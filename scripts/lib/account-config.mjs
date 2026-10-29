import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';

/** Configuration errors never contain input values, credentials, or paths. */
const productionForbiddenFlags = Object.freeze([
  'FRAME_ZERO_LOCAL_ACCOUNTS', 'FRAME_ZERO_ACCOUNT_NODE_RUNTIME',
  'FRAME_ZERO_ACCOUNT_REQUEST_PROOF', 'FRAME_ZERO_INTERNAL_TEST_AREA',
  'FRAME_ZERO_LOCAL_ACCEPTANCE', 'FRAME_ZERO_LOCAL_PREVIEW_BUILD',
]);

export function accountRuntimeEnabled(env = process.env) {
  return env.FRAME_ZERO_PRODUCTION_SITE === '1'
    || (env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME === '1' && env.FRAME_ZERO_LOCAL_ACCOUNTS === '1');
}

function productionSecret(env, name) {
  const filename = `${name}_FILE`;
  if (env[name] !== undefined && env[filename] !== undefined) {
    throw new Error('Production secrets must have exactly one configuration source.');
  }
  if (env[filename] === undefined) return env[name];
  let fd;
  try {
    if (typeof env[filename] !== 'string' || !path.isAbsolute(env[filename]) || !lstatSync(env[filename]).isFile()) throw new Error();
    fd = openSync(env[filename], constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > 4096) throw new Error();
    const bytes = Buffer.alloc(4097);
    const length = readSync(fd, bytes, 0, bytes.length, 0);
    if (length > 4096) throw new Error();
    return bytes.subarray(0, length).toString('utf8').replace(/\r?\n$/, '');
  } catch {
    throw new Error('Production secret file is not usable.');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readProductionAccountConfig(env) {
  if (env.NODE_ENV !== 'production' || productionForbiddenFlags.some(name => env[name] !== undefined)
    || env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW === '1') {
    throw new Error('Production Site cannot enable local or internal-test modes.');
  }
  let origin;
  try {
    origin = new URL(env.FRAME_ZERO_ACCOUNT_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin !== env.FRAME_ZERO_ACCOUNT_ORIGIN || origin.port === '0'
      || origin.username || origin.password || origin.search || origin.hash
      || isIP(origin.hostname) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(origin.hostname)
      || origin.hostname.endsWith('.localhost')) throw new Error();
  } catch { throw new Error('Production Site requires a canonical HTTPS origin.'); }
  let database;
  try {
    const input = productionSecret(env, 'FRAME_ZERO_ACCOUNT_DATABASE_URL');
    if (typeof input !== 'string' || /\s|\u0000/.test(input)) throw new Error();
    database = new URL(input);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || database.port === '0'
      || !database.username || !database.password || database.hash
      || !/^\/[a-z][a-z0-9_]{2,62}$/.test(database.pathname)
      || ['/postgres', '/template0', '/template1'].includes(database.pathname)
      || [...database.searchParams].some(([key, value]) => key !== 'sslmode' || !['require', 'verify-full'].includes(value))
      || database.searchParams.getAll('sslmode').length > 1) throw new Error();
  } catch { throw new Error('Production Site requires a dedicated PostgreSQL database.'); }
  const secret = productionSecret(env, 'FRAME_ZERO_ACCOUNT_SECRET');
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 4096 || /\s|\u0000/.test(secret)) {
    throw new Error('Production account secret must contain at least 32 non-whitespace characters.');
  }
  const root = env.FRAME_ZERO_SITE_ASSET_ROOT;
  if (typeof root !== 'string' || /[\u0000-\u001f\u007f]/.test(root) || !path.isAbsolute(root)
    || /(?:^|[\\/])(?:public|dist|\.next(?:-account|-local-preview)?|node_modules)(?:[\\/]|$)/i.test(root)) {
    throw new Error('Production Site assets require a private absolute directory.');
  }
  const assetRoot = path.resolve(root);
  // cwd() is already absolute. Resolving this dynamic directory again makes
  // Turbopack trace the entire checkout, including unrelated private files.
  const application = process.cwd();
  if (assetRoot === path.parse(assetRoot).root || assetRoot === application || assetRoot.startsWith(`${application}${path.sep}`)) {
    throw new Error('Production Site assets must be outside the application directory.');
  }
  return { mode: 'production', databaseUrl: database.href, secret, origin: origin.origin, assetRoot, isTest: false };
}

export function readAccountConfig(env = process.env) {
  if (env.FRAME_ZERO_PRODUCTION_SITE !== undefined) {
    if (env.FRAME_ZERO_PRODUCTION_SITE !== '1') throw new Error('Invalid production Site mode.');
    return readProductionAccountConfig(env);
  }
  if (env.FRAME_ZERO_LOCAL_ACCOUNTS !== "1") {
    throw new Error("Local accounts are not enabled.");
  }
  let database;
  try {
    database = new URL(env.FRAME_ZERO_ACCOUNT_DATABASE_URL);
  } catch {
    throw new Error("Invalid local account database configuration.");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    !database.username || !database.password || database.search || database.hash ||
    !["/frame_zero_accounts", "/frame_zero_accounts_test"].includes(database.pathname)
  ) {
    throw new Error("Account database must be a dedicated loopback PostgreSQL database.");
  }
  const isTest = database.pathname === "/frame_zero_accounts_test";
  const origin = env.FRAME_ZERO_ACCOUNT_ORIGIN;
  const origins = isTest ? ['http://127.0.0.1:3004'] : ['http://127.0.0.1:3001', 'http://127.0.0.1:3003'];
  if (!origins.includes(origin)) {
    throw new Error("Account origin must match the dedicated local Node environment.");
  }
  const secret = env.FRAME_ZERO_ACCOUNT_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Account secret must contain at least 32 characters.");
  }
  return { mode: 'local', databaseUrl: database.href, secret, origin, isTest };
}
