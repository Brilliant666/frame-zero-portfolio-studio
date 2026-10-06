"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site image variants. */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SiteAsset } from "../site-editor/assets-client";
import { filterPickerAssets, PICKER_PAGE_SIZE, type PickerFilter } from "./photo-picker-state";
import { applyPickerLookup, clearPickerLookup, currentFlowLibraryLookup, describePickerLookup, type FlowLibraryLookup } from "./flow-picker-lookup";
import styles from "./site-photo-picker.module.css";

type Props = {
  appearance?: "flow";
  siteScopeKey?: string;
  flowLibraryLookup?: FlowLibraryLookup;
  returnFocus?: RefObject<HTMLButtonElement | null>;
  collectionName: string; members: readonly string[]; assets: readonly SiteAsset[];
  ready: boolean; truncated: boolean; state: string; onReload: () => Promise<void>;
  onAdd: (ids: readonly string[]) => void; onClose: () => void;
};
const initialFilter: PickerFilter = { query: "", orientation: "all", membership: "outside", sort: "newest", onlySelected: false };
const orientationName = { landscape: "横图", portrait: "竖图", square: "方图" };

export default function SitePhotoPicker({ appearance, siteScopeKey, flowLibraryLookup, returnFocus, collectionName, members, assets, ready, truncated, state, onReload, onAdd, onClose }: Props) {
  const noun = appearance === "flow" ? "分类" : "图集";
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState(initialFilter);
  const [picked, setPicked] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [lookupNotice, setLookupNotice] = useState("");
  const [enlarged, setEnlarged] = useState<SiteAsset | null>(null);
  const enlargeTrigger = useRef<HTMLButtonElement | null>(null);
  const closeEnlarged = () => { setEnlarged(null); requestAnimationFrame(() => enlargeTrigger.current?.focus()); };
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = returnFocus?.current ?? previous;
    node?.showModal();
    return () => { node?.close(); target?.focus(); };
  }, [returnFocus]);
  const memberIds = useMemo(() => new Set(members), [members]);
  const pickedIds = useMemo(() => new Set(picked), [picked]);
  const availableIds = useMemo(() => new Set(assets.map(asset => asset.id)), [assets]);
  const missing = picked.filter(id => !availableIds.has(id));
  const additions = picked.filter(id => !memberIds.has(id));
  const remaining = 500 - members.length;
  const filtered = useMemo(() => filterPickerAssets(assets, members, picked, filter), [assets, members, picked, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PICKER_PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PICKER_PAGE_SIZE, (currentPage + 1) * PICKER_PAGE_SIZE);
  const flowLookupEnabled = appearance === "flow" && Boolean(siteScopeKey);
  const libraryLookup = flowLookupEnabled ? currentFlowLibraryLookup(flowLibraryLookup, siteScopeKey) : null;
  const hasLookup = Boolean(filter.query.trim()) || filter.orientation !== "all";
  const clearLookup = () => { setFilter(clearPickerLookup); setPage(0); setLookupNotice("已清除画幅与素材 ID 条件；分类关系、排序和暂选照片保留。"); };
  const updateFilter = (change: Partial<PickerFilter>) => { setFilter(value => ({ ...value, ...change })); setPage(0); setLookupNotice(""); };
  const toggle = (id: string) => { setPicked(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]); setError(""); };
  const close = () => { if (!picked.length || window.confirm(`放弃本次选片？已加入${noun}的成员和其他编辑不变。`)) onClose(); };
  return <dialog ref={dialog} className={styles.dialog} data-appearance={appearance} aria-labelledby="site-picker-title" onCancel={event => { event.preventDefault(); if (enlarged) closeEnlarged(); else close(); }}>
    <header className={styles.header} inert={Boolean(enlarged)}><div><h2 id="site-picker-title">从图库选片</h2><p>加入「{collectionName}」 · 已有 {members.length} 张，还可加入 {remaining} 张</p></div><button type="button" onClick={close}>取消选片</button></header>
    <div className={styles.content} inert={Boolean(enlarged)}>
      <p role="status">{state}</p>
      {truncated && <p className={styles.warning}>本站素材超过 10,000 张，当前只载入其中一部分；筛选和分页仅覆盖已载入照片。</p>}
      {flowLookupEnabled && (libraryLookup || hasLookup) && <div className={styles.lookupActions}>
        {libraryLookup && <><button type="button" onClick={() => { setFilter(value => applyPickerLookup(value, libraryLookup)); setPage(0); setLookupNotice(`已沿用图库画幅与素材 ID 条件${libraryLookup.order ? "及加入本站时间排序" : ""}；分类关系和暂选照片保留。`); }}>沿用图库查找条件</button><small>{libraryLookup.order ? "沿用画幅、素材 ID 与加入本站时间排序。" : "只沿用画幅与素材 ID；保留选片器当前排序。"}</small></>}
        {hasLookup && <button type="button" onClick={clearLookup}>清除查找条件</button>}
      </div>}
      {flowLookupEnabled && lookupNotice && <p className={styles.hint} role="status">{lookupNotice}</p>}
      <fieldset className={styles.filters} disabled={filter.onlySelected}>
        <label>按素材 ID 查找<input value={filter.query} onChange={event => updateFilter({ query: event.target.value })} placeholder="输入素材 ID 的一部分" /></label>
        <label>照片方向<select aria-label="照片方向" value={filter.orientation} onChange={event => updateFilter({ orientation: event.target.value })}><option value="all">全部方向</option><option value="landscape">横图</option><option value="portrait">竖图</option><option value="square">方图</option></select></label>
        <label>{noun}关系<select aria-label={`${noun}关系`} value={filter.membership} onChange={event => updateFilter({ membership: event.target.value })}><option value="outside">未加入当前{noun}</option><option value="all">全部照片</option></select></label>
        <label>加入本站时间<select aria-label="加入本站时间" value={filter.sort} onChange={event => updateFilter({ sort: event.target.value })}><option value="newest">最新在前</option><option value="oldest">最早在前</option></select></label>
      </fieldset>
      <p className={styles.hint}>按缩略图和方向找照片；加入本站时间不是拍摄时间。选中顺序即追加顺序，改变筛选不会改变已选顺序。</p>
      <div className={styles.tools}>
        <button type="button" disabled={!ready || !visible.some(asset => !memberIds.has(asset.id) && !pickedIds.has(asset.id))} onClick={() => { setPicked(ids => [...new Set([...ids, ...visible.filter(asset => !memberIds.has(asset.id)).map(asset => asset.id)])]); setError(""); }}>选择本页可加入照片</button>
        <button type="button" aria-pressed={filter.onlySelected} onClick={() => updateFilter({ onlySelected: !filter.onlySelected })}>{filter.onlySelected ? "返回全部结果" : "查看已选"}</button>
        <button type="button" disabled={!picked.length} onClick={() => { setPicked([]); setError(""); }}>清空选择</button>
        <button type="button" onClick={() => void onReload()}>重新读取素材</button>
      </div>
      {missing.length > 0 && <p className={styles.warning}>有 {missing.length} 张已选照片不在当前素材列表中。<button type="button" onClick={() => setPicked(ids => ids.filter(id => availableIds.has(id)))}>取消这些选择</button></p>}
      <div className={styles.grid} aria-label="本站选片结果" aria-busy={!ready}>
        {visible.map(asset => <article key={asset.id} className={styles.card} data-selected={pickedIds.has(asset.id)}>
          <button className={styles.imageButton} type="button" aria-label={`放大照片 ${asset.id}`} onClick={event => { enlargeTrigger.current = event.currentTarget; setEnlarged(asset); }}><img alt="" src={asset.variants.thumbnail.src} loading="lazy" /></button>
          <label className={styles.pick}><input type="checkbox" aria-label={`选择照片 ${asset.id}`} disabled={!ready || memberIds.has(asset.id)} checked={pickedIds.has(asset.id)} onChange={() => toggle(asset.id)} />{memberIds.has(asset.id) ? `已在${noun}` : pickedIds.has(asset.id) ? `已选 ${picked.indexOf(asset.id) + 1}` : "选择照片"}</label>
          <span>{orientationName[asset.orientation]} · {asset.variants.full.width} × {asset.variants.full.height}</span>
          <small title={asset.id}>ID {asset.id}</small><small>{asset.createdAt ? new Date(asset.createdAt).toLocaleString("zh-CN", { hour12: false }) : "加入时间未知"}</small>
        </article>)}
      </div>
      {!filtered.length && (flowLookupEnabled ? <p className={styles.empty} role="status">{filter.onlySelected ? "暂无暂选照片。返回全部结果后继续选片。" : <>当前条件：{describePickerLookup(filter)}。没有符合条件的照片。{hasLookup ? "可清除查找条件或调整分类关系。" : "可调整分类关系，或重新读取素材。"}</>}</p> : <p>没有符合条件的照片。试试调整筛选，或清除素材 ID。</p>)}
      <nav className={styles.tools} aria-label="选片分页"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage + 1} / {pages} 页 · {filtered.length} 张匹配</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>
    </div>
    <footer className={styles.footer} inert={Boolean(enlarged)}><div><strong>已选 {picked.length} 张 · 新增 {additions.length} 张</strong><p>加入后仍需保存修改；不会发布。</p>{additions.length > remaining && <p role="alert">超过剩余容量，请减少选择。</p>}{error && <p role="alert">{error}</p>}</div><button className={styles.primary} type="button" disabled={!ready || !additions.length || additions.length > remaining || missing.length > 0} onClick={() => { try { onAdd(picked); } catch (cause) { setError(cause instanceof Error ? cause.message : "加入失败，草稿未改变。"); } }}>加入当前{noun}（{additions.length} 张）</button></footer>
    {enlarged && <div className={styles.enlarged}><button type="button" autoFocus onClick={closeEnlarged}>关闭放大照片</button><img src={enlarged.variants.full.src} alt={`素材 ${enlarged.id}`} /><p>{orientationName[enlarged.orientation]} · ID {enlarged.id}</p></div>}
  </dialog>;
}
