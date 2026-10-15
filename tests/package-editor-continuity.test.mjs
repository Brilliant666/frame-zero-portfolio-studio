import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await fs.readFile(new URL("../app/preview-workspace/package-editor-state.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { addPackage, changePackage, createPackageEditorState, movePackageUp, reconcilePackageEditorState, removePackage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const item = (name = "同名套餐") => ({ name, number: "01", english: "PORTRAIT", description: "介绍", price: "99", duration: "2小时", deliverables: ["精修照片"], enabled: true });

test("editable and duplicate names/numbers do not determine editor identity", () => {
  const original = createPackageEditorState([item(), item()]);
  assert.notEqual(original.keys[0], original.keys[1]);
  const secondKey = original.keys[1];
  const edited = changePackage(original, secondKey, { name: "改名", number: "02", enabled: false });
  assert.deepEqual(edited.keys, original.keys);
  assert.equal(edited.items[0], original.items[0]);
  assert.equal(edited.items[1].name, "改名");
  assert.equal(original.items[1].name, "同名套餐");
  const moved = movePackageUp(edited, secondKey);
  assert.equal(moved.keys[0], secondKey);
  assert.equal(moved.items[0].name, "改名");
  assert.equal(moved.items[0].enabled, false);
});

test("repeated moves keep the same package identity and expanded row association", () => {
  const original = createPackageEditorState([item("A"), item("B"), item("C"), item("D")]);
  const movingKey = original.keys[3];
  const rowState = new Map(original.keys.map(key => [key, { open: key === movingKey, edited: key === movingKey }]));
  let state = original;
  for (let position = 2; position >= 0; position--) {
    state = movePackageUp(state, movingKey);
    assert.equal(state.items[position].name, "D");
    assert.equal(state.keys[position], movingKey);
    assert.equal(rowState.get(state.keys[position]).open, true);
    for (let index = 0; index < state.items.length; index++) {
      assert.equal(rowState.get(state.keys[index]).edited, state.items[index].name === "D");
    }
  }
  assert.equal(movePackageUp(state, movingKey), state);
  assert.deepEqual(original.items.map(entry => entry.name), ["A", "B", "C", "D"]);
});

test("remove/add cannot recycle an old row's disclosure or focus identity", () => {
  let state = createPackageEditorState([item("A"), item("B"), item("C")]);
  const removedKey = state.keys[1];
  state = removePackage(state, removedKey);
  assert.deepEqual(state.items.map(entry => entry.name), ["A", "C"]);
  assert.deepEqual(state.keys, [0, 2]);
  state = addPackage(state);
  assert.equal(state.items[2].name, "新套餐");
  assert.equal(state.keys[2], 3);
  assert.ok(!state.keys.includes(removedKey));
  state = changePackage(state, state.keys[2], { name: "新命名" });
  assert.equal(state.items[2].name, "新命名");
  assert.equal(state.items[1].name, "C");
});

test("equal saved content with fresh objects preserves disclosure/focus identities", () => {
  const original = createPackageEditorState([item("A"), item("B")]);
  assert.equal(reconcilePackageEditorState(original, original.items), original);
  const moved = movePackageUp(original, original.keys[1]);
  const edited = changePackage(moved, moved.keys[0], { price: "199", deliverables: ["底片", "精修"] });
  const acknowledgedItems = structuredClone(edited.items);
  const acknowledged = reconcilePackageEditorState(edited, acknowledgedItems);
  assert.equal(acknowledged.items, acknowledgedItems);
  assert.deepEqual(acknowledged.keys, edited.keys);
  assert.equal(acknowledged.nextKey, edited.nextKey);
  assert.equal(reconcilePackageEditorState(acknowledged, acknowledgedItems), acknowledged);
});

test("changed external content and changed order do not inherit unrelated row identities", () => {
  const original = createPackageEditorState([item("A"), item("B")]);
  for (const patch of [{ name: "C" }, { enabled: false }, { deliverables: ["不同交付"] }]) {
    const replacement = structuredClone(original.items);
    Object.assign(replacement[0], patch);
    const reloaded = reconcilePackageEditorState(original, replacement);
    assert.deepEqual(reloaded.keys, [2, 3]);
  }
  const reordered = reconcilePackageEditorState(original, structuredClone([...original.items].reverse()));
  assert.deepEqual(reordered.keys, [2, 3]);
});

test("external reorder preserves existing object identities, including duplicate references", () => {
  const shared = item();
  const original = createPackageEditorState([shared, item("B"), shared]);
  const reordered = reconcilePackageEditorState(original, [original.items[1], shared, shared]);
  assert.deepEqual(reordered.keys, [1, 0, 2]);
  assert.equal(new Set(reordered.keys).size, 3);
});

test("unknown keys and the existing twelve-package limit leave content unchanged", () => {
  const original = createPackageEditorState(Array.from({ length: 12 }, () => item()));
  assert.equal(addPackage(original), original);
  assert.equal(movePackageUp(original, -1), original);
  assert.equal(removePackage(original, -1), original);
  assert.equal(changePackage(original, -1, { name: "wrong" }), original);
  assert.equal(movePackageUp(original, original.keys[0]), original);
});

test("editor identities never enter serialized packages or mutate business fields", () => {
  const original = createPackageEditorState([item("A"), item("B")]);
  const moved = movePackageUp(original, original.keys[1]);
  assert.equal(JSON.stringify(moved.items), JSON.stringify([original.items[1], original.items[0]]));
  const next = addPackage(removePackage(moved, moved.keys[0]));
  assert.deepEqual(Object.keys(next.items[1]).sort(), Object.keys(item()).sort());
  assert.deepEqual(next.items[0].deliverables, ["精修照片"]);
});
