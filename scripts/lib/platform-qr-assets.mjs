import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const platformQrAssetContract = Object.freeze({
  maximumInputBytes: 10 * 1024 * 1024,
  maximumInputPixels: 24_000_000,
  maximumOutputEdge: 1_600,
  maximumStoredBytes: 16 * 1024 * 1024,
  minimumInputEdge: 160,
  supportedExtensions: Object.freeze([".jpeg", ".jpg", ".png", ".webp"]),
});

const ASSET_ID_PATTERN = /^[a-f0-9]{64}$/;
const DECODED_FORMATS = new Set(["jpeg", "png", "webp"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function assertPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  if (
    relative === ""
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) throw new Error("Refusing to use a platform QR path outside its private store");
}

export function isPlatformQrAssetId(value) {
  return typeof value === "string" && ASSET_ID_PATTERN.test(value);
}

export function getPlatformQrAssetDirectory(projectRoot) {
  return path.join(path.resolve(projectRoot), ".frame-zero", "platform-qr-assets");
}

export function getPlatformQrAssetFile(projectRoot, assetId) {
  if (!isPlatformQrAssetId(assetId)) throw new TypeError("A valid platform QR asset ID is required");
  const directory = getPlatformQrAssetDirectory(projectRoot);
  const filePath = path.join(directory, `${assetId}.png`);
  assertPathInside(directory, filePath);
  return filePath;
}

async function ensureRealDirectory(directory) {
  try {
    await fs.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const stats = await fs.lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("The private platform QR store must use real local directories");
  }
}

async function existingRealDirectory(directory) {
  let stats;
  try {
    stats = await fs.lstat(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("The private platform QR store must use real local directories");
  }
  return true;
}

async function ensurePrivateAssetDirectory(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  const stateDirectory = path.join(resolvedRoot, ".frame-zero");
  const assetDirectory = getPlatformQrAssetDirectory(resolvedRoot);
  await ensureRealDirectory(stateDirectory);
  await ensureRealDirectory(assetDirectory);
  return assetDirectory;
}

async function writeAtomically(filePath, bytes) {
  const directory = path.dirname(filePath);
  const pendingPath = path.join(directory, `.pending-${randomBytes(16).toString("hex")}`);
  assertPathInside(directory, pendingPath);
  let handle;
  try {
    handle = await fs.open(pendingPath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.close();
    handle = undefined;
    await fs.rename(pendingPath, filePath);
    return "added";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return "duplicate";
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(pendingPath, { force: true }).catch(() => undefined);
  }
}

export async function importPlatformQrAsset({ projectRoot, sourcePath }) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new TypeError("projectRoot is required");
  }
  if (typeof sourcePath !== "string" || sourcePath.trim() === "") {
    throw new TypeError("sourcePath is required");
  }

  const sourceStats = await fs.stat(sourcePath);
  if (!sourceStats.isFile() || sourceStats.size < 1) throw new Error("The QR upload is empty");
  if (sourceStats.size > platformQrAssetContract.maximumInputBytes) {
    throw new Error("The QR upload exceeds the local size limit");
  }
  const sourceBytes = await fs.readFile(sourcePath);
  if (sourceBytes.byteLength < 1) throw new Error("The QR upload is empty");
  if (sourceBytes.byteLength > platformQrAssetContract.maximumInputBytes) {
    throw new Error("The QR upload exceeds the local size limit");
  }

  const image = sharp(sourceBytes, {
    animated: false,
    failOn: "warning",
    limitInputPixels: platformQrAssetContract.maximumInputPixels,
  });
  const metadata = await image.metadata();
  if (!metadata.format || !DECODED_FORMATS.has(metadata.format)) {
    throw new Error("The QR upload format is not supported");
  }
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (
    width < platformQrAssetContract.minimumInputEdge
    || height < platformQrAssetContract.minimumInputEdge
  ) throw new Error("The QR upload is too small to scan reliably");

  const { data, info } = await image
    .rotate()
    .resize({
      width: platformQrAssetContract.maximumOutputEdge,
      height: platformQrAssetContract.maximumOutputEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const assetId = createHash("sha256").update(data).digest("hex");
  await ensurePrivateAssetDirectory(projectRoot);
  const filePath = getPlatformQrAssetFile(projectRoot, assetId);
  const existing = await readPlatformQrAsset({ projectRoot, assetId });
  const status = existing ? "duplicate" : await writeAtomically(filePath, data);

  return {
    assetId,
    bytes: data.byteLength,
    height: info.height,
    status,
    width: info.width,
  };
}

export async function readPlatformQrAsset({ projectRoot, assetId }) {
  const resolvedRoot = path.resolve(projectRoot);
  const stateDirectory = path.join(resolvedRoot, ".frame-zero");
  const assetDirectory = getPlatformQrAssetDirectory(resolvedRoot);
  const filePath = getPlatformQrAssetFile(resolvedRoot, assetId);
  if (!await existingRealDirectory(stateDirectory)) return null;
  if (!await existingRealDirectory(assetDirectory)) return null;

  let pathStats;
  try {
    pathStats = await fs.lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (
    pathStats.isSymbolicLink()
    || !pathStats.isFile()
    || pathStats.size < PNG_SIGNATURE.byteLength
    || pathStats.size > platformQrAssetContract.maximumStoredBytes
  ) throw new Error("The stored platform QR asset failed integrity verification");

  const handle = await fs.open(filePath, "r");
  let data;
  try {
    const openedStats = await handle.stat();
    if (
      !openedStats.isFile()
      || openedStats.size !== pathStats.size
      || openedStats.size > platformQrAssetContract.maximumStoredBytes
    ) throw new Error("The stored platform QR asset failed integrity verification");
    data = await handle.readFile();
  } finally {
    await handle.close();
  }
  if (
    data.byteLength < PNG_SIGNATURE.byteLength
    || !data.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
    || createHash("sha256").update(data).digest("hex") !== assetId
  ) throw new Error("The stored platform QR asset failed integrity verification");
  return { data };
}

export function createPlatformQrTemporaryName(extension) {
  if (!platformQrAssetContract.supportedExtensions.includes(extension)) {
    throw new TypeError("Unsupported platform QR extension");
  }
  return `platform-qr-${randomBytes(16).toString("hex")}${extension}`;
}
