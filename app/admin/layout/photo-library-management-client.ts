import { parsePhotoLibraryManifest, type PhotoAsset } from "../../photo-library";

export type LocalPhotoSourceKind = "legacy" | "photos" | "folder";
export type LocalPhotoLibraryStatus = "active" | "archived";

export type LocalPhotoLibraryBatch = Readonly<{
  id: string;
  ordinal: number;
  sourceKind: "photos" | "folder";
  createdAt: string;
}>;

export type LocalPhotoLibraryItem = Readonly<{
  asset: PhotoAsset;
  assetId: string;
  importOrdinal: number | null;
  batchId: string | null;
  batchPosition: number | null;
  sourceKind: LocalPhotoSourceKind;
  addedAt: string | null;
  status: LocalPhotoLibraryStatus;
  archivedAt: string | null;
}>;

export type LocalPhotoLibrarySnapshot = Readonly<{
  version: 1;
  revision: number;
  activeAssets: number;
  archivedAssets: number;
  batches: readonly LocalPhotoLibraryBatch[];
  items: readonly LocalPhotoLibraryItem[];
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class LocalPhotoLibraryManagementError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "LocalPhotoLibraryManagementError";
  }
}

const hash = /^[a-f0-9]{64}$/;
const batchHash = /^[a-f0-9]{32}$/;
const sourceKinds = new Set(["legacy", "photos", "folder"]);
const itemStatuses = new Set(["active", "archived"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function timestamp(value: unknown) {
  return typeof value === "string" && value.length <= 32 && Number.isFinite(Date.parse(value));
}

function batch(value: unknown): value is LocalPhotoLibraryBatch {
  const item = record(value);
  return Boolean(
    item
    && typeof item.id === "string"
    && batchHash.test(item.id)
    && Number.isSafeInteger(item.ordinal)
    && Number(item.ordinal) > 0
    && (item.sourceKind === "photos" || item.sourceKind === "folder")
    && timestamp(item.createdAt),
  );
}

function libraryItem(value: unknown): value is LocalPhotoLibraryItem {
  const item = record(value);
  if (!item || typeof item.assetId !== "string" || !hash.test(item.assetId)) return false;
  const manifest = parsePhotoLibraryManifest({ version: 1, assets: [item.asset] });
  return Boolean(
    manifest
    && manifest.assets[0].id === item.assetId
    && (item.importOrdinal === null || (Number.isSafeInteger(item.importOrdinal) && Number(item.importOrdinal) > 0))
    && (item.batchId === null || (typeof item.batchId === "string" && batchHash.test(item.batchId)))
    && (item.batchPosition === null || (Number.isSafeInteger(item.batchPosition) && Number(item.batchPosition) >= 0))
    && sourceKinds.has(String(item.sourceKind))
    && (item.addedAt === null || timestamp(item.addedAt))
    && itemStatuses.has(String(item.status))
    && (item.archivedAt === null || timestamp(item.archivedAt)),
  );
}

function snapshot(value: unknown): LocalPhotoLibrarySnapshot | null {
  const data = record(value);
  const items = Array.isArray(data?.items) ? data.items : null;
  const activeItemCount = items?.filter((item) => record(item)?.status === "active").length;
  const archivedItemCount = items?.filter((item) => record(item)?.status === "archived").length;
  const assetIds = items?.map((item) => record(item)?.assetId);
  if (!(
    data
    && data.ok === true
    && data.version === 1
    && Number.isSafeInteger(data.revision)
    && Number(data.revision) >= 0
    && Number.isSafeInteger(data.activeAssets)
    && Number(data.activeAssets) >= 0
    && Number.isSafeInteger(data.archivedAssets)
    && Number(data.archivedAssets) >= 0
    && Array.isArray(data.batches)
    && data.batches.every(batch)
    && items
    && items.every(libraryItem)
    && Number(data.activeAssets) + Number(data.archivedAssets) === items.length
    && activeItemCount === Number(data.activeAssets)
    && archivedItemCount === Number(data.archivedAssets)
    && assetIds
    && new Set(assetIds).size === assetIds.length
  )) return null;
  return data as unknown as LocalPhotoLibrarySnapshot;
}

async function json(response: Response) {
  try { return await response.json(); } catch { return null; }
}

function errorCode(value: unknown) {
  const data = record(value);
  const error = record(data?.error);
  return typeof error?.code === "string" ? error.code : null;
}

function url(origin: string, path: string) {
  if (!origin) throw new TypeError("A configured local photo library origin is required");
  return `${origin}${path}`;
}

export async function loadLocalPhotoLibrary(
  origin: string,
  fetchImpl: FetchLike = fetch,
): Promise<LocalPhotoLibrarySnapshot> {
  let response: Response;
  try {
    response = await fetchImpl(url(origin, "/library"), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new LocalPhotoLibraryManagementError("unavailable", "本地素材管理服务暂时不可用。");
  }
  const body = await json(response);
  if (!response.ok) throw new LocalPhotoLibraryManagementError(errorCode(body) ?? "request-failed", "本地素材库读取失败。");
  const parsed = snapshot(body);
  if (!parsed) throw new LocalPhotoLibraryManagementError("invalid-response", "本地素材库返回了无效数据。");
  return parsed;
}

export async function setLocalPhotoLibraryArchived(
  origin: string,
  assetIds: readonly string[],
  archived: boolean,
  expectedRevision: number,
  fetchImpl: FetchLike = fetch,
): Promise<LocalPhotoLibrarySnapshot> {
  if (
    assetIds.length < 1
    || assetIds.length > 100
    || assetIds.some((assetId) => !hash.test(assetId))
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
  ) throw new TypeError("A valid local photo library mutation is required");
  let response: Response;
  try {
    response = await fetchImpl(url(origin, archived ? "/library/archive" : "/library/restore"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-frame-zero-local-import": "1" },
      body: JSON.stringify({ assetIds, expectedRevision }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new LocalPhotoLibraryManagementError("unavailable", "本地素材管理服务暂时不可用。");
  }
  const body = await json(response);
  if (!response.ok) {
    const code = errorCode(body) ?? "request-failed";
    throw new LocalPhotoLibraryManagementError(code,
      code === "library-changed" ? "素材库刚刚发生变化，已刷新列表；请重新操作。"
        : code === "asset-variants-missing" ? "素材文件缺失，请重新导入照片后再恢复。"
          : "素材库更新失败。");
  }
  const parsed = snapshot(body);
  if (!parsed) throw new LocalPhotoLibraryManagementError("invalid-response", "本地素材库返回了无效数据。");
  return parsed;
}
