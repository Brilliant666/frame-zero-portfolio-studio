"use client";

import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Collection } from "../templates/polaroid-field/collection-model";
import { COMPOSER_MODES, type ComposerMode } from "../templates/polaroid-field/composer-view";
import type { SceneCard } from "../templates/polaroid-field/collection-scene";
import type { SiteAsset } from "../site-editor/assets-client";
import styles from "./collection-live-preview.module.css";

const ComposerScene = lazy(() => import("../templates/polaroid-field/composer-scene"));

type Props = {
  collection: Collection;
  assets: readonly SiteAsset[];
  onView: (asset: SiteAsset) => void;
  active?: boolean;
};

/** Reads the current draft only. Display preferences remain local to this mount. */
export default function CollectionLivePreview({ collection, assets, onView, active = true }: Props) {
  const [mode, setMode] = useState<ComposerMode>("constellation");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 520 });
  useLayoutEffect(() => {
    const host = viewport.current, content = canvas.current;
    if (!host || !content) return;
    const measure = () => setDimensions(previous => {
      const next = { width: host.clientWidth, height: content.offsetHeight };
      return previous.width === next.width && previous.height === next.height ? previous : next;
    });
    const observer = new ResizeObserver(measure);
    observer.observe(host); observer.observe(content); measure();
    return () => observer.disconnect();
  }, []);
  const logicalWidth = device === "desktop" ? 960 : 390;
  const scale = dimensions.width > 0 ? Math.min(1, dimensions.width / logicalWidth) : 1;
  const scaledHeight = dimensions.height * scale;
  const [theme, setTheme] = useState<"paper" | "night">("paper");
  const [unavailable, setUnavailable] = useState<ReadonlyMap<string, string>>(() => new Map());
  const assetMap = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets]);
  const cards = useMemo<SceneCard[]>(() => collection.assetIds.flatMap((id, index) => {
    const asset = assetMap.get(id);
    if (!asset || unavailable.get(id) === asset.variants.full.src) return [];
    return [{ id, asset, title: `${String(index + 1).padStart(2, "0")} / ${collection.name}`, subtitle: "查看完整影像" }];
  }), [collection.assetIds, collection.name, assetMap, unavailable]);
  const missing = collection.assetIds.length - cards.length;
  return <section className={styles.preview} aria-label="当前图集即时效果" data-star-theme={theme}>
    <div className={styles.toolbar}>
      <div><h3>当前编辑 · 即时效果</h3><p>按当前照片顺序展示；此处不保存或发布。构图和主题仅用于查看。</p></div>
      <button type="button" onClick={() => setTheme(value => value === "paper" ? "night" : "paper")}>{theme === "paper" ? "切换到夜空" : "切换到纸面"}</button>
    </div>
    <div className={styles.device} role="group" aria-label="即时效果查看尺寸">
      <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>桌面</button>
      <button type="button" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}>手机</button>
      <span>{device === "desktop" ? "960px 桌面构图 · 按容器缩放" : "390px 手机自然排版 · 可滚动"}</span>
    </div>
    <div className={styles.device} role="group" aria-label="即时效果构图">
      {COMPOSER_MODES.map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "constellation" ? "星座" : value === "scatter" ? "散落" : "跨页"}</button>)}
    </div>
    {!collection.visible && <p className={styles.notice}>此图集当前隐藏；仍可在这里检查编辑效果。</p>}
    {missing > 0 && <p className={styles.notice} role="status">{missing} 张照片暂不可用，草稿中的引用和顺序保留。</p>}
    <div ref={viewport} className={styles.viewport} data-preview-device={device} style={{ height: Math.min(520, scaledHeight) }}>
      <div className={styles.scaledSpace} style={{ height: scaledHeight }}>
        <div ref={canvas} className={styles.canvas} style={{ width: logicalWidth, transform: `scale(${scale})` }}>
    {collection.assetIds.length === 0 ? <p className={styles.notice}>加入照片后，这里会立即显示图集效果。</p> : <Suspense fallback={<p className={styles.notice} role="status">正在加载图集效果…</p>}>
      <ComposerScene key={collection.id} cards={cards} sceneId={collection.id} title={collection.name} description={collection.description}
        active={active} editorEmbedded editorMode={mode} focusId={collection.focusAssetId} coverId={collection.coverAssetId}
        onBack={() => {}} onOpen={id => { const asset = assetMap.get(id); if (active && asset) onView(asset); }}
        onAssetUnavailable={id => { const asset = assetMap.get(id); if (asset) setUnavailable(previous => new Map(previous).set(id, asset.variants.full.src)); }} />
    </Suspense>}
        </div>
      </div>
    </div>
  </section>;
}
