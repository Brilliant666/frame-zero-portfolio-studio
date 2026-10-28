import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { accountRuntimeEnabled, readAccountConfig } from '../scripts/lib/account-config.mjs';
import { accountRequestAllowed } from '../db/accounts/http.mjs';
import { authOptions } from '../db/accounts/auth-options.mjs';

const production = {
  NODE_ENV: 'production',
  FRAME_ZERO_PRODUCTION_SITE: '1',
  FRAME_ZERO_ACCOUNT_DATABASE_URL: 'postgresql://fixture:synthetic-password@postgres:5432/frame_zero_site',
  FRAME_ZERO_ACCOUNT_SECRET: 'synthetic-production-configuration-secret-for-fixtures',
  FRAME_ZERO_ACCOUNT_ORIGIN: 'https://portfolio.test:8443',
  FRAME_ZERO_SITE_ASSET_ROOT: path.join(os.tmpdir(), 'isolated-production-assets'),
};
const config = () => readAccountConfig(production);
const transportHeaders = {
  host: 'portfolio.test:8443',
  'x-forwarded-host': 'portfolio.test:8443',
  'x-forwarded-proto': 'https',
};
function request(method = 'GET', extra = {}) {
  return new Request('http://127.0.0.1/api/account/site', { method, headers: { ...transportHeaders, ...extra } });
}

test('production mode has a canonical HTTPS origin, dedicated database and external private asset root', () => {
  const value = config();
  assert.equal(value.mode, 'production');
  assert.equal(value.isTest, false);
  assert.equal(value.origin, production.FRAME_ZERO_ACCOUNT_ORIGIN);
  assert.equal(value.assetRoot, path.resolve(production.FRAME_ZERO_SITE_ASSET_ROOT));
  assert.equal(accountRuntimeEnabled(production), true);
  assert.equal(accountRuntimeEnabled({ FRAME_ZERO_LOCAL_ACCOUNTS: '1' }), false);
  assert.equal(accountRuntimeEnabled({ FRAME_ZERO_LOCAL_ACCOUNTS: '1', FRAME_ZERO_ACCOUNT_NODE_RUNTIME: '1' }), true);
  const local = readAccountConfig({
    FRAME_ZERO_LOCAL_ACCOUNTS: '1', FRAME_ZERO_ACCOUNT_ORIGIN: 'http://127.0.0.1:3001',
    FRAME_ZERO_ACCOUNT_DATABASE_URL: 'postgresql://fixture:synthetic@127.0.0.1:55432/frame_zero_accounts',
    FRAME_ZERO_ACCOUNT_SECRET: production.FRAME_ZERO_ACCOUNT_SECRET,
  });
  assert.equal(local.mode, 'local');
  assert.equal(authOptions(local).advanced.useSecureCookies, false);
});

test('production rejects noncanonical origins, arbitrary database options and application asset paths', () => {
  for (const origin of ['http://portfolio.test', 'https://portfolio.test/', 'https://portfolio.test/path', 'https://portfolio.test?x=1', 'https://user:password@portfolio.example', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://*.example.test', 'https://portfolio.invalid-', 'https://portfolio.test:0', `https://portfolio.${'x'.repeat(64)}`]) {
    assert.throws(() => readAccountConfig({ ...production, FRAME_ZERO_ACCOUNT_ORIGIN: origin }), /canonical HTTPS/);
  }
  for (const database of ['postgresql://fixture@postgres/frame_zero_site', 'postgresql://fixture:synthetic@postgres/postgres', 'postgresql://fixture:synthetic@postgres/frame_zero_site?host=other', 'postgresql://fixture:synthetic@postgres/frame_zero_site?sslmode=disable', 'postgresql://fixture:synthetic@postgres/frame_zero_site#fragment', 'postgresql://fixture:synthetic@post\ngres/frame_zero_site']) {
    assert.throws(() => readAccountConfig({ ...production, FRAME_ZERO_ACCOUNT_DATABASE_URL: database }), /dedicated PostgreSQL/);
  }
  for (const directory of ['relative', path.parse(process.cwd()).root, process.cwd(), path.join(process.cwd(), 'assets'), path.join(os.tmpdir(), 'public', 'assets')]) {
    assert.throws(() => readAccountConfig({ ...production, FRAME_ZERO_SITE_ASSET_ROOT: directory }), /assets/);
  }
  for (const secret of ['', 'short', ' synthetic-secret-with-leading-whitespace-and-length']) {
    assert.throws(() => readAccountConfig({ ...production, FRAME_ZERO_ACCOUNT_SECRET: secret }), /secret/);
  }
  for (const key of ['FRAME_ZERO_ACCOUNT_ORIGIN', 'FRAME_ZERO_ACCOUNT_SECRET', 'FRAME_ZERO_ACCOUNT_DATABASE_URL', 'FRAME_ZERO_SITE_ASSET_ROOT']) {
    const missing = { ...production }; delete missing[key];
    assert.throws(() => readAccountConfig(missing));
  }
});

test('production cannot combine local proof, test entry, or development flags', () => {
  for (const name of ['FRAME_ZERO_LOCAL_ACCOUNTS', 'FRAME_ZERO_ACCOUNT_NODE_RUNTIME', 'FRAME_ZERO_ACCOUNT_REQUEST_PROOF', 'FRAME_ZERO_INTERNAL_TEST_AREA', 'FRAME_ZERO_LOCAL_ACCEPTANCE', 'FRAME_ZERO_LOCAL_PREVIEW_BUILD', 'NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW']) {
    assert.throws(() => readAccountConfig({ ...production, [name]: '1' }), /local or internal-test/);
  }
  assert.throws(() => readAccountConfig({ ...production, NODE_ENV: 'development' }));
  assert.throws(() => readAccountConfig({ ...production, FRAME_ZERO_PRODUCTION_SITE: 'true' }), /Invalid production/);
});

test('production secret files are bounded regular files with one unambiguous source and sanitized errors', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'portfolio-production-secrets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databaseFile = path.join(directory, 'database'); const secretFile = path.join(directory, 'secret');
  await writeFile(databaseFile, `${production.FRAME_ZERO_ACCOUNT_DATABASE_URL}\n`);
  await writeFile(secretFile, `${production.FRAME_ZERO_ACCOUNT_SECRET}\n`);
  const fileConfig = { ...production, FRAME_ZERO_ACCOUNT_DATABASE_URL_FILE: databaseFile, FRAME_ZERO_ACCOUNT_SECRET_FILE: secretFile };
  delete fileConfig.FRAME_ZERO_ACCOUNT_DATABASE_URL; delete fileConfig.FRAME_ZERO_ACCOUNT_SECRET;
  assert.deepEqual(readAccountConfig(fileConfig), config());
  assert.throws(() => readAccountConfig({ ...fileConfig, FRAME_ZERO_ACCOUNT_SECRET: production.FRAME_ZERO_ACCOUNT_SECRET }), /exactly one/);
  assert.throws(() => readAccountConfig({ ...fileConfig, FRAME_ZERO_ACCOUNT_DATABASE_URL: production.FRAME_ZERO_ACCOUNT_DATABASE_URL }), /dedicated PostgreSQL/);
  for (const file of [path.join(directory, 'missing-sensitive-file'), directory, 'relative-secret']) {
    assert.throws(() => readAccountConfig({ ...fileConfig, FRAME_ZERO_ACCOUNT_SECRET_FILE: file }), error => {
      assert.equal(error.message, 'Production secret file is not usable.');
      assert.equal(error.message.includes(directory), false);
      assert.equal(error.message.includes(production.FRAME_ZERO_ACCOUNT_SECRET), false);
      return true;
    });
  }
  await writeFile(secretFile, 'x'.repeat(4097));
  assert.throws(() => readAccountConfig(fileConfig), /file is not usable/);
});

test('production cookie transport is Secure, host-only, HttpOnly and independent from local sessions', () => {
  const options = authOptions(config());
  assert.equal(options.advanced.useSecureCookies, true);
  assert.equal(options.advanced.cookiePrefix, 'portfolio-site');
  assert.deepEqual(options.trustedOrigins, [production.FRAME_ZERO_ACCOUNT_ORIGIN]);
  assert.equal(options.advanced.defaultCookieAttributes.httpOnly, true);
  assert.equal(options.advanced.defaultCookieAttributes.sameSite, 'lax');
  assert.equal('domain' in options.advanced.defaultCookieAttributes, false);
  assert.deepEqual(options.advanced.ipAddress.ipAddressHeaders, []);
  assert.equal(options.emailAndPassword.disableSignUp, true);
});

test('production transport checks canonical proxy metadata and Origin without treating a header as identity', () => {
  assert.equal(accountRequestAllowed(request(), config()), true);
  assert.equal(accountRequestAllowed(request('HEAD'), config()), true);
  assert.equal(accountRequestAllowed(request('POST'), config()), false);
  assert.equal(accountRequestAllowed(request('POST', { origin: production.FRAME_ZERO_ACCOUNT_ORIGIN }), config()), true);
  for (const extra of [
    { host: 'other.test:8443' }, { 'x-forwarded-host': 'other.test:8443' }, { 'x-forwarded-proto': 'http' },
    { origin: 'https://other.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' },
    { forwarded: 'host=portfolio.test;proto=https' }, { 'x-real-ip': '127.0.0.1' },
    { 'x-account-local-proof': 'forged' }, { 'x-user-id': 'forged' }, { 'x-site-id': 'forged' },
    { 'oai-authenticated-user-id': 'forged' }, { 'x-authenticated-user': 'forged' },
    { 'x-internal-runtime': 'forged' }, { 'x-forwarded-user': 'forged' },
  ]) assert.equal(accountRequestAllowed(request('GET', extra), config()), false, JSON.stringify(extra));
  for (const name of ['host', 'x-forwarded-host', 'x-forwarded-proto']) {
    const missing = new Headers(transportHeaders); missing.delete(name);
    assert.equal(accountRequestAllowed(new Request('http://127.0.0.1/', { headers: missing }), config()), false);
  }
});
