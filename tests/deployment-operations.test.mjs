import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

const retiredTimeoutMs = 10_000;
const diagnosticOutputLimit = 2_048;
const retiredMarker = /HISTORICAL_BOOTSTRAP_RETIRED/;
const historicalBodyOutput = /GitHub CLI is required|not authenticated|Authenticate GitHub CLI|Working tree must be clean/;

function assertRetiredGuard(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  // Never run the retained historical body if its unconditional guard is missing.
  assert.equal(lines[0], '$ErrorActionPreference = "Stop"');
  assert.match(lines[1], /^throw "HISTORICAL_BOOTSTRAP_RETIRED:/);
}

async function isolatedRetiredCheck(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "retired-script-check-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // No repository, user profile, GitHub tokens or inherited application config.
  const env = Object.fromEntries(
    ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "PATHEXT", "COMSPEC", "PSModulePath"]
      .filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
  Object.assign(env, {
    HOME: directory, USERPROFILE: directory, APPDATA: directory, LOCALAPPDATA: directory,
    XDG_CONFIG_HOME: directory, GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(directory, "absent.gitconfig"),
  });
  return { cwd: directory, env };
}

// Local to this refusal test: preserve the original arguments and 10-second limit.
async function refusalProcess(executable, args, { cwd, env, timeoutMs = retiredTimeoutMs, observeChild } = {}) {
  const start = performance.now();
  const pending = execFileAsync(executable, args, { cwd, env, encoding: "utf8", timeout: timeoutMs });
  observeChild?.(pending.child); // Only controlled fixtures send a signal to their own child.
  try {
    const { stdout, stderr } = await pending;
    return { code: 0, signal: null, killed: false, elapsedMs: Math.round(performance.now() - start), timeoutMs, stdout, stderr };
  } catch (error) {
    return {
      code: error.code ?? null, signal: error.signal ?? null, killed: error.killed ?? false,
      elapsedMs: Math.round(performance.now() - start), timeoutMs,
      stdout: error.stdout ?? "", stderr: error.stderr ?? "",
      message: String(error.message ?? "").slice(0, 512),
    };
  }
}

function refusalDiagnostic(result, runtime = {}) {
  const { stdout, stderr, ...termination } = result;
  const bounded = (value) => ({ text: value.slice(0, diagnosticOutputLimit), length: value.length, truncated: value.length > diagnosticOutputLimit });
  return JSON.stringify({
    ...termination, stdout: bounded(stdout), stderr: bounded(stderr),
    node: { version: process.version, platform: process.platform, arch: process.arch },
    runner: Object.fromEntries(["RUNNER_OS", "RUNNER_ARCH", "ImageOS", "ImageVersion"]
      .filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
    ...runtime,
  });
}

function assertRetiredRefusal(result, runtime) {
  const diagnostic = "Retired publishing refusal process: " + refusalDiagnostic(result, runtime);
  assert.equal(result.code, 1, diagnostic);
  assert.equal(result.signal, null, diagnostic);
  assert.equal(result.killed, false, diagnostic);
  // Test the complete output, but never let an assertion dump unbounded output.
  assert.ok(retiredMarker.test(result.stderr), diagnostic);
  assert.ok(!historicalBodyOutput.test(result.stdout + result.stderr), diagnostic);
}

test("the retired one-time publishing script rejects execution before GitHub or Git operations", async (t) => {
  const source = await readFile(path.join(projectRoot, "scripts", "publish-public-repo.ps1"), "utf8");
  assertRetiredGuard(source);
  const isolated = await isolatedRetiredCheck(t);
  const retiredPath = path.join(isolated.cwd, "publish-public-repo.ps1");
  await writeFile(retiredPath, source);
  // Measure the original refusal before a version probe can warm PowerShell.
  const result = await refusalProcess("pwsh", ["-NoProfile", "-File", retiredPath], isolated);
  const version = await refusalProcess("pwsh", ["-NoProfile", "-Command",
    "[pscustomobject]@{version=$PSVersionTable.PSVersion.ToString();path=[Environment]::ProcessPath;edition=$PSVersionTable.PSEdition}|ConvertTo-Json -Compress",
  ], isolated);
  const runtime = { powershell: { command: "pwsh", arguments: ["-NoProfile", "-File"], probe: JSON.parse(refusalDiagnostic(version)) } };
  t.diagnostic("Retired refusal: " + refusalDiagnostic(result, runtime));
  assertRetiredRefusal(result, runtime);
});

test("retired refusal diagnostics preserve strict failures with harmless child fixtures", async (t) => {
  const isolated = await isolatedRetiredCheck(t);
  const fixture = (source, options = {}) => refusalProcess(process.execPath, ["-e", source], { ...isolated, ...options });
  const rejects = (result) => assert.throws(() => assertRetiredRefusal(result), (error) => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.match(error.message, /"code":/);
    assert.match(error.message, /"signal":/);
    assert.match(error.message, /"killed":/);
    assert.match(error.message, /"elapsedMs":/);
    assert.match(error.message, /"timeoutMs":/);
    assert.match(error.message, /"stdout":/);
    assert.match(error.message, /"stderr":/);
    return true;
  });

  await t.test("exit 1 and the retirement marker still pass", async () => {
    assertRetiredRefusal(await fixture("process.stderr.write('HISTORICAL_BOOTSTRAP_RETIRED');process.exitCode=1"));
  });
  await t.test("exit 0 is rejected even with the retirement marker", async () => {
    rejects(await fixture("process.stderr.write('HISTORICAL_BOOTSTRAP_RETIRED')"));
  });
  await t.test("exit 1 without the retirement marker is rejected", async () => {
    rejects(await fixture("process.stderr.write('CONTROLLED_OTHER_ERROR');process.exitCode=1"));
  });
  await t.test("a timed-out process is rejected and reports its termination", async () => {
    const result = await fixture("setInterval(()=>{},1000)", { timeoutMs: 250 });
    assert.equal(result.killed, true, refusalDiagnostic(result));
    assert.equal(result.signal, "SIGTERM", refusalDiagnostic(result));
    rejects(result);
  });
  await t.test("a signalled process is rejected even after writing the retirement marker", async () => {
    const result = await fixture("process.stderr.write('HISTORICAL_BOOTSTRAP_RETIRED');process.stdout.write('READY');setInterval(()=>{},1000)", {
      observeChild: (child) => child.stdout.once("data", () => child.kill("SIGTERM")),
    });
    assert.ok(retiredMarker.test(result.stderr), refusalDiagnostic(result));
    assert.equal(result.killed, true, refusalDiagnostic(result));
    assert.equal(result.signal, "SIGTERM", refusalDiagnostic(result));
    rejects(result);
  });
  await t.test("bounded diagnostics do not hide forbidden output beyond the excerpt", async () => {
    const result = await fixture("process.stderr.write('HISTORICAL_BOOTSTRAP_RETIRED');process.stdout.write('x'.repeat(9000)+'GitHub CLI is required');process.exitCode=1");
    const diagnostic = JSON.parse(refusalDiagnostic(result));
    assert.equal(diagnostic.stdout.truncated, true);
    assert.equal(diagnostic.stdout.text.length, diagnosticOutputLimit);
    assert.equal(diagnostic.stdout.length, result.stdout.length);
    rejects(result);
  });
  await t.test("a missing pre-execution guard is rejected without running any script", () => {
    assert.throws(() => assertRetiredGuard('$ErrorActionPreference = "Stop"\nWrite-Output "HISTORICAL_BOOTSTRAP_RETIRED"'));
  });
});
