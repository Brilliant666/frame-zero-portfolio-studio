import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  getPlatformQrAssetFile,
  importPlatformQrAsset,
  platformQrAssetContract,
  readPlatformQrAsset,
} from "../scripts/lib/platform-qr-assets.mjs";

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-platform-qr-"));
  const projectRoot = path.join(root, "project");
  const sourceRoot = path.join(root, "source");
  await Promise.all([
    fs.mkdir(projectRoot, { recursive: true }),
    fs.mkdir(sourceRoot, { recursive: true }),
  ]);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { projectRoot, sourceRoot };
}

async function makeImage(filePath, format, width = 640, height = 960) {
  let image = sharp({
    create: { width, height, channels: 3, background: { r: 245, g: 245, b: 245 } },
  }).composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="40" y="40" width="180" height="180" fill="#111"/></svg>`), top: 0, left: 0 }]);
  if (format === "jpeg") image = image.jpeg({ quality: 88 }).withMetadata({ orientation: 1 });
  else if (format === "webp") image = image.webp({ lossless: true });
  else image = image.png();
  await image.toFile(filePath);
}

async function linkDirectory(t, target, linkPath) {
  try {
    await fs.symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("This host does not allow directory links");
      return false;
    }
    throw error;
  }
}

test("platform QR assets normalize supported raster formats into private content-addressed PNGs", async (t) => {
  const { projectRoot, sourceRoot } = await workspace(t);

  for (const [format, extension] of [["png", ".png"], ["jpeg", ".jpg"], ["webp", ".webp"]]) {
    const sourcePath = path.join(sourceRoot, `synthetic-${format}${extension}`);
    await makeImage(sourcePath, format);
    const imported = await importPlatformQrAsset({ projectRoot, sourcePath });
    assert.match(imported.assetId, /^[a-f0-9]{64}$/);
    assert.equal(imported.width, 640);
    assert.equal(imported.height, 960);
    assert.equal(imported.status, "added");

    const stored = await readPlatformQrAsset({ projectRoot, assetId: imported.assetId });
    assert.ok(stored);
    assert.equal(createHash("sha256").update(stored.data).digest("hex"), imported.assetId);
    const metadata = await sharp(stored.data).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
  }
});

test("platform QR assets preserve aspect ratio, cap the longest edge, and deduplicate", async (t) => {
  const { projectRoot, sourceRoot } = await workspace(t);
  const sourcePath = path.join(sourceRoot, "large.png");
  await makeImage(sourcePath, "png", 1_800, 2_400);

  const first = await importPlatformQrAsset({ projectRoot, sourcePath });
  const second = await importPlatformQrAsset({ projectRoot, sourcePath });
  assert.equal(first.width, 1_200);
  assert.equal(first.height, platformQrAssetContract.maximumOutputEdge);
  assert.equal(second.assetId, first.assetId);
  assert.equal(second.status, "duplicate");
});

test("platform QR assets reject unsafe inputs and private-store collisions", async (t) => {
  const { projectRoot, sourceRoot } = await workspace(t);
  const valid = path.join(sourceRoot, "valid.png");
  await makeImage(valid, "png", 320, 320);

  await assert.rejects(
    () => readPlatformQrAsset({ projectRoot, assetId: "../outside" }),
    /valid platform QR asset ID/,
  );

  const tooSmall = path.join(sourceRoot, "small.png");
  await makeImage(tooSmall, "png", 120, 240);
  await assert.rejects(
    () => importPlatformQrAsset({ projectRoot, sourcePath: tooSmall }),
    /too small/,
  );

  const disguisedSvg = path.join(sourceRoot, "disguised.png");
  await fs.writeFile(disguisedSvg, '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320"/></svg>');
  await assert.rejects(
    () => importPlatformQrAsset({ projectRoot, sourcePath: disguisedSvg }),
    /format is not supported/,
  );

  const oversized = path.join(sourceRoot, "oversized.png");
  await fs.writeFile(oversized, Buffer.alloc(platformQrAssetContract.maximumInputBytes + 1));
  await assert.rejects(
    () => importPlatformQrAsset({ projectRoot, sourcePath: oversized }),
    /size limit/,
  );

  const overPixels = path.join(sourceRoot, "over-pixels.png");
  await makeImage(overPixels, "png", 5_000, 5_000);
  await assert.rejects(
    () => importPlatformQrAsset({ projectRoot, sourcePath: overPixels }),
    /pixel limit|exceeds/i,
  );

  await fs.writeFile(path.join(projectRoot, ".frame-zero"), "collision");
  await assert.rejects(
    () => importPlatformQrAsset({ projectRoot, sourcePath: valid }),
    /real local directories/,
  );
});

test("platform QR reads fail closed when immutable bytes are tampered", async (t) => {
  const { projectRoot, sourceRoot } = await workspace(t);
  const sourcePath = path.join(sourceRoot, "card.png");
  await makeImage(sourcePath, "png");
  const imported = await importPlatformQrAsset({ projectRoot, sourcePath });
  await fs.writeFile(getPlatformQrAssetFile(projectRoot, imported.assetId), Buffer.from("not a png"));
  await assert.rejects(
    () => readPlatformQrAsset({ projectRoot, assetId: imported.assetId }),
    /integrity verification/,
  );
});

test("platform QR store rejects a linked private state directory", async (t) => {
  const { projectRoot, sourceRoot } = await workspace(t);
  const external = path.join(sourceRoot, "external-state");
  await fs.mkdir(external);
  try {
    await fs.symlink(external, path.join(projectRoot, ".frame-zero"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM") return t.skip("This host does not allow directory links");
    throw error;
  }
  const sourcePath = path.join(sourceRoot, "valid.png");
  await makeImage(sourcePath, "png", 320, 320);
  await assert.rejects(
    () => importPlatformQrAsset({ projectRoot, sourcePath }),
    /real local directories/,
  );
});

test("platform QR reads treat missing private directories as an absent asset", async (t) => {
  const { projectRoot } = await workspace(t);
  const assetId = "a".repeat(64);

  assert.equal(await readPlatformQrAsset({ projectRoot, assetId }), null);
  await fs.mkdir(path.join(projectRoot, ".frame-zero"));
  assert.equal(await readPlatformQrAsset({ projectRoot, assetId }), null);
});

test("platform QR reads reject a linked private state directory", async (t) => {
  const { projectRoot, sourceRoot } = await workspace(t);
  const externalProject = path.join(sourceRoot, "external-state-project");
  const sourcePath = path.join(sourceRoot, "state-link-card.png");
  await fs.mkdir(externalProject);
  await makeImage(sourcePath, "png", 320, 480);
  const imported = await importPlatformQrAsset({ projectRoot: externalProject, sourcePath });
  const linked = await linkDirectory(
    t,
    path.join(externalProject, ".frame-zero"),
    path.join(projectRoot, ".frame-zero"),
  );
  if (!linked) return;

  await assert.rejects(
    () => readPlatformQrAsset({ projectRoot, assetId: imported.assetId }),
    /real local directories/,
  );
});

test("platform QR reads reject a linked private asset directory", async (t) => {
  const { projectRoot, sourceRoot } = await workspace(t);
  const externalProject = path.join(sourceRoot, "external-asset-project");
  const sourcePath = path.join(sourceRoot, "asset-link-card.png");
  await fs.mkdir(externalProject);
  await makeImage(sourcePath, "png", 320, 480);
  const imported = await importPlatformQrAsset({ projectRoot: externalProject, sourcePath });
  await fs.mkdir(path.join(projectRoot, ".frame-zero"));
  const linked = await linkDirectory(
    t,
    path.join(externalProject, ".frame-zero", "platform-qr-assets"),
    path.join(projectRoot, ".frame-zero", "platform-qr-assets"),
  );
  if (!linked) return;

  await assert.rejects(
    () => readPlatformQrAsset({ projectRoot, assetId: imported.assetId }),
    /real local directories/,
  );
});
