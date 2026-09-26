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

async function sitePage(path, status, cookie) {
  const response = await request(path, { cookie });
  assert.equal(response.status, status, `${path} has the expected access boundary`);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  const cache = response.headers.get('cache-control') ?? '';
  assert.match(cache, /no-store/);
  assert.match(cache, /private/);
  return response.text();
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
  await t.test('platform landing and explicit internal test area remain separate from Sites', async () => {
    const root = await request('/');
    assert.equal(root.status, 200);
    const html = await root.text();
    assert.match(html, /摄影作品集平台/);
    assert.doesNotMatch(html, /data-site-state=|data-site-admin=/);
    // The dedicated local runner explicitly enables this internal area. The
    // normal production runner's disabled case is covered by runtime tests.
    assert.equal((await request('/test')).status, 200);
    assert.equal((await request('/test/admin')).status, 200);
  });
  await t.test('public Sites are unpublished and expose no private identity or grants', async () => {
    const identities = await runtime.pool.query(`SELECT u.id AS auth_id,p.id AS portfolio_id,s.id AS site_id,
      p.provisioning_id,u.email FROM sites s JOIN portfolio_users p ON p.id=s.owner_id
      JOIN "user" u ON u.id=p.auth_user_id`);
    for (const slug of ['fixturealpha', 'fixturebeta']) {
      const html = await sitePage(`/${slug}`, 200);
      assert.match(html, /data-site-state="unpublished"/);
      assert.doesNotMatch(html, /data-site-admin=|premium-polaroid|已授权|<img\b/);
      for (const row of identities.rows) {
        for (const value of Object.values(row)) assert.ok(!html.includes(value), 'Public HTML omits private identity fields');
      }
    }
    await sitePage('/unknownfixture', 404);
    for (const slug of ['ab', 'InvalidSlug', 'invalid%3Ctag%3E', 'assets']) {
      await sitePage(`/${slug}`, 404);
      await sitePage(`/${slug}/admin`, 404);
    }
    // Even a structurally valid Site must not become public before the
    // provisioning operation is complete.
    await runtime.pool.query("UPDATE account_provisioning SET completed_at=NULL WHERE username='fixturegamma'");
    try { await sitePage('/fixturegamma', 404); }
    finally { await runtime.pool.query("UPDATE account_provisioning SET completed_at=now() WHERE username='fixturegamma'"); }
  });
  await t.test('slug admin is owner-only, read-only and grant-aware without administrator escalation', async () => {
    const a = await sitePage('/fixturealpha/admin', 200, alpha);
    const b = await sitePage('/fixturebeta/admin', 200, beta);
    for (const html of [a, b]) {
      assert.match(html, /data-site-admin="true"/);
      assert.doesNotMatch(html, /<form\b|<input\b|<textarea\b|<button\b|href="\/admin(?:\/|")/i);
    }
    assert.match(a, /高级拍立得（已授权）/);
    assert.match(b, /尚未授权/);
    assert.ok(!a.includes('fixturebeta')); assert.ok(!b.includes('fixturealpha'));
    for (const slug of ['fixturealpha', 'fixturebeta']) await sitePage(`/${slug}/admin`, 401);
    const deniedAlpha = await sitePage('/fixturealpha/admin', 403, beta);
    const deniedBeta = await sitePage('/fixturebeta/admin', 403, alpha);
    const deniedUnknown = await sitePage('/unknownfixture/admin', 403, alpha);
    assert.equal(deniedAlpha, deniedBeta); assert.equal(deniedAlpha, deniedUnknown);
    assert.doesNotMatch(deniedAlpha, /fixturealpha|fixturebeta|@accounts\.example|premium-polaroid/);
    const roles = await runtime.pool.query('SELECT role FROM "user" WHERE username=ANY($1)', [['fixturealpha', 'fixturebeta']]);
    assert.ok(roles.rows.every(row => row.role === 'user'));
  });
  await t.test('Site HTML rejects identity query injection and escapes stored user text', async () => {
    for (const suffix of [`?siteId=${siteId}`, '?owner=fixturebeta']) {
      await sitePage(`/fixturealpha${suffix}`, 400, alpha);
      await sitePage(`/fixturealpha/admin${suffix}`, 400, alpha);
    }
    const hostile = '<script>alert("fixture")</script>&';
    const user = (await runtime.pool.query('UPDATE "user" SET username=$1 WHERE username=$2 RETURNING id', [hostile, 'fixturealpha'])).rows[0];
    try {
      const html = await sitePage('/fixturealpha/admin', 200, alpha);
      assert.ok(!html.includes(hostile));
      assert.match(html, /&lt;script&gt;alert\(&quot;fixture&quot;\)&lt;\/script&gt;&amp;/);
    } finally { await runtime.pool.query('UPDATE "user" SET username=$1 WHERE id=$2', ['fixturealpha', user.id]); }
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
    await sitePage('/fixturebeta/admin', 401, beta);
    const second = await login('fixturealpha');
    assert.equal((await request('/api/auth/revoke-sessions', { cookie: alpha, body: {} })).status, 200);
    assert.equal((await request('/api/account/site', { cookie: second })).status, 401);
    assert.equal((await request('/api/account/site', { cookie: alpha })).status, 401);
    await sitePage('/fixturealpha/admin', 401, second);
    await sitePage('/fixturealpha/admin', 401, alpha);
  });
  await t.test('expired database session is rejected without a cookie-cache grace period', async () => {
    const cookie = await login('fixturebeta');
    await runtime.pool.query('UPDATE "session" SET expires_at=now()-interval \'1 minute\' WHERE user_id=(SELECT id FROM "user" WHERE username=$1)', ['fixturebeta']);
    assert.equal((await request('/api/account/site', { cookie })).status, 401);
    await sitePage('/fixturebeta/admin', 401, cookie);
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
