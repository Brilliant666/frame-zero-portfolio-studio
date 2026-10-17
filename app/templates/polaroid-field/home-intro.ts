export const HOME_INTRO_KEY = "preview:star-home-intro:v1";
let seenInDocument = false;

export function claimHomeIntro(storage: Pick<Storage, "getItem" | "setItem"> | null, suppress = false) {
  let stored = false;
  try { stored = storage?.getItem(HOME_INTRO_KEY) === "seen"; storage?.setItem(HOME_INTRO_KEY, "seen"); } catch { /* Private browsing can deny session storage. */ }
  const play = !seenInDocument && !stored && !suppress;
  seenInDocument = true;
  return play;
}

export function titleCharacterDelay(index: number) { return Math.min(index, 8) * 130; }

/**
 * Inline and pre-paint: decides the first-visit opening before any bundle runs, so CSS plays it
 * from the very first frame instead of covering content that is already there. Mirrors
 * claimHomeIntro: unseen in this tab (or storage denied), not an album deep link, motion allowed.
 */
export const HOME_INTRO_BOOTSTRAP = `(function(){var s;try{s=sessionStorage.getItem('${HOME_INTRO_KEY}')}catch(e){}if(s!=='seen'&&location.hash.indexOf('#polaroid-collection-')!==0&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.starIntro='play'})()`;

/** The opening itself is CSS. This only adds what needs the hydrated page, and owns every handle. */
export function runHomeIntro(root: HTMLElement) {
  const html = document.documentElement;
  if (html.dataset.starIntro !== "play") return () => {};
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations: Animation[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const clear = () => {
    if (stopped) return;
    stopped = true; timers.forEach(clearTimeout); animations.forEach(animation => animation.cancel());
    delete html.dataset.starIntro; motion.removeEventListener("change", changed);
  };
  const changed = () => { if (motion.matches) clear(); };
  motion.addEventListener("change", changed);
  // The sky's surge belongs to the opening; a device that hydrates after the title settled skips it.
  if (performance.now() < 1200) window.dispatchEvent(new CustomEvent("preview:star-boost", { detail: { duration: 900 } }));
  const burst = () => {
    if (stopped) return;
    const box = root.querySelector<HTMLElement>("[data-title-star]")?.getBoundingClientRect();
    const sparks = root.querySelectorAll<HTMLElement>("[data-intro-spark]");
    if (box) sparks.forEach((spark, index) => {
      const angle = index / sparks.length * Math.PI * 2;
      spark.style.left = `${box.left + box.width / 2}px`; spark.style.top = `${box.top + box.height / 2}px`;
      animations.push(spark.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 1, offset: .1 }, { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(angle) * 90}px),calc(-50% + ${Math.sin(angle) * 90}px)) rotate(100deg) scale(.1)` }], { duration: 850, fill: "both", easing: "ease-out" }));
    });
    timers.push(setTimeout(clear, 900));
  };
  // Follow the real CSS rise, however late hydration arrived; no rise (unstyled, reduced) means no burst.
  const characters = root.querySelectorAll<HTMLElement>("[data-title-character]");
  const rise = characters[characters.length - 1]?.getAnimations?.() ?? [];
  if (rise.length) void Promise.all(rise.map(animation => animation.finished)).then(burst, clear);
  else clear();
  return clear;
}
