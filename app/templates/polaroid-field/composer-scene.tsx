"use client";

/* eslint-disable @next/next/no-img-element -- existing local photo variants, never uploaded by the composer. */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SceneCard } from "./collection-scene";
import { buildComposerLayout } from "./composer-layout";
import { resolveComposerHero } from "./composer-selection";
import {composerReleaseVelocity,composerZoomLimit,createComposerWheelClassifier,composerWheelZoomFactor,composerZoomShortcut,composerFlip,composerPaperBounds,constrainComposer,zoomComposerAt,type MotionSample} from "./composer-motion";
import {useComposerMotion} from "./use-composer-motion";
import {playCollectionEntrance,type CollectionEntranceSource} from "./collection-entrance";
import { COMPOSER_MODES, composerSeed, composerView, parseComposerPreference, type ComposerBounds, type ComposerPreference, type ComposerView } from "./composer-view";
import styles from "./composer.module.css";
import "./motion-fonts.css";
import { entryPhotoSource, prepareEntryPhoto, revealEntryImage } from "./entry-photos";
import GlassSegments from "../../preview-workspace/glass-segments";

type Props = { cards: readonly SceneCard[]; sceneId: string; title?: string; description?: string;
  active?: boolean; focusId?: string | null; coverId?: string | null; entranceSource?: CollectionEntranceSource; onBack: () => void; onOpen: (id: string) => void; onAssetUnavailable: (id: string) => void };
const labels = { constellation: "星座", scatter: "散落", editorial: "跨页" };
const preferenceKey = (id: string) => `frame-zero:preview-composer:v2:${id}`;
function readPreference(id: string) {
  try { return parseComposerPreference(JSON.parse(localStorage.getItem(preferenceKey(id)) ?? "null")); }
  catch { return parseComposerPreference(null); }
}

export default function ComposerScene({ cards, sceneId, title, description, active=true, focusId, coverId, entranceSource, onBack, onOpen, onAssetUnavailable }: Props) {
  const [preference, setPreference] = useState(() => readPreference(sceneId));
  const hero = resolveComposerHero(cards.map(card => card.id), preference.heroId, focusId, coverId);
  const [lines, setLines] = useState(true);
  const [size, setSize] = useState({ width: 1280, height: 800, top: 110, nav: 80 });
  const [overlays, setOverlays] = useState<ComposerBounds[]>([]);
  const cameraOptions = useMemo(() => ({mode:preference.mode,overlays}),[preference.mode,overlays]);
  const stageRef = useRef<HTMLDivElement>(null), headerRef = useRef<HTMLDivElement>(null);
  const worldRef=useRef<HTMLDivElement>(null),zoomOutput=useRef<HTMLOutputElement>(null);
  const viewRef = useRef<ComposerView>({ x: 0, y: 0, scale: 1 });
  const cameraMode = useRef<"hero" | "fit" | "manual">("hero");
  const drag = useRef<{ id: number; x: number; y: number; view: ComposerView; moved: boolean; samples:MotionSample[] } | null>(null);
  const suppressClickUntil = useRef(0);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const pinch=useRef<{distance:number;x:number;y:number;view:ComposerView}|null>(null);
  const flip=useRef<Map<string,{x:number;y:number;width:number;angle:number}>|null>(null);
  const animations=useRef(new Set<Animation>());
  const entrance=useRef<(()=>void)|null>(null),entranceStarted=useRef(false);
  const entrancePending=useRef(false),entranceGeneration=useRef(0);
  const cancelEntrance=useCallback(()=>{entranceGeneration.current++;entrancePending.current=false;entrance.current?.();entrance.current=null;entranceSource?.flight?.cleanup();if(worldRef.current)worldRef.current.style.visibility="visible";},[entranceSource]);
  const interruptEntrance=useCallback(()=>{entranceStarted.current=true;cancelEntrance();},[cancelEntrance]);
  useLayoutEffect(()=>{if(!active)interruptEntrance();},[active,interruptEntrance]);
  const beginEntrance=useCallback((mobile=false)=>{
    if(entranceStarted.current || entrancePending.current || !worldRef.current)return;
    if(!worldRef.current.querySelector("[data-card-id]")){worldRef.current.style.visibility="visible";return;}
    entrancePending.current=true;
    const generation=entranceGeneration.current,world=worldRef.current;
    const images=[...world.querySelectorAll<HTMLImageElement>("img")].filter(image=>{const box=image.getBoundingClientRect();return box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight;});
    images.forEach(image=>{image.loading="eager";});
    const ready=Promise.all(images.map(image=>prepareEntryPhoto(image.currentSrc||image.src).then(()=>image.decode().catch(()=>{}))));
    const wait=Math.max(0,300-(performance.now()-(entranceSource?.startedAt ?? performance.now())));
    let timer:ReturnType<typeof setTimeout>;
    void Promise.race([entranceSource?.ready ?? ready,new Promise(resolve=>{timer=setTimeout(resolve,wait);})]).then(()=>{
      clearTimeout(timer);
      if(generation!==entranceGeneration.current || !world.isConnected)return;
      entrancePending.current=false;entranceStarted.current=true;
      images.filter(image=>image.complete&&image.naturalWidth).forEach(image=>{image.style.opacity="1";});
      performance.mark("entry:pin-start");
      entrance.current=playCollectionEntrance(world,entranceSource,{pin:`.${styles.pin}`,tape:`.${styles.tape}`,lines:`.${styles.lines}`},mobile);
    });
  },[entranceSource]);
  useLayoutEffect(()=>()=>{cancelEntrance();entranceStarted.current=false;},[cancelEntrance]);
  const cancelAnimations=useCallback(()=>{animations.current.forEach(animation=>animation.cancel());animations.current.clear();},[]);
  useLayoutEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>{if(media.matches)cancelAnimations();};
    media.addEventListener("change",change);
    return ()=>{cancelAnimations();media.removeEventListener("change",change);};
  },[cancelAnimations]);
  const compact = size.width < 768;
  const layout = useMemo(() => buildComposerLayout(cards.map(card => ({ id: card.id, aspectRatio: card.asset?.aspectRatio ?? 1 })), {
    mode: preference.mode, seed: composerSeed(sceneId, preference), focusId: hero.id,
    viewportWidth: size.width, viewportHeight: size.height, viewportTop: size.top,
  }), [cards, hero.id, preference, sceneId, size.width, size.height, size.top]);
  const constraintRef=useRef({bounds:{left:0,top:0,right:1,bottom:1},width:1280,height:800,fitScale:1});
  useLayoutEffect(()=>{constraintRef.current={bounds:composerPaperBounds(layout.cards),width:size.width,height:size.height,fitScale:composerView(layout,size.width,size.height,size.top,"fit",cameraOptions).scale};},[layout,size,cameraOptions]);
  const constrain=useCallback((next:ComposerView)=>{
    const c=constraintRef.current,scale=composerZoomLimit(next.scale,c.fitScale);
    // Pointer-driven zoom is already clamped at its own anchor. This fallback
    // only changes out-of-range automatic destinations, around viewport centre.
    const bounded=scale===next.scale?next:zoomComposerAt(next,c.width/2,c.height/2,scale);
    return constrainComposer(bounded,c.bounds,c.width,c.height);
  },[]);
  const commit = useCallback((next: ComposerView) => {
    viewRef.current = next;
    if(worldRef.current)worldRef.current.style.transform=`translate3d(${next.x}px,${next.y}px,0) scale(${next.scale})`;
    const label=`${Math.round(next.scale*100)}%`;
    if(zoomOutput.current && zoomOutput.current.textContent!==label)zoomOutput.current.textContent=label;
    worldRef.current?.dispatchEvent(new CustomEvent("composer:scale",{detail:next.scale}));
  }, []);
  useLayoutEffect(()=>{
    const world=worldRef.current;if(!world)return;
    let timer:ReturnType<typeof setTimeout>;
    const upgrade=()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        if (!entranceStarted.current || performance.now()-(entranceSource?.startedAt ?? 0)<1600) return;
        world.querySelectorAll<HTMLImageElement>("img[data-photo-id]").forEach(image=>{
          const asset=cards.find(card=>card.id===image.dataset.photoId)?.asset;if(!asset)return;
          const box=image.getBoundingClientRect();
          if(box.right<0||box.left>innerWidth||box.bottom<0||box.top>innerHeight)return;
          const required=box.width*Math.min(2,devicePixelRatio||1);
          const tier=required>1100?2200:required>600?1100:600;
          if(tier<=Number(image.dataset.photoTier||600))return;
          const src=entryPhotoSource(asset,tier);
          void prepareEntryPhoto(src).then(loaded=>{if(loaded&&image.isConnected&&tier>Number(image.dataset.photoTier||600)){image.src=src;image.dataset.photoTier=String(tier);}});
        });
      },180);
    };
    world.addEventListener("composer:scale",upgrade);upgrade();
    return()=>{clearTimeout(timer);world.removeEventListener("composer:scale",upgrade);};
  },[cards,entranceSource]);
  const motion=useComposerMotion(viewRef,commit,!compact,constrain);
  useLayoutEffect(()=>{
    if(compact && worldRef.current)worldRef.current.style.transform="none";
    else commit(viewRef.current);
  },[compact,commit]);
  const positioned=useRef(false);
  const show = (mode: "hero" | "fit") => { cameraMode.current = mode; motion.move(composerView(layout, size.width, size.height, size.top, mode, cameraOptions)); };
  useLayoutEffect(() => {
    const stage = stageRef.current, header = headerRef.current;
    if (!stage || !header) return;
    const nav = stage.closest("main")?.querySelector("header") ?? document.querySelector("header");
    const measure = () => {
      if (!stage.clientWidth) return;
      const stageBox=stage.getBoundingClientRect();
      // Only persistent chrome counts: opening the options popover must not
      // refit the scene underneath the visitor's pointer.
      const parts=[header.querySelector(`.${styles.identity}`),header.querySelector("[data-preview-segments]"),header.querySelector("summary")];
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
    if (compact) {
      const frame=requestAnimationFrame(()=>beginEntrance(true));
      return ()=>cancelAnimationFrame(frame);
    }
    if (cameraMode.current === "manual") return;
    if(flip.current){
      const before=flip.current;flip.current=null;motion.stop();
      const next=composerView(layout,size.width,size.height,size.top,preference.mode==="scatter"?"fit":"hero",cameraOptions);
      commit(next);positioned.current=true;cancelAnimations();
      if(!matchMedia("(prefers-reduced-motion: reduce)").matches){
        const night=stageRef.current?.closest("[data-star-theme]")?.getAttribute("data-star-theme")==="night";
        const easing=night?"cubic-bezier(.22,1,.36,1)":"cubic-bezier(.3,1.25,.5,1)";
        const track=(animation:Animation)=>{animations.current.add(animation);void animation.finished.then(()=>{animations.current.delete(animation);animation.cancel();}).catch(()=>animations.current.delete(animation));};
        worldRef.current?.querySelectorAll<HTMLElement>("[data-card-id]").forEach((element,i)=>{
          const old=before.get(element.dataset.cardId!),card=layout.cards[i];if(!old || !card)return;
          element.getAnimations().forEach(animation=>animation.cancel());
          const box=element.getBoundingClientRect();
          const travel=composerFlip(old,{x:box.left+box.width/2,y:box.top+box.height/2,width:card.w*next.scale,angle:card.rot},next.scale,i,night);
          track(element.animate(travel.keyframes,travel.options));
          element.querySelectorAll(`.${styles.pin},.${styles.tape}`).forEach(dec=>track(dec.animate([{opacity:0,scale:".3"},{opacity:1,scale:"1"}],{duration:460,delay:760+Math.min(300,i*18),easing,fill:"backwards"})));
        });
        worldRef.current?.querySelectorAll(`.${styles.lines} path`).forEach((path,i)=>track(path.animate([{strokeDashoffset:1,opacity:0},{strokeDashoffset:0,opacity:.55}],{duration:520,delay:700+i*45,easing:"ease",fill:"backwards"})));
      }
      return;
    }
    let entranceFrame=0;
    const frame = requestAnimationFrame(() => {
      // A wheel/drag can start after the effect schedules this frame. Recheck
      // at execution time so an old automatic fit cannot steal manual control.
      if(cameraMode.current==="manual" || drag.current || document.hidden)return;
      const next=composerView(layout, size.width, size.height, size.top, cameraMode.current === "fit" ? "fit" : "hero", cameraOptions);
      if(positioned.current && entranceStarted.current){cancelEntrance();motion.move(next,850);}else{
        motion.stop();commit(next);positioned.current=true;
        // Let the header ResizeObserver settle before sampling the hero's destination.
        entranceFrame=requestAnimationFrame(()=>beginEntrance());
      }
    });
    return () => {cancelAnimationFrame(frame);cancelAnimationFrame(entranceFrame);};
  }, [layout, size, compact, commit, cameraOptions,motion,preference.mode,cancelAnimations,beginEntrance,cancelEntrance]);
  const updatePreference = (next: ComposerPreference) => {
    const valid = parseComposerPreference(next);
    if(!compact && (valid.mode!==preference.mode || valid.seed!==preference.seed)){
      motion.stop();const before=new Map<string,{x:number;y:number;width:number;angle:number}>();
      worldRef.current?.querySelectorAll<HTMLElement>("[data-card-id]").forEach(element=>{
        const box=element.getBoundingClientRect(),style=getComputedStyle(element),matrix=new DOMMatrixReadOnly(style.transform);
        before.set(element.dataset.cardId!,{x:box.left+box.width/2,y:box.top+box.height/2,width:element.offsetWidth*viewRef.current.scale*(Number.parseFloat(style.scale)||1),angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI+(Number.parseFloat(style.rotate)||0)});
      });flip.current=before;
    }
    setPreference(valid);
    try { localStorage.setItem(preferenceKey(sceneId), JSON.stringify(valid)); } catch { /* Private/disabled storage: this visit still works. */ }
  };
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || compact) return;
    const wheelKind=createComposerWheelClassifier();
    const wheel = (event: WheelEvent) => {
      // Floating camera/navigation buttons are part of the canvas, not scroll exits.
      // Keep native scrolling only inside editable settings and expanded controls.
      if ((event.target as Element).closest('select,input,textarea,[contenteditable="true"],details[open]')) return;
      event.preventDefault();
      cameraMode.current = "manual";
      const unit=event.deltaMode===1?16:event.deltaMode===2?size.height:1;
      const delta=event.deltaY*unit;
      if(wheelKind(event,performance.now())==="pan"){
        motion.stop();const old=viewRef.current,c=constraintRef.current;
        commit(constrainComposer({...old,x:old.x-event.deltaX*unit,y:old.y-delta},c.bounds,c.width,c.height,true));
        motion.release({x:0,y:0});return;
      }
      const old = motion.target(), fit = composerView(layout, size.width, size.height, size.top, "fit", cameraOptions);
      const scale = composerZoomLimit(old.scale*composerWheelZoomFactor(delta,event.ctrlKey),fit.scale);
      const rect = stage.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      motion.zoom(zoomComposerAt(old,x,y,scale));
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [compact, layout, size, cameraOptions,motion,commit]);
  const zoom = (factor: number) => {
    const old = motion.target(), fit = composerView(layout, size.width, size.height, size.top, "fit", cameraOptions);
    const scale = composerZoomLimit(old.scale*factor,fit.scale);
    cameraMode.current = "manual";
    motion.zoom(zoomComposerAt(old,size.width/2,size.height/2,scale));
  };
  useLayoutEffect(()=>{
    if(!active||compact)return;
    const shortcut=(event:KeyboardEvent)=>{
      const action=composerZoomShortcut(event);
      if(!action||event.defaultPrevented||document.querySelector('[aria-modal="true"]'))return;
      const target=event.target;
      if(target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"]'))return;
      event.preventDefault();event.stopPropagation();interruptEntrance();
      if(action==="fit"){cameraMode.current="fit";motion.move(composerView(layout,size.width,size.height,size.top,"fit",cameraOptions));return;}
      const old=motion.target(),fit=composerView(layout,size.width,size.height,size.top,"fit",cameraOptions);
      cameraMode.current="manual";
      motion.zoom(zoomComposerAt(old,size.width/2,size.height/2,composerZoomLimit(old.scale*(action==="in"?1.2:1/1.2),fit.scale)));
    };
    window.addEventListener("keydown",shortcut,true);
    return()=>window.removeEventListener("keydown",shortcut,true);
  },[active,compact,layout,size,cameraOptions,motion,interruptEntrance]);
  const finishDrag = (id: number,cancelled=false) => {
    pointers.current.delete(id);
    if(pinch.current){
      pinch.current=null;suppressClickUntil.current=Date.now()+250;
      const remaining=[...pointers.current.entries()][0];
      drag.current=remaining?{id:remaining[0],x:remaining[1].x,y:remaining[1].y,view:viewRef.current,moved:true,samples:[]}:null;
      if(!remaining)motion.release({x:0,y:0});
      if(stageRef.current?.hasPointerCapture(id))stageRef.current.releasePointerCapture(id);
      return;
    }
    if (drag.current?.id !== id) return;
    if (drag.current.moved) {suppressClickUntil.current = Date.now() + 250;motion.release(cancelled?{x:0,y:0}:composerReleaseVelocity(drag.current.samples,performance.now()));}
    drag.current = null;
    if (stageRef.current?.hasPointerCapture(id)) stageRef.current.releasePointerCapture(id);
  };
  return <section ref={stageRef} className={styles.stage} data-composer={preference.mode} data-collection-scene={sceneId} data-compact={compact} data-hero-source={hero.source}
    data-layout-rows={layout.meta?.selectedRows} data-layout-available={layout.meta ? `${layout.meta.availableW},${layout.meta.availableH}` : undefined}
    aria-label={`${title ?? "图集"}构图画布`} tabIndex={compact ? undefined : 0}
    onPointerDownCapture={interruptEntrance} onWheelCapture={interruptEntrance} onKeyDownCapture={interruptEntrance}
    style={{ "--nav": `${size.nav}px`,touchAction:compact?"pan-y pinch-zoom":"none" } as CSSProperties}
    onPointerDown={event => {
      const target = event.target as Element;
      if (compact || event.button !== 0 || (target.closest("button,select,input,a,summary,details") && !target.closest("[data-card-id]"))) return;
      event.preventDefault();
      motion.stop();
      suppressClickUntil.current = 0;
      pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(event.pointerType==="touch")event.currentTarget.setPointerCapture(event.pointerId);
      if(pointers.current.size===2){
        const [a,b]=[...pointers.current.values()],rect=event.currentTarget.getBoundingClientRect();
        pinch.current={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2-rect.left,y:(a.y+b.y)/2-rect.top,view:{...viewRef.current}};
        if(drag.current)drag.current.moved=true;return;
      }
      if(pointers.current.size>2)return;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current, moved: false,samples:[{x:event.clientX,y:event.clientY,t:performance.now()}] };
    }}
    onPointerMove={event => {
      if(pointers.current.has(event.pointerId))pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pinch.current && pointers.current.size>=2){
        const [a,b]=[...pointers.current.values()],start=pinch.current,rect=event.currentTarget.getBoundingClientRect();
        const fit=composerView(layout,size.width,size.height,size.top,"fit",cameraOptions);
        const scale=composerZoomLimit(start.view.scale*Math.hypot(a.x-b.x,a.y-b.y)/start.distance,fit.scale);
        const next=zoomComposerAt(start.view,start.x,start.y,scale);
        next.x+=(a.x+b.x)/2-rect.left-start.x;next.y+=(a.y+b.y)/2-rect.top-start.y;
        cameraMode.current="manual";commit(constrain(next));return;
      }
      const active = drag.current; if (!active || active.id !== event.pointerId) return;
      if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 6) return;
      active.moved = true;
      const now=performance.now();active.samples.push({x:event.clientX,y:event.clientY,t:now});active.samples=active.samples.filter(sample=>sample.t>=now-90).slice(-20);
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      cameraMode.current = "manual";
      const c=constraintRef.current;
      commit(constrainComposer({ ...active.view, x: active.view.x + event.clientX - active.x, y: active.view.y + event.clientY - active.y },c.bounds,c.width,c.height,true));
    }} onPointerUp={event => finishDrag(event.pointerId)} onPointerCancel={event => finishDrag(event.pointerId,true)} onLostPointerCapture={event => {if(pointers.current.has(event.pointerId))finishDrag(event.pointerId,true);}}
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
        motion.move({ ...viewRef.current, x: viewRef.current.x + (event.key === "ArrowLeft" ? 80 : event.key === "ArrowRight" ? -80 : 0),
          y: viewRef.current.y + (event.key === "ArrowUp" ? 80 : event.key === "ArrowDown" ? -80 : 0) },380);
      }
    }}>
    <div className={styles.header} ref={headerRef}>
      <div className={styles.identity}><button type="button" onClick={onBack}>← 返回图集首页</button><div><strong>{title || "未命名图集"}</strong><span className={styles.description}>{cards.length} 张照片{description ? ` · ${description}` : ""}</span>{description && <details className={styles.mobileDescription}><summary>图集说明</summary><span>{cards.length} 张照片 · {description}</span></details>}</div></div>
      <div className={styles.options}>
        <GlassSegments label="构图" value={preference.mode} options={COMPOSER_MODES.map(mode=>({value:mode,label:labels[mode]}))} onChange={mode=>updatePreference({...preference,mode})}/>
        <details><summary>调整摆放</summary><div className={styles.settings}>
          <label>主角照片<select aria-label="主角照片" value={hero.source === "preference" ? hero.id ?? "" : ""} disabled={!cards.length} onChange={event => updatePreference({ ...preference, heroId: event.target.value || undefined })}><option value="">封面（默认）</option>{cards.map((card, index) => <option key={card.id} value={card.id}>第 {index + 1} 张</option>)}</select></label>
          <button type="button" disabled={cards.length < 2} onClick={() => updatePreference({ ...preference, seed: (preference.seed + 1) >>> 0 })}>换一种摆法</button>
          <label><input type="checkbox" checked={lines} disabled={preference.mode !== "constellation"} onChange={event => setLines(event.target.checked)} />星座连线</label>
        </div></details>
      </div>
    </div>
    <div ref={worldRef} className={styles.world} data-composer-world style={{ width: layout.world.w, height: layout.world.h, visibility:"hidden" }}>
      {preference.mode === "constellation" && lines && !compact && <svg className={styles.lines} width={layout.world.w} height={layout.world.h} aria-hidden="true">{layout.lines.map(([x1, y1, x2, y2, sign], i) => <path key={i} pathLength={1} d={`M${x1},${y1} Q${(x1 + x2) / 2 - (y2 - y1) * .08 * sign},${(y1 + y2) / 2 + (x2 - x1) * .08 * sign} ${x2},${y2}`} />)}</svg>}
      {layout.note && <div className={styles.note} data-composer-note style={{ left: layout.note.cx - 125, top: layout.note.cy - 80, transform: `rotate(${layout.note.rot}deg)` }}><i>✦</i><strong>{title || "我的图集"}</strong><span>{cards.length} 张照片</span></div>}
      {layout.cards.map(card => {
        const source = cards[card.i], star = card.role === "hero" ? 16 : card.role === "lead" ? 11 : 8.5;
        return <button type="button" className={styles.card} data-card-id={card.id} data-role={card.role} data-rotation={card.rot} key={card.id}
          aria-label={`查看第 ${card.i + 1} 张照片${card.role === "hero" ? "（主角）" : ""}`} onClick={() => {motion.stop();onOpen(card.id);}}
          onPointerMove={event => {
            if (event.pointerType !== "mouse" || event.buttons || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            const box = event.currentTarget.getBoundingClientRect(), x = (event.clientX-box.left)/box.width-.5, y = (event.clientY-box.top)/box.height-.5;
            event.currentTarget.style.setProperty("--rx", `${-y*7}deg`); event.currentTarget.style.setProperty("--ry", `${x*8}deg`);
            event.currentTarget.style.setProperty("--gx", `${(x+.5)*100}%`); event.currentTarget.style.setProperty("--gy", `${(y+.5)*100}%`);
          }}
          onPointerLeave={event => { event.currentTarget.style.setProperty("--rx", "0deg"); event.currentTarget.style.setProperty("--ry", "0deg"); }}
          onFocus={event => {
            if (compact || !event.currentTarget.matches(":focus-visible")) return;
            motion.stop();
            cameraMode.current = "manual";
            motion.move(composerView({ ...layout, note: null, heroIdx: [card.i], heroOnly: [card.i], heroPad: 0 }, size.width, size.height, size.top, "hero"),800);
          }}
          style={{ left: card.x - card.w / 2, top: card.y - card.h / 2, width: card.w, height: card.h, zIndex: card.z, "--angle": `${card.rot}deg`, "--enter-delay": `${Math.min(card.i,12)*35}ms` } as CSSProperties}>
          <span className={styles.sheet}>
            <span className={styles.photo} style={{ left: card.f.side, top: card.f.top, width: card.pw, height: card.ph }}>{source.asset ? <img src={entryPhotoSource(source.asset)} data-photo-id={card.id} data-photo-tier="600" style={{opacity:card.id===entranceSource?.assetId?1:0}} onLoad={event=>revealEntryImage(event.currentTarget,card.id===entranceSource?.assetId)} alt={`图集照片 ${card.i + 1}`} width={source.asset.variants.card.width} height={source.asset.variants.card.height} loading={card.i < 3 || card.role === "hero" || card.id === coverId || card.id === entranceSource?.assetId ? "eager" : "lazy"} draggable={false} onError={() => onAssetUnavailable(card.id)} /> : "照片暂不可用"}</span>
            <span className={styles.caption} style={{ height: card.f.bottom, paddingInline: card.f.side, justifyContent: card.cap === "right" ? "flex-end" : undefined, fontSize: Math.max(15, Math.min(34, card.f.bottom * .5)) }}>{card.role === "hero" ? "✦ " : ""}No.{String(card.i + 1).padStart(2, "0")}</span>
          </span>
          {[card.tape, card.tape2].map((tape, index) => tape && <i className={styles.tape} key={index} aria-hidden="true" style={{ left: tape.x * card.w - tape.w / 2, width: tape.w, background: "var(--star-tape)", transform: `rotate(${tape.rot}deg)` }} />)}
          {card.pin && <svg className={styles.pin} viewBox="-12 -12 24 24" aria-hidden="true" style={{ width: star * 2, height: star * 2, left: card.w / 2 - star, top: card.f.top * .55 - star }}><path d="M0-11L2.8-2.8 11 0 2.8 2.8 0 11-2.8 2.8-11 0-2.8-2.8Z" /></svg>}
        </button>;
      })}
    </div>
    {!cards.length && <p className={styles.empty}>暂无可展示照片，已保存的素材引用仍保留。</p>}
    {!compact && <div className={styles.camera} role="group" aria-label="镜头"><button type="button" aria-label="缩小" onClick={() => zoom(1 / 1.2)}>−</button><output ref={zoomOutput}>100%</output><button type="button" aria-label="放大" onClick={() => zoom(1.2)}>+</button><button type="button" onClick={() => show("hero")}>主角</button><button type="button" onClick={() => show("fit")}>全景</button></div>}
  </section>;
}
