import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { importPhotoLibrary, photoImportContract } from "../scripts/lib/photo-import.mjs";

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

  await fs.rm(fixtures.portrait);
  const afterRemoval = await importPhotoLibrary({ sourceDir, projectRoot });
  assert.equal(afterRemoval.sourceAssets, 2);
  assert.equal(afterRemoval.importedAssets, 3, "default imports must not invalidate existing homepage assets");
  assert.ok(afterRemoval.manifest.assets.some((asset) => asset.id === portraitId));
  for (const variantName of ["thumbnail", "card", "full"]) {
    const stat = await fs.stat(path.join(afterRemoval.libraryDir, `${portraitId}-${variantName}.webp`));
    assert.ok(stat.isFile());
  }
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
