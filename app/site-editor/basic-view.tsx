"use client";
import { useLayoutEffect, useMemo } from "react";
import type { PhotoAsset } from "../photo-library";
import type { SiteContent } from "../site-config";
import { hydrateSiteWorks } from "./assets-client";
import { PlatformAssetContext } from "../templates/shared/asset-context";
import BasicTemplateHost from "../templates/shared/basic-template-host";
import { useTemplateWorks } from "../templates/shared/use-template-works";
import { useTemplateInteractions } from "../templates/shared/use-template-interactions";

/** Shared renderer for the saved private draft and the immutable public snapshot. */
export function SiteBasicView({ content, assets }: { content: SiteContent; assets: readonly PhotoAsset[] }) {
  const basic = useMemo(() => hydrateSiteWorks(content, assets), [content, assets]);
  const { works } = useTemplateWorks(basic, basic.activeTemplate);
  const interactions = useTemplateInteractions(works);
  const platformAssets = useMemo(() => new Map(assets.map(a => [a.id, a.variants.full.src])), [assets]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    delete root.dataset.previewTheme; delete root.dataset.starTheme; delete root.dataset.publicPortfolio;
    document.body.classList.remove("is-locked");
    window.dispatchEvent(new Event("preview:theme-change"));
  }, []);
  return <PlatformAssetContext.Provider value={platformAssets}>
    <BasicTemplateHost templateId={basic.activeTemplate} content={basic} works={works} packages={basic.packages.filter(p => p.enabled)}
      bookingTemplate={["【约拍任务申请】", ...basic.bookingFields].join("\n")} booted
      isPreview={false} interactions={interactions} lightboxTemplate={basic.activeTemplate} />
  </PlatformAssetContext.Provider>;
}
