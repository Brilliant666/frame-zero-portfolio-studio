"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated Site-owned thumbnail variants. */
import { useState } from "react";
import type { SiteAsset } from "./assets-client";
import type { FlowGroup } from "./flow-gallery-state";
import { compareSiteAssetTimes, siteAssetTimeLabel } from "./asset-metadata";
import { flowPhotoName } from "./flow-gallery-photo-names";
import styles from "./flow-gallery-admin.module.css";
import { Select } from "../admin-kit/select";

export type PhotoOrientation = "all" | "portrait" | "landscape" | "square";
export type PhotoOrder = "recent" | "oldest";
const orientationNames = { portrait: "竖幅", landscape: "横幅", square: "方幅" };
const ORIENTATION_OPTIONS = [{ value: "all", label: "全部画幅" }, { value: "portrait", label: "竖幅" }, { value: "landscape", label: "横幅" }, { value: "square", label: "方幅" }] as const satisfies readonly { value: PhotoOrientation; label: string }[];
const ORDER_OPTIONS = [{ value: "recent", label: "最近加入优先" }, { value: "oldest", label: "最早加入优先" }] as const satisfies readonly { value: PhotoOrder; label: string }[];
export function filterFlowPhotos(assets: readonly SiteAsset[], query: string, orientation: PhotoOrientation, order: PhotoOrder) {
  return assets.filter(asset => asset.id.includes(query.trim().toLowerCase()) && (orientation === "all" || asset.orientation === orientation)).sort((a, b) => compareSiteAssetTimes(a, b, order));
}
export function PhotoFilters({ query, orientation, order, onQuery, onOrientation, onOrder, compactId }: { query: string; orientation: PhotoOrientation; order: PhotoOrder; onQuery: (value: string) => void; onOrientation: (value: PhotoOrientation) => void; onOrder: (value: PhotoOrder) => void; compactId?: boolean }) {
  const idFilter = <label>素材 ID（可选）<input value={query} placeholder="粘贴已知素材 ID" onChange={event => onQuery(event.target.value)} /></label>;
  return <div className={styles.photoFilters}><label>画幅<Select label="画幅" value={orientation} onChange={onOrientation} options={ORIENTATION_OPTIONS} /></label><label>加入本站时间<Select label="加入本站时间" value={order} onChange={onOrder} options={ORDER_OPTIONS} /></label>{compactId ? <details className={styles.idFilter} open={Boolean(query)}><summary>按素材 ID 查找{query ? " · 正在筛选" : ""}</summary>{idFilter}</details> : idFilter}</div>;
}
export function PhotoMetadata({ asset }: { asset: SiteAsset }) {
  return <><small>{orientationNames[asset.orientation]} · {asset.variants.full.width} × {asset.variants.full.height}</small><small className={styles.photoTime}>{siteAssetTimeLabel(asset.createdAt)}</small><details className={styles.photoMetadata}><summary>素材信息</summary><small>ID：{asset.id}</small></details></>;
}
export function PhotoCaptionEditor({ group, assets, onCaption, onRemove, onView }: { group: FlowGroup; assets: ReadonlyMap<string, SiteAsset>; onCaption: (id: string, caption: string) => void; onRemove: (id: string) => void; onView: (id: string) => void }) {
  const [selected, setSelected] = useState(group.assetIds[0] ?? "");
  const id = group.assetIds.includes(selected) ? selected : group.assetIds[0];
  if (!id) return <p>选片后可在这里填写照片说明。</p>;
  const asset = assets.get(id), index = group.assetIds.indexOf(id);
  const photoName = flowPhotoName(group.name, index, group.captions[id]);
  return <section id={`flow-caption-${group.id}`} tabIndex={-1} className={styles.captionEditor} aria-label="当前照片说明"><h3>照片说明与移除</h3><p>说明显示在完整作品的照片预览中。选择一张就地编辑，移出分类保留图库原片。</p><label>选择要编辑的照片<Select label="选择要编辑的照片" value={id} onChange={setSelected} minWidth={300} options={group.assetIds.map((photo, number) => ({ value: photo, label: `第 ${number + 1} 张`, description: group.captions[photo] ? group.captions[photo].slice(0, 40) : "未填写说明", thumb: assets.get(photo)?.variants.thumbnail.src }))} /></label><div className={styles.captionPhoto}>{asset ? <button type="button" aria-label={`查看大图：${photoName}`} onClick={() => onView(id)}><img src={asset.variants.thumbnail.src} alt={photoName} /></button> : <p role="alert">这张素材暂不可用，请重新读取图库。</p>}<label>第 {index + 1} 张照片说明<textarea rows={3} maxLength={2000} value={group.captions[id] ?? ""} onChange={event => onCaption(id, event.target.value)} /></label></div><button type="button" onClick={() => onRemove(id)}>移出当前照片</button></section>;
}
export function focusFlowEntry(id: string) {
  const target = document.getElementById(id);
  const details = target?.querySelector("details"); if (details) details.open = true;
  target?.scrollIntoView({ block: "center", behavior: "auto" }); target?.focus({ preventScroll: true });
}
