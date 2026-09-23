"use client";

/* eslint-disable @next/next/no-img-element -- local photo-library variants already supply bounded thumbnails. */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { assetToWork, parsePhotoLibraryManifest, type PhotoAsset } from "../../photo-library";
import type { Work } from "../../site-config";
import { albumRows, collectionCover, initialCollections, moveItem, uniqueAvailableAssetIds, type Collection } from "./collection-model";
import styles from "./collection-experience.module.css";

type Props = {
  isPreview: boolean;
  homeRequest: number;
  onOpenWork: (work: Work, scope?: readonly Work[]) => void;
  onBeforeViewChange?: () => void;
};

const hashPrefix = "#polaroid-collection-";
const defaultCollection = (): Collection => ({
  id: `preview-${crypto.randomUUID()}`,
  name: "新栏目",
  description: "",
  coverAssetId: null,
  coverFit: "natural",
  coverFocusX: 50,
  coverFocusY: 50,
  assetIds: [],
  style: "album",
  visible: true,
});

function assetLabel(asset: PhotoAsset, index: number) {
  const ratio = asset.aspectRatio > 1.05 ? "横幅" : asset.aspectRatio < .95 ? "竖幅" : "方幅";
  return `素材 ${String(index + 1).padStart(2, "0")} · ${ratio}`;
}

export default function CollectionExperience({ isPreview, homeRequest, onOpenWork, onBeforeViewChange }: Props) {
  const [collections, setCollections] = useState<Collection[]>(() => initialCollections.map((item) => ({ ...item, assetIds: [] })));
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [batch, setBatch] = useState(18);
  const coverRefs = useRef(new Map<string, HTMLButtonElement>());
  const galleryRef = useRef<HTMLDivElement>(null);
  const galleryScroll = useRef(new Map<string, number>());
  const homeScroll = useRef(0);
  const previousSelectionSignature = useRef<string | null>(null);
  const lastSelected = useRef<string | null>(null);
  const priorHomeRequest = useRef(homeRequest);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/photos/library-manifest.json", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => {
        const parsed = parsePhotoLibraryManifest(value);
        if (!parsed) { setLibraryError(true); return; }
        setAssets(parsed.assets);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setLibraryError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const visibleCollections = collections.filter((collection) => collection.visible);
  const selected = visibleCollections.find((collection) => collection.id === selectedId) ?? null;
  const selectedAssets = selected
    ? uniqueAvailableAssetIds(selected, new Set(assetMap.keys())).map((id) => assetMap.get(id)!).filter(Boolean)
    : [];
  const selectedWorks = selectedAssets.map((asset, index) => assetToWork(asset, index));
  const selectionSignature = selected ? `${selected.id}:${selectedAssets.map((asset) => asset.id).join(",")}` : null;

  useEffect(() => {
    if (previousSelectionSignature.current && selectionSignature && previousSelectionSignature.current !== selectionSignature) {
      onBeforeViewChange?.();
    }
    previousSelectionSignature.current = selectionSignature;
  }, [selectionSignature, onBeforeViewChange]);

  const updateCollection = useCallback((id: string, patch: Partial<Collection>) => {
    setCollections((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const openCollection = (id: string, push = true) => {
    if (!visibleCollections.some((item) => item.id === id)) return;
    homeScroll.current = window.scrollY;
    window.scrollTo({ top: 0, behavior: "instant" });
    setSelectedId(id);
    setBatch(18);
    if (push && !isPreview) window.history.pushState(null, "", `${hashPrefix}${id}`);
  };

  const returnHome = (push = true, restoreScene = true) => {
    onBeforeViewChange?.();
    setSelectedId(null);
    if (push && !isPreview) window.history.pushState(null, "", "#polaroid-top");
    window.requestAnimationFrame(() => {
      if (restoreScene) window.scrollTo({ top: homeScroll.current, behavior: "instant" });
      const id = lastSelected.current;
      if (id) coverRefs.current.get(id)?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    if (homeRequest === priorHomeRequest.current) return;
    priorHomeRequest.current = homeRequest;
    const frame = window.requestAnimationFrame(() => returnHome(false, false));
    return () => window.cancelAnimationFrame(frame);
  // The navigation request, rather than the callback identity, is the event source.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeRequest]);

  useEffect(() => {
    if (isPreview) return;
    const sync = (restoreFocus: boolean) => {
      const id = window.location.hash.startsWith(hashPrefix) ? window.location.hash.slice(hashPrefix.length) : null;
      setSelectedId(id && collections.some((item) => item.visible && item.id === id) ? id : null);
      if (restoreFocus && !id && lastSelected.current) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: homeScroll.current, behavior: "instant" });
          coverRefs.current.get(lastSelected.current!)?.focus({ preventScroll: true });
        });
      }
    };
    sync(false);
    const handleHistory = () => sync(true);
    window.addEventListener("popstate", handleHistory);
    window.addEventListener("hashchange", handleHistory);
    return () => { window.removeEventListener("popstate", handleHistory); window.removeEventListener("hashchange", handleHistory); };
  }, [collections, isPreview]);

  useEffect(() => {
    if (selectedId && !selected) {
      onBeforeViewChange?.();
      if (!isPreview && window.location.hash.startsWith(hashPrefix)) {
        window.history.replaceState(null, "", "#polaroid-top");
      }
      const frame = window.requestAnimationFrame(() => setSelectedId(null));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [onBeforeViewChange, selected, selectedId, isPreview]);

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: galleryScroll.current.get(selected.id) ?? 0, behavior: "instant" });
      galleryRef.current?.focus({ preventScroll: true });
    });
    const remember = () => galleryScroll.current.set(selected.id, window.scrollY);
    window.addEventListener("scroll", remember, { passive: true });
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", remember); };
  }, [selected]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !selected || document.querySelector(".lightbox")) return;
      event.preventDefault();
      returnHome();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const useTestGrouping = () => {
    // Preview-only sample assignment; these positions do not imply a real-photo classification.
    const groups: PhotoAsset[][] = [[], [], []];
    assets.forEach((asset, index) => groups[index % groups.length].push(asset));
    setCollections((current) => current.map((item, index) => ({
      ...item,
      assetIds: groups[index]?.map((asset) => asset.id) ?? item.assetIds,
      coverAssetId: groups[index]?.[Math.min(index * 5, (groups[index]?.length ?? 1) - 1)]?.id ?? item.coverAssetId,
    })));
  };

  return (
    <div className={styles.experience} data-collection-proof="local-only">
      {!selected && <div className={styles.identity}>
        <span>摄影作品 / 栏目</span>
        <h1 id="scene-title">作品星图</h1>
        <p>让每一组照片，都有自己的故事。选择一个栏目，走进完整的影像现场。</p>
      </div>}

      <section className={styles.proofPanel} aria-label="本地栏目验证配置">
        <button type="button" className={styles.panelToggle} onClick={() => setPanelOpen((value) => !value)} aria-expanded={panelOpen}>
          栏目验证配置 <span>{panelOpen ? "收起 −" : "展开 +"}</span>
        </button>
        {panelOpen && <div className={styles.panelBody}>
          <p>设计验证配置，仅当前预览有效，刷新后不保留。不会保存至后台或公开内容。</p>
          <div className={styles.panelActions}>
            <button type="button" onClick={() => setCollections((current) => [...current, defaultCollection()])}>＋ 添加栏目</button>
            <button type="button" onClick={useTestGrouping} disabled={assets.length === 0}>填入测试分组（非真实分类）</button>
          </div>
          {loading ? <p>读取本地素材库…</p> : libraryError ? <p role="status">本地素材库不可用；仍可检查空栏目状态。</p> : <p>可选素材 {assets.length} 张；栏目可重复引用同一素材，不复制文件。</p>}
          {collections.map((item, index) => <details key={item.id} className={styles.editor}>
            <summary>{String(index + 1).padStart(2, "0")} · {item.name || "未命名栏目"} · {item.assetIds.length} 张</summary>
            <div className={styles.editorBody}>
              <label>栏目名称<input value={item.name} onChange={(event) => updateCollection(item.id, { name: event.target.value })} maxLength={40} /></label>
              <label>简介<input value={item.description} onChange={(event) => updateCollection(item.id, { description: event.target.value })} maxLength={140} /></label>
              <label>展示方式<select value={item.style} onChange={(event) => updateCollection(item.id, { style: event.target.value as Collection["style"] })}><option value="album">横竖自适应画册</option><option value="portrait">竖向人像留白</option></select></label>
              <label>封面照片<select value={item.coverAssetId ?? ""} onChange={(event) => updateCollection(item.id, { coverAssetId: event.target.value || null })}><option value="">自动取本栏目首张</option>{assets.map((asset, assetIndex) => <option key={asset.id} value={asset.id}>{assetLabel(asset, assetIndex)}</option>)}</select></label>
              <label>封面显示<select value={item.coverFit} onChange={(event) => updateCollection(item.id, { coverFit: event.target.value as Collection["coverFit"] })}><option value="natural">完整显示</option><option value="fill">铺满裁切</option></select></label>
              {item.coverFit === "fill" && <div className={styles.focusControls}><label>水平焦点 {item.coverFocusX}%<input type="range" min="0" max="100" value={item.coverFocusX} onChange={(event) => updateCollection(item.id, { coverFocusX: Number(event.target.value) })} /></label><label>垂直焦点 {item.coverFocusY}%<input type="range" min="0" max="100" value={item.coverFocusY} onChange={(event) => updateCollection(item.id, { coverFocusY: Number(event.target.value) })} /></label></div>}
              <label className={styles.visibility}><input type="checkbox" checked={item.visible} onChange={(event) => updateCollection(item.id, { visible: event.target.checked })} /> 在首页显示</label>
              <div className={styles.panelActions}><button type="button" disabled={index === 0} onClick={() => setCollections((current) => moveItem(current, index, index - 1))}>上移</button><button type="button" disabled={index === collections.length - 1} onClick={() => setCollections((current) => moveItem(current, index, index + 1))}>下移</button><button type="button" onClick={() => setCollections((current) => current.filter((entry) => entry.id !== item.id))}>移除栏目</button></div>
              <fieldset className={styles.assetPicker}><legend>选择栏目照片并排序</legend>
                {assets.map((asset, assetIndex) => {
                  const position = item.assetIds.indexOf(asset.id);
                  return <div key={asset.id} className={styles.assetChoice}>
                    <label><input type="checkbox" checked={position !== -1} onChange={(event) => updateCollection(item.id, { assetIds: event.target.checked ? [...item.assetIds, asset.id] : item.assetIds.filter((id) => id !== asset.id) })} /><img src={asset.variants.thumbnail.src} width={50} height={50} alt="" loading="lazy" />{assetLabel(asset, assetIndex)}</label>
                    {position !== -1 && <span><button type="button" aria-label={`${assetLabel(asset, assetIndex)}上移`} disabled={position === 0} onClick={() => updateCollection(item.id, { assetIds: moveItem(item.assetIds, position, position - 1) })}>↑</button><button type="button" aria-label={`${assetLabel(asset, assetIndex)}下移`} disabled={position === item.assetIds.length - 1} onClick={() => updateCollection(item.id, { assetIds: moveItem(item.assetIds, position, position + 1) })}>↓</button></span>}
                  </div>;
                })}
              </fieldset>
            </div>
          </details>)}
        </div>}
      </section>

      {!selected ? <section className={styles.home} aria-label="作品栏目">
        <div className={styles.heading}><span>01 / 作品星图</span><h2>从这里，走进我的影像。</h2><p>{visibleCollections.length} 个栏目</p></div>
        {visibleCollections.length === 0 ? <p className={styles.empty}>还没有公开栏目。展开上方配置，添加或显示一个栏目。</p> : <div className={styles.constellation} data-count={visibleCollections.length}>
          {visibleCollections.map((item, index) => {
            const cover = collectionCover(item, assetMap);
            const count = uniqueAvailableAssetIds(item, new Set(assetMap.keys())).length;
            return <button type="button" key={item.id} ref={(node) => { if (node) coverRefs.current.set(item.id, node); else coverRefs.current.delete(item.id); }} className={styles.cover} data-index={index % 8} onClick={() => { lastSelected.current = item.id; openCollection(item.id); }} aria-label={`进入栏目 ${item.name || "未命名栏目"}，${count} 张照片`}>
              <span className={styles.coverPhoto} data-fit={item.coverFit} style={{ aspectRatio: item.coverFit === "fill" ? "4 / 3" : cover ? String(cover.aspectRatio) : undefined }}>
                {cover ? <img src={cover.variants.card.src} width={cover.variants.card.width} height={cover.variants.card.height} alt="" loading={index < 3 ? "eager" : "lazy"} style={{ objectPosition: `${item.coverFocusX}% ${item.coverFocusY}%` }} /> : <span className={styles.coverEmpty}>为这个栏目选择封面照片</span>}
              </span>
              <span className={styles.coverCaption}><small>COLLECTION {String(index + 1).padStart(2, "0")} / {count} 张照片</small><strong>{item.name || "未命名栏目"}</strong><span>{item.description || "打开栏目，查看完整影像"}</span><em>走进栏目 ↗</em></span>
            </button>;
          })}
        </div>}
      </section> : <section className={styles.gallery} ref={galleryRef} tabIndex={-1} aria-label={`${selected.name}栏目作品`}>
        <div className={styles.galleryHeading}><button type="button" onClick={() => returnHome()}>← 返回作品星图</button><span>{selectedAssets.length} 张照片</span></div>
        <h2>{selected.name || "未命名栏目"}</h2><p>{selected.description || "这一组影像，值得慢慢看。"}</p>
        {selectedAssets.length === 0 ? <p className={styles.empty}>这个栏目还没有照片。可以在上方配置中选择素材。</p> : selected.style === "portrait"
          ? <div className={styles.portraitList}>{selectedAssets.slice(0, batch).map((asset, index) => <GalleryPhoto key={asset.id} asset={asset} index={index} onClick={() => onOpenWork(selectedWorks[index], selectedWorks)} />)}</div>
          : <div className={styles.album}>{albumRows(selectedAssets.slice(0, batch)).map((row, rowIndex) => <div className={styles.albumRow} key={`${rowIndex}-${row[0].id}`} style={{ "--row-ratio": String(row.reduce((sum, asset) => sum + asset.aspectRatio, 0)) } as CSSProperties}>{row.map((asset) => {
            const index = selectedAssets.indexOf(asset);
            return <GalleryPhoto key={asset.id} asset={asset} index={index} onClick={() => onOpenWork(selectedWorks[index], selectedWorks)} />;
          })}</div>)}</div>}
        {batch < selectedAssets.length && <button type="button" className={styles.more} onClick={() => setBatch((current) => current + 18)}>继续看照片 · 已显示 {batch} / {selectedAssets.length}</button>}
      </section>}
    </div>
  );
}

function GalleryPhoto({ asset, index, onClick }: { asset: PhotoAsset; index: number; onClick: () => void }) {
  return <button type="button" className={styles.galleryPhoto} onClick={onClick} aria-label={`查看第 ${index + 1} 张照片`} style={{ flexGrow: asset.aspectRatio, aspectRatio: String(asset.aspectRatio) }}>
    <img src={asset.variants.card.src} srcSet={`${asset.variants.thumbnail.src} ${asset.variants.thumbnail.width}w, ${asset.variants.card.src} ${asset.variants.card.width}w`} sizes="(max-width: 600px) 92vw, 40vw" width={asset.variants.card.width} height={asset.variants.card.height} alt={`栏目照片 ${index + 1}`} loading={index < 4 ? "eager" : "lazy"} decoding="async" />
    <span>{String(index + 1).padStart(2, "0")}</span>
  </button>;
}
