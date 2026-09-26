"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets provide responsive WebP derivatives. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type ComponentType,
} from "react";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import PlatformAccounts from "../shared/platform-accounts";
import { buildPolaroidFieldLayout } from "./field-layout";
import CollectionExperience from "./collection-experience";
import type { Collection } from "./collection-model";
import { canOpenCollectionProof } from "./collection-proof-gate";
import { selectPolaroidFocus } from "./hero-selection";
import { getPolaroidViewFromHash, POLAROID_VIEW_HASHES, type PolaroidView } from "./navigation";
import { useConstellationViewport } from "./use-constellation-viewport";
import styles from "./field.module.css";

type PolaroidStyle = CSSProperties & { "--rotation": string };
type FieldCanvasStyle = CSSProperties & {
  "--field-canvas-width": string;
  "--field-canvas-height": string;
};

const MAX_SCALE = 1.28;
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
  collectionWorkspace,
}: TemplateProps & { collectionWorkspace?: { collections: readonly Collection[]; initialCollectionId?: string; headerAccessory?: ReactNode; Navigation?: ComponentType<{active:PolaroidView;onNavigate:(event:ReactMouseEvent<HTMLElement>,view:PolaroidView)=>void}> } }) {
  const Navigation = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW === "1" ? collectionWorkspace?.Navigation : undefined;
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
  const navigationFrameRef = useRef<number | null>(null);
  const [activeView, setActiveView] = useState<PolaroidView>("field");
  const [localCollectionProof, setCollectionProof] = useState(false);
  const collectionProof = !!collectionWorkspace || localCollectionProof;
  const [homeRequest, setHomeRequest] = useState(0);

  const { view, minimumScale, dragging, desktopFieldEnabled, sceneMode, showOverview, showFocus, zoomBy, handleFieldKeyDown } = useConstellationViewport({
    viewportRef, canvasRef, layoutKey: fieldSlots, getFocusIndex: () => focusSlot?.index ?? 4, enabled: !collectionProof,
  });

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
    onBeforeViewChange?.();
    setActiveView(view);
    if (!isPreview && window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }
    scrollToViewTarget(hash.slice(1), focusTarget);
  }, [isPreview, scrollToViewTarget, onBeforeViewChange]);

  const handleViewLink = useCallback((
    event: ReactMouseEvent<HTMLElement>,
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
      if (hash && !(collectionProof && view === "field")) scrollToViewTarget(targetHash.slice(1), focusTarget);
    };

    syncViewFromLocation(false);
    const handleHistoryNavigation = () => syncViewFromLocation(true);
    window.addEventListener("hashchange", handleHistoryNavigation);
    window.addEventListener("popstate", handleHistoryNavigation);

    return () => {
      window.removeEventListener("hashchange", handleHistoryNavigation);
      window.removeEventListener("popstate", handleHistoryNavigation);
    };
  }, [isPreview, scrollToViewTarget, collectionProof]);

  useEffect(() => () => {
    if (navigationFrameRef.current !== null) {
      window.cancelAnimationFrame(navigationFrameRef.current);
    }
  }, []);


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
          <span aria-hidden={collectionWorkspace ? true : undefined}>{collectionWorkspace ? "✦" : content.profile.mark}</span>
          <strong>{collectionWorkspace ? content.profile.photographer : content.profile.brand}</strong>
        </a>
        {Navigation ? <Navigation active={activeView} onNavigate={handleViewLink}/> : <nav aria-label="作品集页面导航">
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
        </nav>}
        {collectionWorkspace?.headerAccessory ?? (headerStatus ? <p>{headerStatus}</p> : null)}
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
        {collectionProof ? <CollectionExperience key={collectionWorkspace ? JSON.stringify(collectionWorkspace.collections) : undefined} savedCollections={collectionWorkspace?.collections} initialCollectionId={collectionWorkspace?.initialCollectionId} content={content} isPreview={isPreview} isActive={activeView === "field"} homeRequest={homeRequest} onOpenWork={onOpenWork} onBeforeViewChange={onBeforeViewChange} /> :
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
            <article data-star-paper className={styles.packageCard} key={`${item.number}-${item.english}`}>
              <span className={styles.packageTape} aria-hidden="true" />
              <div className={styles.packageNumber}>{collectionWorkspace ? item.number : String(index + 1).padStart(2, "0")}</div>
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
        <div data-star-dark className={styles.bookingIntro}>
          <small>{collectionWorkspace ? content.statement.eyebrow : "03 / SEND A FIELD NOTE"}</small>
          <h2 id="booking-title">{collectionWorkspace ? content.statement.lineOne : "把下一颗星"}<br /><span>{collectionWorkspace ? content.statement.lineTwo : "钉在这里"}</span></h2>
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

        <div data-star-paper className={styles.noteCard}>
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

        {Navigation ? <PlatformAccounts accounts={content.social} tone="dark" /> : <footer data-star-dark className={styles.footer}>
          <div>
            <strong>{content.profile.brand}</strong>
            <span>{content.profile.photographer} · {content.profile.role}</span>
          </div>
          <PlatformAccounts accounts={content.social} tone="dark" />
          <p>{content.statement.lineOne}{content.statement.lineTwo}</p>
          <small>© 2026 / EVERY MEMORY HAS COORDINATES.</small>
        </footer>}
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
