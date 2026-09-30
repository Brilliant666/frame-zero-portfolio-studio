"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { PhotoAsset } from "../photo-library";
import { loadSiteAssets } from "./assets-client";
import type { SiteContent } from "../site-config";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import { SitePortfolioView } from "./premium-view";
import { SiteBasicView } from "./basic-view";
import type { ContentSpace, SpaceContent } from "./content-schema";
import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";
const FlowGalleryView = dynamic(() => import("./flow-gallery-view").then(module => module.SiteFlowGalleryView));
export default function DraftView({ space, content, assetsEndpoint }: { space: ContentSpace; content: SpaceContent; assetsEndpoint: string }) {
  const [loaded, setLoaded] = useState<{ endpoint: string; assets: PhotoAsset[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadSiteAssets(assetsEndpoint).then(manifest => { if (active) { setLoaded({ endpoint: assetsEndpoint, assets: manifest.assets }); setError(null); } }, () => { if (active) setError(assetsEndpoint); });
    return () => { active = false; };
  }, [assetsEndpoint]);
  if (error === assetsEndpoint) return <p role="alert">本站资源暂不可读，请重新登录或刷新。未读取全局图库。</p>;
  if (!loaded || loaded.endpoint !== assetsEndpoint) return <p role="status">正在读取本站资源…</p>;
  return <LoadedDraft key={`${assetsEndpoint}:${space}`} space={space} content={content} assets={loaded.assets} />;
}
function LoadedDraft({ space, content, assets }: { space: ContentSpace; content: SpaceContent; assets: PhotoAsset[] }) {
  if (space === "premium-flow-gallery") return <FlowGalleryView document={content as FlowGalleryDocumentV1} assets={assets} />;
  if (space === "premium-polaroid") return <SitePortfolioView document={content as PreviewPortfolioDocumentV1} assets={assets} />;
  return <SiteBasicView content={content as SiteContent} assets={assets} />;
}
