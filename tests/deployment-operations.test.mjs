import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(projectRoot, "scripts", "deployment-bootstrap.mjs");

test("operator tooling exposes only the reviewed non-destructive lifecycle", async () => {
  const [source, packageJson] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(path.join(projectRoot, "package.json"), "utf8").then(JSON.parse),
  ]);
  for (const operation of [
    "precheck", "prepare", "deploy", "verify", "update", "rollback", "stop", "logs", "health",
  ]) assert.match(source, new RegExp(`"${operation}"`));
  assert.match(source, /assertReviewedCheckout/);
  assert.match(source, /dirty_checkout/);
  assert.match(source, /assertImageExists/);
  assert.match(source, /"caddy", "validate", "--config", "\/etc\/caddy\/Caddyfile"/);
  assert.match(source, /--no-build/);
  assert.match(source, /\/api\/site-content/);
  assert.match(source, /\/api\/platform-qr\//);
  assert.match(source, /mutation\.status, 405/);
  assert.doesNotMatch(source, /down", "-v"|down --volumes|volume.*(?:rm|prune)|system.*prune|image.*prune/i);
  assert.doesNotMatch(source, /docker\s+(?:login|push)|\bssh\b|kubectl|NEXT_PUBLIC_/i);
  assert.equal(packageJson.scripts["deployment:bootstrap"], "node scripts/deployment-bootstrap.mjs");
});

test("operator CLI documents its contract and rejects the unconfigured example before Docker", async () => {
  const help = await execFileAsync(process.execPath, [scriptPath, "--help"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.match(help.stdout, /precheck prepare deploy verify update rollback stop logs health/);

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "precheck",
      path.join(projectRoot, "deploy", "production.env.example"),
    ], { cwd: projectRoot, encoding: "utf8" }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, "");
      assert.match(error.stderr, /^Deployment operation failed: invalid_release\./);
      assert.doesNotMatch(error.stderr, /replace-with-reviewed-git-sha/);
      return true;
    },
  );
});

test("runbook covers every operation while governance remains externally gated", async () => {
  const [runbook, status, stage] = await Promise.all([
    readFile(path.join(projectRoot, "docs", "deployment-bootstrap-runbook.md"), "utf8"),
    readFile(path.join(projectRoot, "docs", "CURRENT_STATUS.md"), "utf8"),
    readFile(path.join(projectRoot, "docs", "stage-a2-deployment-bootstrap.md"), "utf8"),
  ]);
  for (const heading of [
    "PRECHECK",
    "BUILD / PREPARE",
    "DEPLOY",
    "VERIFY",
    "UPDATE",
    "ROLLBACK",
    "STOP",
    "LOG INSPECTION",
    "HEALTH INSPECTION",
  ]) assert.match(runbook, new RegExp(`^## ${heading.replace("/", "\\/")}$`, "m"));
  assert.ok((runbook.match(/Expected result:/g) ?? []).length >= 9);
  assert.ok((runbook.match(/Failure behavior:/g) ?? []).length >= 9);
  assert.doesNotMatch(runbook, /docker compose down -v\s*```|docker volume (?:rm|prune)|docker image prune/);
  for (const document of [runbook, status, stage]) {
    assert.match(document, /EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED/);
    assert.match(document, /NOT_ONLINE_PREVIEW/);
    assert.doesNotMatch(document, /Stage status:\s*(?:`)?COMPLETE/);
  }
  assert.match(status, /Stage status: IN_PROGRESS/);
  assert.match(status, /REPO_SIDE_BOOTSTRAP_READY/);
  assert.match(stage, /CI_TLS_EVIDENCE/);
  assert.match(stage, /REAL_PRODUCTION_HTTPS_EVIDENCE/);
});
