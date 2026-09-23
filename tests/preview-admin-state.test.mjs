import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function state(t) {
  const source = await fs.readFile(new URL("../app/preview-workspace/admin-state.ts", import.meta.url), "utf8");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "preview-admin-state-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.mjs");
  await fs.writeFile(file, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  return import(pathToFileURL(file).href);
}

test("save acknowledgement does not overwrite an edit made during the request", async (t) => {
  const { reconcilePreviewSave, previewIsDirty } = await state(t);
  const submitted = { profile: { photographer: "submitted" }, collections: [{ id: "stable", name: "one" }] };
  const newer = { ...submitted, collections: [{ id: "stable", name: "edited while saving" }] };
  const response = structuredClone(submitted);
  const result = reconcilePreviewSave(submitted, newer, response);
  assert.equal(result.draft, newer);
  assert.deepEqual(result.saved, submitted);
  assert.equal(result.changedWhileSaving, true);
  assert.equal(previewIsDirty(result.draft, result.saved), true);
  const finished = reconcilePreviewSave(newer, structuredClone(newer), structuredClone(newer));
  assert.equal(finished.changedWhileSaving, false);
  assert.equal(previewIsDirty(finished.draft, finished.saved), false);
});

test("explicit old prototype import creates stable new identities without importing old template state", async (t) => {
  const { importPrototypeCollections } = await state(t);
  const collection = { id: "temporary", name: "Human chosen", assetIds: ["asset-one", "missing-retained"], coverAssetId: "independent-cover", focusAssetId: "asset-one" };
  const draft = { schemaVersion: 1, profile: { photographer: "keep this" }, collections: [] };
  const input = { collections: [collection], activeTemplate: "untrusted", templateWorks: { irrelevant: [] } };
  let next = 0;
  const imported = importPrototypeCollections(input, draft, () => `new-id-${++next}`);
  assert.equal(imported.collections[0].id, "new-id-1");
  assert.equal(imported.profile, draft.profile);
  assert.deepEqual(imported.collections[0].assetIds, collection.assetIds);
  assert.equal(imported.collections[0].coverAssetId, "independent-cover");
  assert.equal("activeTemplate" in imported, false);
  assert.equal("templateWorks" in imported, false);
  assert.equal(input.collections[0].id, "temporary");
  assert.equal(draft.collections.length, 0);
  assert.equal(importPrototypeCollections([collection], draft, () => "array-id").collections[0].id, "array-id");
  assert.throws(() => importPrototypeCollections({ items: [] }, draft, () => "bad"), /JSON/);
  assert.throws(() => importPrototypeCollections([null], draft, () => "bad"), /格式/);
});
