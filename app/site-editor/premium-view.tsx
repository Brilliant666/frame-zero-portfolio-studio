"use client";
import { useMemo } from "react";
import type { PhotoAsset } from "../photo-library";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import { PreviewPortfolioExperience } from "../preview-workspace/portfolio-view";
import { PlatformAssetContext } from "../templates/shared/asset-context";
const EMPTY: readonly PhotoAsset[] = [];
export function SitePortfolioView({ document, embedded = false, initialCollectionId, assets = EMPTY }: { document: PreviewPortfolioDocumentV1; embedded?: boolean; initialCollectionId?: string; assets?: readonly PhotoAsset[] }) {
  const platformAssets = useMemo(() => new Map(assets.map(asset => [asset.id, asset.variants.full.src])), [assets]);
  return <PlatformAssetContext.Provider value={platformAssets}><PreviewPortfolioExperience document={document} embedded={embedded} initialCollectionId={initialCollectionId} assets={assets} /></PlatformAssetContext.Provider>;
}
