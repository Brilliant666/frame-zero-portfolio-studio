"use client";
import { useMemo } from "react";
import type { PhotoAsset } from "../photo-library";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import { PreviewPortfolioExperience } from "../preview-workspace/portfolio-view";
import { PlatformAssetContext } from "../templates/shared/asset-context";
// The lazy() wrappers below this view exist to keep these modules out of the legacy build.
// Here, in the Next-only Site entry, load them with the page: their CSS lands in the
// server-rendered head (no unstyled first paint) and hydration waits on no chunk waterfall.
import "../preview-workspace/star-motion-shell";
import "../templates/polaroid-field/template";
import "../templates/polaroid-field/motion-home";
const EMPTY: readonly PhotoAsset[] = [];
export function SitePortfolioView({ document, embedded = false, initialCollectionId, assets = EMPTY }: { document: PreviewPortfolioDocumentV1; embedded?: boolean; initialCollectionId?: string; assets?: readonly PhotoAsset[] }) {
  const platformAssets = useMemo(() => new Map(assets.map(asset => [asset.id, asset.variants.full.src])), [assets]);
  return <PlatformAssetContext.Provider value={platformAssets}><div data-site-premium><PreviewPortfolioExperience document={document} embedded={embedded} initialCollectionId={initialCollectionId} assets={assets} /></div></PlatformAssetContext.Provider>;
}
