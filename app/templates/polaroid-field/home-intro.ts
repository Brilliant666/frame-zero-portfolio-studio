export const HOME_INTRO_KEY = "preview:star-home-intro:v1";
let seenInDocument = false;

export function claimHomeIntro(storage: Pick<Storage, "getItem" | "setItem"> | null, suppress = false) {
  let stored = false;
  try { stored = storage?.getItem(HOME_INTRO_KEY) === "seen"; storage?.setItem(HOME_INTRO_KEY, "seen"); } catch { /* Private browsing can deny session storage. */ }
  const play = !seenInDocument && !stored && !suppress;
  seenInDocument = true;
  return play;
}

export function introProgress(elapsed: number) {
  const progress = Math.max(0, Math.min(1, elapsed / 950));
  return Math.round((1 - (1 - progress) ** 3) * 100);
}

export function titleCharacterDelay(index: number) { return Math.min(index, 8) * 130; }

/** Own every animation handle, including fill-forwards effects on hidden nodes. */
export function runHomeIntro(root: HTMLElement) {
  const overlay = root.querySelector<HTMLButtonElement>("[data-home-intro]")!;
  const star = overlay.querySelector<HTMLElement>("[data-intro-star]")!;
  const count = overlay.querySelector<HTMLElement>("[data-intro-count]")!;
  const title = [...root.querySelectorAll<HTMLElement>("[data-title-character]")];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations: Animation[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let raf = 0, stopped = false, revealing = false;
  const animate = (node: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = node.animate(frames, options); animations.push(animation); return animation;
  };
  const restoreFocus = () => { if (document.activeElement === overlay) root.querySelector<HTMLButtonElement>("[data-home-action]")?.focus({ preventScroll: true }); };
  const clear = () => {
    cancelAnimationFrame(raf); timers.forEach(clearTimeout); animations.forEach((animation) => animation.cancel());
    restoreFocus(); overlay.hidden = true; root.removeAttribute("data-intro-active");
    overlay.removeEventListener("click", skip); window.removeEventListener("keydown", key); motion.removeEventListener("change", changed);
  };
  const skip = () => { stopped = true; clear(); };
  const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); skip(); } };
  const changed = () => { if (motion.matches) skip(); };
  const burst = () => {
    if (stopped || motion.matches) return;
    const sparkles = root.querySelectorAll<HTMLElement>("[data-intro-spark]");
    sparkles.forEach((spark, index) => {
      const angle = index / sparkles.length * Math.PI * 2;
      animate(spark, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 1, offset: .1 }, { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(angle) * 110}px),calc(-50% + ${Math.sin(angle) * 110}px)) rotate(100deg) scale(.1)` }], { duration: 850, fill: "both", easing: "ease-out" });
    });
  };
  const reveal = () => {
    if (stopped || revealing) return;
    revealing = true; cancelAnimationFrame(raf); count.textContent = "100";
    animate(star, [{ transform: "rotate(180deg) scale(1)", opacity: 1 }, { transform: "rotate(225deg) scale(26)", opacity: 0 }], { duration: 760, fill: "forwards", easing: "cubic-bezier(.7,0,.2,1)" });
    animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: "forwards" });
    window.dispatchEvent(new CustomEvent("preview:star-boost", { detail: { duration: 900 } }));
    title.forEach((character, index) => animate(character, [{ transform: "translateY(112%)" }, { transform: "translateY(0)" }], { duration: 1150, delay: 180 + titleCharacterDelay(index), easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }));
    timers.push(setTimeout(() => { restoreFocus(); overlay.hidden = true; }, 500));
    const duration = 1330 + titleCharacterDelay(Math.max(0, title.length - 1));
    timers.push(setTimeout(burst, duration));
    timers.push(setTimeout(clear, duration + 900));
  };
  overlay.addEventListener("click", skip); window.addEventListener("keydown", key); motion.addEventListener("change", changed);
  if (motion.matches) skip();
  else {
    overlay.hidden = false; root.dataset.introActive = "true"; overlay.focus({ preventScroll: true });
    animate(star, [{ transform: "rotate(0deg) scale(.6)", opacity: 0 }, { transform: "rotate(180deg) scale(1)", opacity: 1 }], { duration: 900, fill: "forwards", easing: "cubic-bezier(.22,1,.36,1)" });
    const start = performance.now();
    const tick = (now: number) => { if (stopped) return; count.textContent = String(introProgress(now - start)).padStart(2, "0"); if (now - start < 950) raf = requestAnimationFrame(tick); else reveal(); };
    raf = requestAnimationFrame(tick);
  }
  return () => { stopped = true; clear(); overlay.removeEventListener("click", skip); window.removeEventListener("keydown", key); motion.removeEventListener("change", changed); };
}
