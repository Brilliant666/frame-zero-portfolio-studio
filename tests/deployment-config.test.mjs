import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  deploymentConfigContract,
  parseDeploymentEnvironment,
} from "../scripts/lib/deployment-config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const production = `
PORTFOLIO_DEPLOYMENT_MODE=production
PORTFOLIO_DOMAIN=photo.cosflow.icu
PORTFOLIO_RELEASE=sha-0123456789abcdef
PORTFOLIO_BIND_ADDRESS=0.0.0.0
PORTFOLIO_HTTP_PORT=80
PORTFOLIO_HTTPS_PORT=443
PORTFOLIO_CADDY_CONFIG=Caddyfile
PORTFOLIO_LOG_LEVEL=WARN
`;

const ci = production
  .replace("production", "ci")
  .replace("photo.cosflow.icu", "portfolio.test")
  .replace("sha-0123456789abcdef", "ci-contract-test")
  .replace("0.0.0.0", "127.0.0.1")
  .replace("PORTFOLIO_HTTP_PORT=80", "PORTFOLIO_HTTP_PORT=0")
  .replace("PORTFOLIO_HTTPS_PORT=443", "PORTFOLIO_HTTPS_PORT=0")
  .replace("Caddyfile\n", "Caddyfile.ci\n");

test("production and CI deployment modes have separate fail-closed boundaries", () => {
  assert.deepEqual(parseDeploymentEnvironment(production), {
    bindAddress: "0.0.0.0",
    caddyConfig: "Caddyfile",
    domain: "photo.cosflow.icu",
    httpPort: 80,
    httpsPort: 443,
    logLevel: "WARN",
    mode: "production",
    release: "sha-0123456789abcdef",
  });
  assert.deepEqual(parseDeploymentEnvironment(ci), {
    bindAddress: "127.0.0.1",
    caddyConfig: "Caddyfile.ci",
    domain: "portfolio.test",
    httpPort: 0,
    httpsPort: 0,
    logLevel: "WARN",
    mode: "ci",
    release: "ci-contract-test",
  });
});

test("deployment configuration rejects missing, unknown, public, secret, duplicate, and interpolated input", () => {
  const cases = [
    [production.replace(/^PORTFOLIO_DOMAIN=.*\n/m, ""), "missing_key"],
    [`${production}UNREVIEWED_OPTION=value\n`, "unknown_key"],
    [`${production}NEXT_PUBLIC_TOKEN=value\n`, "public_config_forbidden"],
    [`${production}PORTFOLIO_SECRET=value\n`, "secret_key_forbidden"],
    [`${production}PORTFOLIO_DOMAIN=second.example\n`, "duplicate_key"],
    [production.replace("sha-0123456789abcdef", "${GIT_SHA}"), "unsafe_value"],
    [production.replace("sha-0123456789abcdef", "latest"), "invalid_release"],
    [production.replace("PORTFOLIO_HTTP_PORT=80", "PORTFOLIO_HTTP_PORT=8080"), "production_boundary"],
    [ci.replace("127.0.0.1", "0.0.0.0"), "ci_boundary"],
    [ci.replace("Caddyfile.ci", "Caddyfile"), "ci_boundary"],
  ];
  for (const [source, code] of cases) {
    assert.throws(() => parseDeploymentEnvironment(source), (error) => error.code === code, code);
  }
});

test("the example is safe but deliberately unusable until its immutable release is replaced", async () => {
  const example = await readFile(path.join(projectRoot, "deploy", "production.env.example"), "utf8");
  assert.doesNotMatch(example, /NEXT_PUBLIC_|(?:PASSWORD|SECRET|TOKEN)=/);
  assert.throws(
    () => parseDeploymentEnvironment(example),
    (error) => error.code === "invalid_release",
  );
  assert.deepEqual(deploymentConfigContract.secret, []);
  assert.equal(Object.isFrozen(deploymentConfigContract), true);
});

test("the minimal Compose topology contains only hardened App and Caddy services", async () => {
  const compose = (await readFile(path.join(projectRoot, "deploy", "compose.yaml"), "utf8")).replaceAll("\r\n", "\n");
  const services = compose.match(/^services:\r?\n([\s\S]+?)^networks:/m)?.[1] ?? "";
  assert.match(compose, /^  app:\r?$/m);
  assert.match(compose, /^  caddy:\r?$/m);
  assert.deepEqual(services.match(/^  [a-z][a-z0-9_-]*:\r?$/gm), ["  app:", "  caddy:"]);
  assert.match(compose, /caddy:2\.11\.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648/);
  assert.match(compose, /^    user: "1000:1000"$/m);
  assert.match(compose, /^    read_only: true$/m);
  assert.match(compose, /^    internal: true$/m);
  assert.match(compose, /condition: service_healthy/);
  assert.doesNotMatch(compose, /docker\.sock|privileged:|network_mode:\s*host|postgres|redis|minio|NEXT_PUBLIC_/i);
  assert.doesNotMatch(compose, /(?:PASSWORD|SECRET|TOKEN):/i);
});

test("production Caddy uses public ACME while isolated CI alone uses internal TLS", async () => {
  const [productionCaddy, ciCaddy, proxy] = await Promise.all([
    readFile(path.join(projectRoot, "deploy", "caddy", "Caddyfile"), "utf8"),
    readFile(path.join(projectRoot, "deploy", "caddy", "Caddyfile.ci"), "utf8"),
    readFile(path.join(projectRoot, "deploy", "caddy", "portfolio-proxy.caddy"), "utf8"),
  ]);
  assert.match(productionCaddy, /^\{\$PORTFOLIO_DOMAIN\} \{$/m);
  assert.doesNotMatch(productionCaddy, /tls\s+internal|local_certs|skip_install_trust/);
  assert.match(ciCaddy, /tls internal/);
  assert.match(ciCaddy, /skip_install_trust/);
  for (const caddyfile of [productionCaddy, ciCaddy]) {
    assert.match(caddyfile, /admin off/);
    assert.match(caddyfile, /output stdout/);
    assert.match(caddyfile, /format json/);
    assert.match(caddyfile, /import portfolio_public_contract/);
    assert.ok(
      caddyfile.indexOf("import /etc/caddy/portfolio-proxy.caddy")
        < caddyfile.indexOf("{$PORTFOLIO_DOMAIN}"),
      "the shared snippet must be defined at top-level before the site block",
    );
  }
  assert.match(proxy, /path \/admin \/admin\/\*/);
  assert.match(proxy, /\^\/\[\^\/\]\+\/admin/);
  assert.match(proxy, /not method GET HEAD/);
  assert.match(proxy, /path \/api\/site-content/);
  assert.match(proxy, /header Allow "GET, HEAD"/);
  assert.match(proxy, /@unreviewed_api path \/api\/\*/);
  assert.doesNotMatch(proxy, /path \/api\/platform-qr(?:\s|\/)/);
  assert.match(proxy, /header_up -Authorization/);
  assert.match(proxy, /header_up -Cookie/);
  assert.match(proxy, /header_up -oai-authenticated-user-\*/);
});
