export type CollectionEntranceSource = { x: number; y: number; width: number; height: number; src: string };

export function collectionEntranceTiming(index: number, flight: boolean, night: boolean) {
  return { delay: (flight ? 980 : 0) + index * 60, duration: 760,
    easing: night ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.34,1.42,.64,1)" };
}

/** Scene-owned WAAPI: no timers, permanent inline hiding, or background RAF. */
export function playCollectionEntrance(world: HTMLElement, source: CollectionEntranceSource | undefined,
  selectors: { pin: string; tape: string; lines: string }, compact = false) {
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
  const hero = cards.find(card => card.dataset.role === "hero") ?? cards[0];
  let landingCard = hero;
  // Mobile keeps saved numeric reading order, not desktop spatial order. Land
  // on a visible paper instead of scrolling the visitor down to an offscreen hero.
  if(compact && hero && !visible(hero.getBoundingClientRect())) landingCard=cards.find(card=>visible(card.getBoundingClientRect())) ?? hero;
  const night = world.closest("[data-star-theme]")?.getAttribute("data-star-theme") === "night";
  const target = landingCard?.getBoundingClientRect();
  const flight = !!(source?.src && source.width > 0 && source.height > 0 && target && visible({left:source.x,top:source.y,width:source.width,height:source.height}) && visible(target));
  if (flight && source && landingCard) {
    const target = landingCard.getBoundingClientRect();
    ghost = document.createElement("div");
    ghost.setAttribute("aria-hidden", "true"); ghost.dataset.collectionFlight = "true";
    Object.assign(ghost.style, { position: "fixed", left: `${source.x}px`, top: `${source.y}px`, width: `${source.width}px`, height: `${source.height}px`, pointerEvents: "none", zIndex: "40", padding: "8px 8px 28px", boxSizing: "border-box", background: getComputedStyle(world).getPropertyValue("--star-paper").trim(), boxShadow: "0 18px 38px #0003", transformOrigin: "center" });
    const image = document.createElement("img"); image.src = source.src; image.alt = "";
    Object.assign(image.style, { width: "100%", height: "100%", objectFit: "contain" }); ghost.append(image); document.body.append(ghost);
    const landing = `translate(${target.left+target.width/2-source.x-source.width/2}px,${target.top+target.height/2-source.y-source.height/2}px) scale(${target.width/source.width}) rotate(${landingCard.dataset.rotation ?? 0}deg)`;
    const animation = track(ghost, [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: landing, opacity: 1 }], { duration: 980, easing: "cubic-bezier(.7,0,.2,1)" });
    void animation.finished.then(() => {
      if(!ghost)return;
      ghost.style.transform=landing;
      const fade=track(ghost,[{opacity:1},{opacity:0}],{duration:160});
      void fade.finished.then(()=>{ghost?.remove();ghost=undefined;}).catch(()=>{});
    }).catch(() => {});
  }
  cards.forEach((card, index) => {
    const timing = collectionEntranceTiming(index, flight, night);
    const delay = flight && card === landingCard ? 980 : timing.delay;
    const landed = flight && card === landingCard;
    track(card, [{ opacity: 0, translate: landed ? "0 0" : "0 -46px", rotate: landed ? "0deg" : "7deg", scale: landed ? "1" : ".94" }, { opacity: 1, translate: "0 0", rotate: "0deg", scale: "1" }], { ...timing, delay, duration: landed ? 160 : timing.duration });
    const image = card.querySelector("img");
    if (image) track(image, [{ filter: "brightness(1.65) saturate(.25) sepia(.3) blur(2px)", opacity: .35 }, { filter: "none", opacity: 1 }], { duration: 1700, delay: delay + 180, easing: "ease-out" });
    card.querySelectorAll(`${selectors.pin},${selectors.tape}`).forEach(pin => track(pin, [{ opacity: 0, scale: ".1" }, { opacity: 1, scale: "1.3", offset: .65 }, { opacity: 1, scale: "1" }], { duration: 560, delay: delay + 460, easing: timing.easing }));
  });
  world.querySelectorAll(`${selectors.lines} path`).forEach((path, index) => track(path, [{ strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: .55 }], { duration: 560, delay: (flight ? 980 : 0) + 360 + index * 60, easing: "ease-out" }));
  world.style.visibility = "visible";
  window.dispatchEvent(new CustomEvent("preview:star-boost", { detail: { duration: 1100 } }));
  return cleanup;
}
