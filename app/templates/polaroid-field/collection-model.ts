import type { PhotoAsset } from "../../photo-library";

export type CollectionStyle = "album" | "portrait";
export type Collection = {
  id: string;
  name: string;
  description: string;
  coverAssetId: string | null;
  coverFit: "natural" | "fill";
  coverFocusX: number;
  coverFocusY: number;
  assetIds: string[];
  style: CollectionStyle;
  visible: boolean;
};

export const initialCollections: Collection[] = [
  { id: "preview-positive", name: "正片创作", description: "", coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, assetIds: [], style: "album", visible: true },
  { id: "preview-convention", name: "漫展场照", description: "", coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, assetIds: [], style: "album", visible: true },
  { id: "preview-diary", name: "美少女日记", description: "", coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, assetIds: [], style: "portrait", visible: true },
];

export function uniqueAvailableAssetIds(collection: Collection, available: ReadonlySet<string>) {
  return collection.assetIds.filter((id, index) => available.has(id) && collection.assetIds.indexOf(id) === index);
}

export function collectionCover(collection: Collection, assets: ReadonlyMap<string, PhotoAsset>) {
  return (collection.coverAssetId && assets.get(collection.coverAssetId))
    || uniqueAvailableAssetIds(collection, new Set(assets.keys())).map((id) => assets.get(id))[0]
    || null;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function albumRows(assets: readonly PhotoAsset[], targetRatio = 3.2, maxPerRow = 4) {
  const rows: PhotoAsset[][] = [];
  let row: PhotoAsset[] = [];
  let ratio = 0;
  for (const asset of assets) {
    row.push(asset);
    ratio += asset.aspectRatio;
    if (ratio >= targetRatio || row.length >= maxPerRow) {
      rows.push(row);
      row = [];
      ratio = 0;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}
