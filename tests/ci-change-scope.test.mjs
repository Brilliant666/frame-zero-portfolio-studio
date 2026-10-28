import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyChanges, isDocumentationPath } from "../scripts/ci-change-scope.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/ci-change-scope.mjs");

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "frame-zero-ci-scope-"));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(tmpdir()), "frame-zero-ci-scope-")));
    rmSync(dir, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (file, content = "fixture\n") => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  };
  const commit = () => {
    git("add", "--all");
    git("-c", "user.name=CI fixture", "-c", "user.email=ci-fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  git("init", "--initial-branch=main");
  git("config", "core.autocrlf", "false");
  write("README.md"); write("docs/guide.md"); write("app/page.js", "export default 1;\n");
  const base = commit();
  const event = (head = git("rev-parse", "HEAD")) => ({ pull_request: { base: { sha: base }, head: { sha: head } } });
  const classify = () => classifyChanges({ eventName: "pull_request", event: event(), cwd: dir });
  const cli = (payload = event(), eventName = "pull_request") => {
    const eventFile = path.join(dir, "event.json");
    const output = path.join(dir, "output.txt");
    const summary = path.join(dir, "summary.md");
    writeFileSync(eventFile, typeof payload === "string" ? payload : JSON.stringify(payload));
    const result = spawnSync(process.execPath, [script], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    return { result, output, summary };
  };
  return { dir, git, write, commit, base, event, classify, cli };
}

test("only the explicit prose allowlist is eligible", () => {
  for (const file of ["README.md", "docs/guide.md", "docs/design/中文说明.md"]) assert.equal(isDocumentationPath(file), true);
  for (const file of ["AGENTS.md", "package.json", "package-lock.json", "docs/config.json", "public/example.md", "app/page.md", "tests/probe.md", "scripts/task.md", ".github/workflows/ci.yml", "docs/../app/page.md", "docs/./x.md", "docs//x.md", "docs/x.md\n", "docs/\ufffd.md", "docs\\x.md", "README.MD", "", null]) {
    assert.equal(isDocumentationPath(file), false, String(file));
  }
});

test("main pushes, manual and unknown events always run full checks", () => {
  for (const eventName of ["push", "workflow_dispatch", "pull_request_target", "merge_group", "", undefined]) {
    assert.equal(classifyChanges({ eventName }).runFull, true);
  }
});

test("missing, malformed or unavailable commits keep full checks", (t) => {
  const f = fixture(t);
  for (const event of [undefined, {}, { pull_request: { base: { sha: "--help" }, head: { sha: f.base } } }, { pull_request: { base: { sha: "a".repeat(40) }, head: { sha: f.base } } }]) {
    assert.equal(classifyChanges({ eventName: "pull_request", event, cwd: f.dir }).runFull, true);
  }
  assert.equal(f.classify().runFull, true, "an empty diff is not proof of docs-only work");
});

test("a real docs-only PR checks its diff and clearly reports the lightweight scope", (t) => {
  const f = fixture(t);
  f.write("docs/guide.md", "# Updated guide\n"); f.commit();
  const scope = f.classify();
  assert.equal(scope.runFull, false);
  assert.deepEqual(scope.files, ["docs/guide.md"]);
  const { result, output, summary } = f.cli();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, "utf8"), "run_full=false\n");
  assert.match(readFileSync(summary, "utf8"), /DOCS_ONLY/);
  assert.match(readFileSync(summary, "utf8"), /Heavy runtime checks are not executed/);
});

test("an earlier product change cannot be hidden by a final documentation commit", (t) => {
  const f = fixture(t);
  f.write("app/page.js", "export default 2;\n"); f.commit();
  f.write("README.md", "# Updated README\n"); f.commit();
  const scope = f.classify();
  assert.equal(scope.runFull, true);
  assert.ok(scope.files.includes("app/page.js"));
});

test("comparison uses the branch merge base when main has advanced", (t) => {
  const f = fixture(t);
  f.git("switch", "-c", "docs"); f.write("docs/guide.md", "# Branch guide\n"); const head = f.commit();
  f.git("switch", "main"); f.write("app/page.js", "export default 3;\n"); const base = f.commit();
  const result = classifyChanges({ eventName: "pull_request", event: { pull_request: { base: { sha: base }, head: { sha: head } } }, cwd: f.dir });
  assert.equal(result.runFull, false);
  assert.equal(result.mergeBase, f.base);
});

test("renaming a product file to Markdown still runs the full checks", (t) => {
  const f = fixture(t);
  f.git("mv", "app/page.js", "docs/moved.md"); f.commit();
  assert.equal(f.classify().runFull, true);
});

test("ordinary documentation rename and deletion remain lightweight", (t) => {
  const f = fixture(t);
  f.git("mv", "docs/guide.md", "docs/renamed.md"); f.commit();
  assert.equal(f.classify().runFull, false);
  f.git("rm", "docs/renamed.md"); f.commit();
  assert.equal(f.classify().runFull, false);
});

test("a .md symlink or executable is not eligible for prose-only checks", (t) => {
  for (const mode of ["120000", "100755"]) {
    const f = fixture(t);
    f.write("docs/unsafe.md", "../app/page.js\n");
    f.git("add", "docs/unsafe.md");
    const blob = f.git("rev-parse", ":docs/unsafe.md");
    f.git("update-index", "--cacheinfo", `${mode},${blob},docs/unsafe.md`);
    // Commit the deliberately altered index, without restaging the real file.
    f.git("-c", "user.name=CI fixture", "-c", "user.email=ci-fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "mode fixture");
    assert.equal(f.classify().runFull, true, mode);
  }
});

test("malformed event JSON defaults to full and never prints event contents", (t) => {
  const f = fixture(t);
  const { result, output } = f.cli("{not-json-sensitive-fixture");
  assert.equal(result.status, 0);
  assert.equal(readFileSync(output, "utf8"), "run_full=true\n");
  assert.doesNotMatch(result.stdout + result.stderr, /sensitive-fixture/);
});

test("docs whitespace failure fails the scope step instead of granting success", (t) => {
  const f = fixture(t);
  f.write("docs/guide.md", "trailing whitespace  \n"); f.commit();
  const { result } = f.cli();
  assert.notEqual(result.status, 0);
});

test("workflows retain original jobs and main/manual triggers, with conservative step gates", () => {
  for (const [file, job, heavy] of [
    ["quality.yml", "quality", "npm test"],
    ["container.yml", "container", "npm run verify:container"],
    ["deployment-bootstrap.yml", "deployment-bootstrap", "npm run verify:deployment-bootstrap"],
    ["local-accounts.yml", "postgres-integration", "node --test tests/local-accounts.test.mjs"],
  ]) {
    const yaml = readFileSync(path.join(root, ".github/workflows", file), "utf8");
    assert.ok(yaml.includes(`  ${job}:`), file);
    assert.match(yaml, /pull_request:/);
    assert.match(yaml, /workflow_dispatch:/);
    assert.match(yaml, /branches:.*main|branches:\s*\n\s*- main/);
    assert.doesNotMatch(yaml, /paths-ignore:|\n\s*paths:|continue-on-error:/);
    assert.match(yaml, /fetch-depth: 0/);
    assert.match(yaml, /id: scope\s*\n\s*run: node scripts\/ci-change-scope\.mjs/);
    assert.ok(yaml.includes(heavy));
    const heavyStep = yaml.split(/\n\s+- /).find((step) => step.includes(heavy));
    assert.ok(heavyStep.includes("if: steps.scope.outputs.run_full != 'false'"), file);
  }
  const safety = readFileSync(path.join(root, ".github/workflows/asset-safety.yml"), "utf8");
  assert.match(safety, /run: npm run check:public/);
  assert.doesNotMatch(safety, /ci-change-scope|run_full|npm ci/);
  const scanner = readFileSync(path.join(root, "scripts/check-public-safety.mjs"), "utf8");
  assert.ok([...scanner.matchAll(/^import .*from "([^"]+)"/gm)].every((match) => match[1].startsWith("node:")), "the always-on scanner needs no installed packages");
  const quality = readFileSync(path.join(root, ".github/workflows/quality.yml"), "utf8");
  assert.match(quality, /if: steps\.scope\.outputs\.run_full == 'false'\s*\n\s*run: node --test tests\/deployment-operations\.test\.mjs tests\/pr24-limited-closure\.test\.mjs/);
});
