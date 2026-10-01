"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated Site-owned thumbnail variants. */
import { useState } from "react";
import type { SiteAsset } from "./assets-client";
import type { FlowGroup } from "./flow-gallery-state";
import { compareSiteAssetTimes, siteAssetTimeLabel } from "./asset-metadata";
import styles from "./flow-gallery-admin.module.css";

export type PhotoOrientation = "all" | "portrait" | "landscape" | "square";
export type PhotoOrder = "recent" | "oldest";
const orientationNames = { portrait: "竖幅", landscape: "横幅", square: "方幅" };
export function filterFlowPhotos(assets: readonly SiteAsset[], query: string, orientation: PhotoOrientation, order: PhotoOrder) {
  return assets.filter(asset => asset.id.includes(query.trim().toLowerCase()) && (orientation === "all" || asset.orientation === orientation)).sort((a, b) => compareSiteAssetTimes(a, b, order));
}
export function PhotoFilters({ query, orientation, order, onQuery, onOrientation, onOrder }: { query: string; orientation: PhotoOrientation; order: PhotoOrder; onQuery: (value: string) => void; onOrientation: (value: PhotoOrientation) => void; onOrder: (value: PhotoOrder) => void }) {
  return <div className={styles.photoFilters}><label>画幅<select value={orientation} onChange={event => onOrientation(event.target.value as PhotoOrientation)}><option value="all">全部画幅</option><option value="portrait">竖幅</option><option value="landscape">横幅</option><option value="square">方幅</option></select></label><label>加入本站时间<select value={order} onChange={event => onOrder(event.target.value as PhotoOrder)}><option value="recent">最近加入优先</option><option value="oldest">最早加入优先</option></select></label><label>素材 ID（可选）<input value={query} placeholder="粘贴已知素材 ID" onChange={event => onQuery(event.target.value)} /></label></div>;
}
export function PhotoMetadata({ asset }: { asset: SiteAsset }) {
  return <><small>{orientationNames[asset.orientation]} · {asset.variants.full.width} × {asset.variants.full.height}</small><details className={styles.photoMetadata}><summary>素材信息</summary><small>{siteAssetTimeLabel(asset.createdAt)}</small><small>ID：{asset.id}</small></details></>;
}
export function PhotoCaptionEditor({ group, assets, onCaption, onRemove, onView }: { group: FlowGroup; assets: ReadonlyMap<string, SiteAsset>; onCaption: (id: string, caption: string) => void; onRemove: (id: string) => void; onView: (id: string) => void }) {
  const [selected, setSelected] = useState(group.assetIds[0] ?? "");
  const id = group.assetIds.includes(selected) ? selected : group.assetIds[0];
  if (!id) return <p>选片后可在这里填写照片说明。</p>;
  const asset = assets.get(id), index = group.assetIds.indexOf(id);
  return <section id={`flow-caption-${group.id}`} tabIndex={-1} className={styles.captionEditor} aria-label="当前照片说明"><h3>照片说明与移除</h3><p>说明显示在完整作品的照片预览中。选择一张就地编辑，移出分类保留图库原片。</p><label>选择要编辑的照片<select value={id} onChange={event => setSelected(event.target.value)}>{group.assetIds.map((photo, number) => <option key={photo} value={photo}>第 {number + 1} 张{group.captions[photo] ? ` · ${group.captions[photo].slice(0, 40)}` : " · 未填写说明"}</option>)}</select></label><div className={styles.captionPhoto}>{asset ? <button type="button" aria-label={`查看第 ${index + 1} 张大图`} onClick={() => onView(id)}><img src={asset.variants.thumbnail.src} alt={`第 ${index + 1} 张`} /></button> : <p role="alert">这张素材暂不可用，请重新读取图库。</p>}<label>第 {index + 1} 张照片说明<textarea rows={3} maxLength={2000} value={group.captions[id] ?? ""} onChange={event => onCaption(id, event.target.value)} /></label></div><button type="button" onClick={() => onRemove(id)}>移出当前照片</button></section>;
}
export function focusFlowEntry(id: string) {
  const target = document.getElementById(id);
  const details = target?.querySelector("details"); if (details) details.open = true;
  target?.scrollIntoView({ block: "center", behavior: "auto" }); target?.focus({ preventScroll: true });
}
