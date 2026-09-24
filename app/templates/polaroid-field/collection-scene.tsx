"use client";

/* eslint-disable @next/next/no-img-element -- bounded local photo variants. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PhotoAsset } from "../../photo-library";
import type { TemplateProps } from "../types";
import { buildCollectionLayout } from "./collection-layout";
import { buildCollectionPhotoComposition } from "./collection-photo-composition";
import { useConstellationViewport } from "./use-constellation-viewport";
import type { ViewState } from "./viewport-fit";
import field from "./field.module.css";
import styles from "./scene.module.css";

export type SceneCard = {
  id: string; asset: PhotoAsset | null; title: string; subtitle: string;
  fit?: "natural" | "fill"; focusX?: number; focusY?: number;
};
type Props = {
  cards: readonly SceneCard[]; sceneId: string; title?: string; description?: string;
  content: TemplateProps["content"]; focusId?: string | null;
  initialView?: ViewState; onViewChange: (view: ViewState) => void;
  onOpen: (id: string) => void; onBack?: () => void; restoreFocusId?: string | null;
  readOnly?: boolean; onAssetUnavailable?: (id: string) => void;
  composedPhotos?: boolean;
};

export default function CollectionScene({ cards, sceneId, title, description, content, focusId, initialView, onViewChange, onOpen, onBack, restoreFocusId, readOnly, onAssetUnavailable, composedPhotos = false }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => typeof window === "undefined" ? 1280 : window.innerWidth);
  const [navigationHeight, setNavigationHeight] = useState(80);
  const isHome = !onBack;
  const composed = composedPhotos && !isHome;
  const compact = width < (readOnly ? 768 : 600);
  const previousCompact = useRef(compact);
  useEffect(() => {
    const element = readOnly ? shellRef.current : viewportRef.current;
    if (!element) return;
    const navigation = readOnly ? element.closest(`.${field.shell}`)?.querySelector("header") : null;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0) setWidth(element.clientWidth);
      if (navigation instanceof HTMLElement && navigation.offsetHeight > 0) setNavigationHeight(navigation.offsetHeight);
    });
    observer.observe(element);
    if (navigation) observer.observe(navigation);
    return () => observer.disconnect();
  }, [readOnly]);
  const layout = useMemo(() => (composed || (readOnly && compact) ? buildCollectionPhotoComposition : buildCollectionLayout)(cards.map((card) => ({
    id: card.id, aspectRatio: card.fit === "fill" ? 4 / 3 : card.asset?.aspectRatio ?? 4 / 3,
  })), { kind: isHome ? "covers" : "photos", focusId, viewportWidth: width, captionExtra: readOnly && isHome ? 40 : 0 }), [cards, focusId, isHome, width, composed, readOnly, compact]);
  const getFocusIndex = useCallback(() => Math.max(0, cards.findIndex((card) => card.id === layout.focusId)), [cards, layout.focusId]);
  const camera = useConstellationViewport({
    viewportRef, canvasRef, layoutKey: layout, getFocusIndex,
    initialMode: "overview",
    mobileEnabled: true, enabled: !(readOnly && compact), decorationMargin: readOnly ? 24 : 0,
    reserveLeft: isHome && width > 800 ? 360 : 0, initialView, onViewChange,
  });
  const { showOverview } = camera;
  const overviewLabel = camera.sceneMode === "overview" ? "返回首页构图" : "查看全部图集";
  useEffect(() => {
    if (previousCompact.current === compact) return;
    previousCompact.current = compact;
    showOverview();
  }, [compact, showOverview]);
  useEffect(() => {
    if (!restoreFocusId) return;
    const frame = requestAnimationFrame(() => {
      const card = Array.from(canvasRef.current?.querySelectorAll<HTMLButtonElement>("[data-card-id]") ?? []).find((node) => node.dataset.cardId === restoreFocusId);
      card?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [restoreFocusId]);

  const photoHeading = <><button type="button" onClick={onBack}>← 返回图集首页</button>
    <div><strong>{title}</strong><span>{cards.length} 张照片{description ? ` · ${description}` : ""}</span></div></>;
  const identity = <div className={`${field.sceneIdentity} ${styles.identity}`}>
    {(readOnly ? content.hero.eyebrow : content.profile.photographer) && <small>{readOnly ? content.hero.eyebrow : `${content.profile.photographer} · 摄影作品`}</small>}
    <h1>{content.profile.photographer}{(!readOnly || content.hero.title) && <span>{readOnly ? content.hero.title : "漂浮拍立得星图"}</span>}</h1>
    {content.profile.intro && <p>{content.profile.intro}</p>}
    {[content.profile.role, content.hero.services].filter(Boolean).length > 0 && <p>{[content.profile.role, content.hero.services].filter(Boolean).join(" · ")}</p>}
    {readOnly && content.profile.city && <p>{content.profile.city}</p>}
  </div>;
  const controls = <div className={`${field.fieldControls} ${styles.controls}`} data-field-controls aria-label="星图浏览控制">
    <button type="button" onClick={() => camera.panBy(120, 0)} aria-label="向左浏览">←</button>
    <button type="button" onClick={() => camera.panBy(-120, 0)} aria-label="向右浏览">→</button>
    <button type="button" onClick={() => camera.panBy(0, 120)} aria-label="向上浏览">↑</button>
    <button type="button" onClick={() => camera.panBy(0, -120)} aria-label="向下浏览">↓</button>
    <button type="button" onClick={() => camera.zoomBy(-.12)} aria-label="缩小星图">−</button>
    <span>{Math.round(camera.view.scale * 100)}%</span>
    <button type="button" onClick={() => camera.zoomBy(.12)} aria-label="放大星图">+</button>
    <button type="button" onClick={camera.showOverview} aria-label="完整显示星图">FIT</button>
  </div>;
  const scene = <div className={`${field.fieldViewport} ${styles.viewport} ${camera.dragging ? field.dragging : ""}`} ref={viewportRef}
    data-composition={composed ? "pasted" : undefined} data-compact={compact}
    data-collection-scene={sceneId} data-home={isHome} tabIndex={readOnly && compact ? undefined : 0} role="region"
    style={compact ? { height: readOnly ? Math.max(120, layout.canvasHeight) : Math.max(680, layout.canvasHeight * Math.min(1, (width - 24) / layout.canvasWidth) + (isHome ? 300 : 130)) } : undefined}
    aria-label={isHome ? "图集封面星图" : `${title}作品星图`} onKeyDown={camera.handleFieldKeyDown}>
    {!readOnly && (isHome ? identity : <div className={styles.sceneHeading} data-field-controls>{photoHeading}</div>)}
    <div className={`${field.fieldCanvas} ${styles.canvas}`} ref={canvasRef} style={{
      width: layout.canvasWidth, height: layout.canvasHeight,
      transform: `translate3d(calc(-50% + ${camera.view.x}px), calc(-50% + ${camera.view.y}px), 0) scale(${camera.view.scale})`,
      "--scene-transform": `translate3d(calc(-50% + ${camera.view.x}px), calc(-50% + ${camera.view.y}px), 0) scale(${camera.view.scale})`,
    } as CSSProperties}>
      <div className={field.canvasTitle} aria-hidden="true"><span>FRAME</span><strong>FIELD</strong></div>
      {layout.threads.map((thread, index) => <i key={index} className={`${field.thread} ${styles.thread}`} aria-hidden="true" style={{ left: thread.left, top: thread.top, width: thread.width, transform: `rotate(${thread.rotation}deg)` }} />)}
      {layout.placements.map((placement, index) => {
        const card = cards.find((item) => item.id === placement.id)!;
        return <button key={card.id} type="button" className={`${field.polaroid} ${styles.card}`} data-polaroid={index + 1} data-card-id={card.id}
          data-tone={placement.tone} data-rotation={placement.rotation} onClick={() => onOpen(card.id)}
          aria-label={isHome ? `进入图集 ${card.title}，${card.subtitle}` : `查看第 ${index + 1} 张照片`}
          style={{ left: placement.left, top: placement.top, width: placement.width, height: placement.height, zIndex: placement.zIndex, "--rotation": `${placement.rotation}deg`, "--card-left": `${placement.left}px`, "--card-top": `${placement.top}px`, "--card-width": `${placement.width}px` } as CSSProperties}>
          <span className={field.tape} aria-hidden="true" />
          <span className={`${field.photoFrame} ${styles.photo}`} style={{ height: placement.photoHeight }}>
            {card.asset ? <img src={card.asset.variants.card.src} width={card.asset.variants.card.width} height={card.asset.variants.card.height}
              onError={() => { if (card.asset) onAssetUnavailable?.(card.asset.id); }}
              alt={isHome ? `${card.title}封面` : `图集照片 ${index + 1}`} loading={index < 3 ? "eager" : "lazy"} decoding="async" draggable={false}
              style={{ objectFit: card.fit === "fill" ? "cover" : "contain", objectPosition: `${card.focusX ?? 50}% ${card.focusY ?? 50}%` }} /> : <span className={styles.emptyPhoto}>{readOnly ? "暂无可用封面" : "选择一张封面"}</span>}
          </span>
          <span className={styles.caption}><strong>{composed ? String(index + 1).padStart(2, "0") : card.title}</strong><small>{composed ? "查看完整影像" : card.subtitle}</small><em aria-hidden="true">↗</em></span>
        </button>;
      })}
    </div>
    {!cards.length && <p className={styles.empty}>{readOnly ? "暂无可展示照片。素材可能尚未添加、已回收或暂时不可用。" : "这个图集还没有照片。可在临时配置中选择素材。"}</p>}
    {!readOnly && isHome && <div className={`${field.sceneActions} ${styles.actions}`} data-field-controls>
      <button type="button" onClick={camera.sceneMode === "overview" ? camera.showFocus : camera.showOverview}>{overviewLabel}<span>↗</span></button>
      <p>{cards.length} 个图集 · 点击封面，走进作品星图</p>
    </div>}
    {!readOnly && controls}
  </div>;
  return readOnly ? <div ref={shellRef} className={styles.sceneShell} data-scene-shell data-home={isHome} data-compact={compact} style={compact ? undefined : { height: `calc(100svh - ${navigationHeight}px)` }}>
    <div className={styles.sceneHeader}>{isHome ? <>{identity}{!compact && <div className={`${field.sceneActions} ${styles.homeActions}`}><button type="button" onClick={camera.sceneMode === "overview" ? camera.showFocus : camera.showOverview}>{overviewLabel}<span>↗</span></button><p>点击封面，走进作品星图</p></div>}</> : <div className={styles.sceneHeading} data-field-controls>{photoHeading}</div>}</div>
    {scene}
    {!compact && controls}
  </div> : scene;
}
