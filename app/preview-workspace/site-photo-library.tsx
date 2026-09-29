"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site image variants. */
import { useMemo, useState } from "react";
import type { SiteAsset } from "../site-editor/assets-client";
import type { Collection } from "../templates/polaroid-field/collection-model";
import { filterPickerAssets, PICKER_PAGE_SIZE, type PickerFilter } from "./photo-picker-state";
import styles from "./site-photo-library.module.css";

export type SitePhotoLibraryProps = {
  assets: readonly SiteAsset[];
  collections: readonly Collection[];
  ready: boolean;
  truncated: boolean;
  state: string;
  onReload: () => Promise<void>;
  /** Parent applies appendPickedPhotos to its current draft; failures must throw. */
  onAdd: (collectionId: string, ids: readonly string[]) => void;
  onView: (asset: SiteAsset) => void;
};
const initialFilter: PickerFilter = { query: "", orientation: "all", membership: "all", sort: "newest", onlySelected: false };
const orientationNames = { landscape: "横图", portrait: "竖图", square: "方图" };
const EMPTY: readonly string[] = [];

export default function SitePhotoLibrary({ assets, collections, ready, truncated, state, onReload, onAdd, onView }: SitePhotoLibraryProps) {
  const [filter, setFilter] = useState(initialFilter);
  const [picked, setPicked] = useState<string[]>([]);
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reloading, setReloading] = useState(false);
  const target = collections.find(item => item.id === targetId);
  const members = target?.assetIds ?? EMPTY;
  const memberIds = useMemo(() => new Set(members), [members]);
  const pickedIds = useMemo(() => new Set(picked), [picked]);
  const availableIds = useMemo(() => new Set(assets.map(asset => asset.id)), [assets]);
  const missing = picked.filter(id => !availableIds.has(id));
  const additions = picked.filter(id => !memberIds.has(id));
  const filtered = useMemo(() => filterPickerAssets(assets, members, picked, filter), [assets, members, picked, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PICKER_PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PICKER_PAGE_SIZE, (currentPage + 1) * PICKER_PAGE_SIZE);
  const updateFilter = (change: Partial<PickerFilter>) => { setFilter(current => ({ ...current, ...change })); setPage(0); };
  const select = (id: string) => { setPicked(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); setError(""); setMessage(""); };
  async function reload() {
    if (reloading) return;
    setReloading(true); setError("");
    try { await onReload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "图库读取失败，选择已保留。"); }
    finally { setReloading(false); }
  }
  function add() {
    if (!ready || reloading || !target || !picked.length || missing.length) return;
    try {
      onAdd(target.id, picked);
      setMessage(`已将所选照片加入「${target.name || "未命名图集"}」草稿；请到图集确认顺序后保存，尚未发布。`);
      setPicked([]); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "加入失败，选择已保留。"); }
  }
  return <section className={styles.library} aria-label="图库">
    <header className={styles.header}><div><h2>图库</h2><p>基础与高级共用本站照片；加入高级图集只修改该空间草稿。</p></div><button type="button" disabled={reloading} onClick={() => void reload()}>{reloading ? "正在读取…" : "重新读取素材"}</button></header>
    <p role="status">{state}</p>
    {truncated && <p className={styles.warning}>当前仅载入部分本站素材（{assets.length} 张）；筛选、排序和分页只覆盖已载入照片。</p>}
    <fieldset className={styles.filters} disabled={filter.onlySelected}>
      <label>按素材 ID 查找<input type="search" value={filter.query} placeholder="输入素材 ID 的一部分" onChange={event => updateFilter({ query: event.target.value })} /></label>
      <label>照片方向<select value={filter.orientation} onChange={event => updateFilter({ orientation: event.target.value })}><option value="all">全部方向</option><option value="landscape">横图</option><option value="portrait">竖图</option><option value="square">方图</option></select></label>
      <label>加入本站时间<select value={filter.sort} onChange={event => updateFilter({ sort: event.target.value })}><option value="newest">最新在前</option><option value="oldest">最早在前</option></select></label>
      <label>图集关系<select value={filter.membership} disabled={!target} onChange={event => updateFilter({ membership: event.target.value })}><option value="all">全部照片</option><option value="outside">未加入目标图集</option></select></label>
    </fieldset>
    <p className={styles.hint}>加入本站时间不是拍摄时间。按选择顺序追加；跨页、筛选和切换目标图集均保留选择。</p>
    <div className={styles.tools}>
      <button type="button" disabled={!ready || reloading || !visible.some(asset => !pickedIds.has(asset.id))} onClick={() => { setPicked(current => [...new Set([...current, ...visible.map(asset => asset.id)])]); setError(""); setMessage(""); }}>选择本页照片</button>
      <button type="button" aria-pressed={filter.onlySelected} onClick={() => updateFilter({ onlySelected: !filter.onlySelected })}>{filter.onlySelected ? "返回全部结果" : "查看已选"}</button>
      <button type="button" disabled={!picked.length} onClick={() => { setPicked([]); setError(""); }}>清空选择</button>
      <strong>已选 {picked.length} 张</strong>
    </div>
    {missing.length > 0 && <p className={styles.warning} role="alert">有 {missing.length} 张已选照片不在当前素材列表，选择仍保留。<button type="button" onClick={() => setPicked(current => current.filter(id => availableIds.has(id)))}>取消不可用选择</button></p>}
    <div className={styles.grid} aria-label="图库浏览结果" aria-busy={!ready || reloading}>
      {visible.map(asset => <article className={styles.card} key={asset.id} data-selected={pickedIds.has(asset.id)}>
        <button type="button" className={styles.photo} aria-label={`查看照片 ${asset.id} 大图`} onClick={() => onView(asset)}><img src={asset.variants.thumbnail.src} alt="" loading="lazy" /></button>
        <label className={styles.pick}><input type="checkbox" aria-label={`选择照片 ${asset.id}`} checked={pickedIds.has(asset.id)} disabled={!ready || reloading} onChange={() => select(asset.id)} />{pickedIds.has(asset.id) ? `已选 ${picked.indexOf(asset.id) + 1}` : "选择照片"}</label>
        <span>{orientationNames[asset.orientation]} · {asset.variants.full.width} × {asset.variants.full.height}</span>
        {target && memberIds.has(asset.id) && <small>已在目标图集</small>}
        <small>ID {asset.id}</small><small>{asset.createdAt ? new Date(asset.createdAt).toLocaleString("zh-CN", { hour12: false }) : "加入时间未知"}</small>
      </article>)}
    </div>
    {ready && !filtered.length && <p>没有符合条件的照片，请调整筛选或清除素材 ID。</p>}
    <nav className={styles.tools} aria-label="图库分页"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage + 1} / {pages} 页 · {filtered.length} 张匹配</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>
    <footer className={styles.destination}>
      <label>加入高级图集<select value={target?.id ?? ""} onChange={event => { setTargetId(event.target.value); setPage(0); setError(""); setMessage(""); }}><option value="">请选择目标图集</option>{collections.map(item => <option value={item.id} key={item.id}>{item.name || "未命名图集"} · {item.assetIds.length} 张{item.visible ? "" : " · 隐藏"}</option>)}</select></label>
      <div><strong>{target ? `预计新增 ${additions.length} 张` : "先选择目标图集"}</strong><p>重复照片会由图集自动去重，不保存或发布。</p>{!collections.length && <p>请先到图集管理新建图集。</p>}{targetId && !target && <p role="alert">原目标图集已不存在，请重新选择。</p>}</div>
      <button className={styles.primary} type="button" disabled={!ready || reloading || !target || !additions.length || !!missing.length} onClick={add}>加入所选图集</button>
    </footer>
    {error && <p className={styles.warning} role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
