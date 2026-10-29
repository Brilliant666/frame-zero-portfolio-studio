import { isIP } from "node:net";
import path from "node:path";

const required = Object.freeze([
  "PORTFOLIO_SITE_MODE", "PORTFOLIO_SITE_ORIGIN", "PORTFOLIO_SITE_DOMAIN",
  "PORTFOLIO_SITE_HOST", "PORTFOLIO_RELEASE", "PORTFOLIO_SITE_CADDY_CONFIG",
  "PORTFOLIO_SITE_BIND_ADDRESS", "PORTFOLIO_SITE_HTTP_PORT", "PORTFOLIO_SITE_HTTPS_PORT",
  "PORTFOLIO_DATABASE_URL_FILE", "PORTFOLIO_ACCOUNT_SECRET_FILE", "PORTFOLIO_POSTGRES_PASSWORD_FILE",
]);
export const siteDeploymentConfigContract = Object.freeze({ required, optional: Object.freeze(["PORTFOLIO_LOG_LEVEL"]) });
const known = new Set([...required, ...siteDeploymentConfigContract.optional]);
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function invalid(code) {
  const error = new Error("Invalid Site deployment configuration.");
  error.code = code;
  return error;
}
function port(value) {
  if (!/^[1-9][0-9]{0,4}$/.test(value) || Number(value) > 65535) throw invalid("invalid_port");
  return Number(value);
}
function secretFile(value) {
  // These are Linux-host file locations, not secret values or Docker targets.
  if (!path.posix.isAbsolute(value) || value !== path.posix.normalize(value) || /[\\`'"$\u0000-\u001f]/.test(value)) {
    throw invalid("invalid_secret_file");
  }
  return value;
}

/** A separate contract from Stage A2. Never includes input values in errors. */
export function parseSiteDeploymentEnvironment(source) {
  if (typeof source !== "string") throw invalid("invalid_source");
  const values = Object.create(null);
  for (const raw of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\s#]+)$/.exec(line);
    if (!match || /[`'"\\$]/.test(match[2])) throw invalid("invalid_line");
    const [, key, value] = match;
    if (!known.has(key)) throw invalid("unknown_key");
    if (Object.hasOwn(values, key)) throw invalid("duplicate_key");
    values[key] = value;
  }
  if (required.some(key => !Object.hasOwn(values, key))) throw invalid("missing_key");
  const mode = values.PORTFOLIO_SITE_MODE;
  if (mode !== "production" && mode !== "ci") throw invalid("invalid_mode");
  let url;
  try { url = new URL(values.PORTFOLIO_SITE_ORIGIN); } catch { throw invalid("invalid_origin"); }
  if (url.protocol !== "https:" || url.origin !== values.PORTFOLIO_SITE_ORIGIN || !domainPattern.test(url.hostname)) throw invalid("invalid_origin");
  if (url.hostname !== values.PORTFOLIO_SITE_DOMAIN || url.host !== values.PORTFOLIO_SITE_HOST) throw invalid("origin_mismatch");
  const release = values.PORTFOLIO_RELEASE;
  if (mode === "production" ? !/^sha-[0-9a-f]{12,64}$/.test(release) : !/^ci-[a-z0-9][a-z0-9._-]{0,59}$/.test(release)) {
    throw invalid("invalid_release");
  }
  const bindAddress = values.PORTFOLIO_SITE_BIND_ADDRESS;
  if (!isIP(bindAddress)) throw invalid("invalid_bind_address");
  const httpPort = port(values.PORTFOLIO_SITE_HTTP_PORT);
  const httpsPort = port(values.PORTFOLIO_SITE_HTTPS_PORT);
  if (httpPort === httpsPort) throw invalid("duplicate_port");
  const caddyConfig = values.PORTFOLIO_SITE_CADDY_CONFIG;
  if (mode === "ci") {
    if (url.hostname !== "portfolio.test" || bindAddress !== "127.0.0.1" || caddyConfig !== "site.ci.caddy" || Number(url.port || 443) !== httpsPort) {
      throw invalid("ci_boundary");
    }
  } else if (caddyConfig !== "site.production.caddy" || /(?:^|\.)(?:test|localhost|invalid)$/.test(url.hostname)) {
    throw invalid("production_boundary");
  }
  const logLevel = values.PORTFOLIO_LOG_LEVEL ?? "INFO";
  if (!["INFO", "WARN", "ERROR"].includes(logLevel)) throw invalid("invalid_log_level");
  const databaseUrlFile = secretFile(values.PORTFOLIO_DATABASE_URL_FILE);
  const accountSecretFile = secretFile(values.PORTFOLIO_ACCOUNT_SECRET_FILE);
  const postgresPasswordFile = secretFile(values.PORTFOLIO_POSTGRES_PASSWORD_FILE);
  if (new Set([databaseUrlFile, accountSecretFile, postgresPasswordFile]).size !== 3) throw invalid("duplicate_secret_file");
  return Object.freeze({ mode, origin: url.origin, domain: url.hostname, host: url.host, release,
    bindAddress, httpPort, httpsPort, caddyConfig, logLevel, databaseUrlFile, accountSecretFile, postgresPasswordFile });
}
