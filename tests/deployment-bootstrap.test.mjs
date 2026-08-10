import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the deployment verifier exercises real Compose, Caddy, lifecycle, logs, and rollback", async () => {
  const [verifier, workflow, compose, packageJson] = await Promise.all([
    readFile(path.join(projectRoot, "scripts", "verify-deployment-bootstrap.mjs"), "utf8"),
    readFile(path.join(projectRoot, ".github", "workflows", "deployment-bootstrap.yml"), "utf8"),
    readFile(path.join(projectRoot, "deploy", "compose.yaml"), "utf8"),
    readFile(path.join(projectRoot, "package.json"), "utf8").then(JSON.parse),
  ]);

  for (const command of ["config", "pull", "build", "up", "port", "logs", "restart", "stop", "down"]) {
    assert.match(verifier, new RegExp(`\\["${command}"`), `missing Compose ${command} evidence`);
  }
  assert.match(verifier, /"caddy", "validate", "--config", "\/etc\/caddy\/Caddyfile"/);
  assert.match(verifier, /assertPublicContract/);
  assert.match(verifier, /http\.request\(\{/);
  assert.match(verifier, /headers: \{ Host: "portfolio\.test" \}/);
  assert.match(verifier, /capability\.replace\(\/\^CAP_\//);
  assert.match(verifier, /=== "NET_BIND_SERVICE"/);
  assert.match(verifier, /assertRuntimeSecurity/);
  assert.match(verifier, /assertLogs/);
  assert.match(verifier, /docker\(\["image", "tag", appImageA, appImageB\]\)/);
  assert.match(verifier, /normal down must preserve future persistent proxy state/);
  assert.doesNotMatch(verifier, /down", "-v"|down --volumes|docker\s+(?:login|push)|\bssh\b|kubectl/i);
  assert.match(verifier, /Refusing to remove unexpected volume/);
  assert.match(verifier, /CI_TLS_EVIDENCE_ONLY/);

  assert.match(workflow, /^name: Deployment Bootstrap$/m);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /npm run verify:deployment-bootstrap/);
  assert.doesNotMatch(workflow, /continue-on-error|docker\s+(?:login|push)|\bssh\b|kubectl/i);
  assert.equal(packageJson.scripts["test:deployment-bootstrap"], "node --test tests/deployment-bootstrap.test.mjs");
  assert.equal(packageJson.scripts["verify:deployment-bootstrap"], "node scripts/verify-deployment-bootstrap.mjs");

  assert.match(compose, /curl --fail.*\/api\/health\/ready/);
  assert.doesNotMatch(compose, /(?:PASSWORD|SECRET|TOKEN):/i);
});

test("proxy negative assertions cover every currently unfinished public surface", async () => {
  const verifier = await readFile(
    path.join(projectRoot, "scripts", "verify-deployment-bootstrap.mjs"),
    "utf8",
  );
  for (const pathName of [
    "/admin",
    "/admin/template",
    "/star/admin",
    "/login",
    "/api/admin",
    "/api/auth/session",
    "/api/draft",
    "/api/upload",
    "/api/uploads",
    "/api/unreviewed",
  ]) assert.match(verifier, new RegExp(pathName.replaceAll("/", "\\/")));
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.match(verifier, new RegExp(`"${method}"`));
  }
  assert.match(verifier, /logSentinelLeaked: false/);
});
