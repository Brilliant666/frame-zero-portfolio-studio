import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  getLocalPhotoLibrarySnapshot,
  importPhotoLibrary,
  photoImportContract,
  setLocalPhotoAssetsArchived,
} from "../scripts/lib/photo-import.mjs";

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const supportsPhotoImport = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13);
const photoTest = supportsPhotoImport
  ? test
  : (name, callback) => test(name, { skip: "Photo importer requires Node.js >=22.13.0" }, callback);

async function makeTemporaryWorkspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-photo-import-"));
  const projectRoot = path.join(root, "project");
  const sourceDir = path.join(root, "source photos");
  await Promise.all([
    fs.mkdir(projectRoot, { recursive: true }),
    fs.mkdir(sourceDir, { recursive: true }),
  ]);
  t.after(async () => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 }));
  return { root, projectRoot, sourceDir };
}

async function sha256(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function removeDirectoryLink(linkPath) {
  try {
    await fs.unlink(linkPath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    await fs.rmdir(linkPath);
  }
}

async function createFixtures(sourceDir) {
  const nestedDir = path.join(sourceDir, "角色 A", "精选");
  await fs.mkdir(nestedDir, { recursive: true });

  const landscape = path.join(nestedDir, "private-landscape-name.jpg");
  const duplicate = path.join(sourceDir, "duplicate-copy.jpeg");
  const portrait = path.join(sourceDir, "portrait.png");
  const rotated = path.join(nestedDir, "rotated-by-exif.jpg");
  const damaged = path.join(sourceDir, "damaged.jpg");

  await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: "#d86f32" },
  }).jpeg({ quality: 88 }).toFile(landscape);
  await fs.copyFile(landscape, duplicate);
  await sharp({
    create: { width: 1600, height: 2400, channels: 3, background: "#315da8" },
  }).png().toFile(portrait);
  await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: "#8b4bb0" },
  }).withMetadata({ orientation: 6 }).jpeg({ quality: 86 }).toFile(rotated);
  await fs.writeFile(damaged, "this is not a photograph", "utf8");
  await fs.writeFile(path.join(sourceDir, "notes.txt"), "ignored", "utf8");

  return { landscape, duplicate, portrait, rotated, damaged, nestedDir };
}

function makeManifestAsset(id) {
  const variant = (name) => ({
    src: `/photos/library/${id}-${name}.webp`,
    width: 1,
    height: 1,
    bytes: 1,
  });
  return {
    id,
    aspectRatio: 1,
    orientation: "square",
    variants: {
      thumbnail: variant("thumbnail"),
      card: variant("card"),
      full: variant("full"),
    },
  };
}

photoTest("imports a recursive, deduplicated, privacy-safe responsive photo library", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const fixtures = await createFixtures(sourceDir);
  const [landscapeId, portraitId, rotatedId] = await Promise.all([
    sha256(fixtures.landscape),
    sha256(fixtures.portrait),
    sha256(fixtures.rotated),
  ]);

  const result = await importPhotoLibrary({ sourceDir, projectRoot });

  assert.equal(result.scannedFiles, 6);
  assert.equal(result.candidateFiles, 5);
  assert.equal(result.uniqueFiles, 4);
  assert.equal(result.duplicateFiles, 1);
  assert.equal(result.importedAssets, 3);
  assert.equal(result.sourceAssets, 3);
  assert.equal(result.addedAssets, 3);
  assert.equal(result.existingAssets, 0);
  assert.equal(result.generatedAssets, 3);
  assert.equal(result.reusedAssets, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].file, "damaged.jpg");
  assert.ok(!result.skipped[0].reason.includes(sourceDir));

  const manifestText = await fs.readFile(result.manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  assert.deepEqual(Object.keys(manifest).sort(), ["assets", "version"]);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.assets.length, 3);
  assert.deepEqual(manifest.assets.map((asset) => asset.id).sort(), [landscapeId, portraitId, rotatedId].sort());

  for (const privateValue of [
    sourceDir,
    "source photos",
    "private-landscape-name.jpg",
    "duplicate-copy.jpeg",
    "角色 A",
    "relativePath",
    "fileName",
  ]) {
    assert.ok(!manifestText.includes(privateValue), `manifest leaked ${privateValue}`);
  }
  assert.ok(!manifestText.includes("\\"), "manifest must use browser URLs, not filesystem separators");

  for (const asset of manifest.assets) {
    assert.deepEqual(Object.keys(asset).sort(), ["aspectRatio", "id", "orientation", "variants"]);
    assert.match(asset.id, /^[a-f0-9]{64}$/);
    assert.ok(asset.aspectRatio > 0);
    assert.ok(["landscape", "portrait", "square"].includes(asset.orientation));
    assert.deepEqual(Object.keys(asset.variants), ["thumbnail", "card", "full"]);

    for (const [variantName, maximum] of [["thumbnail", 480], ["card", 1100], ["full", 2200]]) {
      const variant = asset.variants[variantName];
      assert.deepEqual(Object.keys(variant).sort(), ["bytes", "height", "src", "width"]);
      assert.equal(variant.src, `/photos/library/${asset.id}-${variantName}.webp`);
      assert.ok(Math.max(variant.width, variant.height) <= maximum);
      assert.ok(variant.bytes > 0);

      const generatedPath = path.join(projectRoot, "public", variant.src.slice(1));
      const [stat, generatedBuffer] = await Promise.all([fs.stat(generatedPath), fs.readFile(generatedPath)]);
      const metadata = await sharp(generatedBuffer).metadata();
      assert.equal(stat.size, variant.bytes);
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, variant.width);
      assert.equal(metadata.height, variant.height);
      assert.equal(metadata.orientation, undefined);
      assert.equal(metadata.exif, undefined);
    }
  }

  const landscapeAsset = manifest.assets.find((asset) => asset.id === landscapeId);
  const portraitAsset = manifest.assets.find((asset) => asset.id === portraitId);
  const rotatedAsset = manifest.assets.find((asset) => asset.id === rotatedId);
  assert.equal(landscapeAsset.orientation, "landscape");
  assert.equal(portraitAsset.orientation, "portrait");
  assert.equal(rotatedAsset.orientation, "portrait", "EXIF orientation must be applied before sizing");
  assert.equal(Math.max(...Object.values(landscapeAsset.variants).map((variant) => variant.width)), 2200);
  assert.ok(rotatedAsset.variants.full.height > rotatedAsset.variants.full.width);

  const state = JSON.parse(await fs.readFile(result.statePath, "utf8"));
  assert.equal(state.pipelineVersion, photoImportContract.pipelineVersion);
  assert.match(state.outputKey, /^[a-f0-9]{64}$/);
  assert.equal(state.files.length, 5);
  assert.ok(state.files.every((file) => !path.isAbsolute(file.relativePath)));

  const repeated = await importPhotoLibrary({ sourceDir, projectRoot });
  assert.deepEqual(repeated.manifest, manifest);
  assert.equal(repeated.generatedAssets, 0);
  assert.equal(repeated.reusedAssets, 3);
  assert.equal(repeated.addedAssets, 0);
  assert.equal(repeated.existingAssets, 3);

  await fs.rm(fixtures.portrait);
  const afterRemoval = await importPhotoLibrary({ sourceDir, projectRoot });
  assert.equal(afterRemoval.sourceAssets, 2);
  assert.equal(afterRemoval.addedAssets, 0);
  assert.equal(afterRemoval.existingAssets, 2);
  assert.equal(afterRemoval.importedAssets, 3, "default imports must not invalidate existing homepage assets");
  assert.ok(afterRemoval.manifest.assets.some((asset) => asset.id === portraitId));
  for (const variantName of ["thumbnail", "card", "full"]) {
    const stat = await fs.stat(path.join(afterRemoval.libraryDir, `${portraitId}-${variantName}.webp`));
    assert.ok(stat.isFile());
  }
});

photoTest("records private import order and supports revision-safe recycle and restore", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const firstPath = path.join(sourceDir, "private-first-name.jpg");
  const secondPath = path.join(sourceDir, "nested", "private-second-name.png");
  await fs.mkdir(path.dirname(secondPath), { recursive: true });
  await sharp({ create: { width: 300, height: 200, channels: 3, background: "#c85f42" } })
    .jpeg()
    .toFile(firstPath);
  await sharp({ create: { width: 200, height: 300, channels: 3, background: "#4268c8" } })
    .png()
    .toFile(secondPath);

  const imported = await importPhotoLibrary({ sourceDir, projectRoot });
  const firstSnapshot = await getLocalPhotoLibrarySnapshot({ projectRoot });
  assert.equal(firstSnapshot.revision, 1);
  assert.equal(firstSnapshot.activeAssets, 2);
  assert.equal(firstSnapshot.archivedAssets, 0);
  assert.deepEqual(firstSnapshot.items.map((item) => item.importOrdinal), [1, 2]);
  assert.ok(firstSnapshot.items.every((item) => item.sourceKind === "folder"));
  assert.equal(new Set(firstSnapshot.items.map((item) => item.batchId)).size, 1);
  assert.deepEqual(firstSnapshot.items.map((item) => item.asset), imported.manifest.assets);

  const catalogText = await fs.readFile(imported.catalogPath, "utf8");
  assert.doesNotMatch(catalogText, /private-first|private-second|nested|source photos|[A-Z]:\\/i);

  const archivedId = firstSnapshot.items[0].assetId;
  const archived = await setLocalPhotoAssetsArchived({
    projectRoot,
    assetIds: [archivedId],
    archived: true,
    expectedRevision: firstSnapshot.revision,
  });
  assert.equal(archived.revision, 2);
  assert.equal(archived.activeAssets, 1);
  assert.equal(archived.archivedAssets, 1);
  assert.equal(archived.items.find((item) => item.assetId === archivedId).status, "archived");
  const manifestPath = path.join(projectRoot, "public", "photos", "library-manifest.json");
  const manifestAfterArchive = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifestAfterArchive.assets.length, 1);
  assert.ok(!manifestAfterArchive.assets.some((asset) => asset.id === archivedId),
    "recycled assets must leave the active discovery manifest");
  for (const variantName of ["thumbnail", "card", "full"]) {
    assert.ok((await fs.stat(path.join(imported.libraryDir, `${archivedId}-${variantName}.webp`))).isFile(),
      "recycle must retain variants needed by existing saved URLs");
  }

  await assert.rejects(
    setLocalPhotoAssetsArchived({
      projectRoot,
      assetIds: [archivedId],
      archived: false,
      expectedRevision: firstSnapshot.revision,
    }),
    (error) => error?.code === "CATALOG_REVISION_CONFLICT",
  );

  const restored = await setLocalPhotoAssetsArchived({
    projectRoot,
    assetIds: [archivedId],
    archived: false,
    expectedRevision: archived.revision,
  });
  assert.equal(restored.revision, 3);
  assert.equal(restored.activeAssets, 2);
  assert.equal(restored.archivedAssets, 0);
  assert.deepEqual(restored.items.map((item) => item.importOrdinal), [1, 2]);
  const manifestAfterRestore = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifestAfterRestore.assets.length, 2);
  assert.ok(manifestAfterRestore.assets.some((asset) => asset.id === archivedId));
});

photoTest("re-importing archived bytes reports restored instead of duplicate", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  await sharp({ create: { width: 300, height: 200, channels: 3, background: "#4c8a62" } })
    .jpeg()
    .toFile(path.join(sourceDir, "photo.jpg"));
  const imported = await importPhotoLibrary({ sourceDir, projectRoot });
  const [assetId] = imported.manifest.assets.map((asset) => asset.id);
  const archived = await setLocalPhotoAssetsArchived({
    projectRoot,
    assetIds: [assetId],
    archived: true,
    expectedRevision: imported.catalogRevision,
  });

  const repeated = await importPhotoLibrary({ sourceDir, projectRoot });
  assert.deepEqual(repeated.assetOutcomes, [{ assetId, disposition: "restored" }]);
  assert.equal(repeated.activeAssets, 1);
  assert.equal(repeated.catalogRevision, archived.revision + 1);
  assert.equal((await getLocalPhotoLibrarySnapshot({ projectRoot })).archivedAssets, 0);
  assert.deepEqual(
    JSON.parse(await fs.readFile(repeated.manifestPath, "utf8")).assets.map((asset) => asset.id),
    [assetId],
  );
});

photoTest("bootstraps a canonical private catalog from the legacy public manifest", async (t) => {
  const { projectRoot } = await makeTemporaryWorkspace(t);
  const manifestPath = path.join(projectRoot, "public", "photos", "library-manifest.json");
  const catalogPath = path.join(projectRoot, ".frame-zero", "photo-library-catalog.json");
  const first = makeManifestAsset("b".repeat(64));
  const second = makeManifestAsset("a".repeat(64));
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify({ version: 1, assets: [first, second] })}\n`, "utf8");

  const snapshot = await getLocalPhotoLibrarySnapshot({ projectRoot });

  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.activeAssets, 2);
  assert.deepEqual(snapshot.items.map((item) => item.assetId), [first.id, second.id]);
  assert.ok(snapshot.items.every((item) => (
    item.sourceKind === "legacy"
    && item.importOrdinal === null
    && item.batchId === null
  )));
  assert.deepEqual(snapshot.items.map((item) => item.asset), [first, second]);
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  assert.deepEqual(catalog.items.map((item) => item.asset), [first, second]);
  assert.doesNotMatch(JSON.stringify(catalog), /relativePath|sourceDir|fileName|[A-Z]:\\/i);
});

photoTest("migrates the metadata-only catalog and repairs an interrupted public manifest", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  await sharp({ create: { width: 300, height: 200, channels: 3, background: "#76624c" } })
    .jpeg()
    .toFile(path.join(sourceDir, "photo.jpg"));
  const imported = await importPhotoLibrary({ sourceDir, projectRoot });
  const catalog = JSON.parse(await fs.readFile(imported.catalogPath, "utf8"));
  const metadataOnlyCatalog = {
    ...catalog,
    items: catalog.items.map((item) => {
      const metadataOnlyItem = { ...item };
      delete metadataOnlyItem.asset;
      return metadataOnlyItem;
    }),
  };
  await fs.writeFile(imported.catalogPath, `${JSON.stringify(metadataOnlyCatalog)}\n`, "utf8");

  const migrated = await getLocalPhotoLibrarySnapshot({ projectRoot });
  assert.equal(migrated.revision, catalog.revision + 1);
  assert.deepEqual(migrated.items[0].asset, imported.manifest.assets[0]);

  await setLocalPhotoAssetsArchived({
    projectRoot,
    assetIds: [migrated.items[0].assetId],
    archived: true,
    expectedRevision: migrated.revision,
  });
  // Simulate a catalog-first commit whose public manifest replacement was
  // interrupted. The next locked read must deterministically repair it.
  await fs.writeFile(imported.manifestPath, `${JSON.stringify(imported.manifest)}\n`, "utf8");
  const repaired = await getLocalPhotoLibrarySnapshot({ projectRoot });
  assert.equal(repaired.archivedAssets, 1);
  assert.deepEqual(
    JSON.parse(await fs.readFile(imported.manifestPath, "utf8")),
    { version: 1, assets: [] },
  );
});

photoTest("rejects the generated library as an import source", async (t) => {
  const { projectRoot } = await makeTemporaryWorkspace(t);
  const generatedLibrary = path.join(projectRoot, "public", "photos", "library");
  await fs.mkdir(generatedLibrary, { recursive: true });
  await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#ffffff" },
  }).jpeg().toFile(path.join(generatedLibrary, "input.jpg"));

  await assert.rejects(
    importPhotoLibrary({ sourceDir: generatedLibrary, projectRoot }),
    /cannot be the generated library directory/,
  );
});

photoTest("refuses generated output paths that traverse a symlink or junction", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-external-output-"));
  const publicDir = path.join(projectRoot, "public");
  const externalPhotos = path.join(externalRoot, "photos");
  const linkPath = path.join(publicDir, "photos");
  await Promise.all([fs.mkdir(publicDir, { recursive: true }), fs.mkdir(externalPhotos, { recursive: true })]);
  await sharp({
    create: { width: 320, height: 240, channels: 3, background: "#d76822" },
  }).jpeg().toFile(path.join(sourceDir, "safe-input.jpg"));

  let linked = false;
  try {
    try {
      await fs.symlink(externalPhotos, linkPath, process.platform === "win32" ? "junction" : "dir");
      linked = true;
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("Creating a test junction is not permitted in this environment");
        return;
      }
      throw error;
    }

    await assert.rejects(
      importPhotoLibrary({ sourceDir, projectRoot }),
      /cannot contain symbolic links or junctions/,
    );
    assert.deepEqual(await fs.readdir(externalPhotos), []);
  } finally {
    if (linked) await removeDirectoryLink(linkPath);
    await fs.rm(externalRoot, { recursive: true, force: true });
  }
});

photoTest("keeps a previously owned linked photo directory pinned to its hashed target", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-owned-output-"));
  const publicDir = path.join(projectRoot, "public");
  const externalPhotos = path.join(externalRoot, "photos");
  const linkPath = path.join(publicDir, "photos");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(externalPhotos, { recursive: true }),
  ]);
  await sharp({
    create: { width: 640, height: 420, channels: 3, background: "#e46c28" },
  }).jpeg().toFile(path.join(sourceDir, "linked-input.jpg"));
  let linked = false;
  try {
    try {
      await fs.symlink(externalPhotos, linkPath, process.platform === "win32" ? "junction" : "dir");
      linked = true;
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("Creating a test junction is not permitted in this environment");
        return;
      }
      throw error;
    }

    const adopted = await importPhotoLibrary({ adoptLinkedOutput: true, sourceDir, projectRoot });
    assert.equal(adopted.importedAssets, 1);
    const state = JSON.parse(await fs.readFile(adopted.statePath, "utf8"));
    const owner = JSON.parse(await fs.readFile(path.join(externalPhotos, "library", ".frame-zero-owner.json"), "utf8"));
    assert.match(state.outputKey, /^[a-f0-9]{64}$/);
    assert.match(state.ownershipToken, /^[a-f0-9]{64}$/);
    assert.equal(owner.ownershipToken, state.ownershipToken);

    const repeated = await importPhotoLibrary({ sourceDir, projectRoot });
    assert.equal(repeated.importedAssets, 1);
    assert.equal(repeated.reusedAssets, 1);
  } finally {
    if (linked) await removeDirectoryLink(linkPath);
    await fs.rm(externalRoot, { recursive: true, force: true });
  }
});

photoTest("does not replace an existing manifest when no readable photograph exists", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const manifestPath = path.join(projectRoot, "public", "photos", "library-manifest.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, '{"version":1,"assets":[]}\n', "utf8");
  await fs.writeFile(path.join(sourceDir, "broken.jpg"), "broken", "utf8");

  await assert.rejects(
    importPhotoLibrary({ sourceDir, projectRoot }),
    /No readable photographs could be imported/,
  );
  assert.equal(await fs.readFile(manifestPath, "utf8"), '{"version":1,"assets":[]}\n');
});

photoTest("keeps different source imports additive and preserves CLI source state for transient imports", async (t) => {
  const { root, projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const transientSource = path.join(root, "transient-upload");
  await fs.mkdir(transientSource);
  await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#9c432f" },
  }).jpeg().toFile(path.join(sourceDir, "cli-source.jpg"));
  const transientPhoto = path.join(transientSource, "random-upload-name.png");
  await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#376da5" },
  }).png().toFile(transientPhoto);

  const first = await importPhotoLibrary({ sourceDir, projectRoot });
  const firstState = JSON.parse(await fs.readFile(first.statePath, "utf8"));
  assert.equal(first.importedAssets, 1);
  assert.equal(first.addedAssets, 1);
  assert.equal(first.existingAssets, 0);

  const second = await importPhotoLibrary({
    sourceDir: transientSource,
    projectRoot,
    recordSourceState: false,
  });
  const secondState = JSON.parse(await fs.readFile(second.statePath, "utf8"));
  assert.equal(second.importedAssets, 2);
  assert.equal(second.addedAssets, 1);
  assert.equal(second.existingAssets, 0);
  assert.equal(secondState.sourceKey, firstState.sourceKey);
  assert.deepEqual(secondState.files, firstState.files);
  assert.ok(!JSON.stringify(secondState).includes("random-upload-name"));

  const duplicate = await importPhotoLibrary({
    sourceDir: transientSource,
    projectRoot,
    recordSourceState: false,
  });
  assert.equal(duplicate.importedAssets, 2);
  assert.equal(duplicate.addedAssets, 0);
  assert.equal(duplicate.existingAssets, 1);
  assert.equal(duplicate.generatedAssets, 0);
  assert.equal(duplicate.reusedAssets, 1);

  const transientOnlyProject = path.join(root, "transient-only-project");
  await fs.mkdir(transientOnlyProject);
  const transientOnly = await importPhotoLibrary({
    sourceDir: transientSource,
    projectRoot: transientOnlyProject,
    recordSourceState: false,
  });
  const transientOnlyState = JSON.parse(await fs.readFile(transientOnly.statePath, "utf8"));
  assert.ok(!Object.hasOwn(transientOnlyState, "sourceKey"));
  assert.ok(!Object.hasOwn(transientOnlyState, "files"));
});

photoTest("serializes concurrent imports without losing additive manifest entries", async (t) => {
  const { root, projectRoot } = await makeTemporaryWorkspace(t);
  const firstSource = path.join(root, "concurrent-a");
  const secondSource = path.join(root, "concurrent-b");
  await Promise.all([fs.mkdir(firstSource), fs.mkdir(secondSource)]);
  await Promise.all([
    sharp({
      create: { width: 1600, height: 1000, channels: 3, background: "#b93f28" },
    }).jpeg().toFile(path.join(firstSource, "a.jpg")),
    sharp({
      create: { width: 1000, height: 1600, channels: 3, background: "#2b6eaf" },
    }).png().toFile(path.join(secondSource, "b.png")),
  ]);

  const results = await Promise.all([
    importPhotoLibrary({ sourceDir: firstSource, projectRoot }),
    importPhotoLibrary({ sourceDir: secondSource, projectRoot }),
  ]);
  assert.deepEqual(results.map((result) => result.importedAssets).sort((a, b) => a - b), [1, 2]);
  assert.ok(results.every((result) => result.addedAssets === 1));
  assert.ok(results.every((result) => result.existingAssets === 0));

  const manifest = JSON.parse(await fs.readFile(results[0].manifestPath, "utf8"));
  assert.equal(manifest.assets.length, 2);
  assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, 2);
  await assert.rejects(
    fs.stat(path.join(projectRoot, ".frame-zero", "photo-import.lock")),
    { code: "ENOENT" },
  );
});

photoTest("fails closed when an existing manifest is malformed", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const manifestPath = path.join(projectRoot, "public", "photos", "library-manifest.json");
  const malformedManifest = '{"version":1,"assets":[';
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, malformedManifest, "utf8");
  await sharp({
    create: { width: 640, height: 420, channels: 3, background: "#6f4b9f" },
  }).jpeg().toFile(path.join(sourceDir, "valid.jpg"));

  await assert.rejects(
    importPhotoLibrary({ sourceDir, projectRoot }),
    /Existing photo library manifest is invalid/,
  );
  assert.equal(await fs.readFile(manifestPath, "utf8"), malformedManifest);
});

photoTest("fails closed when an existing manifest is semantically invalid", async (t) => {
  const cases = [
    ["out-of-range aspect ratio", (asset) => { asset.aspectRatio = -1; }],
    ["orientation that disagrees with the ratio", (asset) => { asset.orientation = "landscape"; }],
    ["variant ratio that disagrees with the asset", (asset) => { asset.variants.thumbnail.width = 2; }],
    ["variants that shrink between tiers", (asset) => {
      asset.variants.thumbnail.width = 2;
      asset.variants.thumbnail.height = 2;
    }],
    ["unsafe variant dimensions", (asset) => {
      asset.variants.thumbnail.width = 100_001;
      asset.variants.thumbnail.height = 100_001;
    }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async (caseTest) => {
      const { projectRoot, sourceDir } = await makeTemporaryWorkspace(caseTest);
      const manifestPath = path.join(projectRoot, "public", "photos", "library-manifest.json");
      const asset = makeManifestAsset("a".repeat(64));
      mutate(asset);
      const manifestText = `${JSON.stringify({ version: 1, assets: [asset] })}\n`;
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, manifestText, "utf8");
      await sharp({
        create: { width: 640, height: 420, channels: 3, background: "#426987" },
      }).jpeg().toFile(path.join(sourceDir, "valid.jpg"));

      await assert.rejects(
        importPhotoLibrary({ sourceDir, projectRoot }),
        /Existing photo library manifest is invalid/,
      );
      assert.equal(await fs.readFile(manifestPath, "utf8"), manifestText);
    });
  }
});

photoTest("recovers an interrupted manifest replacement without losing additive assets", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const firstSource = path.join(sourceDir, "first.jpg");
  await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#784562" },
  }).jpeg().toFile(firstSource);
  const first = await importPhotoLibrary({ sourceDir, projectRoot });
  const firstId = first.manifest.assets[0].id;
  const manifestPath = first.manifestPath;
  const backupPath = `${manifestPath}.frame-zero-backup`;
  const pendingPath = `${manifestPath}.frame-zero-pending`;

  await fs.rename(manifestPath, backupPath);
  await fs.writeFile(pendingPath, '{"version":1,"assets":[]}\n', "utf8");
  await fs.rm(firstSource);
  await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#326d82" },
  }).png().toFile(path.join(sourceDir, "second.png"));

  const recovered = await importPhotoLibrary({ sourceDir, projectRoot });
  assert.equal(recovered.importedAssets, 2);
  assert.ok(recovered.manifest.assets.some((asset) => asset.id === firstId));
  await assert.rejects(fs.stat(backupPath), { code: "ENOENT" });
  await assert.rejects(fs.stat(pendingPath), { code: "ENOENT" });
});

photoTest("enforces and exposes the maximum manifest capacity", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const manifestPath = path.join(projectRoot, "public", "photos", "library-manifest.json");
  assert.equal(photoImportContract.maxManifestAssets, 10_000);
  assert.ok(Object.isFrozen(photoImportContract.supportedExtensions));
  assert.deepEqual(photoImportContract.supportedExtensions, [
    ".avif",
    ".heic",
    ".heif",
    ".jpeg",
    ".jpg",
    ".png",
    ".tif",
    ".tiff",
    ".webp",
  ]);

  const assets = Array.from({ length: photoImportContract.maxManifestAssets }, (_, index) => (
    makeManifestAsset(index.toString(16).padStart(64, "0"))
  ));
  const manifestText = `${JSON.stringify({ version: 1, assets })}\n`;
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, manifestText, "utf8");
  await sharp({
    create: { width: 640, height: 420, channels: 3, background: "#3f7658" },
  }).jpeg().toFile(path.join(sourceDir, "one-too-many.jpg"));

  await assert.rejects(
    importPhotoLibrary({ sourceDir, projectRoot }),
    /limited to 10000 assets/,
  );
  assert.equal(await fs.readFile(manifestPath, "utf8"), manifestText);
});

photoTest("recovers a lock left by a crashed importer without recursive cleanup", async (t) => {
  const { projectRoot, sourceDir } = await makeTemporaryWorkspace(t);
  const stateDir = path.join(projectRoot, ".frame-zero");
  const lockPath = path.join(stateDir, "photo-import.lock");
  await fs.mkdir(stateDir);
  await fs.writeFile(lockPath, `${JSON.stringify({
    version: 1,
    pid: 999999,
    token: "a".repeat(64),
    createdAt: Date.now() - 10_000,
  })}\n`, "utf8");
  await sharp({
    create: { width: 640, height: 420, channels: 3, background: "#87602f" },
  }).jpeg().toFile(path.join(sourceDir, "after-crash.jpg"));

  const result = await importPhotoLibrary({ sourceDir, projectRoot });
  assert.equal(result.importedAssets, 1);
  await assert.rejects(fs.stat(lockPath), { code: "ENOENT" });
});
