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
const siteCss = ".site{}";
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
  const manifest = (route, js, css, suffix = "") => put(`server/app/${route ? `${route}/` : ""}page_client-reference-manifest.js`,
    `globalThis.__RSC_MANIFEST["/${route ? `${route}/` : ""}page"] = ${JSON.stringify({ entryJSFiles: { [`[project]/app/${route ? `${route}/` : ""}page${suffix}`]: js }, entryCSSFiles: { [`[project]/app/${route ? `${route}/` : ""}page${suffix}`]: css.map((file) => ({ path: file, inlined: false })) } })};`);
  manifest("", ["static/chunks/home.js", "static/chunks/shared.js", "static/chunks/shared.js"], ["static/chunks/common.css"]);
  manifest("test", ["static/chunks/test.js", "static/chunks/shared.js"], ["static/chunks/common.css", "static/chunks/common.css"]);
  put("server/app-paths-manifest.json", { "/[siteSlug]/page": "app/[siteSlug]/page.js" });
  manifest("[siteSlug]", ["static/chunks/site.js", "static/chunks/shared.js", "static/chunks/site.js"], ["static/chunks/common.css", "static/chunks/site.css", "static/chunks/site.css"], ".node");
  put("static/chunks/site.js", "public-site");
  put("static/chunks/site.css", siteCss);
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
  assert.deepEqual(result.routeEntries.map((route) => route.staticEntryCssBytes), [Buffer.byteLength(commonCss), Buffer.byteLength(commonCss), Buffer.byteLength(commonCss + siteCss)]);
  assert.equal(result.routeEntries[2].route, "/:siteSlug");
  assert.equal(result.routeEntries[2].staticEntryJsBytes, Buffer.byteLength("sharedpublic-site"));
  assert.deepEqual(result.routeEntries[2].jsFiles, ["static/chunks/site.js", "static/chunks/shared.js"]);
  assert.deepEqual(result.routeEntries[2].cssFiles, ["static/chunks/common.css", "static/chunks/site.css"]);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, []);
  const run = f.run();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Route \/ static entry estimate/);
  assert.match(run.stdout, /Route \/test static entry estimate/);
  assert.match(run.stdout, /Route \/:siteSlug static entry estimate[^\n]*JS 17 bytes/);
  assert.match(run.stdout, /excludes lazy templates/);
  assert.match(run.stdout, /NOT gzip\/br/);
  assert.match(run.stdout, /Published photography content.*NOT_MEASURED/);
});

test("Next public Site also measures an ordinary page entry", (t) => {
  const f = fixture(t);
  f.manifest("[siteSlug]", ["static/chunks/site.js"], ["static/chunks/site.css"]);
  const route = enforceNextBuildBudget(f.root).routeEntries[2];
  assert.equal(route.staticEntryJsBytes, Buffer.byteLength("sharedpublic-site"));
  assert.equal(route.staticEntryCssBytes, Buffer.byteLength(siteCss));
});

test("Next public Site entries stay independent of / + /test aggregates and eager template classification", (t) => {
  const f = fixture(t);
  const before = enforceNextBuildBudget(f.root);
  const templateFile = `static/chunks/${TEMPLATE_IDS[0]}.js`;
  f.manifest("[siteSlug]", ["static/chunks/site.js", "static/chunks/shared.js", templateFile, templateFile], ["static/chunks/site.css"], ".node");
  const publicSource = '"static/chunks/site-only-lazy.js"';
  f.put("static/chunks/site.js", publicSource);
  f.put("static/chunks/site-only-lazy.js", "x".repeat(800_000));
  f.put("static/chunks/site.css", siteCss.repeat(123));
  const result = enforceNextBuildBudget(f.root);
  assert.equal(result.applicationJsBytes, before.applicationJsBytes);
  assert.equal(result.bootstrapJsBytes, before.bootstrapJsBytes);
  assert.equal(result.publicCssBytes, before.publicCssBytes);
  assert.deepEqual(result.templateChunks, before.templateChunks);
  assert.equal(result.templateChunks.length, 11);
  assert.equal(result.routeEntries[2].staticEntryJsBytes, Buffer.byteLength("shared" + publicSource + `${TEMPLATE_IDS[0]} ${token}`));
  assert.equal(result.routeEntries[2].staticEntryCssBytes, Buffer.byteLength(siteCss.repeat(123)));
  assert.deepEqual(result.warnings, []);
});

for (const [label, damage, jsMissing = true, cssMissing = true] of [
  ["missing app paths manifest", (f) => rmSync(path.join(f.root, ".next/server/app-paths-manifest.json"))],
  ["malformed app paths manifest", (f) => f.put("server/app-paths-manifest.json", "{")],
  ["missing public route mapping", (f) => f.put("server/app-paths-manifest.json", {})],
  ["invalid public route mapping", (f) => f.put("server/app-paths-manifest.json", { "/[siteSlug]/page": 42 })],
  ["missing client manifest", (f) => rmSync(path.join(f.root, ".next/server/app/[siteSlug]/page_client-reference-manifest.js"))],
  ["unknown client manifest format", (f) => f.put("server/app/[siteSlug]/page_client-reference-manifest.js", "changed format")],
  ["unknown page entry", (f) => f.manifest("[siteSlug]", ["static/chunks/site.js"], ["static/chunks/site.css"], ".unknown")],
  ["ambiguous page entries", (f) => f.put("server/app/[siteSlug]/page_client-reference-manifest.js", `globalThis.__RSC_MANIFEST["/[siteSlug]/page"] = ${JSON.stringify({ entryJSFiles: { "[project]/app/[siteSlug]/page": ["static/chunks/site.js"], "[project]/app/[siteSlug]/page.node": ["static/chunks/site.js"] } })};`)],
  ["empty JS entry", (f) => f.manifest("[siteSlug]", [], ["static/chunks/site.css"], ".node"), true, false],
  ["empty CSS entry", (f) => f.manifest("[siteSlug]", ["static/chunks/site.js"], [], ".node"), false, true],
  ["missing JS resource", (f) => rmSync(path.join(f.root, ".next/static/chunks/site.js")), true, false],
  ["missing CSS resource", (f) => rmSync(path.join(f.root, ".next/static/chunks/site.css")), false, true],
  ["non-file CSS resource", (f) => { rmSync(path.join(f.root, ".next/static/chunks/site.css")); mkdirSync(path.join(f.root, ".next/static/chunks/site.css")); }, false, true],
  ["JS path escape", (f) => f.manifest("[siteSlug]", ["../../outside.js"], ["static/chunks/site.css"], ".node"), true, false],
]) {
  test(`Next public Site fails closed: ${label}`, (t) => {
    const f = fixture(t);
    damage(f);
    const result = inspectNextBuild(f.root);
    assert.equal(result.routeEntries[2].staticEntryJsBytes === null, jsMissing);
    assert.equal(result.routeEntries[2].staticEntryCssBytes === null, cssMissing);
    assert.ok(result.errors.length);
    assert.throws(() => enforceNextBuildBudget(f.root));
    const run = f.run();
    assert.equal(run.status, 1);
    assert.match(run.stdout, /Route \/:siteSlug static entry estimate[^\n]*NOT_MEASURED/);
  });
}

// Next 16.4.1's dynamic JS/CSS loader shape, as emitted for cinematic-light.
const dynamicLoader = (files) => `e.v(t=>Promise.all(${JSON.stringify(files)}.map(t=>e.l(t))).then(()=>t(12863)))`;

test("Next traces lazy global CSS alongside template JS, deduplicates it and excludes unrelated dynamic CSS", (t) => {
  const f = fixture(t);
  const globalCss = ".hero{min-height:100svh}.topbar{display:grid}";
  const files = [`static/chunks/${TEMPLATE_IDS[0]}.js`, "static/chunks/common.css", "static/chunks/cinematic.css", "static/chunks/cinematic.css"];
  const loader = dynamicLoader(files);
  f.put("static/chunks/cinematic.css", globalCss);
  f.put("static/chunks/home.js", loader);
  f.put("static/chunks/test.js", f.lazySource + loader + dynamicLoader(["static/chunks/site.js", "static/chunks/site.css"]));
  const result = enforceNextBuildBudget(f.root);
  assert.equal(result.publicCssBytes, Buffer.byteLength(commonCss + globalCss));
  assert.equal(result.templateChunks.length, 11);
  assert.deepEqual(result.routeEntries.map((route) => route.staticEntryCssBytes), [Buffer.byteLength(commonCss), Buffer.byteLength(commonCss), Buffer.byteLength(commonCss + siteCss)]);
  assert.deepEqual(result.lazyTemplateCss, ["static/chunks/home.js", "static/chunks/test.js"].map((sourcePath) => ({
    sourcePath, jsFiles: [files[0]], cssFiles: ["static/chunks/common.css", "static/chunks/cinematic.css"],
  })));
  const run = f.run();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Lazy template CSS via static\/chunks\/test.js.*cinematic.css/);
});

test("Next traces global CSS loaded within a measured lazy template chunk", (t) => {
  const f = fixture(t);
  const globalCss = ".hero{display:grid}";
  f.put("static/chunks/cinematic.css", globalCss);
  f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, `${TEMPLATE_IDS[0]} ${token};` + dynamicLoader(["static/chunks/cinematic.css"]));
  const result = enforceNextBuildBudget(f.root);
  assert.equal(result.publicCssBytes, Buffer.byteLength(commonCss + globalCss));
  assert.deepEqual(result.lazyTemplateCss, [{ sourcePath: `static/chunks/${TEMPLATE_IDS[0]}.js`, jsFiles: [], cssFiles: ["static/chunks/cinematic.css"] }]);
});

for (const [label, cssPath, damage] of [
  ["missing global CSS", "static/chunks/cinematic.css", () => {}],
  ["non-file global CSS", "static/chunks/cinematic.css", (f) => mkdirSync(path.join(f.root, ".next/static/chunks/cinematic.css"))],
  ["global CSS path escape", "static/chunks/../../../outside.css", () => {}],
  ["invalid loader resource", "static/chunks/cinematic.css", (f) => f.put("static/chunks/test.js", f.lazySource + dynamicLoader([`static/chunks/${TEMPLATE_IDS[0]}.js`, "static/chunks/cinematic.css", 42]))],
]) {
  test(`Next lazy global CSS fails closed: ${label}`, (t) => {
    const f = fixture(t);
    f.put("static/chunks/test.js", f.lazySource + dynamicLoader([`static/chunks/${TEMPLATE_IDS[0]}.js`, cssPath]));
    damage(f);
    const result = inspectNextBuild(f.root);
    assert.equal(result.publicCssBytes, null);
    assert.ok(result.errors.length);
    assert.equal(result.routeEntries[1].staticEntryCssBytes, Buffer.byteLength(commonCss));
    assert.throws(() => enforceNextBuildBudget(f.root));
    const run = f.run();
    assert.equal(run.status, 1);
    assert.match(run.stdout, /public CSS NOT_MEASURED/);
  });
}

test("Next traces a single-resource CSS loader inside a measured template", (t) => {
  const f = fixture(t);
  const css = '.hero{display:grid}';
  f.put('static/chunks/cinematic.css', css);
  f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, `${TEMPLATE_IDS[0]} ${token};e.l("static/chunks/cinematic.css")`);
  assert.equal(enforceNextBuildBudget(f.root).publicCssBytes, Buffer.byteLength(commonCss + css));
});

for (const [label, loader] of [
  ['missing single-resource CSS', 'e.l("static/chunks/missing-cinematic.css")'],
  ['unsupported CSS loader', 'e.loadStyles("static/chunks/cinematic.css")'],
]) {
  test(`Next lazy CSS fails closed: ${label}`, (t) => {
    const f = fixture(t);
    f.put('static/chunks/cinematic.css', '.hero{}');
    f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, `${TEMPLATE_IDS[0]} ${token};${loader}`);
    const result = inspectNextBuild(f.root);
    assert.equal(result.publicCssBytes, null);
    assert.ok(result.errors.length);
    assert.throws(() => enforceNextBuildBudget(f.root));
    assert.equal(f.run().status, 1);
  });
}

// Export-table and class-name shapes taken from the Next 16.4.1 production
// neon-hud / shared-contact chunks, including the numeric-hash CSS escape.
const compactCssExports = 'e.v({archive:"_6mI5aW_archive",root:"_6mI5aW_root"})},77540,e=>{e.v({account:"DsAYtG_account",profileLink:"DsAYtG_profileLink"})';
const compactTokens = ["_6mI5aW_archive", "_6mI5aW_root", "DsAYtG_account", "DsAYtG_profileLink"];

test("Next 16.4.1 compact CSS module exports trace every token and retain legacy support", (t) => {
  const f = fixture(t);
  const css = compactTokens.map((name) => `.${name}{}`).join("") + ".IaG2-G_canvas{}";
  f.put("static/chunks/compact.css", css);
  for (const id of TEMPLATE_IDS) {
    f.put(`static/chunks/${id}.js`, `${id};${compactCssExports};e.v({canvas:"IaG2-G_canvas",legacy:"${token}"})`);
  }
  const result = enforceNextBuildBudget(f.root);
  assert.equal(result.publicCssBytes, Buffer.byteLength(commonCss) + Buffer.byteLength(css));
  assert.deepEqual(result.errors, []);
  assert.equal(f.run().status, 0);
});

for (const [label, exports, css] of [
  ["missing compact CSS", compactCssExports, ""],
  ["partially traced compact CSS", compactCssExports, ".DsAYtG_account{}"],
  ["missing compact token alongside legacy CSS", `e.v({root:"_6mI5aW_root",legacy:"${token}"})`, ""],
  ["unknown compact export value", 'e.v({account:"DsAYtG_account",root:"unknown_shape"})', ".DsAYtG_account{}"],
  ["non-string compact export", 'e.v({account:"DsAYtG_account",root:42})', ".DsAYtG_account{}"],
  ["nested unknown export alongside a known table", 'e.v({account:"DsAYtG_account"});e.v({root:{value:"_6mI5aW_root"}})', ".DsAYtG_account{}._6mI5aW_root{}"],
  ["compact-looking string without a module export", '"DsAYtG_account"', ".DsAYtG_account{}"],
]) {
  test(`Next compact CSS integrity error remains blocking: ${label}`, (t) => {
    const f = fixture(t);
    f.put(`static/chunks/${TEMPLATE_IDS[0]}.js`, `${TEMPLATE_IDS[0]};${exports}`);
    f.put("static/chunks/compact.css", css);
    assert.equal(inspectNextBuild(f.root).publicCssBytes, null);
    assert.throws(() => enforceNextBuildBudget(f.root));
    assert.equal(f.run().status, 1);
  });
}

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
  // Missing entry JS also makes its possible lazy CSS dependencies unknowable.
  assert.equal(result.publicCssBytes, null);
  assert.equal(result.routeEntries[0].staticEntryCssBytes, 400_000);
  assert.ok(result.errors.length);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /cross-route public CSS is at least 400000 bytes/);
  assert.throws(() => enforceNextBuildBudget(f.root), (error) => error.result.publicCssBytes === null);
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
