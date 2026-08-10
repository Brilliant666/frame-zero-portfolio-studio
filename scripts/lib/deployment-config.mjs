import { readFile } from "node:fs/promises";

const CONFIG_KEYS = Object.freeze([
  "PORTFOLIO_DEPLOYMENT_MODE",
  "PORTFOLIO_DOMAIN",
  "PORTFOLIO_RELEASE",
  "PORTFOLIO_BIND_ADDRESS",
  "PORTFOLIO_HTTP_PORT",
  "PORTFOLIO_HTTPS_PORT",
  "PORTFOLIO_CADDY_CONFIG",
  "PORTFOLIO_LOG_LEVEL",
]);

const REQUIRED_KEYS = Object.freeze(CONFIG_KEYS.filter((key) => key !== "PORTFOLIO_LOG_LEVEL"));
const OPTIONAL_KEYS = Object.freeze(["PORTFOLIO_LOG_LEVEL"]);
const SECRET_KEYS = Object.freeze([]);
const NON_SECRET_KEYS = CONFIG_KEYS;
const RELEASE_PATTERN = /^(?:sha-[0-9a-f]{12,64}|ci-[a-z0-9][a-z0-9._-]{0,59})$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const deploymentConfigContract = Object.freeze({
  keys: CONFIG_KEYS,
  nonSecret: NON_SECRET_KEYS,
  optional: OPTIONAL_KEYS,
  required: REQUIRED_KEYS,
  secret: SECRET_KEYS,
});

function configError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parsePort(value, key) {
  if (!/^(?:0|[1-9][0-9]{0,4})$/.test(value)) {
    throw configError("invalid_port", `${key} must be an integer between 0 and 65535.`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw configError("invalid_port", `${key} must be an integer between 0 and 65535.`);
  }
  return port;
}

function assertKnownKey(key) {
  if (/^NEXT_PUBLIC_/i.test(key)) {
    throw configError("public_config_forbidden", `${key} cannot be used for server deployment configuration.`);
  }
  if (/(?:PASSWORD|SECRET|TOKEN|PRIVATE|CREDENTIAL|API_KEY)/i.test(key)) {
    throw configError("secret_key_forbidden", `${key} is not part of the Stage A2 non-secret contract.`);
  }
  if (!CONFIG_KEYS.includes(key)) {
    throw configError("unknown_key", `Unknown deployment configuration key: ${key}.`);
  }
}

export function parseDeploymentEnvironment(source) {
  if (typeof source !== "string") {
    throw configError("invalid_source", "Deployment configuration must be UTF-8 text.");
  }

  const entries = Object.create(null);
  for (const [index, rawLine] of source.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (/^export\s+/i.test(line)) {
      throw configError("export_forbidden", `Line ${index + 1} must not use export syntax.`);
    }
    const match = /^([A-Z][A-Z0-9_]*)=([^\s#]*)$/.exec(line);
    if (!match) {
      throw configError("invalid_line", `Line ${index + 1} must use unquoted KEY=value syntax.`);
    }
    const [, key, value] = match;
    assertKnownKey(key);
    if (Object.hasOwn(entries, key)) {
      throw configError("duplicate_key", `Duplicate deployment configuration key: ${key}.`);
    }
    if (value === "" || /\$\{|[`'"\\]/.test(value)) {
      throw configError("unsafe_value", `${key} must be a non-empty literal value.`);
    }
    entries[key] = value;
  }

  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(entries, key)) {
      throw configError("missing_key", `Missing required deployment configuration key: ${key}.`);
    }
  }

  const mode = entries.PORTFOLIO_DEPLOYMENT_MODE;
  if (mode !== "production" && mode !== "ci") {
    throw configError("invalid_mode", "PORTFOLIO_DEPLOYMENT_MODE must be production or ci.");
  }

  const domain = entries.PORTFOLIO_DOMAIN;
  if (!DOMAIN_PATTERN.test(domain) || domain.includes("..")) {
    throw configError("invalid_domain", "PORTFOLIO_DOMAIN must be a canonical lowercase DNS name.");
  }

  const release = entries.PORTFOLIO_RELEASE;
  if (!RELEASE_PATTERN.test(release) || /^(?:latest|current|stable|example|change-me)$/i.test(release)) {
    throw configError("invalid_release", "PORTFOLIO_RELEASE must be an immutable sha-* or isolated ci-* identifier.");
  }

  const bindAddress = entries.PORTFOLIO_BIND_ADDRESS;
  const httpPort = parsePort(entries.PORTFOLIO_HTTP_PORT, "PORTFOLIO_HTTP_PORT");
  const httpsPort = parsePort(entries.PORTFOLIO_HTTPS_PORT, "PORTFOLIO_HTTPS_PORT");
  const caddyConfig = entries.PORTFOLIO_CADDY_CONFIG;

  if (mode === "production") {
    if (bindAddress !== "0.0.0.0" || httpPort !== 80 || httpsPort !== 443 || caddyConfig !== "Caddyfile") {
      throw configError(
        "production_boundary",
        "Production requires public 80/443 bindings and the public-ACME Caddyfile.",
      );
    }
  } else if (
    bindAddress !== "127.0.0.1"
    || httpPort !== 0
    || httpsPort !== 0
    || caddyConfig !== "Caddyfile.ci"
  ) {
    throw configError(
      "ci_boundary",
      "CI requires loopback ephemeral ports and the isolated internal-TLS Caddyfile.",
    );
  }

  const logLevel = entries.PORTFOLIO_LOG_LEVEL ?? "INFO";
  if (!new Set(["INFO", "WARN", "ERROR"]).has(logLevel)) {
    throw configError("invalid_log_level", "PORTFOLIO_LOG_LEVEL must be INFO, WARN, or ERROR.");
  }

  return Object.freeze({
    bindAddress,
    caddyConfig,
    domain,
    httpPort,
    httpsPort,
    logLevel,
    mode,
    release,
  });
}

export async function loadDeploymentEnvironment(filePath) {
  return parseDeploymentEnvironment(await readFile(filePath, "utf8"));
}
