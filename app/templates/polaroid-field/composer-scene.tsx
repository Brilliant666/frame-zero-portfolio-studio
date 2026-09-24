"use client";

/* eslint-disable @next/next/no-img-element -- existing local photo variants, never uploaded by the composer. */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SceneCard } from "./collection-scene";
import { buildComposerLayout } from "./composer-layout";
import { resolveComposerHero } from "./composer-selection";
import { COMPOSER_MODES, composerSeed, composerView, parseComposerPreference, type ComposerBounds, type ComposerPreference, type ComposerView } from "./composer-view";
import styles from "./composer.module.css";

type Props = { cards: readonly SceneCard[]; sceneId: string; title?: string; description?: string;
  focusId?: string | null; coverId?: string | null; onBack: () => void; onOpen: (id: string) => void; onAssetUnavailable: (id: string) => void };
const labels = { constellation: "星座", scatter: "散落", editorial: "跨页" };
const preferenceKey = (id: string) => `frame-zero:preview-composer:v1:${id}`;
function readPreference(id: string) {
  try { return parseComposerPreference(JSON.parse(localStorage.getItem(preferenceKey(id)) ?? "null")); }
  catch { return parseComposerPreference(null); }
}

export default function ComposerScene({ cards, sceneId, title, description, focusId, coverId, onBack, onOpen, onAssetUnavailable }: Props) {
  const [preference, setPreference] = useState(() => readPreference(sceneId));
  const hero = resolveComposerHero(cards.map(card => card.id), preference.heroId, focusId, coverId);
  const [lines, setLines] = useState(true);
  const [size, setSize] = useState({ width: 1280, height: 800, top: 110, nav: 80 });
  const [overlays, setOverlays] = useState<ComposerBounds[]>([]);
  const cameraOptions = useMemo(() => ({mode:preference.mode,overlays}),[preference.mode,overlays]);
  const stageRef = useRef<HTMLDivElement>(null), headerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ComposerView>({ x: 0, y: 0, scale: 1 });
  const [view, setView] = useState<ComposerView>({ x: 0, y: 0, scale: 1 });
  const cameraMode = useRef<"hero" | "fit" | "manual">("hero");
  const drag = useRef<{ id: number; x: number; y: number; view: ComposerView; moved: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const compact = size.width < 768;
  const layout = useMemo(() => buildComposerLayout(cards.map(card => ({ id: card.id, aspectRatio: card.asset?.aspectRatio ?? 1 })), {
    mode: preference.mode, seed: composerSeed(sceneId, preference), focusId: hero.id,
    viewportWidth: size.width, viewportHeight: size.height, viewportTop: size.top,
  }), [cards, hero.id, preference, sceneId, size.width, size.height, size.top]);
  const commit = useCallback((next: ComposerView) => { viewRef.current = next; setView(next); }, []);
  const show = (mode: "hero" | "fit") => { cameraMode.current = mode; commit(composerView(layout, size.width, size.height, size.top, mode, cameraOptions)); };
  useLayoutEffect(() => {
    const stage = stageRef.current, header = headerRef.current;
    if (!stage || !header) return;
    const nav = stage.closest("main")?.querySelector("header") ?? document.querySelector("header");
    const measure = () => {
      if (!stage.clientWidth) return;
      const stageBox=stage.getBoundingClientRect();
      // Only persistent chrome counts: opening the options popover must not
      // refit the scene underneath the visitor's pointer.
      const parts=[header.querySelector(`.${styles.identity}`),header.querySelector(`.${styles.modes}`),header.querySelector("summary")];
      const measured=parts.filter((element): element is Element=>Boolean(element)).map(element=>{
        const range=element.tagName==="SUMMARY"?document.createRange():null;
        if(range) range.selectNodeContents(element);
        const box=range?range.getBoundingClientRect():element.getBoundingClientRect();
        return {left:box.left-stageBox.left-(range?24:0),right:box.right-stageBox.left+(range?10:0),top:box.top-stageBox.top-(range?7:0),bottom:box.bottom-stageBox.top+(range?7:0)};
      });
      setOverlays(old=>JSON.stringify(old)===JSON.stringify(measured)?old:measured);
      const next = { width: stage.clientWidth, height: stage.clientHeight, top: Math.max(0,...measured.map(box=>box.bottom))+8,
        nav: nav instanceof HTMLElement ? nav.offsetHeight : 80 };
      setSize(old => Object.keys(next).every(key => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage); observer.observe(header); if (nav) observer.observe(nav);
    measure(); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    cameraMode.current = preference.mode === "scatter" ? "fit" : "hero";
  }, [cards, hero.id, preference, sceneId]);
  useLayoutEffect(() => {
    if (compact || cameraMode.current === "manual") return;
    const frame = requestAnimationFrame(() => commit(composerView(layout, size.width, size.height, size.top, cameraMode.current === "fit" ? "fit" : "hero", cameraOptions)));
    return () => cancelAnimationFrame(frame);
  }, [layout, size, compact, commit, cameraOptions]);
  const updatePreference = (next: ComposerPreference) => {
    const valid = parseComposerPreference(next); setPreference(valid);
    try { localStorage.setItem(preferenceKey(sceneId), JSON.stringify(valid)); } catch { /* Private/disabled storage: this visit still works. */ }
  };
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || compact) return;
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest("button,select,input,a,summary,details") && !(event.target as Element).closest("[data-card-id]")) return;
      event.preventDefault();
      const old = viewRef.current, fit = composerView(layout, size.width, size.height, size.top, "fit", cameraOptions);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      const scale = Math.max(Math.min(.1, fit.scale), Math.min(2.4, old.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * .002)));
      const rect = stage.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top, k = scale / old.scale;
      cameraMode.current = "manual";
      commit({ x: x - (x - old.x) * k, y: y - (y - old.y) * k, scale });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [compact, layout, size, commit, cameraOptions]);
  const zoom = (factor: number) => {
    const old = viewRef.current, fit = composerView(layout, size.width, size.height, size.top, "fit", cameraOptions);
    const scale = Math.max(Math.min(.1, fit.scale), Math.min(2.4, old.scale * factor)), k = scale / old.scale;
    cameraMode.current = "manual";
    commit({ x: size.width / 2 - (size.width / 2 - old.x) * k, y: size.height / 2 - (size.height / 2 - old.y) * k, scale });
  };
  const finishDrag = (id: number) => {
    if (drag.current?.id !== id) return;
    if (drag.current.moved) suppressClickUntil.current = Date.now() + 250;
    drag.current = null;
    if (stageRef.current?.hasPointerCapture(id)) stageRef.current.releasePointerCapture(id);
  };
  return <section ref={stageRef} className={styles.stage} data-composer={preference.mode} data-collection-scene={sceneId} data-compact={compact} data-hero-source={hero.source}
    data-layout-rows={layout.meta?.selectedRows} data-layout-available={layout.meta ? `${layout.meta.availableW},${layout.meta.availableH}` : undefined}
    aria-label={`${title ?? "图集"}构图画布`} tabIndex={compact ? undefined : 0}
    style={{ "--nav": `${size.nav}px` } as CSSProperties}
    onPointerDown={event => {
      const target = event.target as Element;
      if (compact || event.button !== 0 || (target.closest("button,select,input,a,summary,details") && !target.closest("[data-card-id]"))) return;
      event.preventDefault();
      suppressClickUntil.current = 0;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current, moved: false };
    }}
    onPointerMove={event => {
      const active = drag.current; if (!active || active.id !== event.pointerId) return;
      if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 6) return;
      active.moved = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      cameraMode.current = "manual";
      commit({ ...active.view, x: active.view.x + event.clientX - active.x, y: active.view.y + event.clientY - active.y });
    }} onPointerUp={event => finishDrag(event.pointerId)} onPointerCancel={event => finishDrag(event.pointerId)} onLostPointerCapture={() => { drag.current = null; }}
    onDragStart={event => event.preventDefault()}
    onClickCapture={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
    onKeyDown={event => {
      if (compact || event.target !== event.currentTarget) return;
      if (event.key === "0" || event.key === "Home") { event.preventDefault(); show("fit"); }
      else if (event.key.toLowerCase() === "h") { event.preventDefault(); show("hero"); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.2); }
      else if (event.key === "-") { event.preventDefault(); zoom(1 / 1.2); }
      else if (event.key.startsWith("Arrow")) {
        event.preventDefault(); cameraMode.current = "manual";
        commit({ ...viewRef.current, x: viewRef.current.x + (event.key === "ArrowLeft" ? 80 : event.key === "ArrowRight" ? -80 : 0),
          y: viewRef.current.y + (event.key === "ArrowUp" ? 80 : event.key === "ArrowDown" ? -80 : 0) });
      }
    }}>
    <div className={styles.header} ref={headerRef}>
      <div className={styles.identity}><button type="button" onClick={onBack}>← 返回图集首页</button><div><strong>{title || "未命名图集"}</strong><span>{cards.length} 张照片{description ? ` · ${description}` : ""}</span></div></div>
      <div className={styles.options}>
        <div className={styles.modes} role="group" aria-label="构图">{COMPOSER_MODES.map(mode => <button type="button" key={mode} aria-pressed={mode === preference.mode} onClick={() => updatePreference({ ...preference, mode })}>{labels[mode]}</button>)}</div>
        <details><summary>调整摆放</summary><div className={styles.settings}>
          <label>主角照片<select aria-label="主角照片" value={hero.id ?? ""} disabled={!cards.length} onChange={event => updatePreference({ ...preference, heroId: event.target.value })}>{cards.map((card, index) => <option key={card.id} value={card.id}>第 {index + 1} 张</option>)}</select></label>
          <button type="button" disabled={cards.length < 2} onClick={() => updatePreference({ ...preference, seed: (preference.seed + 1) >>> 0 })}>换一种摆法</button>
          <label><input type="checkbox" checked={lines} disabled={preference.mode !== "constellation"} onChange={event => setLines(event.target.checked)} />星座连线</label>
        </div></details>
      </div>
    </div>
    <div className={styles.world} data-composer-world style={{ width: layout.world.w, height: layout.world.h,
      transform: compact ? "none" : `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
      {preference.mode === "constellation" && lines && !compact && <svg className={styles.lines} width={layout.world.w} height={layout.world.h} aria-hidden="true">{layout.lines.map(([x1, y1, x2, y2, sign], i) => <path key={i} d={`M${x1},${y1} Q${(x1 + x2) / 2 - (y2 - y1) * .08 * sign},${(y1 + y2) / 2 + (x2 - x1) * .08 * sign} ${x2},${y2}`} />)}</svg>}
      {layout.note && <div className={styles.note} data-composer-note style={{ left: layout.note.cx - 125, top: layout.note.cy - 80, transform: `rotate(${layout.note.rot}deg)` }}><i>✦</i><strong>{title || "我的图集"}</strong><span>{cards.length} 张照片</span></div>}
      {layout.cards.map(card => {
        const source = cards[card.i], star = card.role === "hero" ? 16 : card.role === "lead" ? 11 : 8.5;
        return <button type="button" className={styles.card} data-card-id={card.id} data-role={card.role} data-rotation={card.rot} key={card.id}
          aria-label={`查看第 ${card.i + 1} 张照片${card.role === "hero" ? "（主角）" : ""}`} onClick={() => onOpen(card.id)}
          onFocus={event => {
            if (compact || !event.currentTarget.matches(":focus-visible")) return;
            const box = event.currentTarget.getBoundingClientRect(), stage = stageRef.current!.getBoundingClientRect();
            if (box.left < stage.left + 24 || box.right > stage.right - 24 || box.top < stage.top + size.top || box.bottom > stage.bottom - 72) {
              cameraMode.current = "manual";
              commit(composerView({ ...layout, note: null, heroIdx: [card.i], heroOnly: [card.i], heroPad: 0 }, size.width, size.height, size.top, "hero"));
            }
          }}
          style={{ left: card.x - card.w / 2, top: card.y - card.h / 2, width: card.w, height: card.h, zIndex: card.z, "--angle": `${card.rot}deg` } as CSSProperties}>
          <span className={styles.sheet}>
            <span className={styles.photo} style={{ left: card.f.side, top: card.f.top, width: card.pw, height: card.ph }}>{source.asset ? <img src={source.asset.variants.card.src} alt={`图集照片 ${card.i + 1}`} width={source.asset.variants.card.width} height={source.asset.variants.card.height} loading={card.i < 3 || card.role === "hero" ? "eager" : "lazy"} draggable={false} onError={() => onAssetUnavailable(card.id)} /> : "照片暂不可用"}</span>
            <span className={styles.caption} style={{ height: card.f.bottom, paddingInline: card.f.side, justifyContent: card.cap === "right" ? "flex-end" : undefined, fontSize: Math.max(15, Math.min(34, card.f.bottom * .5)) }}>{card.role === "hero" ? "✦ " : ""}No.{String(card.i + 1).padStart(2, "0")}</span>
          </span>
          {[card.tape, card.tape2].map((tape, index) => tape && <i className={styles.tape} key={index} aria-hidden="true" style={{ left: tape.x * card.w - tape.w / 2, width: tape.w, background: tape.color, transform: `rotate(${tape.rot}deg)` }} />)}
          {card.pin && <svg className={styles.pin} viewBox="-12 -12 24 24" aria-hidden="true" style={{ width: star * 2, height: star * 2, left: card.w / 2 - star, top: card.f.top * .55 - star }}><path d="M0-11L2.8-2.8 11 0 2.8 2.8 0 11-2.8 2.8-11 0-2.8-2.8Z" /></svg>}
        </button>;
      })}
    </div>
    {!cards.length && <p className={styles.empty}>暂无可展示照片，已保存的素材引用仍保留。</p>}
    {!compact && <div className={styles.camera} role="group" aria-label="镜头"><button type="button" aria-label="缩小" onClick={() => zoom(1 / 1.2)}>−</button><output>{Math.round(view.scale * 100)}%</output><button type="button" aria-label="放大" onClick={() => zoom(1.2)}>+</button><button type="button" onClick={() => show("hero")}>主角</button><button type="button" onClick={() => show("fit")}>全景</button></div>}
  </section>;
}
