"use client";
import { useEffect, useRef } from "react";

/** Resource loading is indeterminate; never fabricate a network percentage. */
function LoadingSurface() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { if (localStorage.getItem("frame-zero:preview-star-theme:v1") === "night" && root.current) {
      root.current.style.background = "#05070d"; root.current.style.color = "#f1c86a";
    } } catch { /* The default paper theme also works with storage disabled. */ }
  }, []);
  return <div ref={root} data-preview-loading role="status" aria-label="正在准备作品集，请稍候" aria-busy="true"
    style={{ position:"fixed", inset:0, zIndex:999, display:"grid", placeContent:"center", justifyItems:"center", gap:24, background:"var(--star-intro-bg, #f5f8fb)", color:"var(--star-accent, #4a9be0)" }}>
    <i aria-hidden="true" style={{fontStyle:"normal",fontSize:44,animation:"preview-loading-spin 2s linear infinite"}}>✦</i>
    <b aria-hidden="true" style={{font:"700 13px/1 monospace",letterSpacing:".3em"}}>00</b>
    <style>{`@keyframes preview-loading-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){[data-preview-loading] i{animation:none!important}}`}</style>
  </div>;
}
export const PreviewLoading = process.env.NODE_ENV === "development" ? LoadingSurface : () => null;
