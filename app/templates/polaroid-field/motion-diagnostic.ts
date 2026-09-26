/** Local A/B control only. No saved content or visitor composition preferences. */
export function motionPromotionDisabled() {
  if (typeof window === "undefined" || !(process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW === "1") || !["localhost","127.0.0.1","[::1]"].includes(location.hostname) || !location.pathname.startsWith("/preview")) return false;
  try { return sessionStorage.getItem("preview:motion-diagnostic") === "off"; } catch { return false; }
}

/** Keep the canvas composited during camera jobs, then allow a crisp idle repaint. */
export function createMotionActivity(world:HTMLElement) {
  let timer:ReturnType<typeof setTimeout>|undefined, disposed=false;
  const previous=world.style.willChange, disabled=motionPromotionDisabled();
  const clear=()=>{world.style.willChange=previous;};
  return {
    activity(active:boolean){
      if(disposed || disabled)return;
      clearTimeout(timer);
      if(active)world.style.willChange="transform";
      else timer=setTimeout(clear,150);
    },
    dispose(){disposed=true;clearTimeout(timer);clear();},
  };
}
