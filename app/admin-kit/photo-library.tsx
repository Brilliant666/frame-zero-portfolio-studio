"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site image variants. */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SiteAsset } from "../site-editor/assets-client";
import { Select } from "./select";
import { additionsFor, batchState, DEFAULT_LIBRARY_VIEW, librarySections, membershipIndex, restoreMembers, scopeAlbumId, selectRange, setSelection, toggleSelection, type LibraryAlbum, type LibraryScope, type LibrarySection, type LibraryView } from "./photo-library-model";
import { LIBRARY_UPLOAD_LIMITS, uploadLibraryFile, uploadProblem, type UploadOutcome } from "./library-upload";
import styles from "./photo-library.module.css";

export type { LibraryAlbum } from "./photo-library-model";

export type PhotoLibraryProps = {
  noun: "图集" | "分类";
  assets: readonly SiteAsset[];
  albums: readonly LibraryAlbum[];
  ready: boolean;
  truncated: boolean;
  state: string;
  onReload: () => Promise<void>;
  /** Appends in the given order and returns the ids actually added; throws a message the person can act on. */
  onAdd: (albumId: string, ids: readonly string[]) => readonly string[];
  /** Replaces an album's members (removal, and undoing an add or a removal). */
  onSetMembers?: (albumId: string, ids: readonly string[]) => void;
  /** Creates a hidden album holding these photos. */
  onCreate?: (name: string, ids: readonly string[]) => void;
  maxAlbums?: number;
  /** Picking for one album: its members stay visible but cannot be picked again. */
  target?: LibraryAlbum;
  onCancel?: () => void;
  uploadEndpoint?: string;
  /** False while the draft cannot change (loading, saving, conflict). Browsing and selecting still work. */
  editable?: boolean;
  /** Replaces the default heading (e.g. the editor's own focusable page title). */
  heading?: ReactNode;
  /** One line under the heading. */
  description?: ReactNode;
  /** Editor-specific buttons shown before 上传照片. */
  actions?: readonly LibraryAction[];
  onSelectionChange?: (count: number) => void;
};

const ORIENTATION = { landscape: "横图", portrait: "竖图", square: "方图" } as const;
const PALETTE = ["#d39a2f", "#4f7fd9", "#c95a74", "#3f9a7c", "#8b67c9", "#c06d35", "#3994a8", "#7d8a32"];
const DENSITY = { s: 112, m: 152, l: 212 } as const;
const RENDER_STEP = 240;
const dayFormat = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
const timeFormat = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fullFormat = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function dayLabel(date: Date) {
  const today = new Date(), yesterday = new Date(today.getTime() - 86_400_000);
  if (sameDay(date, today)) return "今天";
  if (sameDay(date, yesterday)) return "昨天";
  const part = Object.fromEntries(dayFormat.formatToParts(date).map(item => [item.type, item.value]));
  return `${date.getFullYear() === today.getFullYear() ? "" : `${part.year}年`}${part.month}月${part.day}日 ${part.weekday}`;
}
export function batchLabel(start: string | null, end: string | null) {
  if (!start || !end) return "加入时间未知";
  const from = new Date(start), to = new Date(end);
  const span = to.getTime() - from.getTime() >= 60_000 ? `${timeFormat.format(from)}–${timeFormat.format(to)}` : timeFormat.format(from);
  return `${dayLabel(from)} ${span}`;
}
const message = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback;

export type LibraryAction = { label: ReactNode; onClick: (event: MouseEvent<HTMLButtonElement>) => void; ariaLabel?: string; disabled?: boolean; data?: Readonly<Record<`data-${string}`, string>> };
type Toast = { id: number; text: string; undo?: () => void };
type QueueItem = { key: number; file: File; status: "queued" | "uploading" | UploadOutcome["status"] | "skipped"; note?: string; id?: string };

export default function PhotoLibrary(props: PhotoLibraryProps) {
  const { noun, assets, albums, ready, truncated, state, onReload, onAdd, onSetMembers, onCreate, maxAlbums = 30, target, onCancel, uploadEndpoint, editable = true, heading, description, actions = [], onSelectionChange } = props;
  const uid = useId().replace(/:/g, "");
  const picking = Boolean(target);
  const [view, setView] = useState<LibraryView>(DEFAULT_LIBRARY_VIEW);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [density, setDensity] = useState<keyof typeof DENSITY>("m");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(RENDER_STEP);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = menuAnchor !== null;
  const setMenuOpen = (open: boolean) => { if (!open) setMenuAnchor(null); };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [recent, setRecent] = useState<ReadonlySet<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reloading, setReloading] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const dragIds = useRef<string[]>([]);
  const toastId = useRef(0);
  useEffect(() => { onSelectionChange?.(selected.length); }, [selected.length, onSelectionChange]);
  const latest = useRef({ albums, onAdd, onSetMembers });
  useEffect(() => { latest.current = { albums, onAdd, onSetMembers }; });

  const assetMap = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets]);
  const members = useMemo(() => membershipIndex(albums), [albums]);
  const colors = useMemo(() => new Map(albums.map((album, index) => [album.id, PALETTE[index % PALETTE.length]])), [albums]);
  const targetIds = useMemo(() => new Set(target?.assetIds ?? []), [target]);
  const scopeAlbum = albums.find(album => album.id === scopeAlbumId(view.scope)) ?? null;
  const effectiveView = useMemo<LibraryView>(() => scopeAlbumId(view.scope) && !scopeAlbum ? { ...view, scope: "all" } : view, [view, scopeAlbum]);
  const sections = useMemo(() => librarySections(assets, albums, effectiveView), [assets, albums, effectiveView]);
  const order = useMemo(() => sections.flatMap(section => collapsed.has(section.key) ? [] : section.items.map(asset => asset.id)), [sections, collapsed]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const unfiled = useMemo(() => assets.filter(asset => !members.has(asset.id)).length, [assets, members]);
  const canEdit = ready && editable && !reloading;
  const selectable = useCallback((id: string) => canEdit && assetMap.has(id) && !targetIds.has(id), [canEdit, assetMap, targetIds]);
  const missing = selected.filter(id => !assetMap.has(id));
  const pickAdditions = target ? additionsFor(target, selected.filter(id => assetMap.has(id))) : [];
  const currentFocus = focusId && order.includes(focusId) ? focusId : order[0] ?? null;

  const toast = useCallback((text: string, undo?: () => void) => {
    const id = ++toastId.current;
    setToasts(list => [...list.slice(-2), { id, text, undo }]);
    setTimeout(() => setToasts(list => list.filter(item => item.id !== id)), undo ? 8000 : 4000);
  }, []);
  const flash = useCallback((ids: readonly string[]) => {
    setRecent(new Set(ids));
    setTimeout(() => setRecent(new Set()), 1800);
  }, []);

  /* Render in steps so a 10,000-photo library stays responsive. */
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setLimit(value => value + RENDER_STEP); }, { rootMargin: "600px" });
    observer.observe(node);
    return () => observer.disconnect();
  });

  const changeView = (change: Partial<LibraryView>) => { setView(value => ({ ...value, ...change })); setLimit(RENDER_STEP); setError(""); };
  const focusTile = useCallback((id: string | null, reveal = true) => {
    if (!id) return;
    const index = order.indexOf(id);
    if (index >= limit - 12) setLimit(value => Math.max(value, index + RENDER_STEP));
    setFocusId(id);
    const move = () => {
      const node = grid.current?.querySelector<HTMLElement>(`[data-asset-id="${CSS.escape(id)}"]`);
      node?.focus({ preventScroll: true });
      if (reveal) node?.scrollIntoView({ block: "nearest" });
      return Boolean(node);
    };
    // Rendered photos take focus at once; one beyond the render budget gets it after the next render.
    if (!move()) requestAnimationFrame(move);
  }, [order, limit]);

  function pick(id: string, event: { shiftKey: boolean }) {
    setError("");
    if (event.shiftKey) setSelected(value => selectRange(order, value, anchor, id, selectable));
    else setSelected(value => toggleSelection(value, id, selectable));
    setAnchor(id); setFocusId(id);
  }

  function add(album: LibraryAlbum, ids: readonly string[], keepSelection = false) {
    try {
      const added = onAdd(album.id, ids);
      const already = new Set(ids).size - added.length;
      const name = album.name || `未命名${noun}`;
      toast(added.length ? `已把 ${added.length} 张加入「${name}」${already ? `，另 ${already} 张原本就在` : ""}` : `这些照片都已在「${name}」`, added.length && onSetMembers ? () => {
        const now = latest.current.albums.find(item => item.id === album.id);
        if (!now) return;
        const drop = new Set(added);
        latest.current.onSetMembers?.(album.id, now.assetIds.filter(id => !drop.has(id)));
      } : undefined);
      if (!keepSelection) { setSelected([]); setAnchor(null); }
      setError(""); flash(added);
      return added;
    } catch (cause) { setError(message(cause, "加入失败，选择已保留。")); return null; }
  }
  function remove(album: LibraryAlbum, ids: readonly string[], keepSelection = false) {
    if (!onSetMembers) return;
    const previous = [...album.assetIds], drop = new Set(ids);
    const removed = previous.filter(id => drop.has(id));
    try { onSetMembers(album.id, previous.filter(id => !drop.has(id))); }
    catch (cause) { setError(message(cause, "移出失败，草稿未改变。")); return; }
    if (!keepSelection) { setSelected([]); setAnchor(null); }
    toast(`已把 ${removed.length} 张移出「${album.name || `未命名${noun}`}」，照片仍在图库`, () => {
      const now = latest.current.albums.find(item => item.id === album.id);
      if (now) latest.current.onSetMembers?.(album.id, restoreMembers(previous, now.assetIds, removed));
    });
  }
  function create(name: string, ids: readonly string[]) {
    if (!onCreate) return;
    try { onCreate(name, ids); }
    catch (cause) { setError(message(cause, `新建${noun}失败，选择已保留。`)); return; }
    toast(`已新建${noun}「${name}」并加入 ${ids.length} 张；它暂不公开，可在${noun}设置里显示`);
    setSelected([]); setAnchor(null); flash(ids);
  }

  async function reload() {
    if (reloading) return;
    setReloading(true); setError("");
    try { await onReload(); } catch (cause) { setError(message(cause, "图库读取失败，选择已保留。")); }
    finally { setReloading(false); }
  }

  /* After an upload, wait for the reloaded library before adding to an album or selecting. */
  const [afterUpload, setAfterUpload] = useState<{ ids: string[]; albumId: string | null } | null>(null);
  useEffect(() => {
    if (!afterUpload || !afterUpload.ids.every(id => assetMap.has(id))) return;
    const { ids, albumId } = afterUpload;
    const timer = setTimeout(() => {
      setAfterUpload(null);
      const album = albumId ? latest.current.albums.find(item => item.id === albumId) : null;
      if (album) { add(album, ids); return; }
      setView(value => ({ ...DEFAULT_LIBRARY_VIEW, orientation: value.orientation === "all" ? "all" : value.orientation, grouped: true }));
      setSelected(value => setSelection(value, ids, true, id => assetMap.has(id) && !targetIds.has(id)));
      flash(ids);
      toast(`已上传 ${ids.length} 张，已全部选中，可以直接加入${noun}`);
      grid.current?.scrollIntoView({ block: "start" });
    }, 0);
    return () => clearTimeout(timer);
    // add/toast/flash read the latest props through refs; re-running on them would add twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterUpload, assetMap]);

  /* Keyboard: a listbox per batch with one roving tab stop across the whole library. */
  function neighbour(id: string, key: string) {
    const index = order.indexOf(id);
    if (key === "ArrowLeft") return order[Math.max(0, index - 1)];
    if (key === "ArrowRight") return order[Math.min(order.length - 1, index + 1)];
    if (key === "Home") return order[0];
    if (key === "End") return order[order.length - 1];
    const tiles = [...(grid.current?.querySelectorAll<HTMLElement>("[data-asset-id]") ?? [])];
    const from = tiles.find(node => node.dataset.assetId === id)?.getBoundingClientRect();
    if (!from) return id;
    const centre = from.left + from.width / 2;
    const rows = tiles.map(node => ({ id: node.dataset.assetId!, box: node.getBoundingClientRect() })).filter(({ box }) => key === "ArrowDown" ? box.top > from.top + 4 : box.top < from.top - 4);
    if (!rows.length) return id;
    const top = key === "ArrowDown" ? Math.min(...rows.map(row => row.box.top)) : Math.max(...rows.map(row => row.box.top));
    return rows.filter(row => Math.abs(row.box.top - top) < 4).sort((a, b) => Math.abs(a.box.left + a.box.width / 2 - centre) - Math.abs(b.box.left + b.box.width / 2 - centre))[0].id;
  }
  function onTileKey(event: KeyboardEvent<HTMLElement>, id: string) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = neighbour(id, event.key);
      if (event.shiftKey && next !== id) { setSelected(value => selectRange(order, value, anchor ?? id, next, selectable)); if (!anchor) setAnchor(id); }
      focusTile(next);
    } else if (event.key === " ") { event.preventDefault(); pick(id, { shiftKey: event.shiftKey }); }
    else if (event.key === "Enter") { event.preventDefault(); setViewing(id); }
  }
  function onRootKey(event: KeyboardEvent<HTMLElement>) {
    const inGrid = (event.target as HTMLElement).closest("[data-asset-id]");
    if (inGrid && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected(value => setSelection(value, order, true, selectable)); }
    else if (inGrid && event.key === "Escape" && selected.length && !menuOpen) { event.preventDefault(); event.stopPropagation(); setSelected([]); setAnchor(null); }
  }

  /* Drag the selection (or one photo) onto an album chip. */
  function onDragStart(event: DragEvent<HTMLElement>, id: string) {
    dragIds.current = selectedSet.has(id) ? [...selected] : [id];
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", `${dragIds.current.length} 张照片`);
    const ghost = document.createElement("div");
    ghost.className = styles.dragGhost;
    ghost.textContent = `${dragIds.current.length} 张`;
    document.body.append(ghost);
    event.dataTransfer.setDragImage(ghost, 18, 18);
    setTimeout(() => ghost.remove(), 0);
    setDragging(true);
  }
  const endDrag = () => { dragIds.current = []; setDragging(false); setDropTarget(null); };
  const dropProps = (album: LibraryAlbum) => picking || !canEdit ? {} : {
    onDragOver: (event: DragEvent) => { if (!dragIds.current.length) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropTarget(album.id); },
    onDragLeave: (event: DragEvent) => { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) setDropTarget(value => value === album.id ? null : value); },
    onDrop: (event: DragEvent) => { event.preventDefault(); const ids = dragIds.current; endDrag(); if (ids.length) add(album, ids); },
  };

  /* Steps through the sections until the render budget is spent; offsets number the photos across batches. */
  const budget = useMemo(() => {
    let left = limit, offset = 0;
    const result = new Map<string, { count: number; offset: number }>();
    for (const section of sections) {
      const count = collapsed.has(section.key) ? 0 : Math.min(section.items.length, Math.max(0, left));
      result.set(section.key, { count, offset });
      left -= count; offset += collapsed.has(section.key) ? 0 : section.items.length;
    }
    return result;
  }, [sections, collapsed, limit]);
  const renderTiles = (section: LibrarySection<SiteAsset>, labelledBy: string) => {
    const { count, offset } = budget.get(section.key) ?? { count: 0, offset: 0 };
    const items = section.items.slice(0, count);
    return <div role="listbox" aria-multiselectable="true" aria-labelledby={labelledBy} className={styles.grid} data-selecting={selected.length > 0 || undefined}>
      {items.map((asset, index) => {
        const position = offset + index + 1;
        const inTarget = targetIds.has(asset.id);
        const isSelected = selectedSet.has(asset.id);
        const albumsOf = members.get(asset.id) ?? [];
        const where = inTarget ? `，已在当前${noun}` : albumsOf.length ? `，已在${albumsOf.map(album => `「${album.name}」`).join("")}` : `，未归入${noun}`;
        return <div key={asset.id} role="option" data-asset-id={asset.id} className={styles.tile} aria-selected={isSelected} aria-disabled={inTarget || !canEdit || undefined}
          aria-label={`第 ${position} 张，${ORIENTATION[asset.orientation]}${where}`} tabIndex={currentFocus === asset.id ? 0 : -1} data-recent={recent.has(asset.id) || undefined} data-member={inTarget || undefined}
          draggable={!picking && canEdit && !inTarget} onDragStart={event => onDragStart(event, asset.id)} onDragEnd={endDrag}
          onClick={event => { (event.currentTarget as HTMLElement).focus({ preventScroll: true }); pick(asset.id, event); }} onDoubleClick={() => setViewing(asset.id)}
          onKeyDown={event => onTileKey(event, asset.id)} onFocus={() => setFocusId(asset.id)}>
          <img src={asset.variants.thumbnail.src} alt="" loading="lazy" decoding="async" draggable={false} />
          <span className={styles.check} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          <button type="button" tabIndex={-1} aria-hidden="true" className={styles.zoom} onClick={(event: MouseEvent) => { event.stopPropagation(); setViewing(asset.id); }}><svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg></button>
          {inTarget ? <span className={styles.inTarget} aria-hidden="true">已在{noun}</span> : albumsOf.length > 0 && <span className={styles.badges} aria-hidden="true">
            {albumsOf.slice(0, 2).map(album => <span key={album.id} className={styles.badge}><i style={{ background: colors.get(album.id) }} />{album.name || `未命名${noun}`}</span>)}
            {albumsOf.length > 2 && <span className={styles.badge}>+{albumsOf.length - 2}</span>}
          </span>}
        </div>;
      })}
    </div>;
  };
  const totalShown = sections.reduce((sum, section) => sum + (collapsed.has(section.key) ? 0 : section.items.length), 0);
  const scopeButton = (scope: LibraryScope, label: ReactNode, count: number, album?: LibraryAlbum) => {
    const current = effectiveView.scope === scope;
    return <button key={scope} type="button" className={styles.chip} aria-pressed={current} data-drop={album && dropTarget === album.id || undefined} onClick={() => changeView({ scope })} {...(album ? dropProps(album) : {})}>
      {album && <i className={styles.chipDot} style={{ background: colors.get(album.id) }} aria-hidden="true" />}
      <span className={styles.chipName}>{label}</span><span className={styles.chipCount}>{count}</span>
      {album && dragging && <span className={styles.dropHint} aria-hidden="true">放到这里</span>}
    </button>;
  };
  const inAlbumScope = Boolean(scopeAlbumId(effectiveView.scope));

  return <section className={styles.root} data-admin-kit="photo-library" data-dragging={dragging || undefined} style={{ "--library-tile": `${DENSITY[density]}px` } as React.CSSProperties} aria-label={picking ? "选片" : "图库"} onKeyDown={onRootKey}>
    <header className={styles.header}>
      <div className={styles.title}>
        {heading ?? <h2>{picking ? `从图库添加到「${target!.name || `未命名${noun}`}」` : "图库"}</h2>}
        {description && <p className={styles.description}>{description}</p>}
        <p>本站 {assets.length} 张{picking ? ` · 已在${noun}的照片变灰` : <> · <b>{unfiled}</b> 张还没归入任何{noun}</>}
          <button type="button" className={styles.linkButton} disabled={reloading} onClick={() => void reload()}>{reloading ? "正在读取…" : "重新读取图库"}</button></p>
      </div>
      <div className={styles.headerActions}>
        {actions.map((action, index) => <button key={index} type="button" className={styles.ghostButton} aria-label={action.ariaLabel} disabled={action.disabled} onClick={action.onClick} {...action.data}>{action.label}</button>)}
        {uploadEndpoint && <button type="button" className={styles.primaryButton} onClick={() => setUploadOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>上传照片</button>}
      </div>
    </header>
    <p role="status" className={ready && !reloading ? styles.srOnly : styles.notice}>{state}</p>
    {truncated && <p className={styles.notice}>当前只载入了部分本站照片（{assets.length} 张）；筛选和批次只覆盖已载入的照片。</p>}

    <div className={styles.scopes} role="group" aria-label="按归属查看">
      {scopeButton("all", "全部", assets.length)}
      {scopeButton("unfiled", `未归入${noun}`, unfiled)}
      {albums.filter(album => album.id !== target?.id).map(album => scopeButton(`album:${album.id}`, <>{album.name || `未命名${noun}`}{!album.visible && <small> · 隐藏</small>}</>, album.assetIds.length, album))}
    </div>
    <div className={styles.toolbar}>
      <label className={styles.control}><span>方向</span><Select size="compact" minWidth={140} label="照片方向" value={effectiveView.orientation} onChange={orientation => changeView({ orientation })} options={[{ value: "all", label: "全部方向" }, { value: "landscape", label: "横图" }, { value: "portrait", label: "竖图" }, { value: "square", label: "方图" }]} /></label>
      {!inAlbumScope && <label className={styles.control}><span>上传时间</span><Select size="compact" minWidth={150} label="上传时间排序" value={effectiveView.sort} onChange={sort => changeView({ sort })} options={[{ value: "newest", label: "最新在前" }, { value: "oldest", label: "最早在前" }]} /></label>}
      {!inAlbumScope && <div className={styles.segment} role="radiogroup" aria-label="分组方式">
        {([[true, "按上传批次"], [false, "平铺"]] as const).map(([grouped, label]) => <button key={label} type="button" role="radio" aria-checked={effectiveView.grouped === grouped} onClick={() => changeView({ grouped })}>{label}</button>)}
      </div>}
      <div className={`${styles.segment} ${styles.density}`} role="radiogroup" aria-label="缩略图大小">
        {(Object.keys(DENSITY) as (keyof typeof DENSITY)[]).map(key => <button key={key} type="button" role="radio" aria-checked={density === key} onClick={() => setDensity(key)}>{{ s: "小", m: "中", l: "大" }[key]}</button>)}
      </div>
      <details className={styles.lookup} open={Boolean(view.query) || undefined}><summary>按素材 ID 查找</summary><input type="search" aria-label="按素材 ID 查找" value={view.query} placeholder="输入素材 ID 的一部分" onChange={event => changeView({ query: event.target.value })} /></details>
    </div>
    <p className={styles.hint}>{inAlbumScope ? `按${noun}里的顺序显示；排序、封面在${noun}编辑页调整。` : "相隔 30 分钟以上的上传算新的一批（按加入本站的时间，不是拍摄时间）。"} 点击选择，<kbd>Shift</kbd> 点击连选{picking ? "" : `，可把选中的照片拖到上方的${noun}上`}。</p>
    {missing.length > 0 && <p className={styles.notice} role="alert">有 {missing.length} 张已选照片不在当前图库，选择仍保留。<button type="button" className={styles.linkButton} onClick={() => setSelected(value => value.filter(id => assetMap.has(id)))}>取消这些选择</button></p>}

    <div ref={grid} className={styles.sections} aria-busy={!ready || reloading}>
      {sections.map(section => {
        const headingId = `${uid}-${section.key}`;
        if (!section.batch) return <div key={section.key} className={styles.section}><h3 id={headingId} className={styles.srOnly}>{scopeAlbum ? `「${scopeAlbum.name}」的照片` : "全部照片"}</h3>{renderTiles(section, headingId)}</div>;
        const ids = section.items.map(asset => asset.id).filter(id => !targetIds.has(id));
        const status = batchState(ids, selectedSet);
        const unfiledIds = ids.filter(id => !members.has(id));
        const batchUnfiled = section.batch.items.filter(asset => !members.has(asset.id)).length;
        const selectedHere = ids.filter(id => selectedSet.has(id)).length;
        const isCollapsed = collapsed.has(section.key);
        const label = batchLabel(section.batch.start, section.batch.end);
        return <div key={section.key} className={styles.section} data-collapsed={isCollapsed || undefined}>
          <div className={styles.batchHead}>
            <button type="button" role="checkbox" className={styles.tri} aria-checked={status === "all" ? true : status === "some" ? "mixed" : false} aria-label={`选中这一批（${label}，${ids.length} 张）`} disabled={!canEdit || !ids.length}
              onClick={() => { setSelected(value => setSelection(value, ids, status !== "all", selectable)); setError(""); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{status === "some" ? <path d="M6 12h12" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}</svg>
            </button>
            <h3 id={headingId} className={styles.batchTitle}><b>{label}</b><span>{section.batch.start ? "上传" : "导入"} · {section.items.length < section.batch.items.length ? `${section.items.length} / ${section.batch.items.length} 张` : `${section.batch.items.length} 张`}</span>
              {batchUnfiled ? <span className={styles.todo}>{batchUnfiled} 张未归入</span> : <span className={styles.done}>已全部归入</span>}
              {selectedHere > 0 && <span className={styles.selectedCount}>已选 {selectedHere}</span>}</h3>
            {canEdit && unfiledIds.length > 0 && unfiledIds.length < ids.length && <button type="button" className={styles.linkButton} onClick={() => setSelected(value => setSelection(value, unfiledIds, true, selectable))}>只选未归入的 {unfiledIds.length} 张</button>}
            <button type="button" className={styles.collapse} aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? "展开" : "收起"}这一批`} onClick={() => setCollapsed(value => { const next = new Set(value); if (next.has(section.key)) next.delete(section.key); else next.add(section.key); return next; })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
          </div>
          {renderTiles(section, headingId)}
        </div>;
      })}
      {limit < totalShown ? <div ref={sentinel} className={styles.more}><button type="button" className={styles.ghostButton} onClick={() => setLimit(value => value + RENDER_STEP)}>显示更多照片</button></div> : null}
      {ready && !sections.some(section => section.items.length) && <div className={styles.empty}>
        <b>{inAlbumScope ? `这个${noun}还没有照片` : effectiveView.scope === "unfiled" && assets.length ? `所有照片都已归入${noun}` : assets.length ? "没有符合条件的照片" : "图库还没有照片"}</b>
        <span>{assets.length ? "可以换个方向或归属条件。" : uploadEndpoint ? "点「上传照片」开始。" : "请先在图库上传照片。"}</span>
      </div>}
    </div>

    <div className={styles.dock}>
      <div className={styles.toasts} role="status" aria-live="polite">{toasts.map(item => <div key={item.id} className={styles.toast}><span>{item.text}</span>{item.undo && <button type="button" onClick={() => { item.undo!(); setToasts(list => list.filter(entry => entry.id !== item.id)); toast("已撤销"); }}>撤销</button>}</div>)}</div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {(picking || selected.length > 0) && <div className={styles.tray} role="region" aria-label="已选照片操作">
        <span className={styles.trayCount}>{selected.length ? `已选 ${selected.length} 张` : "选择要加入的照片"}<small>{picking ? (selected.length ? `新增 ${pickAdditions.length} 张` : "点击照片或批次方框") : "Esc 清除选择"}</small></span>
        {selected.length > 0 && <button type="button" className={styles.trayGhost} onClick={() => { setSelected([]); setAnchor(null); setError(""); }}>清空选择</button>}
        {picking ? <>
          <button type="button" className={styles.trayGhost} onClick={onCancel}>取消选片</button>
          <button type="button" className={styles.trayPrimary} disabled={!canEdit || !pickAdditions.length || missing.length > 0} onClick={() => add(target!, selected)}>{`加入「${target!.name || `未命名${noun}`}」（${pickAdditions.length} 张）`}</button>
        </> : <>
          {scopeAlbum && onSetMembers && <button type="button" className={styles.trayButton} disabled={!canEdit} onClick={() => remove(scopeAlbum, selected)}>移出「{scopeAlbum.name || `未命名${noun}`}」</button>}
          <button ref={menuTrigger} type="button" className={styles.trayPrimary} disabled={!canEdit || missing.length > 0} aria-haspopup="menu" aria-expanded={menuOpen} onClick={event => setMenuAnchor(menuOpen ? null : event.currentTarget)}>加入{noun}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
        </>}
      </div>}
    </div>

    {menuAnchor && <AddMenu trigger={menuAnchor} noun={noun} albums={albums} colors={colors} selected={selected} canCreate={Boolean(onCreate) && albums.length < maxAlbums}
      onPick={album => { setMenuOpen(false); add(album, selected); menuTrigger.current?.focus(); }} onCreate={name => { setMenuOpen(false); create(name, selected); }} onClose={() => { setMenuOpen(false); menuTrigger.current?.focus(); }} />}
    {viewing && assetMap.has(viewing) && <LibraryViewer asset={assetMap.get(viewing)!} order={order} assetMap={assetMap} noun={noun} albums={picking || !canEdit ? null : albums}
      onMove={id => setViewing(id)} onToggle={(album, on) => { const id = viewing; if (on) add(album, [id], true); else remove(album, [id], true); }}
      onClose={() => { const id = viewing; setViewing(null); focusTile(id, false); }} />}
    {uploadOpen && uploadEndpoint && <LibraryUploader endpoint={uploadEndpoint} noun={noun} albums={canEdit ? albums : []} initialAlbum={target?.id ?? scopeAlbum?.id ?? ""} onReload={onReload}
      onFinished={(ids, albumId) => { if (ids.length) setAfterUpload({ ids, albumId }); }} onClose={() => setUploadOpen(false)} />}
  </section>;
}

function AddMenu({ trigger, noun, albums, colors, selected, canCreate, onPick, onCreate, onClose }: { trigger: HTMLElement; noun: string; albums: readonly LibraryAlbum[]; colors: ReadonlyMap<string, string>; selected: readonly string[]; canCreate: boolean; onPick: (album: LibraryAlbum) => void; onCreate: (name: string) => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const host = trigger.closest("dialog") ?? document.body;
  useLayoutEffect(() => {
    const place = () => {
      const node = menu.current; if (!node) return;
      // The tray may still be sliding in; anchor to its dock, which is not transformed.
      const box = trigger.getBoundingClientRect(), dock = (trigger.closest(`.${styles.dock}`) ?? trigger).getBoundingClientRect();
      const top = Math.min(box.top, dock.bottom - 8);
      const height = node.offsetHeight, width = node.offsetWidth;
      setPosition({ left: Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12)), top: top - height - 8 > 8 ? top - height - 8 : box.bottom + 8 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [trigger, creating]);
  useEffect(() => { menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [trigger, onClose]);
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    else if (event.key === "ArrowDown" && index > -1) { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    else if (event.key === "ArrowUp" && index > -1) { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    else if (event.key === "Tab") onClose();
  }
  return createPortal(<div ref={menu} role="menu" aria-label={`加入${noun}`} data-admin-kit="library-menu" className={styles.menu} style={position ? { left: position.left, top: position.top } : { visibility: "hidden" }} onKeyDown={onKey}>
    <p className={styles.menuLabel}>把 {selected.length} 张加入{noun}</p>
    {albums.map(album => {
      const count = additionsFor(album, selected).length;
      return <button key={album.id} type="button" role="menuitem" className={styles.menuItem} onClick={() => onPick(album)}>
        <i className={styles.menuDot} style={{ background: colors.get(album.id) }} aria-hidden="true" />
        <span className={styles.menuText}><b>{album.name || `未命名${noun}`}</b><small>现有 {album.assetIds.length} 张{album.visible ? "" : " · 隐藏"}</small></span>
        <span className={count ? styles.menuAdd : styles.menuNone}>{count ? `+${count}` : "已全部在内"}</span>
      </button>;
    })}
    {!albums.length && <p className={styles.menuLabel}>还没有{noun}。</p>}
    {canCreate && (creating
      ? <form className={styles.menuForm} onSubmit={event => { event.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
          <input autoFocus aria-label={`新${noun}名称`} maxLength={120} value={name} placeholder={`新${noun}名称`} onChange={event => setName(event.target.value)} />
          <button type="submit" className={styles.primaryButton} disabled={!name.trim()}>创建并加入</button>
        </form>
      : <button type="button" role="menuitem" className={styles.menuItem} onClick={() => setCreating(true)}><i className={styles.menuPlus} aria-hidden="true">＋</i><span className={styles.menuText}><b>新建{noun}并加入</b><small>新{noun}先不公开，整理好再显示</small></span></button>)}
  </div>, host);
}

function useModal(onClose: () => void) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => { node?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return dialog;
}

function LibraryViewer({ asset, order, assetMap, noun, albums, onMove, onToggle, onClose }: { asset: SiteAsset; order: readonly string[]; assetMap: ReadonlyMap<string, SiteAsset>; noun: string; albums: readonly LibraryAlbum[] | null; onMove: (id: string) => void; onToggle: (album: LibraryAlbum, on: boolean) => void; onClose: () => void }) {
  const dialog = useModal(onClose);
  const index = order.indexOf(asset.id);
  const step = (delta: number) => { const next = order[index + delta]; if (next && assetMap.has(next)) onMove(next); };
  return <dialog ref={dialog} className={styles.viewer} data-admin-kit="library-viewer" aria-label="查看照片" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={event => { if ((event.target as HTMLElement).matches("input")) return; if (event.key === "ArrowRight") step(1); if (event.key === "ArrowLeft") step(-1); }}>
    <div className={styles.viewerStage}>
      <img src={asset.variants.full.src} alt={`${ORIENTATION[asset.orientation]} ${asset.variants.full.width} × ${asset.variants.full.height}`} />
      {index > 0 && <button type="button" className={`${styles.viewerArrow} ${styles.viewerPrev}`} aria-label="上一张" onClick={() => step(-1)}><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg></button>}
      {index > -1 && index < order.length - 1 && <button type="button" className={`${styles.viewerArrow} ${styles.viewerNext}`} aria-label="下一张" onClick={() => step(1)}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>}
    </div>
    <div className={styles.viewerSide}>
      <div className={styles.viewerHead}><h2>{index > -1 ? `照片 ${index + 1} / ${order.length}` : "照片"}</h2><button type="button" className={styles.ghostButton} autoFocus onClick={onClose}>关闭</button></div>
      <dl className={styles.meta}>
        <dt>加入本站</dt><dd>{asset.createdAt ? fullFormat.format(new Date(asset.createdAt)) : "时间未知"}</dd>
        <dt>尺寸</dt><dd>{asset.variants.full.width} × {asset.variants.full.height}</dd>
        <dt>方向</dt><dd>{ORIENTATION[asset.orientation]}</dd>
        <dt>素材 ID</dt><dd className={styles.assetId}>{asset.id}</dd>
      </dl>
      {albums && <fieldset className={styles.viewerAlbums}><legend>属于哪些{noun}</legend>
        {albums.map(album => <label key={album.id}><input type="checkbox" checked={album.assetIds.includes(asset.id)} onChange={event => onToggle(album, event.target.checked)} />{album.name || `未命名${noun}`}{!album.visible && <small> · 隐藏</small>}</label>)}
        {!albums.length && <p>还没有{noun}。</p>}
      </fieldset>}
      <p className={styles.hint}>← → 切换照片。勾选只改草稿，不会发布。</p>
    </div>
  </dialog>;
}

const STATUS_TEXT: Record<QueueItem["status"], string> = { queued: "排队中", uploading: "上传中…", uploaded: "已入库", duplicate: "已在图库", rejected: "未完成", uncertain: "结果待核对", skipped: "已跳过" };

function LibraryUploader({ endpoint, noun, albums, initialAlbum, onReload, onFinished, onClose }: { endpoint: string; noun: string; albums: readonly LibraryAlbum[]; initialAlbum: string; onReload: () => Promise<void>; onFinished: (ids: string[], albumId: string | null) => void; onClose: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [albumId, setAlbumId] = useState(albums.some(album => album.id === initialAlbum) ? initialAlbum : "");
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const [over, setOver] = useState(false);
  const stop = useRef(false);
  const key = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const dialog = useModal(onClose);
  function addFiles(files: File[]) {
    if (running) return;
    setNote("");
    setQueue(current => {
      const room = LIBRARY_UPLOAD_LIMITS.files - current.length;
      if (files.length > room) setNote(`一次最多排队 ${LIBRARY_UPLOAD_LIMITS.files} 张，其余 ${files.length - Math.max(0, room)} 张没有加入队列。`);
      return [...current, ...files.slice(0, Math.max(0, room)).map(file => { const problem = uploadProblem(file); return { key: ++key.current, file, status: problem ? "skipped" as const : "queued" as const, note: problem ?? undefined }; })];
    });
  }
  const patch = (itemKey: number, change: Partial<QueueItem>) => setQueue(current => current.map(item => item.key === itemKey ? { ...item, ...change } : item));
  async function start() {
    if (running) return;
    stop.current = false; setRunning(true); setNote("");
    const ids: string[] = [];
    let problems = 0;
    for (const item of queue.filter(entry => entry.status === "queued")) {
      if (stop.current) break;
      patch(item.key, { status: "uploading" });
      const outcome = await uploadLibraryFile(endpoint, item.file);
      if ("id" in outcome) { ids.push(outcome.id); patch(item.key, { status: outcome.status, id: outcome.id }); }
      else { problems++; patch(item.key, { status: outcome.status, note: outcome.message }); }
    }
    let refreshed = true;
    try { await onReload(); } catch { refreshed = false; }
    setRunning(false);
    if (!refreshed) { setNote(`已确认 ${ids.length} 张入库，但图库刷新失败。请关闭后点「重新读取图库」核对，避免重复上传。`); return; }
    onFinished(ids, albumId || null);
    if (!problems && !stop.current) onClose();
    else setNote(stop.current ? `已停止；已确认 ${ids.length} 张入库，其余未上传。` : `已确认 ${ids.length} 张入库，${problems} 张需要核对（见下方列表）。结果待核对的照片可能已经入库，请先查看图库再决定是否重传。`);
  }
  const waiting = queue.filter(item => item.status === "queued").length;
  const done = queue.filter(item => item.status === "uploaded" || item.status === "duplicate").length;
  const total = queue.filter(item => item.status !== "skipped").length;
  return <dialog ref={dialog} className={styles.uploader} data-admin-kit="library-uploader" aria-labelledby={`${hintId}-title`} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!running) onClose(); }}>
    <header className={styles.uploaderHead}><div><h2 id={`${hintId}-title`}>上传照片到本站图库</h2><p>上传只进入图库，不会发布；同一张照片重复上传会自动识别。</p></div></header>
    <div className={styles.uploaderBody}>
      <label className={styles.drop} data-over={over || undefined} onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={event => { event.preventDefault(); setOver(false); addFiles([...event.dataTransfer.files]); }}>
        <input ref={input} type="file" aria-label="选择要上传的照片" aria-describedby={hintId} accept={LIBRARY_UPLOAD_LIMITS.types.join(",")} multiple disabled={running} onChange={event => { addFiles([...(event.target.files ?? [])]); event.target.value = ""; }} />
        <b>拖入照片，或点击选择</b>
        <span id={hintId}>一次可排队 {LIBRARY_UPLOAD_LIMITS.files} 张，逐张上传 · JPEG / PNG / WebP · 每张最多 20 MB</span>
      </label>
      {albums.length > 0 && <label className={styles.control}><span>上传后加入</span><Select label="上传后加入" minWidth={260} disabled={running} value={albumId} onChange={setAlbumId}
        options={[{ value: "", label: `先不加入${noun}`, description: "上传后照片会自动选中，可再分批整理" }, ...albums.map(album => ({ value: album.id, label: album.name || `未命名${noun}`, description: `现有 ${album.assetIds.length} 张${album.visible ? "" : " · 隐藏"}` }))]} /></label>}
      {queue.length > 0 && <div className={styles.queue}>
        <div className={styles.queueHead}><b>{running ? `正在上传 ${done + 1 > total ? total : done + 1} / ${total}` : done ? `已入库 ${done} / ${total}` : `待上传 ${waiting} 张`}</b>{!running && waiting > 0 && <button type="button" className={styles.linkButton} onClick={() => setQueue([])}>清空队列</button>}</div>
        <div className={styles.progress} aria-hidden="true"><i style={{ width: total ? `${(done / total) * 100}%` : 0 }} /></div>
        <ul aria-label="上传队列">{queue.map(item => <li key={item.key} data-status={item.status}><span className={styles.queueName}>{item.file.name}</span><span className={styles.queueStatus}>{STATUS_TEXT[item.status]}{item.note ? `：${item.note}` : ""}</span></li>)}</ul>
      </div>}
      {note && <p className={styles.notice} role="alert">{note}</p>}
    </div>
    <footer className={styles.uploaderFoot}>
      {running ? <button type="button" className={styles.ghostButton} onClick={() => { stop.current = true; }}>停止（当前这张传完后）</button> : <button type="button" className={styles.ghostButton} onClick={onClose}>{done ? "完成" : "取消"}</button>}
      <button type="button" className={styles.primaryButton} disabled={running || !waiting} onClick={() => void start()}>{running ? "上传中…" : `开始上传${waiting ? `（${waiting} 张）` : ""}`}</button>
    </footer>
  </dialog>;
}
