"use client";

import { useEffect, useState } from "react";
import type { PhotoAsset } from "../photo-library";
import type { SiteContent } from "../site-config";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";
import { loadSiteAssets } from "./assets-client";
import { LIVE_PREVIEW_EVENT } from "../admin-kit/live-preview";
import type { WorkbenchSpace } from "../admin-kit/workbench";
import { SiteBasicView } from "./basic-view";
import { SitePortfolioView } from "./premium-view";
import { SiteFlowGalleryView } from "./flow-gallery-view";

/**
 * Inside the editor's preview iframe: renders the editor's in-memory draft with the real template.
 * It only reads the parent window (same origin) and the Site's asset list; it never saves anything.
 */
export default function LivePreviewFrame({ space, assetsEndpoint }: { space: WorkbenchSpace; assetsEndpoint: string }) {
  const [content, setContent] = useState<unknown>(null);
  const [assets, setAssets] = useState<PhotoAsset[] | null>(null);
  const [detached, setDetached] = useState(false);
  useEffect(() => {
    let active = true;
    void loadSiteAssets(assetsEndpoint).then(manifest => { if (active) setAssets(manifest.assets); }, () => { if (active) setAssets([]); });
    return () => { active = false; };
  }, [assetsEndpoint]);
  useEffect(() => {
    let parent: Window | null = null;
    try { parent = window.parent; void parent.location.href; } catch { parent = null; }
    // Opened on its own (or framed cross-origin): there is no editor to read from.
    if (!parent || parent === window) { void Promise.resolve().then(() => setDetached(true)); return; }
    const source = parent;
    const read = () => { const value = source.__frameZeroLivePreview?.[space]; if (value) setContent(value.content); };
    void Promise.resolve().then(read);
    source.addEventListener(LIVE_PREVIEW_EVENT, read);
    return () => source.removeEventListener(LIVE_PREVIEW_EVENT, read);
  }, [space]);
  if (detached) return <p style={{ padding: 24, font: "14px/1.6 sans-serif" }}>实时预览只在编辑器内显示。</p>;
  if (content === null || assets === null) return <p style={{ padding: 24, font: "14px/1.6 sans-serif", color: "#777" }}>正在载入预览…</p>;
  if (space === "premium-flow-gallery") return <SiteFlowGalleryView document={content as FlowGalleryDocumentV1} assets={assets} />;
  if (space === "premium-polaroid") return <SitePortfolioView document={content as PreviewPortfolioDocumentV1} assets={assets} embedded />;
  return <SiteBasicView content={content as SiteContent} assets={assets} />;
}
