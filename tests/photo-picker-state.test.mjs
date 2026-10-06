import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function picker(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "site-photo-picker-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, sourcePath] of [["catalog", "templates/catalog"], ["document", "preview-workspace/document"], ["flow", "site-editor/flow-gallery-document"], ["schema", "site-editor/content-schema"], ["picker", "preview-workspace/photo-picker-state"]]) {
    const source = await fs.readFile(new URL(`../app/${sourcePath}.ts`, import.meta.url), "utf8");
    // site-config reexports the same catalog functions; legacy defaults are unrelated.
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace('"../site-config"', '"./catalog.mjs"')
      .replace('"../preview-workspace/document"', '"./document.mjs"')
      .replace('"./flow-gallery-document"', '"./flow.mjs"')
      .replace('"../site-editor/content-schema"', '"./schema.mjs"')
      .replace('"./document"', '"./document.mjs"');
    await fs.writeFile(path.join(directory, `${name}.mjs`), js);
  }
  return { ...await import(pathToFileURL(path.join(directory, "picker.mjs"))), ...await import(pathToFileURL(path.join(directory, "document.mjs"))) };
}

const id = n => `abcdef00-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const collectionId = id(9999);
const filter = { query: "", orientation: "all", membership: "all", sort: "newest", onlySelected: false };
const asset = (n, orientation = "landscape", createdAt = "2026-09-28T01:00:00.000Z") => ({ id: id(n), orientation, createdAt });
function draft(m, members = []) {
  return { ...m.createEmptyPreviewDocument(), collections: [{ id: collectionId, name: "Trip", description: "", visible: true, coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, assetIds: [...members], focusAssetId: null }] };
}
function freeze(value) {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

test("picker combines library filters and selected review bypasses them", async t => {
  const m = await picker(t);
  const assets = freeze([asset(1), asset(2, "portrait"), asset(3), asset(4, "square")]);
  const members = freeze([id(1)]), picked = freeze([id(2), id(3), id(4)]);
  const ids = patch => m.filterPickerAssets(assets, members, picked, { ...filter, ...patch }).map(a => a.id);
  assert.deepEqual(ids({ orientation: "portrait" }), [id(2)]);
  assert.deepEqual(ids({ orientation: "square" }), [id(4)]);
  assert.deepEqual(ids({ membership: "outside" }), [id(2), id(3), id(4)]);
  assert.deepEqual(ids({ onlySelected: true }), [id(2), id(3), id(4)]);
  assert.deepEqual(ids({ query: `  ${id(3).toUpperCase()}  `, orientation: "landscape", membership: "outside" }), [id(3)]);
  assert.deepEqual(ids({ query: "no-matching-id", orientation: "landscape", membership: "outside", onlySelected: true }), picked);
  assert.deepEqual(m.filterPickerAssets(assets, [id(2)], [id(4), id(2), id(99)], { ...filter, membership: "outside", onlySelected: true }).map(a => a.id), [id(4), id(2)]);
  assert.deepEqual(ids({ query: id(1), membership: "outside" }), []);
});

test("picker sorts equal times by stable ID and unknown dates last in both directions", async t => {
  const m = await picker(t);
  const assets = freeze([asset(5, "square", null), asset(3), asset(2, "portrait", "2026-09-27T01:00:00.000Z"), asset(1), { id: id(4), orientation: "portrait" }]);
  assert.deepEqual(m.filterPickerAssets(assets, [], [], filter).map(a => a.id), [id(1), id(3), id(2), id(4), id(5)]);
  assert.deepEqual(m.filterPickerAssets(assets, [], [], { ...filter, sort: "oldest" }).map(a => a.id), [id(2), id(1), id(3), id(4), id(5)]);
});

test("paging and filtering preserve source order and selections from other pages", async t => {
  const m = await picker(t);
  const assets = freeze(Array.from({ length: 100 }, (_, i) => asset(100 - i)));
  const picked = freeze([id(99), id(2), id(49)]), before = structuredClone(assets);
  const sorted = m.filterPickerAssets(assets, [], picked, filter);
  assert.equal(m.PICKER_PAGE_SIZE, 48);
  assert.equal(sorted.slice(0, m.PICKER_PAGE_SIZE).length, 48);
  assert.equal(sorted.slice(m.PICKER_PAGE_SIZE, 2 * m.PICKER_PAGE_SIZE)[0].id, id(49));
  assert.deepEqual(m.filterPickerAssets(assets, [], picked, { ...filter, onlySelected: true }).map(a => a.id), picked);
  assert.deepEqual(picked, [id(99), id(2), id(49)]);
  assert.deepEqual(assets, before);
});

test("append deduplicates against latest members, preserves selection order and leaves the draft untouched", async t => {
  const m = await picker(t), input = draft(m, [id(3), id(2)]);
  input.collections[0].coverAssetId = id(3);
  input.collections[0].focusAssetId = id(2);
  input.collections.push({ ...input.collections[0], id: id(9998), assetIds: [id(2)] , focusAssetId: id(2) });
  const before = structuredClone(input); freeze(input);
  const result = m.appendPickedPhotos(input, collectionId, freeze([id(4), id(2), id(1), id(4)]), new Set([id(1), id(4)]));
  assert.deepEqual(result.additions, [id(4), id(1)]);
  assert.deepEqual(result.document.collections[0].assetIds, [id(3), id(2), id(4), id(1)]);
  assert.equal(result.document.collections[0].coverAssetId, id(3));
  assert.equal(result.document.collections[0].focusAssetId, id(2));
  assert.deepEqual(result.document.collections[1], input.collections[1]);
  assert.deepEqual(input, before);
});

test("500-photo boundary accepts exact capacity and rejects the entire oversized batch", async t => {
  const m = await picker(t), input = freeze(draft(m, Array.from({ length: 499 }, (_, i) => id(i + 1))));
  const before = structuredClone(input), available = new Set([id(500), id(501)]);
  assert.equal(m.appendPickedPhotos(input, collectionId, [id(500), id(500), id(1)], available).document.collections[0].assetIds.length, 500);
  assert.throws(() => m.appendPickedPhotos(input, collectionId, [id(500), id(501)], available), /还可加入 1 张.*新增 2 张/);
  assert.deepEqual(input, before);
});

test("unavailable additions and a removed target reject without changing the draft", async t => {
  const m = await picker(t), input = freeze(draft(m, [id(1)])), before = structuredClone(input);
  assert.throws(() => m.appendPickedPhotos(input, collectionId, [id(2), id(3)], new Set([id(2)])), /不可用素材/);
  assert.throws(() => m.appendPickedPhotos(input, id(9998), [id(2)], new Set([id(2)])), /目标图集已改变/);
  assert.deepEqual(input, before);
});

test("append enforces the full 512000-byte save request limit including revision and multibyte text", async t => {
  const m = await picker(t);
  function sizedDocument(bytes) {
    const input = draft(m);
    input.packages = Array.from({ length: 9 }, () => ({ number: "", english: "", name: "", description: "", price: "", duration: "", enabled: true, deliverables: Array.from({ length: 30 }, () => "中".repeat(600)) }));
    let remaining = bytes - Buffer.byteLength(JSON.stringify(input));
    assert.ok(remaining > 0);
    for (const item of input.packages) for (let i = 0; i < item.deliverables.length; i++) {
      const count = Math.min(remaining, 1400);
      item.deliverables[i] += "x".repeat(count); remaining -= count;
    }
    assert.equal(remaining, 0);
    assert.equal(Buffer.byteLength(JSON.stringify(input)), bytes);
    return freeze(input);
  }
  // One UUID string adds 38 UTF-8 bytes to an empty member array.
  const revision = 123456789;
  const envelopeBytes = Buffer.byteLength(JSON.stringify({ content: {}, expectedRevision: revision })) - 2;
  const atLimit = sizedDocument(512000 - 38 - envelopeBytes);
  const result = m.appendPickedPhotos(atLimit, collectionId, [id(1)], new Set([id(1)]), revision);
  assert.equal(Buffer.byteLength(JSON.stringify({ content: result.document, expectedRevision: revision })), 512000);
  const oversized = sizedDocument(512000 - 37 - envelopeBytes), before = structuredClone(oversized);
  const next = structuredClone(oversized); next.collections[0].assetIds = [id(1)];
  assert.equal(Buffer.byteLength(JSON.stringify({ content: next, expectedRevision: revision })), 512001);
  assert.throws(() => m.appendPickedPhotos(oversized, collectionId, [id(1)], new Set([id(1)]), revision), /草稿保存大小上限/);
  assert.deepEqual(oversized, before);
  const zeroEnvelopeBytes = Buffer.byteLength(JSON.stringify({ content: {}, expectedRevision: 0 })) - 2;
  const zeroRevisionLimit = sizedDocument(512000 - 38 - zeroEnvelopeBytes);
  const defaultResult = m.appendPickedPhotos(zeroRevisionLimit, collectionId, [id(1)], new Set([id(1)]));
  assert.equal(Buffer.byteLength(JSON.stringify({ content: defaultResult.document, expectedRevision: 0 })), 512000);
  assert.throws(() => m.appendPickedPhotos(zeroRevisionLimit, collectionId, [id(1)], new Set([id(1)]), revision), /草稿保存大小上限/);
  assert.deepEqual(zeroRevisionLimit.collections[0].assetIds, []);
});
