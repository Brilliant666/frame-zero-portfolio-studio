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
} from "react";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import { buildPolaroidFieldLayout } from "./field-layout";
import {
  constrainView,
  fitRectsToViewport,
  getMinimumScale,
  type ViewportFit,
  type ViewState,
} from "./viewport-fit";
import styles from "./polaroid-field.module.css";

type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number };
type PolaroidStyle = CSSProperties & { "--rotation": string; "--delay": string };
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef<ViewState>(INITIAL_VIEW);
  const fitRef = useRef<ViewportFit | null>(null);
  const viewModeRef = useRef<"fit" | "manual">("fit");
  const minimumScaleRef = useRef(PREFERRED_MIN_SCALE);
  const frameRef = useRef<number | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [minimumScale, setMinimumScale] = useState(PREFERRED_MIN_SCALE);
  const [dragging, setDragging] = useState(false);
  const [desktopFieldEnabled, setDesktopFieldEnabled] = useState(false);

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

    return fitRectsToViewport(
      { width: viewport.clientWidth, height: viewport.clientHeight },
      { width: canvas.offsetWidth, height: canvas.offsetHeight },
      cards,
      FIT_INSET,
    );
  }, []);

  const updateFitGeometry = useCallback(() => {
    const fit = measureFit();
    if (!fit) return null;

    fitRef.current = fit;
    const nextMinimum = getMinimumScale(fit.view.scale, PREFERRED_MIN_SCALE);
    minimumScaleRef.current = nextMinimum;
    setMinimumScale((current) => Math.abs(current - nextMinimum) < .0001 ? current : nextMinimum);
    return fit;
  }, [measureFit]);

  const constrainCurrentView = useCallback((next: ViewState) => {
    const fit = fitRef.current;
    if (!fit) return next;
    return constrainView(next, fit, minimumScaleRef.current, MAX_SCALE);
  }, []);

  const fitToContent = useCallback(() => {
    const fit = updateFitGeometry();
    if (!fit) return;
    viewModeRef.current = "fit";
    commitView(fit.view);
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

      const fit = updateFitGeometry();
      if (!fit) return;

      if (viewModeRef.current === "fit") {
        commitView(fit.view);
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
        fitToContent();
        break;
    }
  };

  return (
    <main className={`${styles.shell} ${booted ? styles.ready : ""}`} data-template={templateId}>
      <a className={styles.skipLink} href="#polaroid-field">跳到作品星图</a>

      <header className={styles.topbar}>
        <a className={styles.brand} href="#polaroid-top" aria-label="返回页面顶部">
          <span>{content.profile.mark}</span>
          <strong>{content.profile.brand}</strong>
        </a>
        <nav aria-label="页面导航">
          <a href="#polaroid-field">FIELD</a>
          <a href="#polaroid-packages">PACKAGES</a>
          <a href="#polaroid-booking">BOOKING</a>
        </nav>
        <p>{isPreview ? "TEMPLATE PREVIEW" : content.profile.availability}</p>
      </header>

      <section id="polaroid-top" className={styles.hero}>
        <div className={styles.heroIndex}>FIELD NOTE / 001—009</div>
        <div className={styles.heroTitle}>
          <p>{content.hero.eyebrow}</p>
          <h1>漂浮<br /><span>拍立得星图</span></h1>
        </div>
        <div className={styles.heroCopy}>
          <p>{content.profile.intro}</p>
          <strong>{content.profile.photographer} · {content.profile.role}</strong>
          <span>{content.hero.services}</span>
          <a href="#polaroid-field">进入影像星野 <b>↓</b></a>
        </div>
        <div className={styles.heroSeal} aria-hidden="true">
          <span>{String(fieldSlots.length).padStart(2, "0")}</span>
          <small>MEMORIES<br />IN ORBIT</small>
        </div>
      </section>

      <section id="polaroid-field" className={styles.fieldSection} aria-labelledby="field-title">
        <div className={styles.sectionHeading}>
          <div>
            <small>01 / CONSTELLATION OF CHARACTERS</small>
            <h2 id="field-title">作品星座</h2>
          </div>
          <p>拖动画布寻找散落的角色记忆；点击任意拍立得，可展开完整影像。</p>
        </div>

        <div className={styles.fieldToolbar}>
          <p className={styles.dragHint} aria-hidden="true">
            <span>↔</span> DRAG THE EMPTY FIELD · ARROWS TO PAN · + / − TO ZOOM · HOME / 0 TO FIT
          </p>
          <div className={styles.fieldControls} data-field-controls aria-label="画布控制">
            <button
              type="button"
              onClick={() => zoomBy(-.08)}
              disabled={view.scale <= minimumScale + .0001}
              aria-label="缩小作品星图"
              aria-controls="polaroid-field-canvas"
            >−</button>
            <span aria-hidden="true">{Math.round(view.scale * 100)}%</span>
            <button
              type="button"
              onClick={() => zoomBy(.08)}
              disabled={view.scale >= MAX_SCALE - .0001}
              aria-label="放大作品星图"
              aria-controls="polaroid-field-canvas"
            >+</button>
            <button
              type="button"
              onClick={fitToContent}
              aria-label="完整显示全部作品"
              aria-controls="polaroid-field-canvas"
              title="完整显示全部作品"
            >FIT</button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className={`${styles.fieldViewport} ${dragging ? styles.dragging : ""}`}
          tabIndex={desktopFieldEnabled ? 0 : undefined}
          role="region"
          aria-label={desktopFieldEnabled
            ? "可拖拽作品星图。可使用方向键移动，加减号缩放，Home 或数字 0 完整显示全部作品。"
            : "九张拍立得作品画廊。"}
          onKeyDown={desktopFieldEnabled ? handleFieldKeyDown : undefined}
        >
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
              const placementStyle = {
                left: `${placement.left}rem`,
                top: `${placement.top}rem`,
                width: `${placement.width}rem`,
                zIndex: placement.zIndex,
                "--rotation": `${placement.rotation}deg`,
                "--delay": `${index * 65}ms`,
              } as PolaroidStyle;

              if (!work) {
                return (
                  <article
                    className={`${styles.polaroid} ${styles.polaroidPlaceholder}`}
                    data-polaroid={String(index + 1)}
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
                      loading={index < 2 ? "eager" : "lazy"}
                      decoding="async"
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

        </div>

        <div className={styles.factRow} aria-label="约拍关键信息">
          {content.trustItems.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section id="polaroid-packages" className={styles.packageSection} aria-labelledby="package-title">
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
              <a href="#polaroid-booking">收藏这段旅程 <span>↘</span></a>
            </article>
          ))}
        </div>
        <p className={styles.packageNote}>展示价格不含妆造、服装、场地和跨城交通；最终方案会在拍摄前与你逐项确认。</p>
      </section>

      <section id="polaroid-booking" className={styles.bookingSection} aria-labelledby="booking-title">
        <div className={styles.bookingIntro}>
          <small>03 / SEND A FIELD NOTE</small>
          <h2 id="booking-title">把下一颗星<br /><span>钉在这里</span></h2>
          <p>告诉我角色、日期与想要留下的情绪。复制清单后，通过微信或邮箱发送，就可以开始一起搭建画面。</p>

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
          <div className={styles.socials}>
            {content.social.map((item) => (
              <span key={`${item.label}-${item.handle}`}><b>{item.label}</b>{item.handle}</span>
            ))}
          </div>
          <p>{content.statement.lineOne}{content.statement.lineTwo}</p>
          <small>© 2026 / EVERY MEMORY HAS COORDINATES.</small>
        </footer>
      </section>

      <div className={styles.mobileCta} aria-label="快速约拍">
        <button type="button" onClick={() => void onCopy(content.contact.wechat, "polaroid-mobile")}>
          {copiedKey === "polaroid-mobile" ? "微信已复制 ✓" : "复制微信"}
        </button>
        <a href="#polaroid-booking">写下约拍便签 ↗</a>
      </div>
    </main>
  );
}
