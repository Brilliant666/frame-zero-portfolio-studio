import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSiteDeploymentEnvironment, siteDeploymentConfigContract } from "../scripts/lib/site-deployment-config.mjs";
import { JSON_BODY_LIMITS } from "../db/accounts/request-body.mjs";
import { MAX_UPLOAD_BYTES } from "../db/accounts/assets.mjs";

const production = `PORTFOLIO_SITE_MODE=production
PORTFOLIO_SITE_ORIGIN=https://portfolio.example.org
PORTFOLIO_SITE_DOMAIN=portfolio.example.org
PORTFOLIO_SITE_HOST=portfolio.example.org
PORTFOLIO_RELEASE=sha-0123456789abcdef
PORTFOLIO_SITE_CADDY_CONFIG=site.production.caddy
PORTFOLIO_SITE_BIND_ADDRESS=127.0.0.1
PORTFOLIO_SITE_HTTP_PORT=8080
PORTFOLIO_SITE_HTTPS_PORT=8443
PORTFOLIO_DATABASE_URL_FILE=/private/site-database-url
PORTFOLIO_ACCOUNT_SECRET_FILE=/private/site-account-secret
PORTFOLIO_POSTGRES_PASSWORD_FILE=/private/site-postgres-password
`;
const ci = production.replace("SITE_MODE=production", "SITE_MODE=ci")
  .replaceAll("portfolio.example.org", "portfolio.test:18443")
  .replace("SITE_DOMAIN=portfolio.test:18443", "SITE_DOMAIN=portfolio.test")
  .replace("sha-0123456789abcdef", "ci-isolated-contract")
  .replace("site.production.caddy", "site.ci.caddy")
  .replace("HTTPS_PORT=8443", "HTTPS_PORT=18443");

test("Site deployment contract supports existing ingress without claiming host 80/443", () => {
  const parsed = parseSiteDeploymentEnvironment(production);
  assert.equal(parsed.mode, "production");
  assert.equal(parsed.origin, "https://portfolio.example.org");
  assert.equal(parsed.bindAddress, "127.0.0.1");
  assert.equal(parsed.httpPort, 8080);
  assert.equal(parsed.httpsPort, 8443);
  assert.equal(parsed.caddyConfig, "site.production.caddy");
  assert.equal(parsed.databaseUrlFile, "/private/site-database-url");
  assert.equal(parsed.logLevel, "INFO");
  assert.ok(Object.isFrozen(parsed));
  assert.equal(siteDeploymentConfigContract.required.includes("PORTFOLIO_ACCOUNT_SECRET"), false);
  assert.equal(parseSiteDeploymentEnvironment(production.replace("https://portfolio.example.org", "https://portfolio.example.org:9443").replace("SITE_HOST=portfolio.example.org", "SITE_HOST=portfolio.example.org:9443")).host, "portfolio.example.org:9443");
});

test("CI is restricted to generated portfolio.test, loopback bindings and canonical mapped port", () => {
  const parsed = parseSiteDeploymentEnvironment(ci);
  assert.equal(parsed.mode, "ci");
  assert.equal(parsed.origin, "https://portfolio.test:18443");
  assert.equal(parsed.host, "portfolio.test:18443");
  assert.equal(parsed.httpsPort, 18443);
  assert.equal(parsed.caddyConfig, "site.ci.caddy");
});

for (const [name, source, code] of [
  ["missing", production.replace(/^PORTFOLIO_SITE_HOST=.*\n/m, ""), "missing_key"],
  ["unknown", `${production}UNREVIEWED_OPTION=value\n`, "unknown_key"],
  ["raw secret", `${production}PORTFOLIO_ACCOUNT_SECRET=must-not-log-this-value\n`, "unknown_key"],
  ["duplicate", `${production}PORTFOLIO_SITE_HOST=other.example\n`, "duplicate_key"],
  ["interpolation", production.replace("/private/site-database-url", "${HOME}/database"), "invalid_line"],
  ["relative secret path", production.replace("/private/site-database-url", "private/database"), "invalid_secret_file"],
  ["traversal secret path", production.replace("/private/site-database-url", "/private/../database"), "invalid_secret_file"],
  ["duplicate secret file", production.replace("/private/site-account-secret", "/private/site-database-url"), "duplicate_secret_file"],
  ["floating release", production.replace("sha-0123456789abcdef", "latest"), "invalid_release"],
  ["production CI release", production.replace("sha-0123456789abcdef", "ci-fixture"), "invalid_release"],
  ["HTTP", production.replace("https://", "http://"), "invalid_origin"],
  ["origin credentials", production.replace("https://", "https://secret@"), "invalid_origin"],
  ["origin query", production.replace("https://portfolio.example.org", "https://portfolio.example.org?token=secret"), "invalid_origin"],
  ["origin suffix", production.replace("https://portfolio.example.org", "https://portfolio.example.org/"), "invalid_origin"],
  ["host drift", production.replace("SITE_HOST=portfolio.example.org", "SITE_HOST=other.example.org"), "origin_mismatch"],
  ["domain drift", production.replace("SITE_DOMAIN=portfolio.example.org", "SITE_DOMAIN=other.example.org"), "origin_mismatch"],
  ["bind hostname", production.replace("BIND_ADDRESS=127.0.0.1", "BIND_ADDRESS=localhost"), "invalid_bind_address"],
  ["zero port", production.replace("HTTP_PORT=8080", "HTTP_PORT=0"), "invalid_port"],
  ["duplicate port", production.replace("HTTP_PORT=8080", "HTTP_PORT=8443"), "duplicate_port"],
  ["config traversal", production.replace("site.production.caddy", "../site.production.caddy"), "production_boundary"],
  ["production internal TLS", production.replace("site.production.caddy", "site.ci.caddy"), "production_boundary"],
  ["CI public bind", ci.replace("BIND_ADDRESS=127.0.0.1", "BIND_ADDRESS=0.0.0.0"), "ci_boundary"],
  ["CI actual domain", ci.replaceAll("portfolio.test", "portfolio.example.org"), "ci_boundary"],
  ["CI port drift", ci.replace("HTTPS_PORT=18443", "HTTPS_PORT=19443"), "ci_boundary"],
  ["CI public TLS", ci.replace("site.ci.caddy", "site.production.caddy"), "ci_boundary"],
  ["verbose logging", `${production}PORTFOLIO_LOG_LEVEL=DEBUG\n`, "invalid_log_level"],
]) {
  test(`Site deployment refuses ${name} without logging input`, () => {
    assert.throws(() => parseSiteDeploymentEnvironment(source), error => {
      assert.equal(error.code, code);
      assert.equal(error.message, "Invalid Site deployment configuration.");
      return true;
    });
  });
}

test("Site example cannot run until an explicit immutable release is selected", async () => {
  const example = await readFile(new URL("../deploy/site.env.example", import.meta.url), "utf8");
  assert.throws(() => parseSiteDeploymentEnvironment(example), error => error.code === "invalid_release");
  assert.doesNotMatch(example, /(?:PASSWORD|SECRET|TOKEN)=[^\n]+/);
});

test("new Site topology keeps private persistence separate from app and publishes no base ports", async () => {
  const compose = await readFile(new URL("../deploy/site.compose.yaml", import.meta.url), "utf8");
  const ports = await readFile(new URL("../deploy/site.ports.yaml", import.meta.url), "utf8");
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.match(compose, /postgres:17\.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5/);
  assert.match(compose, /site_postgres:\/var\/lib\/postgresql\/data/);
  assert.match(compose, /site_assets:\/var\/lib\/portfolio\/assets/);
  assert.match(compose, /backend: \{internal: true\}/);
  assert.match(compose, /FRAME_ZERO_ACCOUNT_DATABASE_URL_FILE: \/run\/secrets\/site_database_url/);
  assert.match(compose, /FRAME_ZERO_ACCOUNT_SECRET_FILE: \/run\/secrets\/site_account_secret/);
  assert.match(compose, /POSTGRES_PASSWORD_FILE: \/run\/secrets\/site_postgres_password/);
  assert.doesNotMatch(compose, /(?:migrate|provision|import).*command:/);
  assert.match(compose, /profiles: \[tools\]/);
  assert.match(compose, /fs\.chownSync\(p,1000,1000\)/);
  assert.doesNotMatch(compose, /chmod.*777|privileged: true|docker\.sock|initdb\.d/);
  assert.match(ports, /PORTFOLIO_SITE_BIND_ADDRESS/);
  assert.doesNotMatch(ports, /^\s+(?:app|postgres):/m);
});

test("Site proxy uses one business contract with bounded bodies and no public legacy bypass", async () => {
  const proxy = await readFile(new URL("../deploy/caddy/site-proxy.caddy", import.meta.url), "utf8");
  const productionConfig = await readFile(new URL("../deploy/caddy/site.production.caddy", import.meta.url), "utf8");
  const ciConfig = await readFile(new URL("../deploy/caddy/site.ci.caddy", import.meta.url), "utf8");
  for (const config of [productionConfig, ciConfig]) {
    assert.match(config, /import portfolio_site_contract/);
    assert.match(config, /read_header 10s/);
    assert.match(config, /read_body 30s/);
  }
  assert.doesNotMatch(productionConfig, /tls internal|local_certs/);
  assert.match(ciConfig, /tls internal/);
  for (const maximum of [JSON_BODY_LIMITS.auth, JSON_BODY_LIMITS.draft, JSON_BODY_LIMITS.publication, MAX_UPLOAD_BYTES]) {
    assert.ok(proxy.includes(`max_size ${maximum}`));
  }
  assert.match(proxy, /header_up -Forwarded/);
  assert.match(proxy, /request_header -X-Forwarded-\*/);
  assert.doesNotMatch(proxy, /header_up -X-Forwarded-\*/, 'Caddy applies deletes after sets; canonical upstream headers must survive');
  assert.match(proxy, /header_up -X-Account-\*/);
  assert.match(proxy, /header_up -Oai-Authenticated-User-\*/);
  assert.match(proxy, /header_up X-Forwarded-Proto https/);
  assert.match(proxy, /header_up Host \{\$PORTFOLIO_SITE_HOST\}/);
  assert.doesNotMatch(proxy, /header_up -Cookie|trusted_proxies|request_buffers|header_up .*proof/i);
  assert.match(proxy, /@wrong_host not header Host/);
  assert.match(proxy, /respond @forged 403/);
  assert.match(proxy, /@legacy path \/test .*\/preview .*\/admin .*\/api\/site-content/);
  assert.match(proxy, /respond @unreviewed_api 404/);
  const publicPattern = new RegExp(proxy.match(/path_regexp public_media (.+)/)[1]);
  assert.ok(publicPattern.test("/api/public-sites/fixture/assets/10000000-0000-4000-8000-000000000001/card"));
  assert.equal(publicPattern.test("/api/public-sites/fixture/assets/10000000-0000-4000-8000-000000000001/original"), false);
  const pagesPattern = new RegExp(proxy.match(/path_regexp pages (.+)/)[1]);
  for (const route of ["/", "/login", "/fixture", "/fixture/admin", "/fixture/admin/basic/packages", "/fixture/admin/basic/advanced", "/fixture/admin/live/premium-polaroid", "/fixture/admin/preview/premium-flow-gallery"]) {
    assert.ok(pagesPattern.test(route), route);
  }
  for (const route of ["/fixture/admin/unknown", "/fixture/admin/preview/unknown", "/fixture/arbitrary", "/api/unreviewed"]) assert.equal(pagesPattern.test(route), false, route);
});
