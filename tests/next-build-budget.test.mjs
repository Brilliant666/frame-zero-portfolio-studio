import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectNextBuild, enforceNextBuildBudget, TEMPLATE_IDS } from "../scripts/check-next-build-budget.mjs";

const cli = fileURLToPath(new URL("../scripts/check-next-build-budget.mjs", import.meta.url));
const token = "template-module__abc__root";
const commonCss = `body{}.${token}{}`;
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "next-budget-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, data) => {
    const target = path.join(root, ".next", file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof data === "string" ? data : JSON.stringify(data));
  };
  put("standalone/server.js", "server");
  put("build-manifest.json", { polyfillFiles: ["static/chunks/shared.js"], rootMainFiles: ["static/chunks/shared.js"] });
  const manifest = (route, js, css) => put(`server/app/${route ? `${route}/` : ""}page_client-reference-manifest.js`,
    `globalThis.__RSC_MANIFEST["/${route ? `${route}/` : ""}page"] = ${JSON.stringify({ entryJSFiles: { [`[project]/app/${route ? `${route}/` : ""}page`]: js }, entryCSSFiles: { [`[project]/app/${route ? `${route}/` : ""}page`]: css.map((file) => ({ path: file })) } })};`);
  manifest("", ["static/chunks/home.js", "static/chunks/shared.js", "static/chunks/shared.js"], ["static/chunks/common.css"]);
  manifest("test", ["static/chunks/test.js", "static/chunks/shared.js"], ["static/chunks/common.css", "static/chunks/common.css"]);
  put("static/chunks/home.js", "home");
  put("static/chunks/shared.js", "shared");
  put("static/chunks/common.css", commonCss);
  const lazySource = TEMPLATE_IDS.map((id) => `"static/chunks/${id}.js"`).join(";");
  put("static/chunks/test.js", lazySource);
  for (const id of TEMPLATE_IDS) put(`static/chunks/${id}.js`, `${id} ${token}`);
  return { root, put, manifest, lazySource, run: () => spawnSync(process.execPath, [cli], { cwd: root, encoding: "utf8" }) };
}

test("Next valid artifacts: exact deduplicated raw and route estimates, function and CLI pass", (t) => {
  const f = fixture(t);
  const result = enforceNextBuildBudget(f.root);
  const lazyBytes = TEMPLATE_IDS.reduce((sum, id) => sum + Buffer.byteLength(`${id} ${token}`), 0);
  assert.equal(result.applicationJsBytes, 10 + Buffer.byteLength(f.lazySource) + lazyBytes);
  assert.equal(result.bootstrapJsBytes, 10 + Buffer.byteLength(f.lazySource));
  assert.equal(result.publicCssBytes, Buffer.byteLength(commonCss));
  assert.equal(result.routeEntries[0].staticEntryJsBytes, 10);
  assert.equal(result.routeEntries[1].staticEntryJsBytes, 6 + Buffer.byteLength(f.lazySource));
  assert.deepEqual(result.routeEntries.map((route) => route.staticEntryCssBytes), [Buffer.byteLength(commonCss), Buffer.byteLength(commonCss)]);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, []);
  const run = f.run();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Route \/ static entry estimate/);
  assert.match(run.stdout, /Route \/test static entry estimate/);
  assert.match(run.stdout, /excludes lazy templates/);
  assert.match(run.stdout, /NOT gzip\/br/);
  assert.match(run.stdout, /Published photography content.*NOT_MEASURED/);
});

test("Next all three aggregate references warn, even for a large artifact, without blocking callers or CLI", (t) => {
  const f = fixture(t);
  f.put("static/chunks/home.js", "x".repeat(2_000_000));
  f.put("static/chunks/common.css", commonCss.padEnd(400_000));
  const result = enforceNextBuildBudget(f.root);
  assert.equal(result.warnings.length, 3);
  assert.equal(result.bootstrapJsBytes, 2_000_006 + Buffer.byteLength(f.lazySource));
  assert.equal(result.publicCssBytes, 400_000);
  assert.match(result.warnings.join("\n"), /reference 563200 bytes/);
  assert.match(result.warnings.join("\n"), /reference 716800 bytes/);
  assert.match(result.warnings.join("\n"), /reference 307200 bytes/);
  const run = f.run();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /WARNING: cross-route public CSS is 400000 bytes/);
  assert.match(run.stdout, /passed with size warnings/);
});

test("Next missing resource and excess CSS report both warning and error; unreadable measurement is not zero", (t) => {
  const f = fixture(t);
  f.put("static/chunks/common.css", commonCss.padEnd(400_000));
  rmSync(path.join(f.root, ".next/static/chunks/home.js"));
  const result = inspectNextBuild(f.root);
  assert.equal(result.applicationJsBytes, null);
  assert.equal(result.routeEntries[0].staticEntryJsBytes, null);
  assert.equal(result.publicCssBytes, 400_000);
  assert.ok(result.errors.length);
  assert.equal(result.warnings.length, 1);
  assert.throws(() => enforceNextBuildBudget(f.root), (error) => error.result.publicCssBytes === 400_000);
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stdout, /NOT_MEASURED/);
  assert.match(run.stderr, /WARNING:/);
  assert.match(run.stderr, /ERROR:/);
});

for (const [label, damage] of [
  ["missing manifest", (f) => rmSync(path.join(f.root, ".next/build-manifest.json"))],
  ["malformed manifest", (f) => f.put("build-manifest.json", "{")],
  ["unknown client manifest format", (f) => f.put("server/app/page_client-reference-manifest.js", "changed format")],
  ["invalid resource number", (f) => f.put("build-manifest.json", { polyfillFiles: [42], rootMainFiles: [] })],
  ["NaN resource", (f) => f.put("build-manifest.json", '{"polyfillFiles":[NaN],"rootMainFiles":[]}')],
  ["missing standalone", (f) => rmSync(path.join(f.root, ".next/standalone/server.js"))],
  ["unreadable non-file resource", (f) => { rmSync(path.join(f.root, ".next/static/chunks/home.js")); mkdirSync(path.join(f.root, ".next/static/chunks/home.js")); }],
  ["path escape", (f) => f.put("build-manifest.json", { polyfillFiles: ["../../outside.js"], rootMainFiles: [] })],
  ["missing lazy template", (f) => rmSync(path.join(f.root, `.next/static/chunks/${TEMPLATE_IDS[0]}.js`))],
  ["eager instead of lazy template", (f) => f.manifest("test", ["static/chunks/test.js", `static/chunks/${TEMPLATE_IDS[0]}.js`], ["static/chunks/common.css"])],
  ["untraceable CSS", (f) => f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, `${TEMPLATE_IDS[0]} unknown-module__abc__token`)],
  ["unknown CSS token format", (f) => f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, TEMPLATE_IDS[0])],
  ["partially traced CSS tokens", (f) => f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, `${TEMPLATE_IDS[0]} ${token} missing-module__abc__root`)],
]) {
  test(`Next integrity error remains blocking: ${label}`, (t) => {
    const f = fixture(t); damage(f);
    assert.ok(inspectNextBuild(f.root).errors.length);
    assert.throws(() => enforceNextBuildBudget(f.root));
    assert.equal(f.run().status, 1);
  });
}

test("Next symlink directory cannot redirect a resource outside .next", (t) => {
  const f = fixture(t);
  const outside = path.join(f.root, "outside");
  mkdirSync(outside);
  writeFileSync(path.join(outside, "asset.js"), "outside");
  symlinkSync(outside, path.join(f.root, ".next/linked"), process.platform === "win32" ? "junction" : "dir");
  f.put("build-manifest.json", { polyfillFiles: ["linked/asset.js"], rootMainFiles: [] });
  assert.match(inspectNextBuild(f.root).errors.join("\n"), /escapes/);
  assert.equal(f.run().status, 1);
});

test("Next precise single-template JS limit stays a hard error", (t) => {
  const f = fixture(t);
  f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, `${TEMPLATE_IDS[0]} ${token}` + " ".repeat(65_537));
  assert.match(inspectNextBuild(f.root).errors.join("\n"), /cinematic-light lazy JS/);
  assert.throws(() => enforceNextBuildBudget(f.root));
  assert.equal(f.run().status, 1);
});

test("Next empty required route entries are NOT_MEASURED, not zero-byte successes", (t) => {
  const f = fixture(t);
  f.manifest("", [], []);
  const result = inspectNextBuild(f.root);
  assert.equal(result.routeEntries[0].staticEntryJsBytes, null);
  assert.equal(result.routeEntries[0].staticEntryCssBytes, null);
  assert.equal(result.applicationJsBytes, null);
  assert.equal(result.bootstrapJsBytes, null);
  assert.equal(result.publicCssBytes, null);
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stdout, /Route \/ static entry estimate[^\n]*JS NOT_MEASURED, CSS NOT_MEASURED/);
});

test("Next unreadable CSS mapping source invalidates the aggregate CSS measurement", (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.root, ".next/static/chunks/unreadable.css"));
  const result = inspectNextBuild(f.root);
  assert.equal(result.publicCssBytes, null);
  assert.equal(result.routeEntries[0].staticEntryCssBytes, Buffer.byteLength(commonCss));
  assert.ok(result.errors.length);
  assert.equal(f.run().status, 1);
});

test("Next a single incomplete aggregate keeps its known oversized lower-bound warning", (t) => {
  const f = fixture(t);
  f.put("static/chunks/home.js", "x".repeat(2_000_000));
  f.manifest("", ["static/chunks/home.js", "static/chunks/missing.js"], ["static/chunks/common.css"]);
  const result = inspectNextBuild(f.root);
  assert.equal(result.applicationJsBytes, null);
  assert.equal(result.bootstrapJsBytes, null);
  assert.match(result.warnings.join("\n"), /cross-route application JS is at least 2000\d+ bytes \(incomplete/);
  assert.ok(result.errors.length);
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /WARNING:.*at least/);
  assert.match(run.stderr, /ERROR:/);
});
