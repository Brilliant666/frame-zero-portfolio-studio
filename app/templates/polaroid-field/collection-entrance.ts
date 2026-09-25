export type CollectionEntranceSource = { x: number; y: number; width: number; height: number; src: string; assetId: string };

/** A rotated bounding box is not the paper's width: undo rotation before scaling. */
export function collectionLandingGeometry(box: {left:number;top:number;width:number;height:number}, width:number, height:number, angle:number) {
  const radians=angle*Math.PI/180, c=Math.abs(Math.cos(radians)), s=Math.abs(Math.sin(radians));
  const scale=(box.width/(width*c+height*s)+box.height/(width*s+height*c))/2;
  return {x:box.left+box.width/2,y:box.top+box.height/2,width,height,angle,scale};
}

/** Freeze the actual target paper, including its photo inset, caption and contain crop. */
function clonePaper(card: HTMLElement) {
  const clone=card.cloneNode(true) as HTMLElement;
  const originals=[card,...card.querySelectorAll<HTMLElement>("*")];
  const copies=[clone,...clone.querySelectorAll<HTMLElement>("*")];
  originals.forEach((element,index)=>{
    const style=getComputedStyle(element),copy=copies[index];
    for(let i=0;i<style.length;i++) copy.style.setProperty(style[i],style.getPropertyValue(style[i]));
    copy.style.animation="none";copy.style.transition="none";copy.style.visibility="visible";
    copy.removeAttribute("id");copy.removeAttribute("data-card-id");
  });
  clone.tabIndex=-1;
  return clone;
}

export function collectionEntranceTiming(index: number, flight: boolean, night: boolean) {
  return { delay: (flight ? 980 : 0) + index * 60, duration: 760,
    easing: night ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.34,1.42,.64,1)" };
}

/** Scene-owned WAAPI: no timers, permanent inline hiding, or background RAF. */
export function playCollectionEntrance(world: HTMLElement, source: CollectionEntranceSource | undefined,
  selectors: { pin: string; tape: string; lines: string }, _compact = false) {
  void _compact; // Both desktop and compact views preserve the same cover identity.
  const animations = new Set<Animation>();
  let ghost: HTMLElement | undefined;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const cleanup = () => {
    animations.forEach(animation => animation.cancel()); animations.clear();
    ghost?.remove(); ghost = undefined; world.style.visibility = "visible";
    media.removeEventListener("change", onChange);
  };
  const onChange = () => { if (media.matches) cleanup(); };
  const track = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(frames, { ...options, fill: "backwards" });
    animations.add(animation);
    void animation.finished.then(() => { animations.delete(animation); animation.cancel(); }).catch(() => animations.delete(animation));
    return animation;
  };
  if (media.matches) { world.style.visibility = "visible"; return cleanup; }
  media.addEventListener("change", onChange);
  const cards = [...world.querySelectorAll<HTMLElement>("[data-card-id]")];
  const visible = (box: {left:number;top:number;width:number;height:number}) => box.left < innerWidth && box.top < innerHeight && box.left + box.width > 0 && box.top + box.height > 0;
  const landingCard=source ? cards.find(card=>card.dataset.cardId===source.assetId) : undefined;
  const stage=world.closest<HTMLElement>("[data-composer]"),clip=stage?.getBoundingClientRect();
  const fullyVisible=(box: DOMRect)=>box.left>=Math.max(0,clip?.left ?? 0) && box.top>=Math.max(0,clip?.top ?? 0)
    && box.right<=Math.min(innerWidth,clip?.right ?? innerWidth) && box.bottom<=Math.min(innerHeight,clip?.bottom ?? innerHeight);
  const night = world.closest("[data-star-theme]")?.getAttribute("data-star-theme") === "night";
  const target = landingCard?.getBoundingClientRect();
  const flight = !!(source?.src && source.width > 0 && source.height > 0 && target && visible({left:source.x,top:source.y,width:source.width,height:source.height}) && fullyVisible(target));
  if (flight && source && landingCard) {
    const target = landingCard.getBoundingClientRect();
    const paperStyle=getComputedStyle(landingCard);
    const geometry=collectionLandingGeometry(target,parseFloat(paperStyle.width)||landingCard.offsetWidth,parseFloat(paperStyle.height)||landingCard.offsetHeight,Number(landingCard.dataset.rotation ?? 0));
    ghost = clonePaper(landingCard);
    ghost.setAttribute("aria-hidden", "true"); ghost.dataset.collectionFlight = "true";
    ghost.dataset.collectionFlightAsset=source.assetId;
    Object.assign(ghost.style, { position: "fixed", left: "0px", top: "0px", right:"auto",bottom:"auto",margin:"0", width: `${geometry.width}px`, height: `${geometry.height}px`, pointerEvents: "none", zIndex: "40", transformOrigin: "center",visibility:"visible",opacity:"1",filter:"none",translate:"none",rotate:"none",scale:"none" });
    document.body.append(ghost);
    const landing = `translate(${geometry.x-geometry.width/2}px,${geometry.y-geometry.height/2}px) rotate(${geometry.angle}deg) scale(${geometry.scale})`;
    const start=`translate(${source.x+source.width/2-geometry.width/2}px,${source.y+source.height/2-geometry.height/2}px) rotate(0deg) scale(${source.width/geometry.width},${source.height/geometry.height})`;
    // Commit the final transform before WAAPI is cancelled, so the crossfade has no reset frame.
    ghost.style.transform=landing;
    const animation = track(ghost, [{ transform: start, opacity: 1 }, { transform: landing, opacity: 1 }], { duration: 980, easing: "cubic-bezier(.7,0,.2,1)" });
    void animation.finished.then(() => {
      if(!ghost)return;
      ghost.style.transform=landing;
      const fade=track(ghost,[{opacity:1},{opacity:0}],{duration:180});
      void fade.finished.then(()=>{ghost?.remove();ghost=undefined;}).catch(()=>{});
    }).catch(() => {});
  }
  cards.forEach((card, index) => {
    const timing = collectionEntranceTiming(index, flight, night);
    const landed = flight && card === landingCard;
    if(landed) return; // The real paper stays completely developed and opaque under the flight.
    const delay=timing.delay;
    track(card, [{ opacity: 1, translate: "0 -46px", rotate: "7deg", scale: ".94" }, { opacity: 1, translate: "0 0", rotate: "0deg", scale: "1" }], { ...timing, delay });
    const image = card.querySelector("img");
    if (image) track(image, [{ filter: "brightness(1.2) saturate(.6)", opacity: 1 }, { filter: "none", opacity: 1 }], { duration: 1200, delay: delay + 180, easing: "ease-out" });
    card.querySelectorAll(`${selectors.pin},${selectors.tape}`).forEach(pin => track(pin, [{ opacity: 0, scale: ".1" }, { opacity: 1, scale: "1.3", offset: .65 }, { opacity: 1, scale: "1" }], { duration: 560, delay: delay + 460, easing: timing.easing }));
  });
  world.querySelectorAll(`${selectors.lines} path`).forEach((path, index) => track(path, [{ strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: .55 }], { duration: 560, delay: (flight ? 980 : 0) + 360 + index * 60, easing: "ease-out" }));
  world.style.visibility = "visible";
  window.dispatchEvent(new CustomEvent("preview:star-boost", { detail: { duration: 1100 } }));
  return cleanup;
}
