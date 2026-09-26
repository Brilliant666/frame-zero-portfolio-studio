import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await fs.readFile(new URL("../app/templates/polaroid-field/composer-selection.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { resolveComposerHero: resolve } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
test("hero validates every fallback tier against displayable members", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(resolve(ids, "c", "b", "a"), { id: "c", source: "preference" });
  assert.deepEqual(resolve(ids, "missing", "b", "c"), { id: "c", source: "cover" });
  assert.deepEqual(resolve(ids, null, "b", "missing"), { id: "b", source: "focus" });
  assert.deepEqual(resolve(ids, null, "missing", "c"), { id: "c", source: "cover" });
  assert.deepEqual(resolve(ids, null, null, "c"), { id: "c", source: "cover" });
  assert.deepEqual(resolve(ids, "missing", "missing", "outside"), { id: "a", source: "first" });
  assert.deepEqual(resolve(ids), { id: "a", source: "first" });
  assert.deepEqual(resolve([], "c", "b", "a"), { id: null, source: "empty" });
  assert.deepEqual(ids, ["a", "b", "c"]);
});
test("async availability and temporary failure never replace an explicit identity", () => {
  const preference = Object.freeze({ heroId: "b" });
  assert.equal(resolve([], preference.heroId, null, "c").source, "empty");
  assert.equal(resolve(["a", "b", "c"], preference.heroId, null, "c").id, "b");
  assert.equal(resolve(["a", "c"], preference.heroId, null, "c").id, "c");
  assert.equal(resolve(["c", "b", "a"], preference.heroId, null, "c").id, "b");
  assert.equal(preference.heroId, "b");
});
