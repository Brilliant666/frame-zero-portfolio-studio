import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await fs.readFile(new URL("../app/preview-workspace/collection-member-order.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { moveCollectionMember, moveCollectionMembers, rememberMemberMove, undoMemberMove } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
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

for (const size of [50, 100]) {
  test(`${size} members: move photo 47 to 3, undo and preserve collection settings`, () => {
    const original = { ...fixture(), assetIds: Array.from({ length: size }, (_, i) => `photo-${i + 1}`) };
    const next = moveCollectionMember(original, "photo-47", 2);
    assert.equal(next.assetIds[2], "photo-47");
    assert.equal(next.assetIds.length, size);
    assert.equal(new Set(next.assetIds).size, size);
    assert.deepEqual(next.assetIds.filter(id => id !== "photo-47"), original.assetIds.filter(id => id !== "photo-47"));
    assert.equal(next.coverAssetId, original.coverAssetId);
    assert.equal(next.focusAssetId, original.focusAssetId);
    assert.deepEqual(undoMemberMove(next, rememberMemberMove(original, next)), original);
  });
  test(`${size} members: reverse selection moves as a stable block`, () => {
    const original = { ...fixture(), assetIds: Array.from({ length: size }, (_, i) => `photo-${i + 1}`) };
    const picked = ["photo-47", "photo-10", "photo-25"];
    const next = moveCollectionMembers(original, picked, { kind: "position", position: 2 });
    assert.deepEqual(next.assetIds.slice(2, 5), ["photo-10", "photo-25", "photo-47"]);
    const rest = original.assetIds.filter(id => !picked.includes(id));
    assert.deepEqual(next.assetIds, [...rest.slice(0, 2), "photo-10", "photo-25", "photo-47", ...rest.slice(2)]);
    for (const side of ["before", "after"]) {
      const relative = moveCollectionMembers(original, picked, { kind: "relative", targetId: "photo-30", side });
      const position = rest.indexOf("photo-30") + Number(side === "after");
      assert.deepEqual(relative.assetIds, [...rest.slice(0, position), "photo-10", "photo-25", "photo-47", ...rest.slice(position)]);
      assert.deepEqual(undoMemberMove(relative, rememberMemberMove(original, relative)), original);
    }
  });
}
test("block inputs reject unknown targets, selected targets and invalid final positions", () => {
  const original = fixture();
  for (const targetId of ["absent", "a"]) assert.equal(moveCollectionMembers(original, ["a", "c"], { kind: "relative", targetId, side: "before" }), original);
  for (const position of [-1, 3, 1.5, NaN, Infinity]) assert.equal(moveCollectionMembers(original, ["a", "c"], { kind: "position", position }), original);
  assert.equal(moveCollectionMembers(original, [], { kind: "position", position: 0 }), original);
  assert.equal(moveCollectionMembers(original, ["missing"], { kind: "position", position: 0 }), original);
  assert.deepEqual(moveCollectionMembers(original, ["c", "a", "a"], { kind: "position", position: 0 }).assetIds, ["a", "c", "b", "unavailable"]);
});
test("undo never overwrites externally changed metadata, collection, membership or order", () => {
  const original = fixture();
  const next = moveCollectionMember(original, "c", 0);
  const undo = rememberMemberMove(original, next);
  for (const external of [{ ...next }, { ...next, name: "new title" }, { ...next, id: "another" }, { ...next, assetIds: [...next.assetIds, "new"] }, { ...next, assetIds: [...next.assetIds].reverse() }]) assert.equal(undoMemberMove(external, undo), external);
  assert.equal(undoMemberMove(next, null), next);
  assert.equal(rememberMemberMove(original, original), null);
  const reverted = undoMemberMove(next, undo);
  assert.equal(undoMemberMove(reverted, undo), reverted, "The same undo is single-use after state changes");
  next.assetIds.reverse();
  assert.equal(undoMemberMove(next, undo), next, "In-place external mutation is also rejected");
});
