"use client";
import { useEffect, useState } from "react";
import type { PhotoAsset } from "../photo-library";
import { hydrateSiteWorks, loadSiteAssets } from "./assets-client";
import { PlatformAssetContext } from "../templates/shared/asset-context";
import Lightbox from "../templates/shared/lightbox";
import type { SiteContent } from "../site-config";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import { SitePortfolioView } from "./premium-view";
import TemplateRenderer from "../templates/template-renderer";
import { useTemplateInteractions } from "../templates/shared/use-template-interactions";
import type { ContentSpace } from "./content-schema";
export default function DraftView({ space, content, assetsEndpoint }: { space: ContentSpace; content: SiteContent | PreviewPortfolioDocumentV1; assetsEndpoint: string }) {
  const [assets, setAssets] = useState<PhotoAsset[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadSiteAssets(assetsEndpoint).then(manifest => { if (active) setAssets(manifest.assets); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [assetsEndpoint]);
  if (error) return <p role="alert">本站资源暂不可读，请重新登录或刷新。未读取全局图库。</p>;
  if (!assets) return <p role="status">正在读取本站资源…</p>;
  return <LoadedDraft space={space} content={content} assets={assets} />;
}
function LoadedDraft({ space, content, assets }: { space: ContentSpace; content: SiteContent | PreviewPortfolioDocumentV1; assets: PhotoAsset[] }) {
  const basic = space === "basic" ? hydrateSiteWorks(content as SiteContent, assets) : content as SiteContent;
  const works = space === "basic" ? (basic.templateWorks[basic.activeTemplate] ?? basic.works).filter(work => work.enabled) : [];
  const interactions = useTemplateInteractions(works);
  if (space === "premium-polaroid") return <SitePortfolioView document={content as PreviewPortfolioDocumentV1} assets={assets} />;
  return <PlatformAssetContext.Provider value={new Map(assets.map(asset => [asset.id, asset.variants.full.src]))}><TemplateRenderer templateId={basic.activeTemplate} content={basic} works={works} packages={basic.packages.filter(p => p.enabled)}
    bookingTemplate={["【约拍任务申请】", ...basic.bookingFields].join("\n")} booted copiedKey={interactions.copiedKey}
    isPreview onCopy={interactions.copyText} onOpenWork={interactions.openWork} />
    {interactions.activeWork && <Lightbox work={interactions.activeWork} works={[...interactions.lightboxWorks]} frameRef={interactions.lightboxRef} closeButtonRef={interactions.closeButtonRef} onMove={interactions.moveActiveWork} onClose={() => interactions.setActiveWork(null)} />}
  </PlatformAssetContext.Provider>;
}
