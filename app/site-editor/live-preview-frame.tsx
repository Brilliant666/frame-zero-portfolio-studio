"use client";

import { useEffect, useRef, useState } from "react";
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

/** Site asset IDs are UUIDs. Other UUIDs in a draft (album IDs) are simply never found, and asked for once. */
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Inside the editor's preview iframe: renders the editor's in-memory draft with the real template.
 * It only reads the parent window (same origin) and the Site's asset list; it never saves anything.
 */
export default function LivePreviewFrame({ space, assetsEndpoint }: { space: WorkbenchSpace; assetsEndpoint: string }) {
  const [content, setContent] = useState<unknown>(null);
  const [assets, setAssets] = useState<PhotoAsset[] | null>(null);
  const [detached, setDetached] = useState(false);
  const mounted = useRef(true);
  const asked = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    void loadSiteAssets(assetsEndpoint).then(manifest => { if (mounted.current) setAssets(manifest.assets); }, () => { if (mounted.current) setAssets([]); });
    return () => { mounted.current = false; };
  }, [assetsEndpoint]);
  useEffect(() => {
    // A photo uploaded after the preview opened is not in its first asset list: read the list again,
    // once per newly referenced ID, so the preview shows it instead of silently leaving it out.
    if (content === null || assets === null) return;
    const known = new Set(assets.map(asset => asset.id));
    const fresh = [...new Set(JSON.stringify(content).match(UUIDS) ?? [])].map(id => id.toLowerCase()).filter(id => !known.has(id) && !asked.current.has(id));
    if (!fresh.length) return;
    fresh.forEach(id => asked.current.add(id));
    void loadSiteAssets(assetsEndpoint).then(manifest => { if (mounted.current) setAssets(manifest.assets); }, () => {});
  }, [content, assets, assetsEndpoint]);
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
