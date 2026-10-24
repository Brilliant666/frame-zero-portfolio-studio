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

import { createLivePreviewAssets, type LivePreviewAssetState } from "./live-preview-assets";
import styles from "./live-preview-frame.module.css";

/**
 * Inside the editor's preview iframe: renders the editor's in-memory draft with the real template.
 * It only reads the parent window (same origin) and the Site's asset list; it never saves anything.
 */
export default function LivePreviewFrame({ space, assetsEndpoint }: { space: WorkbenchSpace; assetsEndpoint: string }) {
  const [content, setContent] = useState<unknown>(null);
  const [assetState, setAssetState] = useState<LivePreviewAssetState<PhotoAsset>>({ assets: null, loading: true, failed: false });
  const assets = assetState.assets;
  const [detached, setDetached] = useState(false);
  const refresh = useRef<ReturnType<typeof createLivePreviewAssets<PhotoAsset>> | null>(null);
  useEffect(() => {
    const controller = createLivePreviewAssets<PhotoAsset>(async () => (await loadSiteAssets(assetsEndpoint)).assets, setAssetState);
    refresh.current = controller;
    void controller.start();
    return () => { controller.dispose(); if (refresh.current === controller) refresh.current = null; };
  }, [assetsEndpoint]);
  useEffect(() => {
    refresh.current?.observe(content);
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
  const notice = assetState.failed && <aside className={styles.assetNotice} role="alert">
    <p>{assets === null ? "预览照片读取失败，请重新读取。" : "预览照片更新失败，暂时显示上次读取的照片。"}</p>
    <button type="button" disabled={assetState.loading} onClick={() => refresh.current?.retry()}>{assetState.loading ? "正在重新读取…" : "重新读取预览照片"}</button>
  </aside>;
  if (content === null || assets === null) return <>{notice}{!assetState.failed && <p style={{ padding: 24, font: "14px/1.6 sans-serif", color: "#777" }}>正在载入预览…</p>}</>;
  return <>{notice}{space === "premium-flow-gallery" ? <SiteFlowGalleryView document={content as FlowGalleryDocumentV1} assets={assets} />
    : space === "premium-polaroid" ? <SitePortfolioView document={content as PreviewPortfolioDocumentV1} assets={assets} embedded />
      : <SiteBasicView content={content as SiteContent} assets={assets} />}</>;
}
