import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { checkLegacyBuildBudget } from "../scripts/check-build-budget.mjs";

const names = ["archive-os", "character-select", "cinematic-light", "editorial-duet", "film-rail", "manga-panels", "museum-depth", "neon-hud", "orbital-portal", "polaroid-field", "prism-liquid"];
const script = fileURLToPath(new URL("../scripts/check-build-budget.mjs", import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "legacy-budget-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const client = join(root, "dist/client");
  mkdirSync(join(client, ".vite"), { recursive: true });
  mkdirSync(join(client, "assets"));
  const manifest = { entry: { file: "assets/entry.js", isEntry: true, imports: ["shared"], dynamicImports: names.map((name) => `app/templates/${name}/template.tsx`) }, shared: { file: "assets/shared.js", css: ["assets/shared.css"] }, "app/admin/editor.tsx": { file: "assets/admin.js", isDynamicEntry: true, imports: ["shared"] } };
  function asset(file, bytes) { writeFileSync(join(client, file), Buffer.alloc(bytes, 32)); }
  asset("assets/entry.js", 100); asset("assets/shared.js", 20); asset("assets/shared.css", 30); asset("assets/admin.js", 40);
  for (const name of names) { manifest[`app/templates/${name}/template.tsx`] = { file: `assets/${name}.js`, isDynamicEntry: true, imports: ["shared"], css: ["assets/shared.css", "assets/shared.css"] }; asset(`assets/${name}.js`, 10); }
  const save = () => writeFileSync(join(client, ".vite/manifest.json"), JSON.stringify(manifest));
  save();
  const run = () => { save(); return checkLegacyBuildBudget({ root }); };
  const cli = () => spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  return { root, client, manifest, asset, save, run, cli };
}

test("valid raw cross-route totals deduplicate shared files and CLI succeeds", (t) => {
  const f = fixture(t), r = f.run();
  assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings, []);
  assert.equal(r.metrics.publicJs, 230); assert.equal(r.metrics.adminJs, 40); assert.equal(r.metrics.totalJs, 270); assert.equal(r.metrics.totalCss, 30);
  assert.equal(r.metrics.templates[0].cssBytes, 30);
  assert.match(r.metrics.scope, /Cross-route.*not first-page/);
  assert.match(r.metrics.routes["/"], /NOT_MEASURED/);
  assert.equal(f.cli().status, 0);
});
test("aggregate overage is a visible warning with unchanged reference and exact large bytes", (t) => {
  const f = fixture(t); f.asset("assets/entry.js", 8_000_000);
  const r = f.run(); assert.deepEqual(r.errors, []);
  const warning = r.warnings.find((w) => w.metric === "publicJs");
  assert.equal(warning.bytes, 8_000_130); assert.equal(warning.referenceBytes, 563200);
  assert.equal(r.metrics.totalJs, 8_000_170);
  const cli = f.cli(); assert.equal(cli.status, 0); assert.match(cli.stdout, /8000130/); assert.match(cli.stdout, /passed with size warnings/);
});
test("all legacy local size references warn, not fail", (t) => {
  const f = fixture(t); f.asset("assets/admin.js", 170_000); f.asset("assets/archive-os.js", 70_000); f.asset("assets/shared.css", 310_000);
  const r = f.run(); assert.deepEqual(r.errors, []);
  for (const metric of ["adminJs", "app/admin/editor.tsx lazy JS", "app/templates/archive-os/template.tsx JS", "app/templates/archive-os/template.tsx CSS", "totalCss"]) assert.ok(r.warnings.some((w) => w.metric === metric));
  assert.equal(f.cli().status, 0);
});
test("size warning does not swallow missing-resource failure or invent zero bytes", (t) => {
  const f = fixture(t); f.asset("assets/entry.js", 600_000); rmSync(join(f.client, "assets/shared.js"));
  const r = f.run(); assert.ok(r.errors.some((s) => /unreadable resource/.test(s))); assert.equal(r.metrics.publicJs, null);
  assert.ok(r.warnings.some((w) => w.metric === "publicJs" && !w.complete && w.bytes === 600110));
  const cli = f.cli(); assert.equal(cli.status, 1); assert.match(cli.stdout, /NOT_MEASURED/); assert.match(cli.stdout, /WARNINGS/);
});
test("missing and malformed manifest fail CLI with unmeasured metrics", (t) => {
  const f = fixture(t);
  for (const content of ["{", "[]", "null", "{}"] ) {
    writeFileSync(join(f.client, ".vite/manifest.json"), content);
    assert.equal(checkLegacyBuildBudget({ root: f.root }).metrics.publicJs, null); assert.equal(f.cli().status, 1);
  }
  rmSync(join(f.client, ".vite/manifest.json")); assert.equal(f.cli().status, 1);
});
test("invalid required fields and numeric paths including NaN cannot pass", (t) => {
  const f = fixture(t);
  for (const bad of [null, 42, NaN, { file: "assets/entry.js", css: 42 }, { file: "assets/entry.js", imports: [9] }]) {
    f.manifest.entry = bad;
    const r = f.run(); assert.ok(r.errors.length); assert.equal(r.metrics.totalJs, null); assert.equal(f.cli().status, 1);
  }
});
test("eleven known lazy templates and no eager template imports remain required", (t) => {
  const f = fixture(t); const key = "app/templates/archive-os/template.tsx";
  f.manifest[key].isDynamicEntry = false; assert.ok(f.run().errors.some((s) => /not a lazy/.test(s))); assert.equal(f.cli().status, 1);
  f.manifest[key].isDynamicEntry = true; f.manifest.entry.imports.push(key); assert.ok(f.run().errors.some((s) => /eagerly imported/.test(s))); assert.equal(f.cli().status, 1);
  delete f.manifest[key]; assert.ok(f.run().errors.some((s) => /expected 11/.test(s))); assert.equal(f.cli().status, 1);
});
test("missing import mapping, path escape and unreadable non-file fail", (t) => {
  const f = fixture(t);
  f.manifest.shared.imports = ["absent"]; assert.ok(f.run().errors.some((s) => /manifest dependency/.test(s))); assert.equal(f.cli().status, 1);
  delete f.manifest.shared.imports;
  // Synthetic drive-root path; no developer machine location is embedded.
  for (const path of ["../outside.js", "/outside.js", ["Z:", "outside.js"].join("/"), "assets"] ) {
    f.manifest.shared.file = path; assert.ok(f.run().errors.length); assert.equal(f.cli().status, 1);
  }
});
test("templates require independent files and a real client entry", (t) => {
  const f = fixture(t);
  const first = "app/templates/archive-os/template.tsx";
  const second = "app/templates/character-select/template.tsx";
  const originalFile = f.manifest[second].file;
  f.manifest[second].file = f.manifest[first].file;
  assert.ok(f.run().errors.some((s) => /independent lazy template/.test(s))); assert.equal(f.cli().status, 1);
  f.manifest[second].file = originalFile;
  delete f.manifest.entry.isEntry;
  assert.ok(f.run().errors.some((s) => /client JS entry is missing/.test(s))); assert.equal(f.cli().status, 1);
});
test("directory symlink cannot escape the artifact root", (t) => {
  const f = fixture(t); const outside = join(f.root, "outside"); mkdirSync(outside); writeFileSync(join(outside, "asset.js"), "x");
  symlinkSync(outside, join(f.client, "assets/escape"), process.platform === "win32" ? "junction" : "dir");
  f.manifest.shared.file = "assets/escape/asset.js";
  assert.ok(f.run().errors.some((s) => /symlink escapes/.test(s))); assert.equal(f.cli().status, 1);
});
