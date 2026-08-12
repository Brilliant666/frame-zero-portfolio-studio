import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MANIFEST_VERSION = 1;
const PIPELINE_VERSION = "webp-480-1100-2200-v1";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MINIMUM_NODE_VERSION = [22, 13, 0];
const MAX_MANIFEST_ASSETS = 10_000;
const MAX_VARIANT_DIMENSION = 100_000;
const MIN_ASPECT_RATIO = 0.05;
const MAX_ASPECT_RATIO = 20;
const ASPECT_RATIO_TOLERANCE = 0.03;
const PHOTO_IMPORT_LOCK_FILE = "photo-import.lock";
const PHOTO_IMPORT_RECOVERY_LOCK_FILE = "photo-import.lock.recovery";
const PHOTO_IMPORT_LOCK_VERSION = 1;
const PHOTO_IMPORT_LOCK_TIMEOUT_MS = 120_000;
const PHOTO_IMPORT_LOCK_RETRY_MS = 50;
const PHOTO_IMPORT_DEAD_LOCK_GRACE_MS = 5_000;
const PHOTO_IMPORT_INCOMPLETE_LOCK_GRACE_MS = 30_000;
const PHOTO_LIBRARY_CATALOG_VERSION = 1;
const PHOTO_LIBRARY_CATALOG_FILE = "photo-library-catalog.json";
const IMPORT_BATCH_PATTERN = /^[a-f0-9]{32}$/;
const IMPORT_SOURCE_KINDS = new Set(["photos", "folder"]);
const SUPPORTED_EXTENSION_LIST = Object.freeze([
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
const SUPPORTED_EXTENSIONS = new Set(SUPPORTED_EXTENSION_LIST);

const VARIANT_OPTIONS = {
  thumbnail: { maximum: 480, quality: 60 },
  card: { maximum: 1100, quality: 70 },
  full: { maximum: 2200, quality: 80 },
};

function assertSupportedNodeRuntime() {
  const current = process.versions.node.split(".").map(Number);
  let supported = true;
  for (let index = 0; index < MINIMUM_NODE_VERSION.length; index += 1) {
    if (current[index] > MINIMUM_NODE_VERSION[index]) break;
    if (current[index] < MINIMUM_NODE_VERSION[index]) {
      supported = false;
      break;
    }
  }

  if (!supported) {
    throw new Error(
      `Photo import requires Node.js >=${MINIMUM_NODE_VERSION.join(".")}; current runtime is ${process.versions.node}. `
      + "Run `fnm use 22.13.1` (or newer) and try again.",
    );
  }
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function ensureGeneratedDirectory(projectRoot, targetDirectory, { allowLinkedOutput = false } = {}) {
  const resolvedTarget = path.resolve(targetDirectory);
  if (!isPathInside(projectRoot, resolvedTarget)) {
    throw new Error("Generated photo paths must stay inside the project");
  }

  const segments = path.relative(projectRoot, resolvedTarget).split(path.sep).filter(Boolean);
  let current = projectRoot;
  let followedLink = false;

  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        if (!allowLinkedOutput) throw new Error("Generated photo paths cannot contain symbolic links or junctions");
        current = await fs.realpath(current);
        followedLink = true;
        const targetStat = await fs.stat(current);
        if (!targetStat.isDirectory()) throw new Error("Generated photo link must resolve to a directory");
        continue;
      }
      if (!stat.isDirectory()) throw new Error("Generated photo path collides with a non-directory entry");
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
      try {
        await fs.mkdir(current);
      } catch (mkdirError) {
        if (!mkdirError || mkdirError.code !== "EEXIST") throw mkdirError;
        const existing = await fs.lstat(current);
        if (existing.isSymbolicLink() || !existing.isDirectory()) {
          throw new Error("Generated photo path collides with a non-directory entry");
        }
      }
    }
  }

  const realTarget = await fs.realpath(current);
  if (!isPathInside(projectRoot, realTarget) && !(allowLinkedOutput && followedLink)) {
    throw new Error("Generated photo paths resolved outside the project");
  }
  return realTarget;
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function sanitizeError(error, sourceDir) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedSource = path.resolve(sourceDir);
  return message
    .replaceAll(normalizedSource, "[source]")
    .replaceAll(normalizedSource.replaceAll("\\", "/"), "[source]");
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function scanPhotoFiles(sourceDir, excludedDirectories) {
  const files = [];
  let scannedFiles = 0;
  let skippedSymlinks = 0;

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true }));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinks += 1;
        continue;
      }

      if (entry.isDirectory()) {
        const resolvedDirectory = path.resolve(absolutePath);
        if (excludedDirectories.some((excluded) => isPathInside(excluded, resolvedDirectory))) continue;
        await visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      scannedFiles += 1;
      if (!SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      files.push(absolutePath);
    }
  }

  await visit(sourceDir);
  files.sort((left, right) => normalizeRelativePath(path.relative(sourceDir, left))
    .localeCompare(normalizeRelativePath(path.relative(sourceDir, right)), "en", { numeric: true }));

  return { files, scannedFiles, skippedSymlinks };
}

function variantFileName(id, variantName) {
  return `${id}-${variantName}.webp`;
}

function variantSource(id, variantName) {
  return `/photos/library/${variantFileName(id, variantName)}`;
}

function orientationFor(width, height) {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

function roundAspectRatio(width, height) {
  return Number((width / height).toFixed(6));
}

async function removeFileWithRetry(filePath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(filePath, { force: true });
      return;
    } catch (error) {
      if (!error || !["EBUSY", "EPERM"].includes(error.code) || attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function atomicWritePaths(filePath) {
  return {
    backupPath: `${filePath}.frame-zero-backup`,
    temporaryPath: `${filePath}.frame-zero-pending`,
  };
}

async function recoverInterruptedAtomicWrite(filePath) {
  const { backupPath, temporaryPath } = atomicWritePaths(filePath);
  const [targetExists, backupExists] = await Promise.all([
    fileExists(filePath),
    fileExists(backupPath),
  ]);

  if (!targetExists && backupExists) {
    await fs.rename(backupPath, filePath);
  } else if (targetExists && backupExists) {
    await removeFileWithRetry(backupPath);
  }
  await removeFileWithRetry(temporaryPath);
}

async function writeJsonAtomically(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await recoverInterruptedAtomicWrite(filePath);
  const { backupPath, temporaryPath } = atomicWritePaths(filePath);
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    if (!error || !["EEXIST", "EPERM"].includes(error.code)) {
      await removeFileWithRetry(temporaryPath);
      throw error;
    }
    await removeFileWithRetry(backupPath);
    let movedExistingFile = false;
    try {
      await fs.rename(filePath, backupPath);
      movedExistingFile = true;
      await fs.rename(temporaryPath, filePath);
      await removeFileWithRetry(backupPath);
    } catch (replacementError) {
      if (movedExistingFile) {
        if (await fileExists(filePath)) await removeFileWithRetry(backupPath);
        else await fs.rename(backupPath, filePath);
      }
      await removeFileWithRetry(temporaryPath);
      throw replacementError;
    }
  }
}

async function readJson(filePath) {
  try {
    await recoverInterruptedAtomicWrite(filePath);
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    return null;
  }
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function parseImportLock(contents) {
  try {
    const value = JSON.parse(contents);
    if (
      value?.version !== PHOTO_IMPORT_LOCK_VERSION
      || !Number.isSafeInteger(value.pid)
      || value.pid <= 0
      || typeof value.token !== "string"
      || !HASH_PATTERN.test(value.token)
      || typeof value.createdAt !== "number"
      || !Number.isFinite(value.createdAt)
    ) return null;
    return value;
  } catch {
    return null;
  }
}

async function inspectImportLock(lockPath) {
  let contents;
  let stat;
  try {
    [contents, stat] = await Promise.all([
      fs.readFile(lockPath, "utf8"),
      fs.stat(lockPath),
    ]);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const lock = parseImportLock(contents);
  const now = Date.now();
  return {
    contents,
    isStale: lock
    ? now - lock.createdAt >= PHOTO_IMPORT_DEAD_LOCK_GRACE_MS && !isProcessAlive(lock.pid)
    : now - stat.mtimeMs >= PHOTO_IMPORT_INCOMPLETE_LOCK_GRACE_MS,
  };
}

async function createOwnedLock(lockPath) {
  const token = randomBytes(32).toString("hex");
  let handle;
  try {
    handle = await fs.open(lockPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({
      version: PHOTO_IMPORT_LOCK_VERSION,
      pid: process.pid,
      token,
      createdAt: Date.now(),
    })}\n`, "utf8");
    await handle.sync();
    await handle.close();
    return { lockPath, token };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (handle) await removeFileWithRetry(lockPath);
    throw error;
  }
}

async function releaseOwnedLock(lock) {
  try {
    const contents = await fs.readFile(lock.lockPath, "utf8");
    if (parseImportLock(contents)?.token !== lock.token) return;
    await removeFileWithRetry(lock.lockPath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

async function removeAbandonedRecoveryLock(recoveryLockPath) {
  const observed = await inspectImportLock(recoveryLockPath);
  if (!observed) return true;
  if (!observed.isStale) return false;

  try {
    if (await fs.readFile(recoveryLockPath, "utf8") !== observed.contents) return false;
    await removeFileWithRetry(recoveryLockPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function recoverStaleImportLock(lockPath, recoveryLockPath) {
  const observed = await inspectImportLock(lockPath);
  if (!observed) return true;
  if (!observed.isStale) return false;

  let recoveryLock;
  try {
    recoveryLock = await createOwnedLock(recoveryLockPath);
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }

  try {
    const current = await inspectImportLock(lockPath);
    if (!current) return true;
    if (!current.isStale || current.contents !== observed.contents) return false;
    await removeFileWithRetry(lockPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  } finally {
    await releaseOwnedLock(recoveryLock);
  }
}

async function acquireImportLock(stateDir) {
  const lockPath = path.join(stateDir, PHOTO_IMPORT_LOCK_FILE);
  const recoveryLockPath = path.join(stateDir, PHOTO_IMPORT_RECOVERY_LOCK_FILE);
  const startedAt = Date.now();

  while (true) {
    const recovery = await inspectImportLock(recoveryLockPath);
    if (recovery) {
      if (recovery.isStale) await removeAbandonedRecoveryLock(recoveryLockPath);
      if (Date.now() - startedAt >= PHOTO_IMPORT_LOCK_TIMEOUT_MS) {
        throw new Error("Another photo import is still running; try again after it finishes");
      }
      await sleep(PHOTO_IMPORT_LOCK_RETRY_MS);
      continue;
    }

    try {
      return await createOwnedLock(lockPath);
    } catch (error) {
      if (!error || error.code !== "EEXIST") throw error;
      if (await recoverStaleImportLock(lockPath, recoveryLockPath)) continue;
      if (Date.now() - startedAt >= PHOTO_IMPORT_LOCK_TIMEOUT_MS) {
        throw new Error("Another photo import is still running; try again after it finishes");
      }
      await sleep(PHOTO_IMPORT_LOCK_RETRY_MS);
    }
  }
}

async function withImportLock(stateDir, operation) {
  const lock = await acquireImportLock(stateDir);
  try {
    return await operation();
  } finally {
    await releaseOwnedLock(lock);
  }
}

function isVariantShape(value, id, name) {
  return Boolean(
    value
    && typeof value === "object"
    && value.src === variantSource(id, name)
    && Number.isSafeInteger(value.width)
    && value.width > 0
    && value.width <= MAX_VARIANT_DIMENSION
    && Number.isSafeInteger(value.height)
    && value.height > 0
    && value.height <= MAX_VARIANT_DIMENSION
    && Number.isSafeInteger(value.bytes)
    && value.bytes > 0,
  );
}

function isAssetShape(value) {
  if (!(
    value
    && typeof value === "object"
    && HASH_PATTERN.test(value.id)
    && typeof value.aspectRatio === "number"
    && Number.isFinite(value.aspectRatio)
    && value.aspectRatio >= MIN_ASPECT_RATIO
    && value.aspectRatio <= MAX_ASPECT_RATIO
    && ["landscape", "portrait", "square"].includes(value.orientation)
    && value.variants
    && isVariantShape(value.variants.thumbnail, value.id, "thumbnail")
    && isVariantShape(value.variants.card, value.id, "card")
    && isVariantShape(value.variants.full, value.id, "full")
  )) return false;

  const { aspectRatio, orientation, variants } = value;
  const expectedOrientation = aspectRatio > 1
    ? "landscape"
    : aspectRatio < 1
      ? "portrait"
      : "square";
  if (orientation !== expectedOrientation) return false;

  const orderedVariants = [variants.thumbnail, variants.card, variants.full];
  if (orderedVariants.some((variant) => (
    Math.abs(Math.log((variant.width / variant.height) / aspectRatio)) > ASPECT_RATIO_TOLERANCE
  ))) return false;
  if (variants.thumbnail.width > variants.card.width || variants.thumbnail.height > variants.card.height) {
    return false;
  }
  if (variants.card.width > variants.full.width || variants.card.height > variants.full.height) {
    return false;
  }
  return true;
}

function selectPublicAssetFields(asset) {
  return {
    id: asset.id,
    aspectRatio: asset.aspectRatio,
    orientation: asset.orientation,
    variants: Object.fromEntries(Object.keys(VARIANT_OPTIONS).map((name) => [name, {
      src: asset.variants[name].src,
      width: asset.variants[name].width,
      height: asset.variants[name].height,
      bytes: asset.variants[name].bytes,
    }])),
  };
}

function isManifestShape(value) {
  if (
    !value
    || typeof value !== "object"
    || value.version !== MANIFEST_VERSION
    || !Array.isArray(value.assets)
    || value.assets.length > MAX_MANIFEST_ASSETS
    || !value.assets.every(isAssetShape)
  ) return false;

  return new Set(value.assets.map((asset) => asset.id)).size === value.assets.length;
}

async function readExistingManifest(manifestPath) {
  await recoverInterruptedAtomicWrite(manifestPath);
  let contents;
  try {
    contents = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { version: MANIFEST_VERSION, assets: [] };
    throw error;
  }

  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("Existing photo library manifest is invalid; refusing to overwrite it");
  }
  if (!isManifestShape(value)) {
    throw new Error("Existing photo library manifest is invalid; refusing to overwrite it");
  }
  return {
    version: MANIFEST_VERSION,
    assets: value.assets.map(selectPublicAssetFields),
  };
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 32) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isCatalogBatch(value) {
  return Boolean(
    value
    && typeof value === "object"
    && Object.keys(value).length === 4
    && IMPORT_BATCH_PATTERN.test(value.id)
    && Number.isSafeInteger(value.ordinal)
    && value.ordinal > 0
    && IMPORT_SOURCE_KINDS.has(value.sourceKind)
    && isIsoTimestamp(value.createdAt),
  );
}

function isCatalogItem(value) {
  return Boolean(
    value
    && typeof value === "object"
    && Object.keys(value).length === 9
    && isCanonicalAssetShape(value.asset)
    && HASH_PATTERN.test(value.assetId)
    && value.asset.id === value.assetId
    && (value.importOrdinal === null || (Number.isSafeInteger(value.importOrdinal) && value.importOrdinal > 0))
    && (value.batchId === null || IMPORT_BATCH_PATTERN.test(value.batchId))
    && (value.batchPosition === null || (
      Number.isSafeInteger(value.batchPosition)
      && value.batchPosition >= 0
      && value.batchPosition < MAX_MANIFEST_ASSETS
    ))
    && ["legacy", "photos", "folder"].includes(value.sourceKind)
    && (value.addedAt === null || isIsoTimestamp(value.addedAt))
    && ["active", "archived"].includes(value.status)
    && (value.archivedAt === null || isIsoTimestamp(value.archivedAt)),
  );
}

function isCanonicalAssetShape(value) {
  if (!isAssetShape(value) || Object.keys(value).length !== 4) return false;
  if (Object.keys(value.variants).length !== Object.keys(VARIANT_OPTIONS).length) return false;
  return Object.values(value.variants).every((variant) => Object.keys(variant).length === 4);
}

// A short-lived development build wrote catalog metadata without the PhotoAsset.
// Accept that exact private shape only long enough to hydrate it from the legacy
// public manifest while holding the import lock. It is never written again.
function isLegacyCatalogItem(value) {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 8) return false;
  return isCatalogItem({ ...value, asset: makeCatalogValidationAsset(value.assetId) });
}

function makeCatalogValidationAsset(assetId) {
  const variant = (name) => ({
    src: variantSource(assetId, name),
    width: 1,
    height: 1,
    bytes: 1,
  });
  return {
    id: assetId,
    aspectRatio: 1,
    orientation: "square",
    variants: Object.fromEntries(Object.keys(VARIANT_OPTIONS).map((name) => [name, variant(name)])),
  };
}

function emptyPhotoLibraryCatalog() {
  return {
    version: PHOTO_LIBRARY_CATALOG_VERSION,
    revision: 0,
    nextImportOrdinal: 1,
    nextBatchOrdinal: 1,
    batches: [],
    items: [],
  };
}

function isPhotoLibraryCatalogWithItems(value, itemValidator) {
  if (!(
    value
    && typeof value === "object"
    && Object.keys(value).length === 6
    && value.version === PHOTO_LIBRARY_CATALOG_VERSION
    && Number.isSafeInteger(value.revision)
    && value.revision >= 0
    && Number.isSafeInteger(value.nextImportOrdinal)
    && value.nextImportOrdinal > 0
    && Number.isSafeInteger(value.nextBatchOrdinal)
    && value.nextBatchOrdinal > 0
    && Array.isArray(value.batches)
    && value.batches.length <= MAX_MANIFEST_ASSETS
    && value.batches.every(isCatalogBatch)
    && Array.isArray(value.items)
    && value.items.length <= MAX_MANIFEST_ASSETS
    && value.items.every(itemValidator)
  )) return false;

  const batchIds = new Set(value.batches.map((batch) => batch.id));
  const batchesById = new Map(value.batches.map((batch) => [batch.id, batch]));
  const batchOrdinals = new Set(value.batches.map((batch) => batch.ordinal));
  const assetIds = new Set(value.items.map((item) => item.assetId));
  const importOrdinals = value.items
    .map((item) => item.importOrdinal)
    .filter((ordinal) => ordinal !== null);
  const batchPositions = value.items
    .filter((item) => item.batchId !== null)
    .map((item) => `${item.batchId}:${item.batchPosition}`);
  if (
    batchIds.size !== value.batches.length
    || batchOrdinals.size !== value.batches.length
    || assetIds.size !== value.items.length
    || new Set(importOrdinals).size !== importOrdinals.length
    || new Set(batchPositions).size !== batchPositions.length
    || value.batches.some((batch) => batch.ordinal >= value.nextBatchOrdinal)
    || importOrdinals.some((ordinal) => ordinal >= value.nextImportOrdinal)
    || value.items.some((item) => (
      item.batchId !== null && !batchIds.has(item.batchId)
      || item.sourceKind === "legacy" && (
        item.batchId !== null
        || item.batchPosition !== null
        || item.importOrdinal !== null
        || item.addedAt !== null
      )
      || item.sourceKind !== "legacy" && (
        item.batchId === null
        || item.batchPosition === null
        || item.importOrdinal === null
        || item.addedAt === null
      )
      || item.batchId !== null && batchesById.get(item.batchId)?.sourceKind !== item.sourceKind
      || item.status === "active" && item.archivedAt !== null
      || item.status === "archived" && item.archivedAt === null
    ))
  ) return false;

  return true;
}


function isPhotoLibraryCatalog(value) {
  return isPhotoLibraryCatalogWithItems(value, isCatalogItem);
}

function isLegacyPhotoLibraryCatalog(value) {
  return isPhotoLibraryCatalogWithItems(value, isLegacyCatalogItem);
}

async function readPhotoLibraryCatalog(catalogPath) {
  await recoverInterruptedAtomicWrite(catalogPath);
  let contents;
  try {
    contents = await fs.readFile(catalogPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { catalog: emptyPhotoLibraryCatalog(), needsMigration: false };
    }
    throw error;
  }

  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("Local photo library catalog is invalid; refusing to overwrite it");
  }
  const canonical = isPhotoLibraryCatalog(value);
  if (!canonical && !isLegacyPhotoLibraryCatalog(value)) {
    throw new Error("Local photo library catalog is invalid; refusing to overwrite it");
  }
  return { catalog: value, needsMigration: !canonical };
}

function legacyCatalogItem(asset) {
  return {
    asset: selectPublicAssetFields(asset),
    assetId: asset.id,
    importOrdinal: null,
    batchId: null,
    batchPosition: null,
    sourceKind: "legacy",
    addedAt: null,
    status: "active",
    archivedAt: null,
  };
}

function createManifestFromCatalog(catalog) {
  return {
    version: MANIFEST_VERSION,
    assets: catalog.items
      .filter((item) => item.status === "active")
      .map((item) => selectPublicAssetFields(item.asset)),
  };
}

function manifestsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function loadCanonicalPhotoLibraryState({ manifestPath, catalogPath }) {
  const manifest = await readExistingManifest(manifestPath);
  const result = await readPhotoLibraryCatalog(catalogPath);
  let { catalog } = result;
  let catalogChanged = result.needsMigration;
  const manifestAssets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const hydratedItems = catalog.items.map((item) => {
    if (isCatalogItem(item)) return item;
    const asset = manifestAssets.get(item.assetId);
    if (!asset) {
      throw new Error("Local photo library catalog cannot recover an asset missing from the public manifest");
    }
    return { asset: selectPublicAssetFields(asset), ...item };
  });
  const catalogAssetIds = new Set(hydratedItems.map((item) => item.assetId));
  for (const asset of manifest.assets) {
    if (catalogAssetIds.has(asset.id)) continue;
    if (hydratedItems.length >= MAX_MANIFEST_ASSETS) {
      throw new Error("Local photo library catalog exceeds its asset limit");
    }
    hydratedItems.push(legacyCatalogItem(asset));
    catalogAssetIds.add(asset.id);
    catalogChanged = true;
  }

  if (catalogChanged) {
    catalog = {
      ...catalog,
      revision: catalog.revision + 1,
      items: hydratedItems,
    };
    if (!isPhotoLibraryCatalog(catalog)) {
      throw new Error("Local photo library catalog migration is invalid; refusing to overwrite it");
    }
    // The private catalog is canonical. Committing it first ensures a later
    // read can always reconstruct a missing or stale public manifest.
    await writeJsonAtomically(catalogPath, catalog);
  }

  const derivedManifest = createManifestFromCatalog(catalog);
  if (!manifestsMatch(manifest, derivedManifest)) {
    await writeJsonAtomically(manifestPath, derivedManifest);
  }
  return { catalog, manifest: derivedManifest };
}

function createCatalogSnapshot(catalog) {
  const items = catalog.items.map((item) => ({
    ...item,
    asset: selectPublicAssetFields(item.asset),
  }));
  const relevantBatchIds = new Set(items.map((item) => item.batchId).filter(Boolean));
  return {
    version: PHOTO_LIBRARY_CATALOG_VERSION,
    revision: catalog.revision,
    activeAssets: items.filter((item) => item.status === "active").length,
    archivedAssets: items.filter((item) => item.status === "archived").length,
    batches: catalog.batches.filter((batch) => relevantBatchIds.has(batch.id)),
    items,
  };
}

function validateImportCatalogMetadata({ batchId, batchPosition, batchSize, sourceKind }) {
  const resolvedBatchId = batchId ?? randomBytes(16).toString("hex");
  if (!IMPORT_BATCH_PATTERN.test(resolvedBatchId)) throw new TypeError("batchId is invalid");
  if (!IMPORT_SOURCE_KINDS.has(sourceKind)) throw new TypeError("sourceKind is invalid");
  if (!Number.isSafeInteger(batchPosition) || batchPosition < 0 || batchPosition >= MAX_MANIFEST_ASSETS) {
    throw new TypeError("batchPosition is invalid");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_MANIFEST_ASSETS) {
    throw new TypeError("batchSize is invalid");
  }
  if (batchPosition >= batchSize) throw new TypeError("batchPosition must be smaller than batchSize");
  return { batchId: resolvedBatchId, batchPosition, batchSize, sourceKind };
}

function applyImportToCatalog(catalog, currentAssets, assetOutcomes, importMetadata, addedAt) {
  const assetsById = new Map(currentAssets.map((asset) => [asset.id, selectPublicAssetFields(asset)]));
  const addedOutcomes = assetOutcomes.filter((outcome) => outcome.disposition === "added");
  const restoredIds = new Set(
    assetOutcomes.filter((outcome) => outcome.disposition === "restored").map((outcome) => outcome.assetId),
  );
  const existingItems = new Map(catalog.items.map((item) => [item.assetId, item]));
  const existingBatch = catalog.batches.find((batch) => batch.id === importMetadata.batchId);
  if (addedOutcomes.length > 0 && existingBatch && existingBatch.sourceKind !== importMetadata.sourceKind) {
    throw new Error("Local photo import batch metadata changed during import");
  }

  const batches = addedOutcomes.length === 0 || existingBatch
    ? catalog.batches
    : [...catalog.batches, {
        id: importMetadata.batchId,
        ordinal: catalog.nextBatchOrdinal,
        sourceKind: importMetadata.sourceKind,
        createdAt: addedAt,
      }];
  let changed = false;
  let nextImportOrdinal = catalog.nextImportOrdinal;
  let items = catalog.items.map((item) => {
    if (!restoredIds.has(item.assetId)) return item;
    const asset = assetsById.get(item.assetId);
    if (!asset) throw new Error("Imported photo catalog update is missing asset metadata");
    const nextItem = { ...item, asset, status: "active", archivedAt: null };
    if (JSON.stringify(nextItem) !== JSON.stringify(item)) changed = true;
    return nextItem;
  });
  const occupiedPositions = new Map(
    items.flatMap((item) => item.batchId === importMetadata.batchId && item.batchPosition !== null
      ? [[item.batchPosition, item.assetId]]
      : []),
  );
  for (let offset = 0; offset < addedOutcomes.length; offset += 1) {
    const { assetId } = addedOutcomes[offset];
    if (existingItems.has(assetId)) throw new Error("Imported photo already exists in the local catalog");
    const batchPosition = importMetadata.batchPosition + offset;
    if (batchPosition >= importMetadata.batchSize) {
      throw new Error("Local photo import batch position exceeds its declared size");
    }
    const occupiedAssetId = occupiedPositions.get(batchPosition);
    if (occupiedAssetId && occupiedAssetId !== assetId) {
      throw new Error("Local photo import batch position is already occupied");
    }
    const asset = assetsById.get(assetId);
    if (!asset) throw new Error("Imported photo catalog update is missing asset metadata");
    items.push({
      asset,
      assetId,
      importOrdinal: nextImportOrdinal,
      batchId: importMetadata.batchId,
      batchPosition,
      sourceKind: importMetadata.sourceKind,
      addedAt,
      status: "active",
      archivedAt: null,
    });
    occupiedPositions.set(batchPosition, assetId);
    nextImportOrdinal += 1;
    changed = true;
  }
  if (!changed) return catalog;
  const nextCatalog = {
    ...catalog,
    revision: catalog.revision + 1,
    nextImportOrdinal,
    nextBatchOrdinal: addedOutcomes.length > 0 && !existingBatch
      ? catalog.nextBatchOrdinal + 1
      : catalog.nextBatchOrdinal,
    batches,
    items,
  };
  if (!isPhotoLibraryCatalog(nextCatalog)) {
    throw new Error("Imported photo catalog update is invalid; refusing to publish it");
  }
  return nextCatalog;
}

function selectStoredSourceState(previousState) {
  if (
    !previousState
    || typeof previousState !== "object"
    || typeof previousState.sourceKey !== "string"
    || !HASH_PATTERN.test(previousState.sourceKey)
    || !Array.isArray(previousState.files)
    || !previousState.files.every((file) => (
      file
      && typeof file === "object"
      && typeof file.relativePath === "string"
      && file.relativePath.length > 0
      && !path.isAbsolute(file.relativePath)
      && typeof file.size === "number"
      && Number.isFinite(file.size)
      && file.size >= 0
      && typeof file.mtimeMs === "number"
      && Number.isFinite(file.mtimeMs)
      && typeof file.hash === "string"
      && HASH_PATTERN.test(file.hash)
    ))
  ) return {};

  return {
    sourceKey: previousState.sourceKey,
    files: previousState.files.map((file) => ({
      relativePath: file.relativePath,
      size: file.size,
      mtimeMs: file.mtimeMs,
      hash: file.hash,
    })),
  };
}

async function canReuseAsset(asset, libraryDir) {
  if (!isAssetShape(asset)) return false;

  for (const name of Object.keys(VARIANT_OPTIONS)) {
    const variant = asset.variants[name];
    const filePath = path.join(libraryDir, variantFileName(asset.id, name));
    try {
      const [stat, contents] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)]);
      const metadata = await sharp(contents).metadata();
      if (
        !stat.isFile()
        || stat.size !== variant.bytes
        || metadata.format !== "webp"
        || metadata.width !== variant.width
        || metadata.height !== variant.height
      ) return false;
    } catch {
      return false;
    }
  }

  return true;
}

async function generateAsset(sourcePath, id, libraryDir) {
  const base = sharp(sourcePath, { failOn: "error", animated: false })
    .rotate()
    .toColourspace("srgb");
  const temporaryFiles = [];

  try {
    const generated = await Promise.all(Object.entries(VARIANT_OPTIONS).map(async ([name, options]) => {
      const targetPath = path.join(libraryDir, variantFileName(id, name));
      const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${name}`;
      temporaryFiles.push(temporaryPath);

      const info = await base
        .clone()
        .resize({
          width: options.maximum,
          height: options.maximum,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: options.quality, effort: 4, smartSubsample: true })
        .toFile(temporaryPath);

      if (info.format !== "webp" || !info.width || !info.height || !info.size) {
        throw new Error(`Sharp did not return valid ${name} output metadata`);
      }

      return {
        name,
        targetPath,
        temporaryPath,
        value: {
          src: variantSource(id, name),
          width: info.width,
          height: info.height,
          bytes: info.size,
        },
      };
    }));

    for (const output of generated) {
      await removeFileWithRetry(output.targetPath);
      await fs.rename(output.temporaryPath, output.targetPath);
      temporaryFiles.splice(temporaryFiles.indexOf(output.temporaryPath), 1);
    }

    const variants = Object.fromEntries(generated.map((output) => [output.name, output.value]));
    const canonical = variants.full;
    return {
      id,
      aspectRatio: roundAspectRatio(canonical.width, canonical.height),
      orientation: orientationFor(canonical.width, canonical.height),
      variants,
    };
  } finally {
    await Promise.all(temporaryFiles.map((filePath) => removeFileWithRetry(filePath)));
  }
}

/**
 * Imports a local photography folder into the repository's ignored photo area.
 * The public manifest intentionally contains no source names or filesystem paths.
 */
export async function importPhotoLibrary({
  sourceDir,
  projectRoot = process.cwd(),
  adoptLinkedOutput = false,
  recordSourceState = true,
  batchId,
  batchPosition = 0,
  batchSize = MAX_MANIFEST_ASSETS,
  sourceKind = recordSourceState ? "folder" : "photos",
}) {
  assertSupportedNodeRuntime();
  // The local HTTP importer reads from short-lived request directories. libvips
  // otherwise keeps recently opened source files in its file cache, which can
  // prevent Windows from removing an already-processed upload. Keep the memory
  // and operation caches, but never retain source file descriptors.
  sharp.cache({ files: 0 });
  if (typeof sourceDir !== "string" || sourceDir.trim() === "") {
    throw new TypeError("sourceDir is required");
  }
  if (typeof recordSourceState !== "boolean") {
    throw new TypeError("recordSourceState must be a boolean");
  }
  const importMetadata = validateImportCatalogMetadata({
    batchId,
    batchPosition,
    batchSize,
    sourceKind,
  });

  const resolvedProjectRoot = await fs.realpath(path.resolve(projectRoot));
  const resolvedSourceDir = await fs.realpath(path.resolve(sourceDir));
  const sourceStat = await fs.stat(resolvedSourceDir);
  if (!sourceStat.isDirectory()) throw new Error("Photo source must be a directory");

  const generatedPhotosRoot = path.join(resolvedProjectRoot, "public", "photos");
  const generatedLibraryDir = path.join(generatedPhotosRoot, "library");
  const stateDir = await ensureGeneratedDirectory(resolvedProjectRoot, path.join(resolvedProjectRoot, ".frame-zero"));
  if (isPathInside(generatedLibraryDir, resolvedSourceDir)) {
    throw new Error("Photo source cannot be the generated library directory");
  }

  return withImportLock(stateDir, async () => {
    const statePath = path.join(stateDir, "photo-import-state.json");
    const catalogPath = path.join(stateDir, PHOTO_LIBRARY_CATALOG_FILE);
    const previousState = await readJson(statePath);
    const linkedManifest = await readJson(path.join(generatedPhotosRoot, "library-manifest.json"));
    const linkedOwner = await readJson(path.join(generatedLibraryDir, ".frame-zero-owner.json"));
    let existingOutputKey = null;
    try {
      const existingLibraryDir = await fs.realpath(generatedLibraryDir);
      existingOutputKey = createHash("sha256").update(existingLibraryDir).digest("hex");
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    const ownsExistingLinkedOutput = previousState?.pipelineVersion === PIPELINE_VERSION
      && typeof previousState.outputKey === "string"
      && previousState.outputKey === existingOutputKey
      && typeof previousState.ownershipToken === "string"
      && HASH_PATTERN.test(previousState.ownershipToken)
      && linkedOwner?.ownershipToken === previousState.ownershipToken
      && isManifestShape(linkedManifest);

    const libraryDir = await ensureGeneratedDirectory(resolvedProjectRoot, generatedLibraryDir, {
      allowLinkedOutput: ownsExistingLinkedOutput || adoptLinkedOutput,
    });
    if (isPathInside(libraryDir, resolvedSourceDir)) {
      throw new Error("Photo source cannot be the generated library directory");
    }
    const outputKey = createHash("sha256").update(libraryDir).digest("hex");
    if (previousState?.outputKey && previousState.outputKey !== outputKey && !adoptLinkedOutput) {
      throw new Error("Generated photo output link changed since the previous import");
    }
    const ownershipToken = ownsExistingLinkedOutput
      ? previousState.ownershipToken
      : randomBytes(32).toString("hex");
    const photosRoot = path.dirname(libraryDir);
    const manifestPath = path.join(photosRoot, "library-manifest.json");
    const { catalog: previousCatalog, manifest: previousManifest } = await loadCanonicalPhotoLibraryState({
      manifestPath,
      catalogPath,
    });
    const previousAssets = new Map(
      previousCatalog.items.map((item) => [item.assetId, item.asset]),
    );
    const previousCatalogItems = new Map(
      previousCatalog.items.map((item) => [item.assetId, item]),
    );
    const canReusePrevious = previousState?.pipelineVersion === PIPELINE_VERSION;

    const scan = await scanPhotoFiles(resolvedSourceDir, [libraryDir, stateDir]);
    if (scan.files.length === 0) {
      throw new Error("No supported image files were found in the source directory");
    }

    const uniqueSources = new Map();
    const stateFiles = [];
    const skipped = [];

    for (const sourcePath of scan.files) {
      const relativePath = normalizeRelativePath(path.relative(resolvedSourceDir, sourcePath));
      try {
        const [hash, stat] = await Promise.all([hashFile(sourcePath), fs.stat(sourcePath)]);
        stateFiles.push({ relativePath, size: stat.size, mtimeMs: stat.mtimeMs, hash });
        if (!uniqueSources.has(hash)) uniqueSources.set(hash, sourcePath);
      } catch (error) {
        skipped.push({ file: relativePath, reason: sanitizeError(error, resolvedSourceDir) });
      }
    }

    const duplicateFiles = stateFiles.length - uniqueSources.size;
    const currentAssets = [];
    let generatedAssets = 0;
    let reusedAssets = 0;
    let addedAssets = 0;
    let existingAssets = 0;
    let capacityRejectedAssets = 0;
    const assetOutcomes = [];

    for (const [id, sourcePath] of uniqueSources) {
      const alreadyExists = previousAssets.has(id);
      if (!alreadyExists && previousAssets.size + addedAssets >= MAX_MANIFEST_ASSETS) {
        capacityRejectedAssets += 1;
        skipped.push({
          file: normalizeRelativePath(path.relative(resolvedSourceDir, sourcePath)),
          reason: `Photo library is limited to ${MAX_MANIFEST_ASSETS} assets`,
        });
        continue;
      }

      try {
        const previous = canReusePrevious ? previousAssets.get(id) : null;
        let regenerated = false;
        if (previous && await canReuseAsset(previous, libraryDir)) {
          currentAssets.push(previous);
          reusedAssets += 1;
        } else {
          currentAssets.push(await generateAsset(sourcePath, id, libraryDir));
          generatedAssets += 1;
          regenerated = alreadyExists;
        }
        if (alreadyExists) existingAssets += 1;
        else addedAssets += 1;
        const wasArchived = previousCatalogItems.get(id)?.status === "archived";
        assetOutcomes.push({
          assetId: id,
          disposition: !alreadyExists
            ? "added"
            : regenerated || wasArchived
              ? "restored"
              : "duplicate",
        });
      } catch (error) {
        skipped.push({
          file: normalizeRelativePath(path.relative(resolvedSourceDir, sourcePath)),
          reason: sanitizeError(error, resolvedSourceDir),
        });
      }
    }

    if (currentAssets.length === 0) {
      const message = capacityRejectedAssets > 0
        ? `Photo library is limited to ${MAX_MANIFEST_ASSETS} assets`
        : "No readable photographs could be imported";
      const error = new Error(message);
      error.skipped = skipped;
      throw error;
    }

    // Commit the canonical private catalog before deriving the browser-safe,
    // active-only manifest. Variant files are intentionally retained when an
    // item is archived so existing SiteContent references remain renderable.
    const addedAt = new Date().toISOString();
    const catalog = applyImportToCatalog(
      previousCatalog,
      currentAssets,
      assetOutcomes,
      importMetadata,
      addedAt,
    );
    if (catalog.revision !== previousCatalog.revision) {
      await writeJsonAtomically(catalogPath, catalog);
    }

    const manifest = createManifestFromCatalog(catalog);
    if (!manifestsMatch(previousManifest, manifest)) {
      await writeJsonAtomically(manifestPath, manifest);
    }
    await writeJsonAtomically(path.join(libraryDir, ".frame-zero-owner.json"), {
      version: MANIFEST_VERSION,
      ownershipToken,
    });

    const sourceState = recordSourceState
      ? {
          sourceKey: createHash("sha256").update(resolvedSourceDir).digest("hex"),
          files: stateFiles,
        }
      : selectStoredSourceState(previousState);
    const state = {
      version: MANIFEST_VERSION,
      pipelineVersion: PIPELINE_VERSION,
      outputKey,
      ownershipToken,
      ...sourceState,
    };
    await writeJsonAtomically(statePath, state);

    const catalogSnapshot = createCatalogSnapshot(catalog);

    return {
      manifest,
      manifestPath,
      statePath,
      libraryDir,
      scannedFiles: scan.scannedFiles,
      candidateFiles: scan.files.length,
      uniqueFiles: uniqueSources.size,
      duplicateFiles,
      generatedAssets,
      reusedAssets,
      addedAssets,
      existingAssets,
      assetOutcomes,
      sourceAssets: currentAssets.length,
      importedAssets: catalog.items.length,
      activeAssets: catalogSnapshot.activeAssets,
      catalogRevision: catalogSnapshot.revision,
      catalogPath,
      skippedSymlinks: scan.skippedSymlinks,
      skipped,
    };
  });
}

function libraryCatalogError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function resolveLocalPhotoLibraryPaths(projectRoot) {
  assertSupportedNodeRuntime();
  const resolvedProjectRoot = await fs.realpath(path.resolve(projectRoot));
  const stateDir = await ensureGeneratedDirectory(
    resolvedProjectRoot,
    path.join(resolvedProjectRoot, ".frame-zero"),
  );
  return {
    stateDir,
    catalogPath: path.join(stateDir, PHOTO_LIBRARY_CATALOG_FILE),
    manifestPath: path.join(resolvedProjectRoot, "public", "photos", "library-manifest.json"),
    libraryDir: path.join(resolvedProjectRoot, "public", "photos", "library"),
  };
}

/**
 * Returns the private local management view joined to the browser-safe manifest.
 * The response deliberately excludes source names and filesystem paths.
 */
export async function getLocalPhotoLibrarySnapshot({ projectRoot = process.cwd() } = {}) {
  const paths = await resolveLocalPhotoLibraryPaths(projectRoot);
  return withImportLock(paths.stateDir, async () => {
    const { catalog } = await loadCanonicalPhotoLibraryState(paths);
    return createCatalogSnapshot(catalog);
  });
}

/**
 * Moves assets into or out of the private recycle bin. Variant files and the
 * saved layout URLs remain intact; the public discovery manifest is active-only.
 */
export async function setLocalPhotoAssetsArchived({
  projectRoot = process.cwd(),
  assetIds,
  archived,
  expectedRevision,
} = {}) {
  if (
    !Array.isArray(assetIds)
    || assetIds.length < 1
    || assetIds.length > 100
    || assetIds.some((assetId) => typeof assetId !== "string" || !HASH_PATTERN.test(assetId))
    || new Set(assetIds).size !== assetIds.length
  ) throw new TypeError("assetIds must contain 1 to 100 unique asset IDs");
  if (typeof archived !== "boolean") throw new TypeError("archived must be a boolean");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new TypeError("expectedRevision must be a non-negative safe integer");
  }

  const paths = await resolveLocalPhotoLibraryPaths(projectRoot);
  return withImportLock(paths.stateDir, async () => {
    const { catalog, manifest } = await loadCanonicalPhotoLibraryState(paths);
    if (catalog.revision !== expectedRevision) {
      throw libraryCatalogError(
        "CATALOG_REVISION_CONFLICT",
        "The local photo library changed; refresh it before trying again",
      );
    }

    const catalogItems = new Map(catalog.items.map((item) => [item.assetId, item]));
    for (const assetId of assetIds) {
      if (!catalogItems.has(assetId)) {
        throw libraryCatalogError("ASSET_NOT_FOUND", "The local photo asset does not exist");
      }
    }
    if (!archived) {
      for (const assetId of assetIds) {
        if (!await canReuseAsset(catalogItems.get(assetId).asset, paths.libraryDir)) {
          throw libraryCatalogError(
            "ASSET_VARIANTS_MISSING",
            "The local photo variants are unavailable; re-import the photo before restoring it",
          );
        }
      }
    }

    const requestedIds = new Set(assetIds);
    const timestamp = new Date().toISOString();
    let changed = false;
    const items = catalog.items.map((current) => {
      if (!requestedIds.has(current.assetId)) return current;
      const desiredStatus = archived ? "archived" : "active";
      if (current.status === desiredStatus) return current;
      changed = true;
      return {
        ...current,
        status: desiredStatus,
        archivedAt: archived ? timestamp : null,
      };
    });

    const nextCatalog = changed
      ? {
          ...catalog,
          revision: catalog.revision + 1,
          items,
        }
      : catalog;
    if (changed) {
      if (!isPhotoLibraryCatalog(nextCatalog)) {
        throw new Error("Local photo library status update is invalid; refusing to publish it");
      }
      await writeJsonAtomically(paths.catalogPath, nextCatalog);
      const nextManifest = createManifestFromCatalog(nextCatalog);
      if (!manifestsMatch(manifest, nextManifest)) {
        await writeJsonAtomically(paths.manifestPath, nextManifest);
      }
    }
    return createCatalogSnapshot(nextCatalog);
  });
}

export const photoImportContract = Object.freeze({
  catalogVersion: PHOTO_LIBRARY_CATALOG_VERSION,
  maxManifestAssets: MAX_MANIFEST_ASSETS,
  manifestVersion: MANIFEST_VERSION,
  pipelineVersion: PIPELINE_VERSION,
  supportedExtensions: SUPPORTED_EXTENSION_LIST,
  variants: Object.freeze(Object.fromEntries(Object.entries(VARIANT_OPTIONS)
    .map(([name, value]) => [name, Object.freeze({ ...value })]))),
});
