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
  assert.match(source, /--no-build/);
  assert.match(source, /\/api\/site-content/);
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
