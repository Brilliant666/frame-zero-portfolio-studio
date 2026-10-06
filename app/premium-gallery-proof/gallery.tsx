"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GalleryDocument, GalleryPhoto } from "./model";
import { galleryScrollport, galleryScrollTop, restoreGalleryScroll } from "./scrollport";
import { scrollToGalleryGroup } from "./group-preview";
import { lockGalleryBodyScroll } from "./body-scroll-lock";
import { railTimeAfterWheel } from "./rail-motion";
import { galleryPhotoSource } from "./photo-source";
import { beginGallerySwipe, completeGallerySwipe, nextGalleryPhotoIndex, type GallerySwipe } from "./gallery-interaction";
import styles from "./gallery.module.css";

type Scene = "works" | "pricing" | "contact" | "gallery";
const scenes: Scene[] = ["works", "pricing", "contact"];

function readScene(available: Scene[]): Scene {
  const hash = window.location.hash.slice(1);
  return [...available, "gallery"].includes(hash) ? hash as Scene : "works";
}

function Photo({ photo, className, style, sizes = "100vw", full = false, lazy = false }: { photo: GalleryPhoto; className?: string; style?: CSSProperties; sizes?: string; full?: boolean; lazy?: boolean }) {
  // Intrinsic dimensions preserve layout; responsive sources only change transferred pixels.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} style={style} {...galleryPhotoSource(photo, sizes, full)} loading={lazy ? "lazy" : "eager"} decoding="async" width={photo.width} height={photo.height} alt={photo.alt} draggable={false} />;
}

function Rail({ group, reverse, paused, onSelect, widthPercent }: { group: GalleryDocument["groups"][number]; reverse: boolean; paused: boolean; onSelect: (photo: GalleryPhoto) => void; widthPercent: number }) {
  const rail = useRef<HTMLDivElement>(null);
  const railWindow = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const primaryButtons = useRef(new Map<string, HTMLButtonElement>());
  const [duration, setDuration] = useState(600);
  const [photoWidth, setPhotoWidth] = useState<number | null>(null);
  const ratio = widthPercent / 100;
  const photoSizes = photoWidth ? `${photoWidth}px` : `(max-width: 700px) calc((100vw - 52px) * ${ratio}), calc((55vw - 17px) * ${ratio})`;
  const keyboardIntent = useRef(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  useLayoutEffect(() => {
    const viewport = railWindow.current;
    if (!viewport) return;
    const image = viewport.querySelector("img");
    // The button border and static-list scrollbar reduce the image slot;
    // clientWidth excludes borders and is unaffected by the hover transform.
    const measure = () => setPhotoWidth(Math.max(1, image?.clientWidth ?? viewport.clientWidth));
    const observer = new ResizeObserver(measure);
    observer.observe(viewport); if (image) observer.observe(image); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const viewport = railWindow.current;
    if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      // Keep native scrolling in keyboard, explicit pause and reduced-motion modes.
      // Even at their ends, a rail must not hand its wheel to scene navigation.
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey || !event.deltaY) return;
      if (getComputedStyle(viewport).overflowY !== "hidden") return;
      event.preventDefault();
      const animation = track.current?.getAnimations()[0];
      const durationMs = animation?.effect?.getComputedTiming().duration;
      const loopHeight = copy.current?.getBoundingClientRect().height ?? 0;
      if (!animation || typeof animation.currentTime !== "number" || typeof durationMs !== "number" || durationMs <= 0 || loopHeight <= 0) return;
      const deltaPixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
      animation.currentTime = railTimeAfterWheel(animation.currentTime, durationMs, loopHeight, deltaPixels, reverse);
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    return () => viewport.removeEventListener("wheel", wheel);
  }, [reverse]);
  useLayoutEffect(() => {
    if (!paused && !keyboardFocused && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      railWindow.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [paused, keyboardFocused]);
  useEffect(() => {
    // Pointer focus survives lightbox return, but should not freeze the rail.
    // Track Tab before it enters the rail so keyboard users get a stable list.
    const keyDown = (event: KeyboardEvent) => {
      if (!["Tab", "Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      keyboardIntent.current = true;
      if (rail.current?.contains(document.activeElement)) setKeyboardFocused(true);
    };
    const pointerDown = () => { keyboardIntent.current = false; setKeyboardFocused(false); };
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("pointerdown", pointerDown, true);
    return () => {
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("pointerdown", pointerDown, true);
    };
  }, []);
  useLayoutEffect(() => {
    const element = copy.current;
    if (!element) return;
    // Visible reference samples move about 25–26 px/s, independently of list length.
    // Measure before paint so a returning rail starts with its final geometry.
    const measure = () => setDuration(Math.max(1, element.getBoundingClientRect().height / 25));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div ref={rail} className={`${styles.rail} ${keyboardFocused ? styles.keyboardRail : ""}`}
    onFocusCapture={(event) => {
      if (!keyboardIntent.current) return;
      setKeyboardFocused(true);
      const target = event.target;
      requestAnimationFrame(() => { if (target.isConnected) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }); });
    }}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocused(false); }}>
    <h2 className={styles.railHeading}>{group.name}</h2>
    <div ref={railWindow} data-flow-rail-window className={styles.railWindow}><div ref={track} className={`${styles.track} ${reverse ? styles.reverse : ""}`} style={{ "--rail-duration": `${duration}s` } as CSSProperties}>
      {[0, 1].map((repeat) => <div ref={repeat === 0 ? copy : undefined} key={repeat} className={styles.railCopy} aria-hidden={repeat === 1 ? true : undefined}>{group.photos.map((photo) => <button key={photo.id} ref={repeat ? undefined : (button) => { if (button) primaryButtons.current.set(photo.id, button); else primaryButtons.current.delete(photo.id); }} tabIndex={repeat ? -1 : 0} onClick={() => {
        // Loop duplicates disappear in keyboard mode; return to their accessible original.
        if (repeat) primaryButtons.current.get(photo.id)?.focus({ preventScroll: true });
        onSelect(photo);
      }} aria-label={`查看大图：${photo.alt}`}><Photo photo={photo} sizes={photoSizes} /></button>)}</div>)}
    </div></div>
  </div>;
}

function Lightbox({ photo: initialPhoto, photos, onClose }: { photo: GalleryPhoto; photos: readonly GalleryPhoto[]; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex(item => item.id === initialPhoto.id)));
  const photo = photos[index] ?? initialPhoto;
  const [zoomWidth, setZoomWidth] = useState<number | null>(null);
  const move = (direction: -1 | 1) => {
    if (photos.length < 2) return;
    setZoomWidth(null);
    setIndex(current => nextGalleryPhotoIndex(current, photos.length, direction));
  };
  useLayoutEffect(() => {
    dialog.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [zoomWidth, index]);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = lockGalleryBodyScroll(document.body);
    close.current?.focus({ preventScroll: true });
    return () => {
      releaseScroll();
      requestAnimationFrame(() => {
        // A scene change may already have handed focus to its new heading.
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body && document.activeElement.isConnected) return;
        const target = previous?.isConnected ? previous : document.querySelector<HTMLElement>('nav[aria-label="主要导航"] a[aria-current="page"]');
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  return <div ref={dialog} className={`${styles.lightbox} ${photos.length > 1 ? styles.browsingLightbox : ""} ${zoomWidth === null ? "" : styles.zoomedLightbox}`} role="dialog" aria-modal="true" aria-label={photo.alt}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (photos.length > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); event.stopPropagation(); move(event.key === "ArrowLeft" ? -1 : 1); }
      if (event.key === "Tab") {
        const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    }}>
    <button ref={close} className={styles.close} onClick={onClose} aria-label="关闭大图">×</button>
    <button className={styles.zoom} aria-pressed={zoomWidth !== null} onClick={() => {
      if (zoomWidth !== null) setZoomWidth(null);
      else {
        const width = dialog.current?.querySelector("img")?.getBoundingClientRect().width;
        if (width) setZoomWidth(width * 2);
      }
    }}>{zoomWidth === null ? "放大查看" : "适应屏幕"}</button>
    <Photo photo={photo} full className={styles.lightboxPhoto} style={zoomWidth === null ? undefined : { width: zoomWidth }} />
    {photos.length > 1 && <div className={styles.photoNavigation} role="group" aria-label="当前分类照片，循环浏览">
      <button type="button" onClick={() => move(-1)} aria-label="上一张照片">← 上一张</button>
      <output aria-live="polite" aria-atomic="true">{index + 1} / {photos.length}</output>
      <button type="button" onClick={() => move(1)} aria-label="下一张照片">下一张 →</button>
    </div>}
  </div>;
}

export default function FlowGallery({ document: content, previewGroupId }: { document: GalleryDocument; previewGroupId?: string }) {
  const [scene, setScene] = useState<Scene>(previewGroupId ? "gallery" : "works");
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<GalleryPhoto | null>(null);
  const [selectedScope, setSelectedScope] = useState<readonly GalleryPhoto[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const introduction = useRef<HTMLDivElement>(null);
  const [introHeight, setIntroHeight] = useState(58);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [gridPhotoWidth, setGridPhotoWidth] = useState<number | null>(null);
  const sceneBody = useRef<HTMLElement>(null);
  const lastWheel = useRef(0);
  const touchStart = useRef<GallerySwipe | null>(null);
  const sceneFocus = useRef<"heading" | "expand" | null>(null);
  const galleryScroll = useRef(0);
  const activeScene = useRef<Scene>("works");
  const restoringScroll = useRef(false);
  const groupHeadings = useRef(new Map<string, HTMLHeadingElement>());
  const previewTargetApplied = useRef<string | null>(null);
  const groups = content.groups.filter((group) => group.photos.length > 0);
  const columns = content.featuredGroupIds
    ? [content.featuredGroupIds.left, content.featuredGroupIds.right].map(id => groups.find(group => group.id === id) ?? null)
    : groups.slice(0, 2);
  const available = useMemo(() => scenes.filter((item) => item === "works" || item === "pricing" && Boolean(content.pricing) || item === "contact" && Boolean(content.contact)), [content.pricing, content.contact]);
  const navigate = useCallback((next: Scene, focus?: "heading" | "expand") => {
    if (focus) sceneFocus.current = focus;
    window.location.hash = next;
  }, []);
  const openPhoto = (photo: GalleryPhoto, scope: readonly GalleryPhoto[] = [photo]) => {
    setSelectedScope(scope); setSelected(photo);
  };
  useEffect(() => {
    const port = galleryScrollport(root.current);
    const target = port ?? window;
    const originalRestoration = window.history.scrollRestoration;
    if (!port) window.history.scrollRestoration = "manual";
    const rememberScroll = () => {
      if (!restoringScroll.current && activeScene.current === "gallery" && readScene(available) === "gallery") {
        galleryScroll.current = galleryScrollTop(port, window);
      }
    };
    const update = () => {
      const next = readScene(available);
      if (next !== activeScene.current) {
        restoringScroll.current = true;
        const focused = document.activeElement;
        const leavingContent = focused === document.body || focused instanceof Element && root.current?.contains(focused) && !root.current.querySelector("header")?.contains(focused);
        if (!sceneFocus.current && leavingContent) {
          sceneFocus.current = activeScene.current === "gallery" && next === "works" ? "expand" : "heading";
        }
      }
      setSelected(null);
      setScene(next);
    };
    update();
    window.addEventListener("hashchange", update);
    target.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      window.removeEventListener("hashchange", update);
      target.removeEventListener("scroll", rememberScroll);
      if (!port) window.history.scrollRestoration = originalRestoration;
    };
  }, [available]);
  useLayoutEffect(() => {
    activeScene.current = scene;
    restoringScroll.current = true;
    const top = scene === "gallery" ? galleryScroll.current : 0;
    // Override the host page's smooth scrolling so intermediate animation positions
    // cannot replace the gallery bookmark during hash/history navigation.
    restoreGalleryScroll(galleryScrollport(root.current), window, top);
    if (scene !== "gallery") sceneBody.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (sceneFocus.current) {
      const target = root.current?.querySelector<HTMLElement>(sceneFocus.current === "expand" ? "[data-flow-expand]" : "[data-flow-scene-heading]");
      sceneFocus.current = null;
      target?.focus({ preventScroll: true });
    }
    const frame = requestAnimationFrame(() => { restoringScroll.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [scene]);
  useLayoutEffect(() => {
    if (!previewGroupId || scene !== "gallery" || previewTargetApplied.current === previewGroupId) return;
    // The containing native dialog opens in the editor effect. Measure after it
    // becomes visible, once per opening, so ordinary browsing keeps its bookmark.
    const frame = requestAnimationFrame(() => {
      const heading = groupHeadings.current.get(previewGroupId);
      if (!root.current || !heading) return;
      galleryScroll.current = scrollToGalleryGroup(root.current, heading, window);
      heading.focus({ preventScroll: true });
      previewTargetApplied.current = previewGroupId;
    });
    return () => cancelAnimationFrame(frame);
  }, [scene, previewGroupId]);
  useLayoutEffect(() => {
    const port = galleryScrollport(root.current);
    if (!port) return;
    const measure = () => setViewportHeight(port.clientHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(port); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      const mobile = window.matchMedia("(max-width: 700px)").matches;
      setGridPhotoWidth(Math.ceil((width - (mobile ? 45 : 130)) / (mobile ? 2 : 3)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  useLayoutEffect(() => {
    const element = introduction.current;
    if (!element) return;
    const measure = () => setIntroHeight(element.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [scene]);
  useEffect(() => {
    const element = root.current;
    if (!element || scene === "gallery" || selected) return;
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.target instanceof Element && event.target.closest("[data-flow-rail-window]")) return;
      if (window.matchMedia("(max-width: 700px)").matches || Math.abs(event.deltaY) < 18) return;
      const body = sceneBody.current;
      if (body && (event.deltaY > 0 ? body.scrollTop + body.clientHeight < body.scrollHeight - 2 : body.scrollTop > 2)) return;
      if (Date.now() - lastWheel.current < 1000) return;
      const next = available[available.indexOf(scene) + (event.deltaY > 0 ? 1 : -1)];
      if (next) { event.preventDefault(); lastWheel.current = Date.now(); navigate(next); }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [scene, selected, available, navigate]);

  return <div ref={root} data-flow-scene={scene} style={{ "--intro-height": `${introHeight}px`, ...(viewportHeight ? { "--gallery-viewport-height": `${viewportHeight}px` } : {}) } as CSSProperties} className={`${styles.root} ${scene === "gallery" ? styles.galleryRoot : ""}`}>
    <div className={styles.background} aria-hidden="true">{content.background && <Photo photo={content.background} sizes={`max(100vw, ${100 * content.background.width / content.background.height}svh)`} style={{ objectPosition: `${content.backgroundFocus?.x ?? 50}% ${content.backgroundFocus?.y ?? 50}%` }} />}</div>
    <header className={styles.navigation}>
      <a className={styles.brand} href="#works" aria-label={content.profile.brand}><span className={styles.avatar} aria-hidden="true">{content.profile.brand.slice(0, 1)}</span><span className={styles.brandName}>{content.profile.brand}</span></a>
      <nav aria-label="主要导航">{available.map((item) => <a key={item} href={`#${item}`} aria-current={scene === item || item === "works" && scene === "gallery" ? "page" : undefined}>{item === "works" ? "作品画廊" : item === "pricing" ? "价格与活动" : "联系方式"}</a>)}</nav>
    </header>
    {scene === "gallery" ? <main className={styles.fullGallery}>
      <div className={styles.galleryHeading}><button onClick={() => navigate("works", "expand")} aria-label="返回首页">↶</button><h1 data-flow-scene-heading tabIndex={-1}>{content.profile.title}</h1></div>
      {groups.length === 0 && <p className={styles.emptyGallery}>还没有作品</p>}
      {groups.map((group) => <section key={group.id} className={styles.group} data-flow-group-id={group.id} data-flow-preview-current={previewGroupId === group.id ? "true" : undefined} aria-labelledby={`group-${group.id}`}>
        <h2 ref={node => { if (node) groupHeadings.current.set(group.id, node); else groupHeadings.current.delete(group.id); }} id={`group-${group.id}`} tabIndex={previewGroupId === group.id ? -1 : undefined}><span className={styles.groupName}>{group.name}</span></h2>
        <div className={styles.photoGrid}>{group.photos.map((photo) => <button key={photo.id} className={photo.height > photo.width ? styles.tall : ""} onClick={() => openPhoto(photo, group.photos)} aria-label={`查看大图：${photo.alt}`}><Photo photo={photo} lazy sizes={gridPhotoWidth ? `${gridPhotoWidth}px` : "(max-width: 700px) calc((100vw - 45px) / 2), calc((100vw - 130px) / 3)"} /></button>)}</div>
      </section>)}
    </main> : <main ref={sceneBody} key={scene} className={`${styles.scene} ${styles[scene]}`}
      onTouchStart={(event) => {
        const interactive = event.target instanceof Element && Boolean(event.target.closest("button,a,input,select,textarea,summary,[contenteditable='true'],[role='button'],[data-flow-rail-window]"));
        touchStart.current = beginGallerySwipe(event.touches, interactive);
      }}
      onTouchMove={(event) => { if (event.touches.length !== 1) touchStart.current = null; }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={(event) => {
        const start = touchStart.current; touchStart.current = null;
        if (event.defaultPrevented || window.getSelection()?.toString()) return;
        const direction = completeGallerySwipe(start, event.changedTouches, event.touches.length);
        if (!direction) return;
        const next = available[available.indexOf(scene) + direction];
        if (next) navigate(next);
      }}>
      {scene === "works" && <>
        <div ref={introduction} className={styles.introduction}><h1 data-flow-scene-heading tabIndex={-1}>{content.profile.title}</h1><a data-flow-expand className={styles.expand} href="#gallery" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) sceneFocus.current = "heading"; }}>展开完整作品</a><p>{content.profile.intro}</p></div>
        <div className={`${styles.rails} ${paused ? styles.paused : ""}`} aria-label="作品速览" style={content.leftRailWidthPercent === undefined ? undefined : { gridTemplateColumns: `minmax(0, ${content.leftRailWidthPercent}fr) minmax(0, ${100 - content.leftRailWidthPercent}fr)` }}>
          {columns.length === 0 ? <p className={styles.emptyGallery}>还没有作品</p> : columns.map((column, index) => column ? <Rail key={`${index}-${column.id}`} group={column} reverse={index === 1} paused={paused} onSelect={photo => openPhoto(photo, column.photos)} widthPercent={index === 0 ? content.leftRailWidthPercent ?? 200 / 3 : 100 - (content.leftRailWidthPercent ?? 200 / 3)} /> : <div key={`empty-${index}`} className={styles.emptyGallery}>尚未选择{index ? "右" : "左"}侧作品分类</div>)}
        </div>
      </>}
      {scene === "pricing" && content.pricing && <section className={styles.pricePanel}><h1 data-flow-scene-heading tabIndex={-1}>{content.pricing.heading}</h1><p className={styles.priceIntro}>{content.pricing.introduction}</p><div className={styles.packages}>{content.pricing.packages.map((item) => <article key={item.id}><h2>{item.name}</h2><p className={styles.price}>{item.price}</p><p>{item.description}</p><ul>{item.details.map((line, index) => <li key={index}>{line}</li>)}</ul></article>)}</div></section>}
      {scene === "contact" && content.contact && <section className={styles.contactPanel}><div><h1 data-flow-scene-heading tabIndex={-1}>{content.contact.heading}</h1><p>{content.contact.intro}</p></div><div className={styles.contactCards}>{content.contact.items.map((item) => <article key={item.id}><h2>{item.label}</h2>{item.href && /^(https?:|mailto:)/.test(item.href) ? <a href={item.href} rel="noreferrer">{item.value} ↗</a> : <p>{item.value}</p>}{item.qrPhoto && <button className={styles.contactQr} aria-label={`查看${item.label}二维码`} onClick={() => openPhoto(item.qrPhoto!)}><Photo photo={item.qrPhoto} sizes="96px" /></button>}</article>)}</div></section>}
    </main>}
    {scene === "works" && <button className={styles.motion} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "播放动效" : "暂停动效"}</button>}
    {scene !== "gallery" && <div className={styles.sceneProgress} aria-label="页面位置"><span>0{available.indexOf(scene) + 1} / {scene === "works" ? "作品画廊" : scene === "pricing" ? "价格与活动" : "联系方式"}</span><div className={styles.progressLine}>{available.map((item) => <button key={item} aria-label={`前往${item === "works" ? "作品画廊" : item === "pricing" ? "价格与活动" : "联系方式"}`} aria-current={scene === item ? "step" : undefined} onClick={() => navigate(item)} />)}</div></div>}
    {selected && <Lightbox photo={selected} photos={selectedScope} onClose={() => setSelected(null)} />}
  </div>;
}
