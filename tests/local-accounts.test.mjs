import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { readAccountConfig } from '../scripts/lib/account-config.mjs';
import { createAccountRuntime } from '../db/accounts/runtime.mjs';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { readOwnedSite } from '../db/accounts/http.mjs';
import { migrateAccounts } from '../db/accounts/migrate.mjs';

// Deliberately fail, not skip, when the dedicated integration environment is missing.
const config = readAccountConfig();
assert.equal(config.isTest, true, 'Integration tests only run against the explicit test database');
assert.equal(new URL(config.databaseUrl).pathname, '/frame_zero_accounts_test');
const runtime = createAccountRuntime(config);
const password = 'Isolated-fixture-password-28!';
const input = (name, premium = false) => ({ username: name, slug: name, email: `${name}@accounts.example`, password, premium });
let server;

async function cleanTestTables() {
  const client = await runtime.pool.connect();
  try {
    const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
    assert.equal(database, 'frame_zero_accounts_test', 'Refuse cleanup outside the dedicated test database');
    // Explicit list, no CASCADE: newly introduced referencing data must fail safely.
    await client.query('TRUNCATE TABLE site_template_grants, sites, portfolio_users, "session", account, verification, "user", account_provisioning');
  } finally { client.release(); }
}

async function startServer() {
  await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', () => reject(new Error('Test port 3004 is occupied; no process was stopped')));
    socket.listen(3004, '127.0.0.1', () => socket.close(resolve));
  });
  server = spawn(process.execPath, ['scripts/start-local-accounts.mjs', '--test'], {
    env: { ...process.env, NODE_ENV: 'production' }, windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let launchFailed = false;
  server.on('error', () => { launchFailed = true; });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (launchFailed || server.exitCode !== null) throw new Error('Local Next identity server failed to start');
    try {
      const response = await fetch(`${config.origin}/login`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
    } catch { /* allow bounded Next startup time */ }
    await delay(250);
  }
  throw new Error('Local Next identity server startup timed out');
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
  server = undefined;
}

async function request(path, { cookie, body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  return fetch(`${config.origin}${path}`, {
    method, redirect: 'follow', signal: AbortSignal.timeout(10000),
    headers: { ...(method !== 'GET' ? { origin: config.origin, 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(username) {
  const response = await request('/api/auth/sign-in/username', { body: { username, password } });
  assert.equal(response.status, 200, 'Username login succeeds through real Next HTTP');
  assert.deepEqual(await response.json(), { ok: true });
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some(value => /httponly/i.test(value)));
  assert.ok(cookies.some(value => /samesite=lax/i.test(value)));
  return cookies.map(value => value.split(';')[0]).join('; ');
}

test('real PostgreSQL and Standard Next account boundary', { timeout: 180000 }, async t => {
  t.after(async () => { await stopServer(); await runtime.pool.end(); });
  await migrateAccounts(config);
  await cleanTestTables();
  await t.test('migration re-run is a no-op', async () => {
    const before = await runtime.pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id');
    await migrateAccounts(config);
    const after = await runtime.pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id');
    assert.deepEqual(after.rows, before.rows);
  });
  await t.test('concurrent provision is idempotent; conflicts cannot overwrite', async () => {
    const outcomes = await Promise.all([provisionAccount(runtime, input('fixturealpha', true)), provisionAccount(runtime, input('FIXTUREALPHA', true))]);
    assert.deepEqual(outcomes.map(o => o.status).sort(), ['ALREADY_EXISTS', 'CREATED']);
    await provisionAccount(runtime, input('fixturebeta'));
    for (const conflict of [
      { ...input('fixturealpha', true), email: 'other@accounts.example' },
      { ...input('other'), email: 'FIXTUREALPHA@accounts.example' },
      { ...input('other'), slug: 'fixturealpha' },
      input('fixturealpha', false),
    ]) await assert.rejects(provisionAccount(runtime, conflict), /PROVISION_CONFLICT/);
    assert.equal((await runtime.pool.query('SELECT count(*)::int AS n FROM sites')).rows[0].n, 2);
    const credentials = (await runtime.pool.query('SELECT password FROM account')).rows;
    assert.ok(credentials.every(row => row.password && row.password !== password));
  });
  await t.test('post-auth failure rolls back credentials; intent resumes safely', async () => {
    await assert.rejects(provisionAccount(runtime, input('fixturegamma'), { afterAuth: async () => { throw new Error('injected failure'); } }), /PROVISION_FAILED/);
    const pending = (await runtime.pool.query("SELECT id,completed_at FROM account_provisioning WHERE username='fixturegamma'")).rows[0];
    assert.equal(pending.completed_at, null);
    assert.equal((await runtime.pool.query('SELECT count(*)::int AS n FROM "user" WHERE username=$1', ['fixturegamma'])).rows[0].n, 0);
    const recovered = await provisionAccount(runtime, input('fixturegamma'));
    assert.equal(recovered.operationId, pending.id);
    assert.equal(recovered.status, 'CREATED');
  });
  await t.test('unrelated existing Auth identity is never adopted by provisioning', async () => {
    await runtime.auth.api.createUser({ body: {
      email: 'unrelated@accounts.example', password, name: 'unrelated', role: 'user',
      data: { username: 'unrelated', displayUsername: 'unrelated' },
    } });
    await assert.rejects(provisionAccount(runtime, input('unrelated')), /EXISTING_AUTH_IDENTITY_NOT_OWNED/);
    const orphan = (await runtime.pool.query('SELECT id FROM "user" WHERE username=$1', ['unrelated'])).rows[0];
    assert.equal((await runtime.pool.query('SELECT count(*)::int AS n FROM portfolio_users WHERE auth_user_id=$1', [orphan.id])).rows[0].n, 0);
    for (const username of ['admin', 'preview', '_next', 'ab', 'name/other']) {
      await assert.rejects(provisionAccount(runtime, input(username)), /INVALID_USERNAME_OR_SLUG/);
    }
  });
  await startServer();
  let alpha, beta, siteId;
  await t.test('real sessions, owner-scoped lookup and separate template rights', async () => {
    assert.equal((await request('/api/account/site')).status, 401);
    alpha = await login('FIXTUREALPHA'); beta = await login('fixturebeta');
    const a = await (await request('/api/account/site', { cookie: alpha })).json();
    const b = await (await request('/api/account/site', { cookie: beta })).json();
    siteId = a.site.id;
    assert.equal(a.site.slug, 'fixturealpha'); assert.notEqual(a.site.id, b.site.id);
    assert.equal(a.user.role, 'user'); assert.equal(a.user.emailVerified, false);
    assert.equal(a.templates.basic.length, 11); assert.ok(a.templates.basic.includes('polaroid-field'));
    assert.deepEqual(a.templates.premium, ['premium-polaroid']); assert.deepEqual(b.templates.premium, []);
    assert.equal((await request(`/api/account/site?siteId=${siteId}`, { cookie: beta })).status, 401);
    assert.equal(await readOwnedSite(runtime, new Headers({ cookie: beta }), siteId), null);
    assert.equal((await request(`/api/account/site?siteId=${siteId}`, { cookie: alpha })).status, 200);
  });
  await t.test('registration variants and operator endpoints cannot create accounts', async () => {
    const before = (await runtime.pool.query('SELECT count(*)::int AS n FROM "user"')).rows[0].n;
    for (const path of ['/api/auth/sign-up/email','/api/auth/sign-up/email/','/api/auth/sign-up/%65mail','/api/auth/admin/create-user','/api/auth/admin/set-role','/api/auth/admin/impersonate-user']) {
      const response = await request(path, { cookie: alpha, body: { ...input('forbidden'), name: 'forbidden', role: 'admin' } });
      assert.ok(response.status >= 400, `${path} denied`);
    }
    assert.equal((await runtime.pool.query('SELECT count(*)::int AS n FROM "user"')).rows[0].n, before);
  });
  await t.test('injected identity, forwarded headers, cross-origin writes fail closed', async () => {
    for (const field of ['role','owner','siteId','premium','provisioningId','returnTo']) {
      assert.equal((await request('/api/auth/sign-in/username', { body: { username: 'fixturealpha', password, [field]: siteId } })).status, 400);
    }
    assert.equal((await request('/api/account/site?owner=fixturealpha', { cookie: beta })).status, 403);
    for (const name of ['x-forwarded-for','x-forwarded-host','x-forwarded-proto','forwarded','x-real-ip']) {
      assert.equal((await request('/api/account/site', { cookie: alpha, headers: { [name]: '127.0.0.1' } })).status, 403);
    }
    assert.equal((await request('/api/account/site', { headers: { 'oai-authenticated-user-email': 'fixturealpha@accounts.example' } })).status, 401);
    assert.equal((await request('/api/auth/sign-out', { cookie: alpha, body: {}, headers: { origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await request('/api/account/site', { cookie: alpha, method: 'POST', body: { owner: 'fixturealpha', siteId } })).status, 405);
  });
  await t.test('logout and revocation invalidate previously issued cookies', async () => {
    assert.equal((await request('/api/auth/sign-out', { cookie: beta, body: {} })).status, 200);
    assert.equal((await request('/api/account/site', { cookie: beta })).status, 401);
    const second = await login('fixturealpha');
    assert.equal((await request('/api/auth/revoke-sessions', { cookie: alpha, body: {} })).status, 200);
    assert.equal((await request('/api/account/site', { cookie: second })).status, 401);
    assert.equal((await request('/api/account/site', { cookie: alpha })).status, 401);
  });
  await t.test('expired database session is rejected without a cookie-cache grace period', async () => {
    const cookie = await login('fixturebeta');
    await runtime.pool.query('UPDATE "session" SET expires_at=now()-interval \'1 minute\' WHERE user_id=(SELECT id FROM "user" WHERE username=$1)', ['fixturebeta']);
    assert.equal((await request('/api/account/site', { cookie })).status, 401);
  });
  await t.test('server restart preserves accounts and Site relations', async () => {
    await stopServer(); await startServer();
    const cookie = await login('fixturealpha');
    const body = await (await request('/api/account/site', { cookie })).json();
    assert.equal(body.site.id, siteId);
  });
  await t.test('incorrect and unknown credentials share errors; attempts are limited', async () => {
    const wrong = await request('/api/auth/sign-in/username', { body: { username: 'fixturealpha', password: 'incorrect-password' } });
    const unknown = await request('/api/auth/sign-in/username', { body: { username: 'unknownfixture', password: 'incorrect-password' } });
    assert.equal(wrong.status, unknown.status); assert.deepEqual(await wrong.json(), await unknown.json());
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const response = await request('/api/auth/sign-in/username', { body: { username: 'unknownfixture', password: 'incorrect-password' } });
      if (response.status === 429) { limited = true; break; }
    }
    assert.equal(limited, true);
  });
});
