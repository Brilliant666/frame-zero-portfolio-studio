import type { PhotoAsset } from "../photo-library";
import type { SiteContent } from "../site-config";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import { SitePortfolioView } from "./premium-view";
import { SiteBasicView } from "./basic-view";
import type { ContentSpace, SpaceContent } from "./content-schema";
import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";

/** Server-rendered like the public page: assets arrive with the HTML, `null` means the Site read failed. */
export default async function DraftView({ space, content, assets }: { space: ContentSpace; content: SpaceContent; assets: PhotoAsset[] | null }) {
  if (!assets) return <p role="alert">本站资源暂不可读，请重新登录或刷新。未读取全局图库。</p>;
  if (space === "premium-flow-gallery") {
    const { SiteFlowGalleryView } = await import("./flow-gallery-view");
    return <SiteFlowGalleryView document={content as FlowGalleryDocumentV1} assets={assets} />;
  }
  if (space === "premium-polaroid") return <SitePortfolioView document={content as PreviewPortfolioDocumentV1} assets={assets} />;
  return <SiteBasicView content={content as SiteContent} assets={assets} />;
}
