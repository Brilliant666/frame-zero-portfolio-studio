"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets provide responsive WebP derivatives. */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { TemplateProps } from "../types";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder, type PhotoRatio } from "../shared/photo-slots";
import styles from "./polaroid-field.module.css";

type ViewState = { x: number; y: number; scale: number };
type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number };
type PolaroidStyle = CSSProperties & { "--rotation": string; "--delay": string };

const INITIAL_VIEW: ViewState = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.28;
const POLAROID_RATIOS = ["3:2", "16:9", "3:2", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"] as const satisfies readonly PhotoRatio[];

const placements = [
  { left: "6%", top: "8%", width: "25rem", rotation: "-7deg", z: 5, tone: "coral" },
  { left: "38%", top: "4%", width: "21rem", rotation: "4deg", z: 3, tone: "blue" },
  { left: "69%", top: "12%", width: "24rem", rotation: "-2deg", z: 7, tone: "ink" },
  { left: "18%", top: "43%", width: "20rem", rotation: "6deg", z: 8, tone: "blue" },
  { left: "47%", top: "35%", width: "27rem", rotation: "-4deg", z: 10, tone: "coral" },
  { left: "77%", top: "48%", width: "19rem", rotation: "8deg", z: 4, tone: "sand" },
  { left: "3%", top: "69%", width: "23rem", rotation: "3deg", z: 6, tone: "ink" },
  { left: "35%", top: "71%", width: "21rem", rotation: "-8deg", z: 9, tone: "sand" },
  { left: "64%", top: "72%", width: "26rem", rotation: "5deg", z: 11, tone: "coral" },
] as const;

const threads = [
  { left: "18%", top: "25%", width: "28%", rotation: "-7deg" },
  { left: "50%", top: "19%", width: "26%", rotation: "13deg" },
  { left: "27%", top: "52%", width: "31%", rotation: "-5deg" },
  { left: "59%", top: "50%", width: "26%", rotation: "11deg" },
  { left: "14%", top: "76%", width: "28%", rotation: "7deg" },
  { left: "45%", top: "79%", width: "27%", rotation: "-4deg" },
] as const;

const stars = [
  [14, 31], [33, 18], [55, 27], [82, 31], [11, 61], [39, 57], [68, 61], [91, 67], [24, 86], [56, 89], [79, 85],
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

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
  const fieldSlots = useMemo(() => buildPhotoSlots(works, POLAROID_RATIOS), [works]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef<ViewState>(INITIAL_VIEW);
  const frameRef = useRef<number | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const desktopQuery = window.matchMedia("(min-width: 801px)");

    const scheduleView = (next: ViewState) => {
      viewRef.current = next;
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        setView(viewRef.current);
      });
    };

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
      scheduleView({
        ...viewRef.current,
        x: clamp(active.originX + event.clientX - active.startX, -720, 720),
        y: clamp(active.originY + event.clientY - active.startY, -460, 460),
      });
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
  }, []);

  const commitView = (next: ViewState) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    viewRef.current = next;
    setView(next);
  };

  const zoomBy = (amount: number) => {
    const current = viewRef.current;
    commitView({ ...current, scale: clamp(current.scale + amount, MIN_SCALE, MAX_SCALE) });
  };

  const panBy = (x: number, y: number) => {
    const current = viewRef.current;
    commitView({
      ...current,
      x: clamp(current.x + x, -720, 720),
      y: clamp(current.y + y, -460, 460),
    });
  };

  const resetView = () => commitView(INITIAL_VIEW);

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
        resetView();
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

        <div
          ref={viewportRef}
          className={`${styles.fieldViewport} ${dragging ? styles.dragging : ""}`}
          tabIndex={0}
          role="region"
          aria-label="可拖拽作品星图。可使用方向键移动，加减号缩放，Home 或数字 0 重置。"
          onKeyDown={handleFieldKeyDown}
        >
          <div className={styles.fieldControls} data-field-controls aria-label="画布控制">
            <button
              type="button"
              onClick={() => zoomBy(-.08)}
              disabled={view.scale <= MIN_SCALE}
              aria-label="缩小作品星图"
            >−</button>
            <span aria-hidden="true">{Math.round(view.scale * 100)}%</span>
            <button
              type="button"
              onClick={() => zoomBy(.08)}
              disabled={view.scale >= MAX_SCALE}
              aria-label="放大作品星图"
            >+</button>
            <button type="button" onClick={resetView} aria-label="重置作品星图位置与缩放">RESET</button>
          </div>

          <div
            className={styles.fieldCanvas}
            style={{
              transform: `translate3d(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px), 0) scale(${view.scale})`,
            }}
          >
            <div className={styles.canvasTitle} aria-hidden="true">
              <span>FRAME</span>
              <strong>FIELD</strong>
              <small>PRIVATE CONSTELLATION / {content.profile.city}</small>
            </div>

            {threads.map((thread, index) => (
              <i
                className={styles.thread}
                key={`thread-${index}`}
                style={{ left: thread.left, top: thread.top, width: thread.width, transform: `rotate(${thread.rotation})` }}
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
              const placement = placements[index];
              const work = slot.work;
              const placementStyle = {
                left: placement.left,
                top: placement.top,
                width: placement.width,
                zIndex: placement.z,
                "--rotation": placement.rotation,
                "--delay": `${index * 65}ms`,
              } as PolaroidStyle;

              if (!work) {
                return (
                  <article
                    className={`${styles.polaroid} ${styles.polaroidPlaceholder}`}
                    data-polaroid={String(index + 1)}
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

          <div className={styles.dragHint} aria-hidden="true">
            <span>↔</span> DRAG THE EMPTY FIELD · ARROWS TO PAN · + / − TO ZOOM
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
