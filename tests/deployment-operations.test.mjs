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

async function deploymentDocumentation(readSource = (filename) => readFile(path.join(projectRoot, filename), "utf8")) {
  const [runbook, historicalStatus, stage] = await Promise.all([
    readSource("docs/deployment-bootstrap-runbook.md"),
    readSource("docs/CURRENT_STATUS_HISTORY_2026-10-27.md"),
    readSource("docs/stage-a2-deployment-bootstrap.md"),
  ]);
  return { runbook, historicalStatus, stage };
}

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
  const { runbook, historicalStatus, stage } = await deploymentDocumentation();
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
  // Approval is a continuing operating rule. NOT_ONLINE_PREVIEW and the old
  // freeze are dated Stage A2 facts, not permanent current-checkpoint values.
  assert.match(runbook, /EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED/);
  for (const document of [historicalStatus, stage]) {
    assert.match(document, /EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED/);
    assert.match(document, /NOT_ONLINE_PREVIEW/);
    assert.doesNotMatch(document, /Stage status:\s*(?:`)?COMPLETE/);
  }
  assert.match(historicalStatus, /Remote deployment: FROZEN \/ NOT_AUTHORIZED/);
  assert.match(historicalStatus, /REPO_SIDE_BOOTSTRAP_READY/);
  assert.match(stage, /CI_TLS_EVIDENCE/);
  assert.match(stage, /REAL_PRODUCTION_HTTPS_EVIDENCE/);
});

test("deployment documentation checks do not bind current state to the Stage A2 freeze", async () => {
  const requested = [];
  const documents = await deploymentDocumentation(async (filename) => {
    requested.push(filename);
    assert.notEqual(filename, "docs/CURRENT_STATUS.md", "a current stage may legitimately advance after authorization");
    return readFile(path.join(projectRoot, filename), "utf8");
  });
  assert.match(documents.runbook, /EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED/);
  assert.match(documents.historicalStatus, /Remote deployment: FROZEN \/ NOT_AUTHORIZED/);
  assert.match(documents.stage, /NOT_ONLINE_PREVIEW/);
  assert.deepEqual(requested, [
    "docs/deployment-bootstrap-runbook.md",
    "docs/CURRENT_STATUS_HISTORY_2026-10-27.md",
    "docs/stage-a2-deployment-bootstrap.md",
  ]);
});

test("the retired one-time publishing script rejects execution before GitHub or Git operations", async (t) => {
  const retiredPath = path.join(projectRoot, "scripts", "publish-public-repo.ps1");
  const executableLines = (await readFile(retiredPath, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  // Check the guard before invoking PowerShell, so removing it cannot make this
  // regression test execute the retained historical publishing body.
  assert.equal(executableLines[0], '$ErrorActionPreference = "Stop"');
  assert.match(executableLines[1], /^throw "HISTORICAL_BOOTSTRAP_RETIRED:/);
  let result;
  try {
    await execFileAsync("pwsh", ["-NoProfile", "-File", retiredPath], {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.fail("the historical publishing script must never execute its former body");
  } catch (error) {
    if (error.code === "ENOENT") {
      t.skip("PowerShell is unavailable; no historical publishing command was executed");
      return;
    }
    result = error;
  }
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HISTORICAL_BOOTSTRAP_RETIRED/);
  assert.doesNotMatch(result.stdout + result.stderr, /GitHub CLI is required|not authenticated|Authenticate GitHub CLI|Working tree must be clean/);
});
