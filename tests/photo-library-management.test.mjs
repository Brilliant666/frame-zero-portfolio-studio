import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule(t, relativePath) {
  const sourcePath = new URL(relativePath, import.meta.url);
  let source = await fs.readFile(sourcePath, "utf8");
  if (relativePath.endsWith("photo-library-management-client.ts")) {
    const dependencyPath = new URL("../app/photo-library.ts", import.meta.url);
    let dependencySource = await fs.readFile(dependencyPath, "utf8");
    dependencySource = dependencySource.replace('./photo-ratio-policy', './photo-ratio-policy.mjs');
    const dependencyCompiled = ts.transpileModule(dependencySource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: "photo-library.ts",
    }).outputText;
    const ratioSource = await fs.readFile(new URL("../app/photo-ratio-policy.ts", import.meta.url), "utf8");
    const ratioCompiled = ts.transpileModule(ratioSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: "photo-ratio-policy.ts",
    }).outputText;
    source = source.replace('../../photo-library', './photo-library.mjs');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-library-management-"));
    const modulePath = path.join(directory, "module.mjs");
    await fs.writeFile(path.join(directory, "photo-library.mjs"), dependencyCompiled, "utf8");
    await fs.writeFile(path.join(directory, "photo-ratio-policy.mjs"), ratioCompiled, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: path.basename(sourcePath.pathname),
    }).outputText;
    await fs.writeFile(modulePath, compiled, "utf8");
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: path.basename(sourcePath.pathname),
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-library-management-"));
  const modulePath = path.join(directory, "module.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

const assetId = "a".repeat(64);
const secondAssetId = "b".repeat(64);

function asset(id = assetId) {
  const variant = (name, width) => ({
    src: `/photos/library/${id}-${name}.webp`,
    width,
    height: Math.round(width / 1.5),
    bytes: width,
  });
  return {
    id,
    aspectRatio: 1.5,
    orientation: "landscape",
    variants: {
      thumbnail: variant("thumbnail", 480),
      card: variant("card", 1100),
      full: variant("full", 2200),
    },
  };
}

function snapshot() {
  return {
    ok: true,
    version: 1,
    revision: 4,
    activeAssets: 1,
    archivedAssets: 0,
    batches: [{
      id: "0123456789abcdef0123456789abcdef",
      ordinal: 1,
      sourceKind: "folder",
      createdAt: "2026-08-12T00:00:00.000Z",
    }],
    items: [{
      asset: asset(),
      assetId,
      importOrdinal: 1,
      batchId: "0123456789abcdef0123456789abcdef",
      batchPosition: 0,
      sourceKind: "folder",
      addedAt: "2026-08-12T00:00:00.000Z",
      status: "active",
      archivedAt: null,
    }],
  };
}

test("management client reads a strict local snapshot without a fixed origin", async (t) => {
  const { loadLocalPhotoLibrary } = await importTypeScriptModule(
    t,
    "../app/admin/layout/photo-library-management-client.ts",
  );
  let requested;
  const result = await loadLocalPhotoLibrary("http://127.0.0.1:43127", async (url, init) => {
    requested = { url: String(url), init };
    return new Response(JSON.stringify(snapshot()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(requested.url, "http://127.0.0.1:43127/library");
  assert.equal(requested.init.method, "GET");
  assert.equal(requested.init.credentials, "omit");
  assert.equal(result.items[0].assetId, assetId);
  assert.equal(result.batches[0].sourceKind, "folder");
});

test("management client rejects inconsistent status counts and duplicate asset identities", async (t) => {
  const { loadLocalPhotoLibrary, LocalPhotoLibraryManagementError } = await importTypeScriptModule(
    t,
    "../app/admin/layout/photo-library-management-client.ts",
  );
  const invalidSnapshots = [
    { ...snapshot(), activeAssets: 0, archivedAssets: 1 },
    { ...snapshot(), activeAssets: 1, archivedAssets: 1, items: [snapshot().items[0], snapshot().items[0]] },
  ];
  for (const invalidSnapshot of invalidSnapshots) {
    await assert.rejects(
      loadLocalPhotoLibrary("http://127.0.0.1:43127", async () => new Response(
        JSON.stringify(invalidSnapshot),
        { status: 200, headers: { "content-type": "application/json" } },
      )),
      (error) => error instanceof LocalPhotoLibraryManagementError && error.code === "invalid-response",
    );
  }
});

test("management client sends revision-safe archive requests with no source metadata", async (t) => {
  const { setLocalPhotoLibraryArchived } = await importTypeScriptModule(
    t,
    "../app/admin/layout/photo-library-management-client.ts",
  );
  let requested;
  await setLocalPhotoLibraryArchived(
    "http://127.0.0.1:43127",
    [assetId],
    true,
    4,
    async (url, init) => {
      requested = { url: String(url), init };
      return new Response(JSON.stringify(snapshot()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.equal(requested.url, "http://127.0.0.1:43127/library/archive");
  assert.equal(requested.init.headers["x-frame-zero-local-import"], "1");
  assert.deepEqual(JSON.parse(requested.init.body), { assetIds: [assetId], expectedRevision: 4 });
  assert.doesNotMatch(JSON.stringify(requested), /filename|folder|relativePath|webkitRelativePath|[A-Z]:\\/i);
});

test("reference map covers saved and draft works through IDs and legacy variant URLs", async (t) => {
  const { buildPhotoAssetReferenceMap } = await importTypeScriptModule(
    t,
    "../app/photo-library-references.ts",
  );
  const work = (overrides) => ({
    code: "X",
    title: "",
    subtitle: "",
    image: "/placeholder.webp",
    preview: "/placeholder.webp",
    position: "50% 50%",
    previewWidth: 1,
    previewHeight: 1,
    fullWidth: 1,
    enabled: true,
    ...overrides,
  });
  const base = { works: [], templateWorks: {} };
  const draft = {
    ...base,
    works: [work({ assetId })],
    templateWorks: {
      "character-select": [work({
        image: `/photos/library/${secondAssetId}-full.webp`,
        preview: `/photos/library/${secondAssetId}-card.webp`,
        slotIndex: 4,
      })],
    },
  };
  const saved = { ...base, works: [work({ assetId })], templateWorks: {} };
  const references = buildPhotoAssetReferenceMap(draft, saved);
  assert.equal(references.get(assetId).draft.length, 1);
  assert.equal(references.get(assetId).saved.length, 1);
  assert.deepEqual(references.get(secondAssetId).draft[0], {
    scope: "template",
    templateId: "character-select",
    slotIndex: 4,
  });
});
