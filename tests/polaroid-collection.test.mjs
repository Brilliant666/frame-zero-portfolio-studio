import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import ts from "typescript";

async function loadModule(t, relativePath, baseName) {
  const source = await fs.readFile(new URL(relativePath, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "polaroid-collection-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, `${baseName}.mjs`);
  await fs.writeFile(file, js);
  return import(pathToFileURL(file).href);
}

const loadModel = (t) => loadModule(t, "../app/templates/polaroid-field/collection-model.ts", "collection-model");

test("saved preview Lightbox reserves an external operation row and preserves legacy defaults", async () => {
  const source = await fs.readFile(new URL("../app/templates/shared/lightbox.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", js)(createRequire(import.meta.url), compiled, compiled.exports);
  const Lightbox = compiled.exports.default;
  const work = { assetId: "a", code: "01", title: "匿名作品", subtitle: "测试", image: "/a.jpg", preview: "/a.jpg", previewWidth: 400, fullWidth: 1200 };
  const props = { work, works: [work, { ...work, assetId: "b", code: "02" }], frameRef: { current: null }, closeButtonRef: { current: null }, onMove() {}, onClose() {} };
  const render = (extra = {}) => renderToStaticMarkup(createElement(Lightbox, { ...props, ...extra }));
  const saved = render({ theme: "light", separateControls: true });
  assert.match(saved, /data-separated="true"/);
  assert.doesNotMatch(saved.split('class="lightbox-info"')[0], /aria-label="[上下]一张作品"/);
  assert.match(saved.split('class="lightbox-info"')[1], /aria-label="上一张作品"/);
  assert.match(saved.split('class="lightbox-info"')[1], /aria-label="下一张作品"/);
  assert.match(saved, /关闭 ×/);
  assert.doesNotMatch(render({ theme: "light", separateControls: true, works: [work] }), /aria-label="[上下]一张作品"/);
  const legacy = render();
  assert.doesNotMatch(legacy, /data-separated/);
  assert.match(legacy, /lightbox-nav lightbox-prev/);
  assert.match(legacy, /CLOSE ×/);
  const wiring = await fs.readFile(new URL("../app/preview-workspace/portfolio-view.tsx", import.meta.url), "utf8");
  assert.match(wiring, /<Lightbox theme="light" safeMissingImage separateControls/);
});

test("a query parameter alone cannot expose the editor outside loopback development", async (t) => {
  const { canOpenCollectionProof } = await loadModule(t, "../app/templates/polaroid-field/collection-proof-gate.ts", "collection-proof-gate");
  assert.equal(canOpenCollectionProof("development", "127.0.0.1", "?collections=preview"), true);
  assert.equal(canOpenCollectionProof("development", "localhost", "?collections=preview"), true);
  assert.equal(canOpenCollectionProof("production", "127.0.0.1", "?collections=preview"), false);
  assert.equal(canOpenCollectionProof("development", "portfolio.example", "?collections=preview"), false);
  assert.equal(canOpenCollectionProof("development", "127.0.0.1", "?collections=off"), false);
});

function asset(index, ratio) {
  return { id: `asset-${index}`, aspectRatio: ratio };
}

test("default collections are editable preview identities, not photo mappings", async (t) => {
  const { initialCollections } = await loadModel(t);
  assert.deepEqual(initialCollections.map((item) => item.name), ["正片创作", "漫展场照", "美少女日记"]);
  assert.equal(new Set(initialCollections.map((item) => item.id)).size, 3);
  assert.ok(initialCollections.every((item) => item.assetIds.length === 0 && item.coverAssetId === null));
  for (const count of [1, 2, 3, 5, 8]) {
    const list = Array.from({ length: count }, (_, index) => ({ ...initialCollections[index % 3], id: `preview-${index}` }));
    assert.equal(list.filter((item) => item.visible).length, count);
  }
});

test("cover and focus choices do not add outside photos to ordered membership", async (t) => {
  const { collectionCover, uniqueAvailableAssetIds, initialCollections, moveItem } = await loadModel(t);
  const photos = new Map(Array.from({ length: 5 }, (_, i) => [`asset-${i}`, asset(i, 3 / 2)]));
  const first = { ...initialCollections[0], coverAssetId: "asset-4", focusAssetId: "asset-2", assetIds: ["asset-2", "asset-0"] };
  const second = { ...initialCollections[1], coverAssetId: "asset-0", focusAssetId: "asset-1", assetIds: ["asset-1", "asset-3"] };
  const original = structuredClone([first, second]);
  assert.equal(collectionCover(first, photos)?.id, "asset-4");
  assert.deepEqual(uniqueAvailableAssetIds(first, new Set(photos.keys())), ["asset-2", "asset-0"]);
  assert.deepEqual(uniqueAvailableAssetIds(second, new Set(photos.keys())), ["asset-1", "asset-3"]);
  const reordered = { ...first, assetIds: moveItem(first.assetIds, 0, 1) };
  assert.deepEqual(uniqueAvailableAssetIds(reordered, new Set(photos.keys())), ["asset-0", "asset-2"]);
  assert.equal(reordered.focusAssetId, "asset-2");
  assert.equal(reordered.coverAssetId, "asset-4");
  assert.deepEqual([first, second], original);
  assert.equal(collectionCover({ ...first, coverAssetId: null, assetIds: [] }, photos), null);
});

test("missing references do not inflate counts; cover falls back without mutating members", async (t) => {
  const { collectionCover, uniqueAvailableAssetIds, initialCollections, moveItem } = await loadModel(t);
  const photos = new Map([["asset-1", asset(1, 2 / 3)], ["asset-2", asset(2, 3 / 2)]]);
  const collection = { ...initialCollections[0], coverAssetId: "missing", assetIds: ["missing", "asset-1", "asset-1", "asset-2"] };
  assert.deepEqual(uniqueAvailableAssetIds(collection, new Set(photos.keys())), ["asset-1", "asset-2"]);
  assert.equal(collectionCover(collection, photos)?.id, "asset-1");
  assert.deepEqual(moveItem(collection.assetIds, 1, 3), ["missing", "asset-1", "asset-2", "asset-1"]);
  assert.deepEqual(collection.assetIds, ["missing", "asset-1", "asset-1", "asset-2"]);
});
