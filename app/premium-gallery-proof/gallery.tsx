"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GalleryDocument, GalleryPhoto } from "./model";
import { galleryScrollport, galleryScrollTop, restoreGalleryScroll } from "./scrollport";
import { lockGalleryBodyScroll } from "./body-scroll-lock";
import styles from "./gallery.module.css";

type Scene = "works" | "pricing" | "contact" | "gallery";
const scenes: Scene[] = ["works", "pricing", "contact"];

function readScene(available: Scene[]): Scene {
  const hash = window.location.hash.slice(1);
  return [...available, "gallery"].includes(hash) ? hash as Scene : "works";
}

function Photo({ photo, className, style }: { photo: GalleryPhoto; className?: string; style?: CSSProperties }) {
  // Authored proof assets retain intrinsic dimensions, including in the moving rails.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} style={style} src={photo.url} width={photo.width} height={photo.height} alt={photo.alt} draggable={false} />;
}

function Rail({ group, reverse, paused, onSelect }: { group: GalleryDocument["groups"][number]; reverse: boolean; paused: boolean; onSelect: (photo: GalleryPhoto) => void }) {
  const rail = useRef<HTMLDivElement>(null);
  const railWindow = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const primaryButtons = useRef(new Map<string, HTMLButtonElement>());
  const [duration, setDuration] = useState(600);
  const keyboardIntent = useRef(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
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
  useEffect(() => {
    const element = copy.current;
    if (!element) return;
    // Visible reference samples move about 25–26 px/s, independently of list length.
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
    <div ref={railWindow} className={styles.railWindow}><div className={`${styles.track} ${reverse ? styles.reverse : ""}`} style={{ "--rail-duration": `${duration}s` } as CSSProperties}>
      {[0, 1].map((repeat) => <div ref={repeat === 0 ? copy : undefined} key={repeat} className={styles.railCopy} aria-hidden={repeat === 1 ? true : undefined}>{group.photos.map((photo) => <button key={photo.id} ref={repeat ? undefined : (button) => { if (button) primaryButtons.current.set(photo.id, button); else primaryButtons.current.delete(photo.id); }} tabIndex={repeat ? -1 : 0} onClick={() => {
        // Loop duplicates disappear in keyboard mode; return to their accessible original.
        if (repeat) primaryButtons.current.get(photo.id)?.focus({ preventScroll: true });
        onSelect(photo);
      }} aria-label={`查看大图：${photo.alt}`}><Photo photo={photo} /></button>)}</div>)}
    </div></div>
  </div>;
}

function Lightbox({ photo, onClose }: { photo: GalleryPhoto; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = lockGalleryBodyScroll(document.body);
    close.current?.focus();
    return () => {
      releaseScroll();
      requestAnimationFrame(() => {
        const target = previous?.isConnected ? previous : document.querySelector<HTMLElement>('nav[aria-label="主要导航"] a[aria-current="page"]');
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  return <div ref={dialog} className={styles.lightbox} role="dialog" aria-modal="true" aria-label={photo.alt}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") { event.preventDefault(); close.current?.focus(); }
    }}>
    <button ref={close} className={styles.close} onClick={onClose} aria-label="关闭大图">×</button>
    <Photo photo={photo} className={photo.height > photo.width ? styles.portraitLightbox : styles.landscapeLightbox} />
  </div>;
}

export default function FlowGallery({ document: content }: { document: GalleryDocument }) {
  const [scene, setScene] = useState<Scene>("works");
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<GalleryPhoto | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const introduction = useRef<HTMLDivElement>(null);
  const [introHeight, setIntroHeight] = useState(58);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const sceneBody = useRef<HTMLElement>(null);
  const lastWheel = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const galleryScroll = useRef(0);
  const activeScene = useRef<Scene>("works");
  const restoringScroll = useRef(false);
  const groups = content.groups.filter((group) => group.photos.length > 0);
  const columns = content.featuredGroupIds
    ? [content.featuredGroupIds.left, content.featuredGroupIds.right].map(id => groups.find(group => group.id === id) ?? null)
    : groups.slice(0, 2);
  const available = useMemo(() => scenes.filter((item) => item === "works" || item === "pricing" && Boolean(content.pricing) || item === "contact" && Boolean(content.contact)), [content.pricing, content.contact]);
  const navigate = useCallback((next: Scene) => {
    window.location.hash = next;
  }, []);
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
      if (next !== activeScene.current) restoringScroll.current = true;
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
    const frame = requestAnimationFrame(() => { restoringScroll.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [scene]);
  useLayoutEffect(() => {
    const port = galleryScrollport(root.current);
    if (!port) return;
    const measure = () => setViewportHeight(port.clientHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(port); measure();
    return () => observer.disconnect();
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

  return <div ref={root} style={{ "--intro-height": `${introHeight}px`, ...(viewportHeight ? { "--gallery-viewport-height": `${viewportHeight}px` } : {}) } as CSSProperties} className={`${styles.root} ${scene === "gallery" ? styles.galleryRoot : ""}`}>
    <div className={styles.background} aria-hidden="true">{content.background && <Photo photo={content.background} style={{ objectPosition: `${content.backgroundFocus?.x ?? 50}% ${content.backgroundFocus?.y ?? 50}%` }} />}</div>
    <header className={styles.navigation}>
      <a className={styles.brand} href="#works" aria-label={content.profile.brand}><span className={styles.avatar} aria-hidden="true">{content.profile.brand.slice(0, 1)}</span><span className={styles.brandName}>{content.profile.brand}</span></a>
      <nav aria-label="主要导航">{available.map((item) => <a key={item} href={`#${item}`} aria-current={scene === item || item === "works" && scene === "gallery" ? "page" : undefined}>{item === "works" ? "作品画廊" : item === "pricing" ? "价格与活动" : "联系方式"}</a>)}</nav>
    </header>
    {scene === "gallery" ? <main className={styles.fullGallery}>
      <div className={styles.galleryHeading}><button onClick={() => navigate("works")} aria-label="返回首页">↶</button><h1>{content.profile.title}</h1></div>
      {groups.length === 0 && <p className={styles.emptyGallery}>还没有作品</p>}
      {groups.map((group) => <section key={group.id} className={styles.group} aria-labelledby={`group-${group.id}`}>
        <h2 id={`group-${group.id}`}>{group.name}</h2>
        <div className={styles.photoGrid}>{group.photos.map((photo) => <button key={photo.id} className={photo.height > photo.width ? styles.tall : ""} onClick={() => setSelected(photo)} aria-label={`查看大图：${photo.alt}`}><Photo photo={photo} /></button>)}</div>
      </section>)}
    </main> : <main ref={sceneBody} key={scene} className={`${styles.scene} ${styles[scene]}`}
      onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
      onTouchEnd={(event) => {
        const start = touchStart.current; touchStart.current = null;
        if (!start) return;
        const touch = event.changedTouches[0], dx = touch.clientX - start.x, dy = touch.clientY - start.y;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        const next = available[available.indexOf(scene) + (dx < 0 ? 1 : -1)];
        if (next) navigate(next);
      }}>
      {scene === "works" && <>
        <div ref={introduction} className={styles.introduction}><h1>{content.profile.title}</h1><a className={styles.expand} href="#gallery">展开完整作品</a><p>{content.profile.intro}</p></div>
        <div className={`${styles.rails} ${paused ? styles.paused : ""}`} aria-label="作品速览">
          {columns.length === 0 ? <p className={styles.emptyGallery}>还没有作品</p> : columns.map((column, index) => column ? <Rail key={`${index}-${column.id}`} group={column} reverse={index === 1} paused={paused} onSelect={setSelected} /> : <div key={`empty-${index}`} className={styles.emptyGallery}>尚未选择{index ? "右" : "左"}侧作品分类</div>)}
        </div>
      </>}
      {scene === "pricing" && content.pricing && <section className={styles.pricePanel}><h1>{content.pricing.heading}</h1><p className={styles.priceIntro}>{content.pricing.introduction}</p><div className={styles.packages}>{content.pricing.packages.map((item) => <article key={item.id}><h2>{item.name}</h2><p className={styles.price}>{item.price}</p><p>{item.description}</p><ul>{item.details.map((line, index) => <li key={index}>{line}</li>)}</ul></article>)}</div></section>}
      {scene === "contact" && content.contact && <section className={styles.contactPanel}><div><h1>{content.contact.heading}</h1><p>{content.contact.intro}</p></div><div className={styles.contactCards}>{content.contact.items.map((item) => <article key={item.id}><h2>{item.label}</h2>{item.href && /^(https?:|mailto:)/.test(item.href) ? <a href={item.href} rel="noreferrer">{item.value} ↗</a> : <p>{item.value}</p>}{item.qrPhoto && <button className={styles.contactQr} aria-label={`查看${item.label}二维码`} onClick={() => setSelected(item.qrPhoto!)}><Photo photo={item.qrPhoto} /></button>}</article>)}</div></section>}
    </main>}
    {scene === "works" && <button className={styles.motion} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "播放动效" : "暂停动效"}</button>}
    {scene !== "gallery" && <div className={styles.sceneProgress} aria-label="页面位置"><span>0{available.indexOf(scene) + 1} / {scene === "works" ? "作品画廊" : scene === "pricing" ? "价格与活动" : "联系方式"}</span><div className={styles.progressLine}>{available.map((item) => <button key={item} aria-label={`前往${item === "works" ? "作品画廊" : item === "pricing" ? "价格与活动" : "联系方式"}`} aria-current={scene === item ? "step" : undefined} onClick={() => navigate(item)} />)}</div></div>}
    {selected && <Lightbox photo={selected} onClose={() => setSelected(null)} />}
  </div>;
}
