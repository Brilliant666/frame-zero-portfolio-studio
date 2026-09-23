"use client";

/* eslint-disable @next/next/no-img-element -- local photo-library thumbnail variants. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetToWork, parsePhotoLibraryManifest, type PhotoAsset } from "../../photo-library";
import type { TemplateProps } from "../types";
import { collectionCover, initialCollections, moveItem, uniqueAvailableAssetIds, type Collection } from "./collection-model";
import CollectionScene, { type SceneCard } from "./collection-scene";
import type { ViewState } from "./viewport-fit";
import styles from "./collection.module.css";

type Props = Pick<TemplateProps, "content" | "onOpenWork" | "onBeforeViewChange" | "isPreview"> & {
  homeRequest: number; isActive: boolean; savedCollections?: readonly Collection[]; initialCollectionId?: string;
};
const hashPrefix = "#polaroid-collection-";
const cameraKey = (id: string) => `${id}:${window.innerWidth < 600 ? "mobile" : "desktop"}`;
const assetLabel = (asset: PhotoAsset, index: number) => `素材 ${String(index + 1).padStart(2, "0")} · ${asset.aspectRatio > 1.05 ? "横幅" : asset.aspectRatio < .95 ? "竖幅" : "方幅"}`;

export default function CollectionExperience({ content, isPreview, homeRequest, isActive, savedCollections, initialCollectionId, onOpenWork, onBeforeViewChange }: Props) {
  const [collections, setCollections] = useState<Collection[]>(() => savedCollections ? structuredClone([...savedCollections]) : initialCollections.map((item) => ({ ...item, assetIds: [] })));
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [libraryState, setLibraryState] = useState("读取本地素材库…");
  const [libraryError, setLibraryError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialCollectionId ?? null);
  const [panelOpen, setPanelOpen] = useState(false);
  const cameras = useRef(new Map<string, ViewState>());
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [restoredView, setRestoredView] = useState<ViewState | undefined>();
  const priorHomeRequest = useRef(homeRequest);
  const scrollPositions = useRef(new Map<string, number>());
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const visible = useMemo(() => collections.filter((item) => item.visible), [collections]);
  const selected = visible.find((item) => item.id === selectedId) ?? null;
  const selectedAssets = useMemo(() => selected ? uniqueAvailableAssetIds(selected, new Set(assetMap.keys())).map((id) => assetMap.get(id)!) : [], [assetMap, selected]);
  const works = useMemo(() => selectedAssets.map((asset) => {
    const work = assetToWork(asset, 0);
    delete work.slotIndex;
    return { ...work, title: "照片", subtitle: "" };
  }), [selectedAssets]);
  const sceneId = selected?.id ?? "home";
  useEffect(() => {
    if (!isActive) return;
    const remember = () => scrollPositions.current.set(cameraKey(sceneId), window.scrollY);
    addEventListener("scroll", remember, { passive: true });
    return () => removeEventListener("scroll", remember);
  }, [isActive, sceneId]);
  const rememberCamera = useCallback((view: ViewState) => { cameras.current.set(cameraKey(sceneId), view); }, [sceneId]);
  const cards = useMemo<SceneCard[]>(() => selected ? selectedAssets.map((asset, index) => ({
    id: asset.id, asset, title: `${String(index + 1).padStart(2, "0")} / ${selected.name}`, subtitle: "查看完整影像",
  })) : visible.map((item) => ({ id: item.id, asset: collectionCover(item, assetMap), title: item.name || "未命名图集",
    subtitle: `${uniqueAvailableAssetIds(item, new Set(assetMap.keys())).length} 张照片`, fit: item.coverFit, focusX: item.coverFocusX, focusY: item.coverFocusY,
  })), [selected, selectedAssets, visible, assetMap]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/photos/library-manifest.json", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => {
        const parsed = parsePhotoLibraryManifest(value);
        if (!parsed) { setLibraryState("本地素材库暂时不可用。已保存的图集引用仍保留，请稍后刷新重试。"); setLibraryError(true); return; }
        setAssets(parsed.assets); setLibraryState(`可选素材 ${parsed.assets.length} 张；引用同一素材不会复制文件。`);
      }).catch(() => { if (!controller.signal.aborted) { setLibraryState("本地素材库暂时不可用。已保存的图集引用仍保留，请稍后刷新重试。"); setLibraryError(true); } });
    return () => controller.abort();
  }, []);

  const returnHome = useCallback((push = true) => {
    const scrollTop = scrollPositions.current.get(cameraKey("home")) ?? 0;
    onBeforeViewChange?.(); setRestoredView(cameras.current.get(cameraKey("home"))); setSelectedId(null);
    if (push && !isPreview) window.history.pushState(null, "", "#polaroid-top");
    requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "instant" }));
  }, [isPreview, onBeforeViewChange]);
  useEffect(() => {
    if (homeRequest === priorHomeRequest.current) return;
    priorHomeRequest.current = homeRequest;
    const frame = requestAnimationFrame(() => returnHome(false));
    return () => cancelAnimationFrame(frame);
  }, [homeRequest, returnHome]);
  useEffect(() => {
    if (isPreview) return;
    const sync = () => {
      const id = location.hash.startsWith(hashPrefix) ? location.hash.slice(hashPrefix.length) : null;
      const next = visible.some((item) => item.id === id) ? id : null;
      const scrollTop = scrollPositions.current.get(cameraKey(next ?? "home")) ?? 0;
      onBeforeViewChange?.(); setRestoredView(cameras.current.get(cameraKey(next ?? "home"))); setSelectedId(next);
      requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "instant" }));
      if (id && !next) history.replaceState(null, "", "#polaroid-top");
    };
    sync(); addEventListener("popstate", sync); addEventListener("hashchange", sync);
    return () => { removeEventListener("popstate", sync); removeEventListener("hashchange", sync); };
  }, [isPreview, visible, onBeforeViewChange]);
  useEffect(() => {
    if (!selectedId || selected) return;
    const frame = requestAnimationFrame(() => returnHome(false));
    return () => cancelAnimationFrame(frame);
  }, [selected, selectedId, returnHome]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (!isActive || event.key !== "Escape" || document.querySelector(".lightbox")) return;
      if (panelOpen) { event.preventDefault(); setPanelOpen(false); }
      else if (selected) { event.preventDefault(); returnHome(); }
    };
    addEventListener("keydown", escape);
    return () => removeEventListener("keydown", escape);
  }, [isActive, panelOpen, selected, returnHome]);
  const update = (id: string, patch: Partial<Collection>) => {
    onBeforeViewChange?.();
    setCollections((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const openCard = (id: string) => {
    if (selected) {
      const index = selectedAssets.findIndex((asset) => asset.id === id);
      if (index >= 0) onOpenWork(works[index], works);
    } else {
      const scrollTop = scrollPositions.current.get(cameraKey(id)) ?? 0;
      scrollPositions.current.set(cameraKey("home"), window.scrollY); setLastSelected(id); setRestoredView(cameras.current.get(cameraKey(id)));
      setSelectedId(id);
      requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "instant" }));
      if (!isPreview) history.pushState(null, "", `${hashPrefix}${id}`);
    }
  };

  return <div className={styles.experience} data-collection-proof={savedCollections ? undefined : "local-only"}>
    {libraryError && <p role="alert">{libraryState}</p>}
    <CollectionScene key={`${sceneId}${savedCollections && selected ? cards.length ? ":photos" : ":empty" : ""}`} cards={cards} sceneId={sceneId} content={content} title={selected?.name} description={selected?.description}
      composedPhotos={!!savedCollections && !!selected}
      readOnly={!!savedCollections} onAssetUnavailable={(id) => setAssets((current) => current.filter((asset) => asset.id !== id))}
      focusId={selected?.focusAssetId} initialView={restoredView} onViewChange={rememberCamera} onOpen={openCard}
      onBack={selected ? () => returnHome() : undefined} restoreFocusId={selected ? null : lastSelected} />
    {process.env.NODE_ENV === "development" && !savedCollections && <button type="button" className={styles.configure} aria-expanded={panelOpen} onClick={() => setPanelOpen((value) => !value)}>临时配置 {panelOpen ? "×" : "⚙"}</button>}
    {process.env.NODE_ENV === "development" && !savedCollections && panelOpen && <section className={styles.panel} aria-label="图集临时配置">
      <div className={styles.panelHeader}><strong>图集临时配置</strong><button type="button" onClick={() => setPanelOpen(false)}>关闭配置 ×</button></div>
      <p>设计验证配置，仅当前预览有效，刷新后不保留。</p><p>{libraryState}</p>
      <div className={styles.panelActions}>
        <button type="button" onClick={() => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(new Blob([JSON.stringify({ collections }, null, 2)], { type: "application/json" }));
          link.download = "polaroid-collections-recovery.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }}>导出当前临时图集（供新版导入）</button>
        <button type="button" onClick={() => setCollections((current) => [...current, { ...initialCollections[0], id: `preview-${crypto.randomUUID()}`, name: "新图集", assetIds: [] }])}>＋ 添加图集</button>
        <button type="button" disabled={!assets.length} onClick={() => setCollections((current) => current.map((item, index) => ({ ...item,
          assetIds: assets.filter((_, assetIndex) => assetIndex % 3 === index).map((asset) => asset.id), coverAssetId: assets[index]?.id ?? null,
        })))}>填入测试分组（非真实分类）</button>
      </div>
      {collections.map((item, index) => <details key={item.id} className={styles.editor}>
        <summary>{index + 1} · {item.name || "未命名图集"} · {item.assetIds.length} 张</summary>
        <div className={styles.editorBody}>
          <label>图集名称<input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} maxLength={40} /></label>
          <label>简介<input value={item.description} onChange={(event) => update(item.id, { description: event.target.value })} maxLength={140} /></label>
          <label>封面照片<select value={item.coverAssetId ?? ""} onChange={(event) => update(item.id, { coverAssetId: event.target.value || null })}><option value="">自动取本图集首张</option>{assets.map((asset, i) => <option key={asset.id} value={asset.id}>{assetLabel(asset, i)}</option>)}</select></label>
          <label>封面显示<select value={item.coverFit} onChange={(event) => update(item.id, { coverFit: event.target.value as Collection["coverFit"] })}><option value="natural">完整显示</option><option value="fill">铺满裁切</option></select></label>
          {item.coverFit === "fill" && <div className={styles.focusControls}><label>水平焦点 {item.coverFocusX}%<input type="range" min="0" max="100" value={item.coverFocusX} onChange={(event) => update(item.id, { coverFocusX: Number(event.target.value) })} /></label><label>垂直焦点 {item.coverFocusY}%<input type="range" min="0" max="100" value={item.coverFocusY} onChange={(event) => update(item.id, { coverFocusY: Number(event.target.value) })} /></label></div>}
          <label>重点照片<select value={item.focusAssetId ?? ""} onChange={(event) => update(item.id, { focusAssetId: event.target.value || null })}><option value="">按图集顺序使用第一张</option>{item.assetIds.map((id) => assetMap.get(id)).filter((asset): asset is PhotoAsset => !!asset).map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset, assets.indexOf(asset))}</option>)}</select></label>
          <label><input type="checkbox" checked={item.visible} onChange={(event) => update(item.id, { visible: event.target.checked })} /> 在首页显示</label>
          <div className={styles.panelActions}><button type="button" disabled={!index} onClick={() => setCollections((current) => moveItem(current, index, index - 1))}>上移</button><button type="button" disabled={index === collections.length - 1} onClick={() => setCollections((current) => moveItem(current, index, index + 1))}>下移</button><button type="button" onClick={() => setCollections((current) => current.filter((entry) => entry.id !== item.id))}>移除图集</button></div>
          <fieldset className={styles.assetPicker}><legend>选择图集照片并排序</legend>{assets.map((asset, i) => {
            const position = item.assetIds.indexOf(asset.id);
            return <div key={asset.id} className={styles.assetChoice}><label><input type="checkbox" checked={position !== -1} onChange={(event) => update(item.id, { assetIds: event.target.checked ? [...item.assetIds, asset.id] : item.assetIds.filter((id) => id !== asset.id) })} /><img src={asset.variants.thumbnail.src} width={48} height={48} alt="" loading="lazy" />{assetLabel(asset, i)}</label>
              {position !== -1 && <span><button type="button" aria-label={`${assetLabel(asset, i)}上移`} disabled={!position} onClick={() => update(item.id, { assetIds: moveItem(item.assetIds, position, position - 1) })}>↑</button><button type="button" aria-label={`${assetLabel(asset, i)}下移`} disabled={position === item.assetIds.length - 1} onClick={() => update(item.id, { assetIds: moveItem(item.assetIds, position, position + 1) })}>↓</button></span>}</div>;
          })}</fieldset>
        </div>
      </details>)}
    </section>}
  </div>;
}
