"use client";

/** Resource loading is indeterminate; never fabricate a network percentage. */
function LoadingSurface() {
  return <div data-preview-loading role="status" aria-label="正在准备作品集，请稍候" aria-busy="true"
    style={{ position:"fixed", inset:0, zIndex:999, display:"grid", placeContent:"center", justifyItems:"center", gap:24, background:"var(--star-intro-bg)", color:"var(--star-accent)" }}>
    <i aria-hidden="true" style={{fontStyle:"normal",fontSize:44,animation:"preview-loading-spin 2s linear infinite"}}>✦</i>
    <b aria-hidden="true" style={{font:"700 13px/1 monospace",letterSpacing:".3em"}}>00</b>
    <style>{`@keyframes preview-loading-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){[data-preview-loading] i{animation:none!important}}`}</style>
  </div>;
}
export const PreviewLoading = process.env.NODE_ENV === "development" ? LoadingSurface : () => null;
