"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets provide responsive WebP derivatives. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import PlatformAccounts from "../shared/platform-accounts";
import { buildPolaroidFieldLayout } from "./field-layout";
import CollectionExperience from "./collection-experience";
import { canOpenCollectionProof } from "./collection-proof-gate";
import { selectPolaroidFocus } from "./hero-selection";
import { getPolaroidViewFromHash, POLAROID_VIEW_HASHES, type PolaroidView } from "./navigation";
import {
  constrainView,
  fitRectsToViewport,
  focusRectInViewport,
  getMinimumScale,
  type ViewportFit,
  type ViewState,
} from "./viewport-fit";
import styles from "./polaroid-field.module.css";

type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number };
type PolaroidStyle = CSSProperties & { "--rotation": string };
type FieldCanvasStyle = CSSProperties & {
  "--field-canvas-width": string;
  "--field-canvas-height": string;
};

const INITIAL_VIEW: ViewState = { x: 0, y: 0, scale: 1 };
const PREFERRED_MIN_SCALE = 0.72;
const MAX_SCALE = 1.28;
const FIT_INSET = 32;
const POLAROID_RATIOS = getTemplateSlotRatios("polaroid-field");

const stars = [
  [14, 31], [33, 18], [55, 27], [82, 31], [11, 61], [39, 57], [68, 61], [91, 67], [24, 86], [56, 89], [79, 85],
] as const;

export default function PolaroidFieldTemplate({
  templateId,
  content,
  works,
  packages,
  bookingTemplate,
  booted,
  copiedKey,
  isPreview,
  onCopy,
  onBeforeViewChange,
  onOpenWork,
}: TemplateProps) {
  const fieldSlots = useMemo(
    () => buildPhotoSlots(works, POLAROID_RATIOS, { templateId: "polaroid-field" }),
    [works],
  );
  const fieldLayout = useMemo(
    () => buildPolaroidFieldLayout(fieldSlots.map((slot) => slot.ratio)),
    [fieldSlots],
  );
  const { focusSlot } = useMemo(() => selectPolaroidFocus(fieldSlots), [fieldSlots]);
  const headerStatus = isPreview ? "TEMPLATE PREVIEW" : content.profile.availability.trim();
  const trustItems = content.trustItems.filter(({ label, value }) => label.trim() || value.trim());
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef<ViewState>(INITIAL_VIEW);
  const fitRef = useRef<ViewportFit | null>(null);
  const viewModeRef = useRef<"focus" | "overview" | "manual">("focus");
  const minimumScaleRef = useRef(PREFERRED_MIN_SCALE);
  const frameRef = useRef<number | null>(null);
  const navigationFrameRef = useRef<number | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [minimumScale, setMinimumScale] = useState(PREFERRED_MIN_SCALE);
  const [dragging, setDragging] = useState(false);
  const [desktopFieldEnabled, setDesktopFieldEnabled] = useState(false);
  const [activeView, setActiveView] = useState<PolaroidView>("field");
  const [sceneMode, setSceneMode] = useState<"focus" | "overview">("focus");
  const [collectionProof, setCollectionProof] = useState(false);
  const [homeRequest, setHomeRequest] = useState(0);

  useEffect(() => {
    const enabled = canOpenCollectionProof(process.env.NODE_ENV, window.location.hostname, window.location.search);
    const frame = window.requestAnimationFrame(() => setCollectionProof(enabled));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const scrollToViewTarget = useCallback((targetId: string, focusTarget: boolean) => {
    if (navigationFrameRef.current !== null) {
      window.cancelAnimationFrame(navigationFrameRef.current);
    }

    navigationFrameRef.current = window.requestAnimationFrame(() => {
      navigationFrameRef.current = null;
      const target = document.getElementById(targetId);
      if (!target) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (focusTarget) target.focus({ preventScroll: true });
    });
  }, []);

  const activateView = useCallback((
    view: PolaroidView,
    hash = POLAROID_VIEW_HASHES[view],
    focusTarget = false,
  ) => {
    setActiveView(view);
    if (!isPreview && window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }
    scrollToViewTarget(hash.slice(1), focusTarget);
  }, [isPreview, scrollToViewTarget]);

  const handleViewLink = useCallback((
    event: ReactMouseEvent<HTMLAnchorElement>,
    view: PolaroidView,
    hash = POLAROID_VIEW_HASHES[view],
    focusTarget = false,
  ) => {
    event.preventDefault();
    if (view === "field") setHomeRequest((current) => current + 1);
    activateView(view, hash, focusTarget);
  }, [activateView]);

  useEffect(() => {
    if (isPreview) return;

    const syncViewFromLocation = (focusTarget: boolean) => {
      const hash = window.location.hash;
      const view = getPolaroidViewFromHash(hash);
      const targetHash = hash.startsWith("#polaroid-collection-")
        ? "#polaroid-top"
        : hash === "#polaroid-field" || Object.values(POLAROID_VIEW_HASHES).includes(hash)
        ? hash
        : POLAROID_VIEW_HASHES[view];
      setActiveView(view);
      if (hash) scrollToViewTarget(targetHash.slice(1), focusTarget);
    };

    syncViewFromLocation(false);
    const handleHistoryNavigation = () => syncViewFromLocation(true);
    window.addEventListener("hashchange", handleHistoryNavigation);
    window.addEventListener("popstate", handleHistoryNavigation);

    return () => {
      window.removeEventListener("hashchange", handleHistoryNavigation);
      window.removeEventListener("popstate", handleHistoryNavigation);
    };
  }, [isPreview, scrollToViewTarget]);

  useEffect(() => () => {
    if (navigationFrameRef.current !== null) {
      window.cancelAnimationFrame(navigationFrameRef.current);
    }
  }, []);

  const commitView = useCallback((next: ViewState) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    viewRef.current = next;
    setView(next);
  }, []);

  const scheduleView = useCallback((next: ViewState) => {
    viewRef.current = next;
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setView(viewRef.current);
    });
  }, []);

  const measureFit = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas || !window.matchMedia("(min-width: 801px)").matches) return null;

    const cards = Array.from(canvas.querySelectorAll<HTMLElement>("[data-polaroid]"), (card) => ({
      left: card.offsetLeft,
      top: card.offsetTop,
      width: card.offsetWidth,
      height: card.offsetHeight,
      rotation: Number.parseFloat(card.dataset.rotation ?? "0"),
    }));

    const fit = fitRectsToViewport(
      { width: viewport.clientWidth, height: viewport.clientHeight },
      { width: canvas.offsetWidth, height: canvas.offsetHeight },
      cards,
      FIT_INSET,
    );
    const focus = cards[focusSlot?.index ?? 4] ?? cards[4];
    return fit && focus ? { fit, focus } : null;
  }, [focusSlot]);

  const updateFitGeometry = useCallback(() => {
    const geometry = measureFit();
    if (!geometry) return null;
    const { fit } = geometry;

    fitRef.current = fit;
    const nextMinimum = getMinimumScale(fit.view.scale, PREFERRED_MIN_SCALE);
    minimumScaleRef.current = nextMinimum;
    setMinimumScale((current) => Math.abs(current - nextMinimum) < .0001 ? current : nextMinimum);
    return geometry;
  }, [measureFit]);

  const constrainCurrentView = useCallback((next: ViewState) => {
    const fit = fitRef.current;
    if (!fit) return next;
    return constrainView(next, fit, minimumScaleRef.current, MAX_SCALE);
  }, []);

  const showOverview = useCallback(() => {
    const geometry = updateFitGeometry();
    viewModeRef.current = "overview";
    setSceneMode("overview");
    if (geometry) commitView(geometry.fit.view);
  }, [commitView, updateFitGeometry]);

  const showFocus = useCallback(() => {
    const geometry = updateFitGeometry();
    viewModeRef.current = "focus";
    setSceneMode("focus");
    if (geometry) commitView(focusRectInViewport(
      geometry.fit, geometry.focus, minimumScaleRef.current, MAX_SCALE,
    ));
  }, [commitView, updateFitGeometry]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;

    const desktopQuery = window.matchMedia("(min-width: 801px)");
    let resizeFrame: number | null = null;

    const recompute = () => {
      resizeFrame = null;
      if (!desktopQuery.matches) return;

      const geometry = updateFitGeometry();
      if (!geometry) return;

      if (viewModeRef.current === "focus") {
        commitView(focusRectInViewport(
          geometry.fit, geometry.focus, minimumScaleRef.current, MAX_SCALE,
        ));
      } else if (viewModeRef.current === "overview") {
        commitView(geometry.fit.view);
      } else {
        commitView(constrainCurrentView(viewRef.current));
      }
    };

    const scheduleRecompute = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(recompute);
    };

    const handleDesktopChange = () => {
      setDesktopFieldEnabled(desktopQuery.matches);
      scheduleRecompute();
    };

    setDesktopFieldEnabled(desktopQuery.matches);
    recompute();

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleRecompute);
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener("resize", scheduleRecompute);
    desktopQuery.addEventListener("change", handleDesktopChange);

    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", scheduleRecompute);
      desktopQuery.removeEventListener("change", handleDesktopChange);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, [commitView, constrainCurrentView, fieldSlots, updateFitGeometry]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const desktopQuery = window.matchMedia("(min-width: 801px)");

    const finishDrag = () => {
      const active = dragRef.current;
      dragRef.current = null;
      setDragging(false);

      if (active && viewport.hasPointerCapture(active.pointerId)) {
        viewport.releasePointerCapture(active.pointerId);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!desktopQuery.matches || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("button, a, [data-field-controls]")) return;

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
      };
      viewport.setPointerCapture(event.pointerId);
      viewport.focus({ preventScroll: true });
      setDragging(true);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const active = dragRef.current;
      if (!active || active.pointerId !== event.pointerId) return;

      event.preventDefault();
      viewModeRef.current = "manual";
      scheduleView(constrainCurrentView({
        ...viewRef.current,
        x: active.originX + event.clientX - active.startX,
        y: active.originY + event.clientY - active.startY,
      }));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      finishDrag();
    };

    const handleLostCapture = () => {
      dragRef.current = null;
      setDragging(false);
    };

    viewport.addEventListener("pointerdown", handlePointerDown);
    viewport.addEventListener("pointermove", handlePointerMove);
    viewport.addEventListener("pointerup", handlePointerEnd);
    viewport.addEventListener("pointercancel", handlePointerEnd);
    viewport.addEventListener("lostpointercapture", handleLostCapture);

    return () => {
      viewport.removeEventListener("pointerdown", handlePointerDown);
      viewport.removeEventListener("pointermove", handlePointerMove);
      viewport.removeEventListener("pointerup", handlePointerEnd);
      viewport.removeEventListener("pointercancel", handlePointerEnd);
      viewport.removeEventListener("lostpointercapture", handleLostCapture);

      const active = dragRef.current;
      if (active && viewport.hasPointerCapture(active.pointerId)) {
        viewport.releasePointerCapture(active.pointerId);
      }
      dragRef.current = null;

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [constrainCurrentView, scheduleView]);

  const zoomBy = useCallback((amount: number) => {
    const current = viewRef.current;
    viewModeRef.current = "manual";
    commitView(constrainCurrentView({ ...current, scale: current.scale + amount }));
  }, [commitView, constrainCurrentView]);

  const panBy = useCallback((x: number, y: number) => {
    const current = viewRef.current;
    viewModeRef.current = "manual";
    commitView(constrainCurrentView({
      ...current,
      x: current.x + x,
      y: current.y + y,
    }));
  }, [commitView, constrainCurrentView]);

  const handleFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !window.matchMedia("(min-width: 801px)").matches) return;
    const distance = event.shiftKey ? 100 : 42;

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        panBy(distance, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        panBy(-distance, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        panBy(0, distance);
        break;
      case "ArrowDown":
        event.preventDefault();
        panBy(0, -distance);
        break;
      case "+":
      case "=":
        event.preventDefault();
        zoomBy(.08);
        break;
      case "-":
        event.preventDefault();
        zoomBy(-.08);
        break;
      case "0":
      case "Home":
        event.preventDefault();
        showOverview();
        break;
    }
  };

  return (
    <main
      className={`${styles.shell} ${booted ? styles.ready : ""}`}
      data-template={templateId}
      data-collection-proof={collectionProof ? (isPreview ? "preview" : "public") : undefined}
      data-polaroid-active-view={activeView}
    >
      <a
        className={styles.skipLink}
        href={collectionProof ? "#polaroid-top" : "#polaroid-field"}
        onClick={(event) => handleViewLink(event, "field", "#polaroid-field", true)}
      >跳到作品星图</a>

      <header className={`${styles.topbar} ${isPreview ? styles.previewTopbar : ""}`}>
        <a
          className={styles.brand}
          href="#polaroid-top"
          aria-label="返回作品首页"
          onClick={(event) => handleViewLink(event, "field", "#polaroid-top")}
        >
          <span>{content.profile.mark}</span>
          <strong>{content.profile.brand}</strong>
        </a>
        <nav aria-label="作品集页面导航">
          <a
            href="#polaroid-top"
            aria-current={activeView === "field" ? "page" : undefined}
            onClick={(event) => handleViewLink(event, "field")}
          >作品</a>
          <a
            href="#polaroid-packages"
            aria-current={activeView === "packages" ? "page" : undefined}
            onClick={(event) => handleViewLink(event, "packages")}
          >拍摄套餐</a>
          <a
            href="#polaroid-booking"
            aria-current={activeView === "booking" ? "page" : undefined}
            onClick={(event) => handleViewLink(event, "booking")}
          >联系约拍</a>
        </nav>
        {headerStatus ? <p>{headerStatus}</p> : null}
      </header>

      <section
        id="polaroid-top"
        className={styles.fieldSection}
        aria-labelledby={collectionProof ? undefined : "scene-title"}
        aria-label={collectionProof ? "作品栏目" : undefined}
        data-polaroid-view="field"
        data-scene-mode={sceneMode}
        hidden={activeView !== "field"}
        tabIndex={-1}
      >
        {collectionProof ? <CollectionExperience isPreview={isPreview} homeRequest={homeRequest} onOpenWork={onOpenWork} onBeforeViewChange={onBeforeViewChange} /> :
        <div
          id="polaroid-field"
          ref={viewportRef}
          className={`${styles.fieldViewport} ${dragging ? styles.dragging : ""}`}
          tabIndex={desktopFieldEnabled ? 0 : undefined}
          role="region"
          aria-label={desktopFieldEnabled
            ? "可拖拽作品星图。可使用方向键移动，加减号缩放，Home 或数字 0 完整显示全部作品。"
            : "九张拍立得作品画廊。"}
          onKeyDown={desktopFieldEnabled ? handleFieldKeyDown : undefined}
        >
          <div className={styles.sceneIdentity}>
            <small>{content.profile.photographer} · 摄影作品</small>
            <h1 id="scene-title">{content.profile.photographer}<span>漂浮拍立得星图</span></h1>
            <p>{content.profile.intro}</p>
            <p>{content.profile.role} · {content.hero.services}</p>
          </div>
          <div
            ref={canvasRef}
            id="polaroid-field-canvas"
            className={styles.fieldCanvas}
            style={{
              "--field-canvas-width": `${fieldLayout.canvasWidth}rem`,
              "--field-canvas-height": `${fieldLayout.canvasHeight}rem`,
              transform: `translate3d(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px), 0) scale(${view.scale})`,
            } as FieldCanvasStyle}
            data-field-layout="ratio-aware-v1"
          >
            <div className={styles.canvasTitle} aria-hidden="true">
              <span>FRAME</span>
              <strong>FIELD</strong>
              <small>PRIVATE CONSTELLATION / {content.profile.city}</small>
            </div>

            {fieldLayout.threads.map((thread, index) => (
              <i
                className={styles.thread}
                key={`thread-${index}`}
                style={{
                  left: `${thread.left}rem`,
                  top: `${thread.top}rem`,
                  width: `${thread.width}rem`,
                  transform: `rotate(${thread.rotation}deg)`,
                }}
                aria-hidden="true"
              />
            ))}
            {stars.map(([left, top], index) => (
              <i
                className={styles.star}
                key={`star-${index}`}
                style={{ left: `${left}%`, top: `${top}%` }}
                aria-hidden="true"
              />
            ))}

            {fieldSlots.map((slot, index) => {
              const placement = fieldLayout.placements[index];
              const work = slot.work;
              const sceneRole = index === focusSlot?.index ? "focus" : (index === 2 || index === 6 ? "near" : "other");
              const placementStyle = {
                left: `${placement.left}rem`,
                top: `${placement.top}rem`,
                width: `${placement.width}rem`,
                zIndex: placement.zIndex,
                "--rotation": `${placement.rotation}deg`,
              } as PolaroidStyle;

              if (!work) {
                return (
                  <article
                    className={`${styles.polaroid} ${styles.polaroidPlaceholder}`}
                    data-polaroid={String(index + 1)}
                    data-scene-role={sceneRole}
                    inert={sceneMode === "focus" && sceneRole === "other"}
                    data-rotation={placement.rotation}
                    data-layout-band={placement.band}
                    data-tone={placement.tone}
                    data-ratio={slot.ratio}
                    data-photo-slot={slot.index}
                    data-photo-ratio={slot.ratio}
                    key={`polaroid-slot-${slot.index}`}
                    style={placementStyle}
                  >
                    <span className={styles.tape} aria-hidden="true" />
                    <span className={styles.photoFrame} style={getPhotoSlotStyle(slot)}>
                      <PhotoPlaceholder slot={slot} tone="light" compact label="MEMORY PENDING" />
                    </span>
                    <span className={styles.polaroidCaption}>
                      <small>PHOTO SLOT / {slot.ratio}</small>
                      <strong>等待下一段记忆</strong>
                      <em>image pending</em>
                    </span>
                  </article>
                );
              }

              return (
                <button
                  type="button"
                  className={styles.polaroid}
                  data-polaroid={String(index + 1)}
                  data-scene-role={sceneRole}
                  inert={sceneMode === "focus" && sceneRole === "other"}
                  data-rotation={placement.rotation}
                  data-layout-band={placement.band}
                  data-tone={placement.tone}
                  data-ratio={slot.ratio}
                  data-photo-slot={slot.index}
                  data-photo-ratio={slot.ratio}
                  key={`polaroid-slot-${slot.index}`}
                  onClick={() => onOpenWork(work)}
                  aria-label={`打开作品 ${work.title}`}
                  style={placementStyle}
                >
                  <span className={styles.tape} aria-hidden="true" />
                  <span className={styles.photoFrame} style={getPhotoSlotStyle(slot)}>
                    <img
                      src={work.preview}
                      srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                      sizes="(max-width: 800px) 82vw, 25rem"
                      width={work.previewWidth}
                      height={work.previewHeight}
                      alt={work.subtitle || work.title}
                      loading={index === focusSlot?.index ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={index === focusSlot?.index ? "high" : "auto"}
                      style={{ objectPosition: work.position }}
                    />
                    <span className={styles.exposure} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <span className={styles.polaroidCaption}>
                    <small>{work.code} / {work.subtitle}</small>
                    <strong>{work.title}</strong>
                    <em>open memory ↗</em>
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.sceneActions} data-field-controls>
            <button type="button" onClick={sceneMode === "focus" ? showOverview : showFocus} aria-controls="polaroid-field-canvas">
              {sceneMode === "focus" ? "查看全部作品" : "返回主图"} <span aria-hidden="true">↗</span>
            </button>
            <p>{sceneMode === "focus" ? "点击照片，展开完整影像" : "拖动画布探索，点击照片查看"}</p>
          </div>
          <div className={styles.fieldControls} data-field-controls aria-label="画布控制">
            <button type="button" onClick={() => zoomBy(-.08)} disabled={view.scale <= minimumScale + .0001} aria-label="缩小作品星图">−</button>
            <span aria-hidden="true">{Math.round(view.scale * 100)}%</span>
            <button type="button" onClick={() => zoomBy(.08)} disabled={view.scale >= MAX_SCALE - .0001} aria-label="放大作品星图">+</button>
            <button type="button" onClick={showOverview} aria-label="完整显示全部作品" title="完整显示全部作品">FIT</button>
          </div>
        </div>}
      </section>

      <section
        id="polaroid-packages"
        className={styles.packageSection}
        aria-labelledby="package-title"
        data-polaroid-view="packages"
        hidden={activeView !== "packages"}
        tabIndex={-1}
      >
        <div className={styles.sectionHeading}>
          <div>
            <small>02 / CHOOSE YOUR PHOTO WALK</small>
            <h2 id="package-title">选择拍摄旅程</h2>
          </div>
          <p>从漫展擦肩而过，到为一个角色完整搭建世界。选择适合你的影像篇幅。</p>
        </div>

        <div className={styles.packageGrid}>
          {packages.map((item, index) => (
            <article className={styles.packageCard} key={`${item.number}-${item.english}`}>
              <span className={styles.packageTape} aria-hidden="true" />
              <div className={styles.packageNumber}>{String(index + 1).padStart(2, "0")}</div>
              <div className={styles.packageTitle}>
                <small>{item.english} / {item.duration}</small>
                <h3>{item.name}</h3>
              </div>
              <p>{item.description}</p>
              <div className={styles.packageOffer}>
                <strong>{item.price}</strong>
                <ul>
                  {item.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}
                </ul>
              </div>
              <a
                href="#polaroid-booking"
                onClick={(event) => handleViewLink(event, "booking", "#polaroid-booking", true)}
              >收藏这段旅程 <span>↘</span></a>
            </article>
          ))}
        </div>
        <p className={styles.packageNote}>展示价格不含妆造、服装、场地和跨城交通；最终方案会在拍摄前与你逐项确认。</p>
        {trustItems.length > 0 ? (
          <div className={styles.factRow} aria-label="约拍关键信息">
            {trustItems.map((item, index) => (
              <div key={`${item.label}-${index}`}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section
        id="polaroid-booking"
        className={styles.bookingSection}
        aria-labelledby="booking-title"
        data-polaroid-view="booking"
        hidden={activeView !== "booking"}
        tabIndex={-1}
      >
        <div className={styles.bookingIntro}>
          <small>03 / SEND A FIELD NOTE</small>
          <h2 id="booking-title">把下一颗星<br /><span>钉在这里</span></h2>
          <p>
            告诉我角色、日期与想要留下的情绪。复制清单后，
            通过微信或邮箱发送，就可以开始一起搭建画面。
          </p>

          <button type="button" onClick={() => void onCopy(content.contact.wechat, "polaroid-wechat")}>
            <span>WECHAT / 点击复制</span>
            <strong>{content.contact.wechat}</strong>
            <b aria-live="polite">{copiedKey === "polaroid-wechat" ? "已复制 ✓" : "COPY ↗"}</b>
          </button>
          <a href={`mailto:${content.contact.email}`}>
            <span>EMAIL / 写一封信</span>
            <strong>{content.contact.email}</strong>
            <b>OPEN ↗</b>
          </a>
          <p className={styles.contactNote}>{content.contact.note}</p>
        </div>

        <div className={styles.noteCard}>
          <span className={styles.notePin} aria-hidden="true" />
          <div className={styles.noteHeader}>
            <span>FIELD_NOTE.txt</span>
            <strong>{content.profile.brand}</strong>
          </div>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "polaroid-template")}>
            <span aria-live="polite">
              {copiedKey === "polaroid-template" ? "完整清单已复制 ✓" : "复制完整约拍清单"}
            </span>
            <b>↗</b>
          </button>
        </div>

        <footer className={styles.footer}>
          <div>
            <strong>{content.profile.brand}</strong>
            <span>{content.profile.photographer} · {content.profile.role}</span>
          </div>
          <PlatformAccounts accounts={content.social} tone="dark" />
          <p>{content.statement.lineOne}{content.statement.lineTwo}</p>
          <small>© 2026 / EVERY MEMORY HAS COORDINATES.</small>
        </footer>
      </section>

      <div className={styles.mobileCta} aria-label="快速约拍">
        <button type="button" onClick={() => void onCopy(content.contact.wechat, "polaroid-mobile")}>
          {copiedKey === "polaroid-mobile" ? "微信已复制 ✓" : "复制微信"}
        </button>
        <a
          href="#polaroid-booking"
          onClick={(event) => handleViewLink(event, "booking", "#polaroid-booking", true)}
        >写下约拍便签 ↗</a>
      </div>
    </main>
  );
}
