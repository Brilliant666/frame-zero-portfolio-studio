/**
 * Pure library logic shared by the 星轨 and 流影视廊 editors: upload batches, membership views and selection.
 * Batches are inferred from the existing "加入本站时间"; nothing new is stored.
 */
export type LibraryOrientation = "landscape" | "portrait" | "square";
export type LibraryAsset = { id: string; orientation: LibraryOrientation; createdAt?: string };
export type LibraryAlbum = { id: string; name: string; assetIds: readonly string[]; visible: boolean };
export type UploadBatch<T extends LibraryAsset> = { key: string; start: string | null; end: string | null; items: T[] };
export type LibraryScope = "all" | "unfiled" | "filed" | `album:${string}`;
export type LibraryView = { scope: LibraryScope; orientation: LibraryOrientation | "all"; sort: "newest" | "oldest"; grouped: boolean; query: string };
export type LibrarySection<T extends LibraryAsset> = { key: string; batch: UploadBatch<T> | null; items: T[] };

/** Uploads further apart than this start a new batch; one sitting of several 8-photo requests stays together. */
export const UPLOAD_BATCH_GAP_MS = 30 * 60 * 1000;
export const DEFAULT_LIBRARY_VIEW: LibraryView = { scope: "all", orientation: "all", sort: "newest", grouped: true, query: "" };

const byId = (a: LibraryAsset, b: LibraryAsset) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Oldest batch first, items oldest first. Photos without a time form one last batch. */
export function groupUploadBatches<T extends LibraryAsset>(assets: readonly T[], gap = UPLOAD_BATCH_GAP_MS): UploadBatch<T>[] {
  const known = assets.filter(asset => asset.createdAt).sort((a, b) => a.createdAt!.localeCompare(b.createdAt!) || byId(a, b));
  const batches: UploadBatch<T>[] = [];
  let last: UploadBatch<T> | undefined;
  for (const asset of known) {
    if (last && Date.parse(asset.createdAt!) - Date.parse(last.end!) <= gap) { last.items.push(asset); last.end = asset.createdAt!; continue; }
    last = { key: `batch-${asset.createdAt}`, start: asset.createdAt!, end: asset.createdAt!, items: [asset] };
    batches.push(last);
  }
  const unknown = assets.filter(asset => !asset.createdAt).sort(byId);
  if (unknown.length) batches.push({ key: "batch-unknown", start: null, end: null, items: unknown });
  return batches;
}

export function membershipIndex(albums: readonly LibraryAlbum[]) {
  const index = new Map<string, LibraryAlbum[]>();
  for (const album of albums) for (const id of album.assetIds) {
    const list = index.get(id);
    if (list) { if (!list.includes(album)) list.push(album); } else index.set(id, [album]);
  }
  return index;
}

export function scopeAlbumId(scope: LibraryScope) { return scope.startsWith("album:") ? scope.slice(6) : null; }

/**
 * The sections shown for a view. An album scope lists members in the album's own order, as one section;
 * every other scope is grouped by upload batch (or one flat section) in the chosen time order.
 */
export function librarySections<T extends LibraryAsset>(assets: readonly T[], albums: readonly LibraryAlbum[], view: LibraryView): LibrarySection<T>[] {
  const query = view.query.trim().toLowerCase();
  const matches = (asset: T) => (view.orientation === "all" || asset.orientation === view.orientation) && (!query || asset.id.toLowerCase().includes(query));
  const albumId = scopeAlbumId(view.scope);
  if (albumId) {
    const album = albums.find(item => item.id === albumId);
    const assetMap = new Map(assets.map(asset => [asset.id, asset]));
    const items = (album?.assetIds ?? []).flatMap(id => { const asset = assetMap.get(id); return asset && matches(asset) ? [asset] : []; });
    return [{ key: `album-${albumId}`, batch: null, items }];
  }
  const members = membershipIndex(albums);
  const keep = (asset: T) => matches(asset) && (view.scope === "all" || (view.scope === "unfiled") !== members.has(asset.id));
  let batches = groupUploadBatches(assets).map(batch => ({ key: batch.key, batch, items: batch.items.filter(keep) }));
  if (view.sort === "newest") {
    // Newest first, but photos without a time stay last.
    const unknown = batches.filter(section => !section.batch.start);
    batches = [...batches.filter(section => section.batch.start).reverse().map(section => ({ ...section, items: [...section.items].reverse() })), ...unknown];
  }
  batches = batches.filter(section => section.items.length);
  return view.grouped ? batches : [{ key: "flat", batch: null, items: batches.flatMap(section => section.items) }];
}

/** Shift-click: adds everything between the anchor and the target (in display order) after the current selection. */
export function selectRange(order: readonly string[], selected: readonly string[], anchor: string | null, id: string, selectable: (id: string) => boolean = () => true): string[] {
  const from = anchor === null ? -1 : order.indexOf(anchor), to = order.indexOf(id);
  if (to < 0) return [...selected];
  if (from < 0) return selectable(id) && !selected.includes(id) ? [...selected, id] : [...selected];
  const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
  return setSelection(selected, from <= to ? range : range.reverse(), true, selectable);
}

/** Adds (keeping display order, after earlier picks) or removes ids; selection order is the order photos are appended. */
export function setSelection(selected: readonly string[], ids: readonly string[], on: boolean, selectable: (id: string) => boolean = () => true): string[] {
  if (!on) { const drop = new Set(ids); return selected.filter(id => !drop.has(id)); }
  const have = new Set(selected);
  return [...selected, ...ids.filter(id => selectable(id) && !have.has(id) && (have.add(id), true))];
}

export function toggleSelection(selected: readonly string[], id: string, selectable: (id: string) => boolean = () => true) {
  return selected.includes(id) ? selected.filter(value => value !== id) : selectable(id) ? [...selected, id] : [...selected];
}

export function additionsFor(album: Pick<LibraryAlbum, "assetIds">, ids: readonly string[]) {
  const have = new Set(album.assetIds);
  return [...new Set(ids)].filter(id => !have.has(id));
}

/** Undo of a removal: puts the removed ids back at their old positions, keeping anything added since. */
export function restoreMembers(previous: readonly string[], current: readonly string[], removed: readonly string[]) {
  const back = new Set(removed), now = new Set(current);
  const restored = previous.filter(id => back.has(id) || now.has(id));
  const kept = new Set(restored);
  return [...restored, ...current.filter(id => !kept.has(id))];
}

/** Batch tri-state for its selectable photos. */
export function batchState(ids: readonly string[], selected: ReadonlySet<string>): "none" | "some" | "all" {
  const count = ids.filter(id => selected.has(id)).length;
  return count === 0 ? "none" : count === ids.length ? "all" : "some";
}
