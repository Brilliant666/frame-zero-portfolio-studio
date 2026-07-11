import type { Work } from "./site-config";

export const PHOTO_LIBRARY_MANIFEST_VERSION = 1 as const;

export type PhotoOrientation = "landscape" | "portrait" | "square";
export type PhotoSlotRatio = "3:2" | "2:3" | "16:9";

export type PhotoVariant = {
  src: string;
  width: number;
  height: number;
  bytes: number;
};

export type PhotoAsset = {
  id: string;
  aspectRatio: number;
  orientation: PhotoOrientation;
  variants: {
    thumbnail: PhotoVariant;
    card: PhotoVariant;
    full: PhotoVariant;
  };
};

export type PhotoLibraryManifest = {
  version: typeof PHOTO_LIBRARY_MANIFEST_VERSION;
  assets: PhotoAsset[];
};

export type FocusPosition = { x: number; y: number };

const DEFAULT_FOCUS: FocusPosition = { x: 50, y: 50 };
const MAX_ASSETS = 10_000;
const MAX_DIMENSION = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum;
}

function isLibrarySource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  if (!value.startsWith("/photos/library/") || !value.endsWith(".webp")) return false;
  if (value.includes("\\") || /[?#\u0000-\u001f]/.test(value)) return false;

  try {
    const decoded = decodeURIComponent(value);
    return !decoded.split("/").some((segment) => segment === "." || segment === "..");
  } catch {
    return false;
  }
}

function parseVariant(value: unknown): PhotoVariant | null {
  if (!isRecord(value) || !isLibrarySource(value.src)) return null;
  if (!isSafeInteger(value.width, 1, MAX_DIMENSION)) return null;
  if (!isSafeInteger(value.height, 1, MAX_DIMENSION)) return null;
  if (!isSafeInteger(value.bytes, 1, Number.MAX_SAFE_INTEGER)) return null;

  return {
    src: value.src,
    width: value.width,
    height: value.height,
    bytes: value.bytes,
  };
}

function orientationForRatio(aspectRatio: number): PhotoOrientation {
  if (aspectRatio > 1) return "landscape";
  if (aspectRatio < 1) return "portrait";
  return "square";
}

function aspectRatioMatches(actual: number, expected: number) {
  return Math.abs(Math.log(actual / expected)) <= 0.03;
}

function parseAsset(value: unknown): PhotoAsset | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id)) return null;
  if (typeof value.aspectRatio !== "number" || !Number.isFinite(value.aspectRatio)) return null;
  if (value.aspectRatio < 0.05 || value.aspectRatio > 20) return null;
  if (value.orientation !== "landscape" && value.orientation !== "portrait" && value.orientation !== "square") return null;
  if (!isRecord(value.variants)) return null;

  const thumbnail = parseVariant(value.variants.thumbnail);
  const card = parseVariant(value.variants.card);
  const full = parseVariant(value.variants.full);
  if (!thumbnail || !card || !full) return null;

  const aspectRatio = value.aspectRatio;
  const orientation = value.orientation;
  const variants = [thumbnail, card, full];
  if (variants.some((variant) => !aspectRatioMatches(variant.width / variant.height, aspectRatio))) return null;
  if (orientationForRatio(aspectRatio) !== orientation) return null;
  if (thumbnail.width > card.width || thumbnail.height > card.height) return null;
  if (card.width > full.width || card.height > full.height) return null;

  return {
    id: value.id,
    aspectRatio,
    orientation,
    variants: { thumbnail, card, full },
  };
}

/** Strictly validates an untrusted manifest and returns only known fields. */
export function parsePhotoLibraryManifest(value: unknown): PhotoLibraryManifest | null {
  if (!isRecord(value) || value.version !== PHOTO_LIBRARY_MANIFEST_VERSION || !Array.isArray(value.assets)) return null;
  if (value.assets.length > MAX_ASSETS) return null;

  const assets: PhotoAsset[] = [];
  const ids = new Set<string>();

  for (const rawAsset of value.assets) {
    const asset = parseAsset(rawAsset);
    if (!asset || ids.has(asset.id)) return null;
    ids.add(asset.id);
    assets.push(asset);
  }

  return { version: PHOTO_LIBRARY_MANIFEST_VERSION, assets };
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

function cleanPercentage(value: number) {
  return Number(value.toFixed(2)).toString();
}

export function parseFocusPosition(position: unknown): FocusPosition {
  if (typeof position !== "string") return { ...DEFAULT_FOCUS };
  const match = position.trim().match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/);
  if (!match) return { ...DEFAULT_FOCUS };

  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...DEFAULT_FOCUS };
  return { x: clampPercentage(x), y: clampPercentage(y) };
}

export function formatFocusPosition(x: number, y: number) {
  return `${cleanPercentage(clampPercentage(x))}% ${cleanPercentage(clampPercentage(y))}%`;
}

export function assetToWork(asset: PhotoAsset, slotIndex: number): Work {
  const safeSlotIndex = Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : 0;
  const codeSuffix = asset.id.slice(0, 8).toUpperCase();

  return {
    assetId: asset.id,
    slotIndex: safeSlotIndex,
    locked: false,
    code: `P-${codeSuffix}`,
    title: `FRAME ${String(safeSlotIndex + 1).padStart(2, "0")}`,
    subtitle: `LOCAL LIBRARY / ${asset.orientation.toUpperCase()}`,
    image: asset.variants.full.src,
    preview: asset.variants.card.src,
    position: formatFocusPosition(DEFAULT_FOCUS.x, DEFAULT_FOCUS.y),
    previewWidth: asset.variants.card.width,
    previewHeight: asset.variants.card.height,
    fullWidth: asset.variants.full.width,
    enabled: true,
  };
}

function ratioValue(ratio: PhotoSlotRatio) {
  if (ratio === "3:2") return 3 / 2;
  if (ratio === "2:3") return 2 / 3;
  return 16 / 9;
}

function orientationForSlot(ratio: PhotoSlotRatio): Exclude<PhotoOrientation, "square"> {
  return ratioValue(ratio) < 1 ? "portrait" : "landscape";
}

export function isPhotoAssetCompatibleWithSlot(asset: PhotoAsset, ratio: PhotoSlotRatio) {
  return asset.orientation === "square" || asset.orientation === orientationForSlot(ratio);
}

export function isWorkCompatibleWithSlot(work: Work, ratio: PhotoSlotRatio) {
  if (!Number.isFinite(work.previewWidth) || !Number.isFinite(work.previewHeight)) return false;
  if (work.previewWidth <= 0 || work.previewHeight <= 0) return false;
  if (work.previewWidth === work.previewHeight) return true;
  return (work.previewWidth > work.previewHeight) === (ratioValue(ratio) > 1);
}

function minimumCostAssignment(
  rowCount: number,
  columnCount: number,
  cost: (rowIndex: number, columnIndex: number) => number,
) {
  if (rowCount === 0 || columnCount === 0) return [] as Array<[number, number]>;
  if (rowCount > columnCount) throw new Error("Assignment rows must not exceed columns");

  // Rectangular Hungarian algorithm, O(rows² × columns). Templates have at
  // most 12 rows, so this remains fast even for a very large material library.
  const rowPotential = new Array(rowCount + 1).fill(0);
  const columnPotential = new Array(columnCount + 1).fill(0);
  const matchedRow = new Array(columnCount + 1).fill(0);
  const previousColumn = new Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minimum = new Array(columnCount + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array(columnCount + 1).fill(false);

    do {
      used[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;

      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue;
        const reducedCost = cost(currentRow - 1, column - 1)
          - rowPotential[currentRow]
          - columnPotential[column];
        if (reducedCost < minimum[column]) {
          minimum[column] = reducedCost;
          previousColumn[column] = currentColumn;
        }
        if (minimum[column] < delta) {
          delta = minimum[column];
          nextColumn = column;
        }
      }

      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          rowPotential[matchedRow[column]] += delta;
          columnPotential[column] -= delta;
        } else {
          minimum[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const previous = previousColumn[currentColumn];
      matchedRow[currentColumn] = matchedRow[previous];
      currentColumn = previous;
    } while (currentColumn !== 0);
  }

  const pairs: Array<[number, number]> = [];
  for (let column = 1; column <= columnCount; column += 1) {
    if (matchedRow[column] > 0) pairs.push([matchedRow[column] - 1, column - 1]);
  }
  return pairs;
}

/**
 * Keeps valid locked slots, then globally pairs the closest same-orientation
 * assets with the remaining ratios. A missing orientation deliberately leaves
 * a slot empty so the template can render its editorial placeholder.
 */
export function autoComposeTemplateWorks(
  assets: readonly PhotoAsset[],
  slotRatios: readonly PhotoSlotRatio[],
  existingWorks: readonly Work[] = [],
): Work[] {
  const slots = new Map<number, Work>();
  const usedAssetIds = new Set<string>();
  const availableAssetIds = new Set(assets.map((asset) => asset.id));
  const existingByAssetId = new Map(
    existingWorks.flatMap((work) => work.assetId ? [[work.assetId, work] as const] : []),
  );

  existingWorks.forEach((work, fallbackIndex) => {
    if (work.locked !== true) return;
    const slotIndex = Number.isInteger(work.slotIndex) ? work.slotIndex as number : fallbackIndex;
    if (slotIndex < 0 || slotIndex >= slotRatios.length || slots.has(slotIndex)) return;
    if (work.assetId && !availableAssetIds.has(work.assetId)) return;
    if (!isWorkCompatibleWithSlot(work, slotRatios[slotIndex])) return;
    if (work.assetId && usedAssetIds.has(work.assetId)) return;

    slots.set(slotIndex, { ...work, slotIndex, locked: true });
    if (work.assetId) usedAssetIds.add(work.assetId);
  });

  const availableAssets: PhotoAsset[] = [];
  const seenAssetIds = new Set(usedAssetIds);
  for (const asset of assets) {
    if (seenAssetIds.has(asset.id)) continue;
    seenAssetIds.add(asset.id);
    availableAssets.push(asset);
  }

  const openSlotIndexes = slotRatios.flatMap((_, slotIndex) => slots.has(slotIndex) ? [] : [slotIndex]);
  const dummyColumnOffset = availableAssets.length;
  const incompatibleCost = 1_000_000;
  const placeholderCost = 100;
  const assignments = minimumCostAssignment(
    openSlotIndexes.length,
    availableAssets.length + openSlotIndexes.length,
    (slotRow, column) => {
      if (column >= dummyColumnOffset) return placeholderCost;
      const slotIndex = openSlotIndexes[slotRow];
      const asset = availableAssets[column];
      if (!isPhotoAssetCompatibleWithSlot(asset, slotRatios[slotIndex])) return incompatibleCost;
      return Math.abs(Math.log(asset.aspectRatio / ratioValue(slotRatios[slotIndex])));
    },
  );

  for (const [slotRow, assetColumn] of assignments) {
    if (assetColumn >= dummyColumnOffset) continue;
    const slotIndex = openSlotIndexes[slotRow];
    const asset = availableAssets[assetColumn];
    if (!isPhotoAssetCompatibleWithSlot(asset, slotRatios[slotIndex])) continue;
    const existing = existingByAssetId.get(asset.id);
    slots.set(slotIndex, existing
      ? { ...existing, slotIndex, locked: false }
      : assetToWork(asset, slotIndex));
    usedAssetIds.add(asset.id);
  }

  return [...slots.values()].sort((left, right) => (left.slotIndex ?? 0) - (right.slotIndex ?? 0));
}
