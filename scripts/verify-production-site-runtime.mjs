#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, isIP } from 'node:net';
import https from 'node:https';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { migrateAccounts } from '../db/accounts/migrate.mjs';
import { createAccountRuntime } from '../db/accounts/runtime.mjs';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { productionSiteBusinessFlow } from '../tests/production-site-business-flow.mjs';
import { parseSiteDeploymentEnvironment } from './lib/site-deployment-config.mjs';

// This creates and destroys only an explicitly owned, disposable Linux CI stack.
// No configured local database URL, photos, account, or release is accepted.
if (process.platform !== 'linux' || process.env.CI !== 'true' || process.env.FRAME_ZERO_PRODUCTION_VERIFY !== '1') {
  throw new Error('Production Site verification requires the explicit disposable Linux CI environment.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
const suffix = randomUUID().replaceAll('-', '');
const project = `portfolio-site-ci-${suffix}`;
const release = `ci-site-${suffix}`;
const image = `portfolio-platform-app:${release}`;
const databasePassword = randomBytes(24).toString('hex');
const applicationPassword = randomBytes(24).toString('hex');
const accountSecret = randomBytes(32).toString('hex');
const password = `Fixture-${randomBytes(16).toString('hex')}!`;
const temporary = await mkdtemp(path.join(tmpdir(), 'portfolio-site-ci-'));
const evidence = { kind: 'DISPOSABLE_PRODUCTION_HTTPS', state: 'RUNNING', project, tests: {}, limitations: ['Linux CI only; generated accounts and images', 'Internal test CA; no public ACME or target-server validation', 'Container recreation uses the same image; no cross-version data recovery claim'] };
let environment, runtime, agent, stackCreated = false, imageCreated = false, phase = 'prepare';
const redact = value => [databasePassword, applicationPassword, accountSecret, password, temporary].reduce((text, secret) => text.replaceAll(secret, '[redacted]'), String(value));
async function command(executable, args, options = {}) {
  try { return (await exec(executable, args, { cwd: root, env: environment ?? process.env, encoding: 'utf8', timeout: options.timeout ?? 120_000, maxBuffer: 8 * 1024 * 1024, ...options })).stdout.trim(); }
  catch (error) { throw new Error(redact(`${executable} ${args[0]} failed: ${error.stderr ?? error.message}`).slice(-6000)); }
}
const composeArguments = args => ['compose', '--project-name', project, '-f', path.join(root, 'deploy/site.compose.yaml'), '-f', path.join(root, 'deploy/site.ports.yaml'), ...args];
const compose = (args, options) => command('docker', composeArguments(args), options);
const docker = (args, options) => command('docker', args, options);
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function container(service) {
  const id = await compose(['ps', '--all', '--quiet', service]);
  assert.match(id, /^[0-9a-f]{12,64}$/);
  const [inspection] = JSON.parse(await docker(['inspect', id]));
  assert.equal(inspection.Config.Labels['com.docker.compose.project'], project);
  return inspection;
}
async function appNode(code, args = [], user = '1000:1000') {
  const app = await container('app');
  return docker(['exec', '--user', user, app.Id, 'node', '-e', code, ...args]);
}
function response(status, headers, bytes) {
  return { status, headers, bytes, json: () => {
    try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Fixture response is not valid JSON'); }
  }, text: () => bytes.toString('utf8') };
}
let origin, httpsPort;
function request(pathname, options = {}) {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  const headers = { host: new URL(origin).host, ...(options.cookie ? { cookie: options.cookie } : {}) };
  if (!['GET', 'HEAD'].includes(method) && options.origin !== false) headers.origin = options.origin ?? origin;
  let body = options.body;
  if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') { body = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  if (body !== undefined) headers['content-length'] = Buffer.byteLength(body);
  Object.assign(headers, options.headers);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', port: httpsPort, servername: 'portfolio.test', path: pathname, method, headers, agent, timeout: 15_000 }, res => {
      let size = 0; const chunks = [];
      res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) req.destroy(new Error('Fixture response exceeded its bound')); else chunks.push(chunk); });
      res.on('end', () => resolve(response(res.statusCode, res.headers, Buffer.concat(chunks))));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Fixture HTTPS request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await request('/api/health/ready')).status === 200) return; } catch { /* bounded startup */ }
    await delay(250);
  }
  throw new Error('Production Site did not become ready through HTTPS');
}
async function savedResourceConsistency() {
  const rows = (await runtime.pool.query('SELECT id,site_id,digest,variants FROM site_assets ORDER BY id')).rows;
  const checked = JSON.parse(await appNode(`const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const rows=JSON.parse(process.argv[1]);let files=0;for(const row of rows){for(const [kind,variant] of Object.entries(row.variants)){const location=path.join('/var/lib/portfolio/assets',...variant.key.split('/'));const bytes=fs.readFileSync(location);if(kind==='original'&&crypto.createHash('sha256').update(bytes).digest('hex')!==row.digest)throw Error('original digest mismatch');if(bytes.length!==variant.bytes)throw Error('variant size mismatch');files++;}}console.log(JSON.stringify({assets:rows.length,files}));`, [JSON.stringify(rows)]));
  assert.ok(checked.assets > 0 && checked.files >= checked.assets * 4);
  return checked;
}
try {
  httpsPort = await freePort(); let httpPort;
  do { httpPort = await freePort(); } while (httpPort === httpsPort);
  origin = `https://portfolio.test:${httpsPort}`;
  for (const [name, value] of [['database-url', `postgresql://portfolio_app:${applicationPassword}@postgres:5432/frame_zero_site`], ['account-secret', accountSecret], ['postgres-password', databasePassword]]) {
    // Parent is private 0700; file bind mounts must also be readable by app1000/PG999.
    await writeFile(path.join(temporary, name), value, { mode: 0o444 });
  }
  environment = { ...process.env, PORTFOLIO_SITE_MODE: 'ci', PORTFOLIO_SITE_ORIGIN: origin, PORTFOLIO_SITE_DOMAIN: 'portfolio.test', PORTFOLIO_SITE_HOST: new URL(origin).host, PORTFOLIO_SITE_CADDY_CONFIG: 'site.ci.caddy', PORTFOLIO_SITE_BIND_ADDRESS: '127.0.0.1', PORTFOLIO_SITE_HTTP_PORT: String(httpPort), PORTFOLIO_SITE_HTTPS_PORT: String(httpsPort), PORTFOLIO_RELEASE: release, PORTFOLIO_DATABASE_URL_FILE: path.join(temporary, 'database-url'), PORTFOLIO_ACCOUNT_SECRET_FILE: path.join(temporary, 'account-secret'), PORTFOLIO_POSTGRES_PASSWORD_FILE: path.join(temporary, 'postgres-password') };
  parseSiteDeploymentEnvironment(Object.entries(environment).filter(([key]) => key.startsWith('PORTFOLIO_')).map(([key, value]) => `${key}=${value}`).join('\n'));
  phase = 'build-production-artifact';
  imageCreated = true;
  await docker(['build', '--tag', image, '.'], { timeout: 600_000 });
  const [built] = JSON.parse(await docker(['image', 'inspect', image]));
  evidence.artifact = { imageId: built.Id, architecture: built.Architecture, os: built.Os, sourceRevision: await command('git', ['rev-parse', 'HEAD']), sourceTree: await command('git', ['rev-parse', 'HEAD^{tree}']) };
  assert.equal(built.Os, 'linux');
  const invalidName = `${project}-invalid-config`;
  try {
    await assert.rejects(exec('docker', ['run', '--name', invalidName, '--network', 'none', '--env', 'FRAME_ZERO_PRODUCTION_SITE=1', image], { encoding: 'utf8', timeout: 20_000 }), error => {
      evidence.tests.invalidStartupExit = { code: error.code ?? null, signal: error.signal ?? null, killed: error.killed === true };
      return error.code === 1 && !error.killed;
    });
    evidence.tests.missingConfiguration = 'Startup exits nonzero without creating a replacement database';
  } finally { await docker(['rm', '--force', invalidName]).catch(() => {}); }
  phase = 'prepare-owned-empty-fixture'; stackCreated = true;
  await compose(['up', '--detach', '--wait', 'postgres']);
  const pg = await container('postgres');
  assert.ok(pg.Mounts.some(m => m.Name === `${project}_site_postgres`));
  // A native Linux Docker host can reach an internal bridge directly. Docker
  // does not publish ports for internal-only endpoints; keep the production
  // topology intact rather than adding a fixture-only public/egress network.
  const endpoint = pg.NetworkSettings.Networks[`${project}_backend`];
  assert.equal(isIP(endpoint?.IPAddress ?? ''), 4, 'Fixture must use its own inspected IPv4 endpoint');
  const [network] = JSON.parse(await docker(['network', 'inspect', endpoint.NetworkID]));
  assert.equal(network.Labels['com.docker.compose.project'], project);
  assert.equal(network.Driver, 'bridge'); assert.equal(network.Internal, true);
  assert.notEqual(network.Options?.['com.docker.network.bridge.gateway_mode_ipv4'], 'isolated');
  assert.equal(network.Containers[pg.Id].IPv4Address.split('/')[0], endpoint.IPAddress);
  assert.equal(Object.values(pg.HostConfig.PortBindings ?? {}).flat().length, 0);
  assert.equal(Object.values(pg.NetworkSettings.Ports ?? {}).flat().filter(Boolean).length, 0);
  evidence.tests.fixtureDatabase = 'Owned internal bridge endpoint; no PostgreSQL host port or extra network';
  const config = { mode: 'production', databaseUrl: `postgresql://portfolio:${databasePassword}@${endpoint.IPAddress}:5432/frame_zero_site`, origin, secret: accountSecret, isTest: false, assetRoot: '/var/lib/portfolio/assets' };
  await migrateAccounts(config);
  runtime = createAccountRuntime(config);
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_site');
  assert.equal((await runtime.pool.query('SELECT count(*)::int AS count FROM sites')).rows[0].count, 0, 'Fixture must start empty');
  const primary = await provisionAccount(runtime, { username: 'fixtureone', slug: 'fixtureone', email: 'one@portfolio.example', password, premium: true });
  await provisionAccount(runtime, { username: 'fixturetwo', slug: 'fixturetwo', email: 'two@portfolio.example', password, premium: false });
  await runtime.pool.query("INSERT INTO site_template_grants(id,site_id,product,source) VALUES($1,$2,'premium-flow-gallery','operator-test')", [randomUUID(), primary.siteId]);
  // Explicit disposable fixture setup, not normal app startup or a production
  // provisioning endpoint. The runtime never receives administrator credentials.
  await runtime.pool.query(`CREATE ROLE portfolio_app LOGIN PASSWORD '${applicationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT CONNECT ON DATABASE frame_zero_site TO portfolio_app; GRANT USAGE ON SCHEMA public TO portfolio_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO portfolio_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO portfolio_app`);
  evidence.tests.databaseRole = 'Application uses separate non-superuser DML role; administrator secret is not mounted in app';
  await compose(['--profile', 'tools', 'run', '--rm', 'assets-init']);
  await compose(['run', '--rm', '--no-deps', '--entrypoint', 'caddy', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']);
  phase = 'start-same-production-image';
  await compose(['up', '--detach', '--wait', 'app', 'caddy']);
  const initial = await container('app');
  assert.equal(initial.Image, built.Id);
  assert.equal(Object.keys(initial.HostConfig.PortBindings ?? {}).length, 0);
  assert.deepEqual(initial.Config.Cmd, ['node', 'server.js']);
  assert.equal(initial.Mounts.some(m => m.Destination === '/run/secrets/site_postgres_password'), false);
  assert.ok(initial.Mounts.some(m => m.Name === `${project}_site_assets` && m.Destination === '/var/lib/portfolio/assets'));
  const ca = await compose(['exec', '-T', 'caddy', 'cat', '/data/caddy/pki/authorities/local/root.crt']);
  agent = new https.Agent({ ca, rejectUnauthorized: true, keepAlive: false });
  await ready();
  evidence.tests.tls = 'Explicit ephemeral CA trust, hostname verified; no insecure TLS';
  const native = JSON.parse(await appNode(`console.log(JSON.stringify({node:process.version,probePid:process.pid,uid:process.getuid(),sharp:require('sharp').versions.sharp,rsvg:require('sharp').versions.rsvg}))`));
  evidence.runtime = native;
  assert.equal(native.uid, 1000);
  evidence.runtime.databaseRole = JSON.parse(await appNode(`const fs=require('node:fs');const {Pool}=require('pg');const p=new Pool({connectionString:fs.readFileSync(process.env.FRAME_ZERO_ACCOUNT_DATABASE_URL_FILE,'utf8'),connectionTimeoutMillis:3000});p.query('SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user').then(async result=>{console.log(JSON.stringify(result.rows[0]));await p.end();}).catch(()=>{console.error('FIXTURE_ROLE_PROBE_FAILED');process.exitCode=1;});`));
  assert.deepEqual(evidence.runtime.databaseRole, { name: 'portfolio_app', rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  phase = 'https-business-chain';
  evidence.tests.business = await productionSiteBusinessFlow({ request, pool: runtime.pool, password, siteId: primary.siteId,
    restartApp: async () => { phase = 'app-restart'; await compose(['restart', 'app']); await ready(); assert.equal((await container('app')).Image, built.Id); },
    recreateApp: async () => { phase = 'container-recreation'; await compose(['up', '--detach', '--force-recreate', '--no-deps', '--wait', 'app']); await ready(); const recreated = await container('app'); assert.notEqual(recreated.Id, initial.Id); assert.equal(recreated.Image, built.Id); evidence.tests.persistence = await savedResourceConsistency(); },
    setDatabaseAvailable: async available => { phase = 'database-fault'; await compose(available ? ['up', '--detach', '--wait', 'postgres'] : ['stop', '--timeout', '10', 'postgres']); if (available) await ready(); },
    setAssetsAvailable: async available => { phase = 'asset-permission-fault'; await appNode(`require('node:fs').chmodSync('/var/lib/portfolio/assets',${available ? '0o700' : '0o000'});`); if (available) await ready(); },
    assertCleanupFailure: async ({ cookie, bytes, siteId }) => {
      phase = 'upload-cleanup-failure';
      await runtime.pool.query(`CREATE FUNCTION fixture_reject_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RAISE EXCEPTION 'fixture rejection'; END $$; CREATE TRIGGER fixture_reject_asset BEFORE INSERT ON site_assets FOR EACH ROW EXECUTE FUNCTION fixture_reject_asset()`);
      const siteRoot = `/var/lib/portfolio/assets/${siteId}`;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const faultBytes = await sharp(bytes).resize({ width: 401 + attempt }).png().toBuffer();
          const previous = JSON.parse(await appNode(`console.log(JSON.stringify(require('node:fs').readdirSync(process.argv[1])));`, [siteRoot]));
          const pending = request('/api/sites/fixtureone/assets', { method: 'POST', cookie, headers: { 'content-type': 'image/png', 'x-file-name': 'cleanup.png' }, body: faultBytes });
          let created = false;
          for (let poll = 0; poll < 40; poll++) {
            const entries = JSON.parse(await appNode(`console.log(JSON.stringify(require('node:fs').readdirSync(process.argv[1])));`, [siteRoot]));
            if (entries.some(id => !previous.includes(id))) { created = true; break; }
            await delay(50);
          }
          assert.equal(created, true, 'Fault must reach a newly written upload directory');
          await appNode(`require('node:fs').chmodSync(process.argv[1],0o500);`, [siteRoot]);
          const failed = await pending;
          assert.equal(failed.status, 503);
          assert.doesNotMatch(failed.text(), /\/var\/lib|postgresql:|fixture rejection/);
          await appNode(`require('node:fs').chmodSync(process.argv[1],0o700);`, [siteRoot]);
        }
      } finally {
        await appNode(`require('node:fs').chmodSync(process.argv[1],0o700);`, [siteRoot]);
        await runtime.pool.query('DROP TRIGGER IF EXISTS fixture_reject_asset ON site_assets; DROP FUNCTION IF EXISTS fixture_reject_asset()');
      }
      const recovered = await request('/api/sites/fixtureone/assets', { method: 'POST', cookie, headers: { 'content-type': 'image/png', 'x-file-name': 'recovered.png' }, body: bytes });
      assert.ok([200, 201].includes(recovered.status), 'Two cleanup failures must not exhaust the upload slots');
      return { injectedCleanupFailures: 2, nextUploadSucceeded: true, generatedOrphans: 'retained until disposable volume teardown; no GC' };
    },
    assertAbortedUploads: async ({ cookie, bytes }) => {
      phase = 'aborted-and-concurrent-uploads';
      const oversized = await request('/api/sites/fixtureone/assets', { method: 'POST', cookie, headers: { 'content-type': 'image/png', 'x-file-name': 'oversized.png', 'content-length': 25 * 1024 * 1024 + 1 }, body: Buffer.alloc(0) });
      assert.equal(oversized.status, 413, 'Declared oversize is rejected before sending its body');
      const began = Date.now();
      const slow = await new Promise((resolve, reject) => {
        const req = https.request({ hostname: '127.0.0.1', port: httpsPort, servername: 'portfolio.test', path: '/api/auth/sign-in/username', method: 'POST', agent, headers: { host: new URL(origin).host, origin, 'content-type': 'application/json', 'content-length': 100 }, timeout: 16_000 }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
        req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Slow-body deadline was not enforced')));
        req.flushHeaders(); req.write('{');
      });
      assert.equal(slow, 408, 'The application JSON deadline precedes proxy read timeout');
      assert.ok(Date.now() - began < 16_000);
      const held = [];
      for (let i = 0; i < 2; i++) {
        const req = https.request({ hostname: '127.0.0.1', port: httpsPort, servername: 'portfolio.test', path: '/api/sites/fixtureone/assets', method: 'POST', agent, headers: { host: new URL(origin).host, origin, cookie, 'content-type': 'image/png', 'x-file-name': 'partial.png', 'content-length': bytes.length + 1024 } }, res => res.resume());
        req.on('error', () => {}); req.flushHeaders(); req.write(bytes.subarray(0, Math.min(32, bytes.length))); held.push(req);
      }
      try {
        await delay(400);
        const busy = await request('/api/sites/fixtureone/assets', { method: 'POST', cookie, headers: { 'content-type': 'image/png', 'x-file-name': 'busy.png' }, body: bytes });
        assert.equal(busy.status, 429, 'Two incomplete streams occupy both slots');
      } finally { for (const req of held) req.destroy(); }
      await delay(400);
      const recovered = await request('/api/sites/fixtureone/assets', { method: 'POST', cookie, headers: { 'content-type': 'image/png', 'x-file-name': 'after-abort.png' }, body: bytes });
      assert.ok([200, 201].includes(recovered.status));
      return { declaredOversizeRejectedBeforeBody: 413, slowJson: 408, concurrencyLimit: 2, thirdRejected: 429, abortedStreamsReleaseSlots: true };
    },
  });
  phase = 'final-consistency';
  evidence.tests.finalResources = await savedResourceConsistency();
  assert.equal((await container('app')).State.Running, true);
  evidence.state = 'PASS';
} catch (error) {
  evidence.state = 'FAIL'; evidence.phase = phase; evidence.error = redact(error.message).slice(0, 3000);
  if (stackCreated) {
    const logs = await compose(['logs', '--no-color', '--tail', '30', 'app', 'caddy']).catch(() => 'logs unavailable');
    console.error(redact(logs).replace(/^.*(?:Cookie|Authorization).*$/gmi, '[credential header omitted]'));
  }
  process.exitCode = 1;
} finally {
  await runtime?.pool.end().catch(() => {});
  agent?.destroy();
  // Names are generated here, never read from operator input; only this stack is removed.
  assert.match(project, /^portfolio-site-ci-[a-f0-9]{32}$/);
  if (stackCreated) await compose(['--profile', 'tools', 'down', '--volumes', '--remove-orphans', '--timeout', '10']).catch(() => { evidence.state = 'FAIL'; evidence.cleanup = 'FAILED'; process.exitCode = 1; });
  if (imageCreated) await docker(['image', 'rm', image]).catch(() => {});
  assert.ok(temporary.startsWith(path.join(tmpdir(), 'portfolio-site-ci-')));
  await rm(temporary, { recursive: true, force: true });
  const output = path.join(root, 'outputs/production-site-runtime');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('PRODUCTION_SITE_EVIDENCE ' + JSON.stringify(evidence));
}
