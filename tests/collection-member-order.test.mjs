import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await fs.readFile(new URL("../app/preview-workspace/collection-member-order.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { moveCollectionMember } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const fixture = () => ({ id: "collection", name: "Photos", description: "", visible: true, coverAssetId: "external-cover", coverFit: "fill", coverFocusX: 23, coverFocusY: 78, focusAssetId: "b", assetIds: ["a", "b", "unavailable", "c"] });

test("move forward and backward follows insertion positions and retains every member", () => {
  const original = fixture();
  const end = moveCollectionMember(original, "a", 3);
  assert.deepEqual(end.assetIds, ["b", "unavailable", "c", "a"]);
  assert.deepEqual(moveCollectionMember(end, "a", 0), original);
  assert.deepEqual(original.assetIds, ["a", "b", "unavailable", "c"]);
});
test("ordering preserves unavailable references, independent cover and focus fields", () => {
  const original = fixture();
  const next = moveCollectionMember(original, "unavailable", 0);
  assert.deepEqual(next, { ...original, assetIds: ["unavailable", "a", "b", "c"] });
  assert.notEqual(next.assetIds, original.assetIds);
});
test("invalid positions and unknown members leave collection identity unchanged", () => {
  const original = fixture();
  for (const position of [-1, 4, 1.5, NaN, Infinity]) assert.equal(moveCollectionMember(original, "a", position), original);
  assert.equal(moveCollectionMember(original, "absent", 0), original);
  assert.equal(moveCollectionMember(original, "a", 0), original);
});
test("empty and single-member boundaries do not introduce references", () => {
  const empty = { ...fixture(), assetIds: [] };
  assert.equal(moveCollectionMember(empty, "a", 0), empty);
  const single = { ...fixture(), assetIds: ["a"] };
  assert.equal(moveCollectionMember(single, "a", 0), single);
  assert.equal(moveCollectionMember(single, "a", 1), single);
});
