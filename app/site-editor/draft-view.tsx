"use client";
import type { SiteContent } from "../site-config";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import { SitePortfolioView } from "../preview-workspace/portfolio-view";
import TemplateRenderer from "../templates/template-renderer";
import { useTemplateInteractions } from "../templates/shared/use-template-interactions";
import type { ContentSpace } from "./content-schema";
export default function DraftView({ space, content }: { space: ContentSpace; content: SiteContent | PreviewPortfolioDocumentV1 }) {
  const interactions = useTemplateInteractions([]);
  if (space === "premium-polaroid") return <SitePortfolioView document={content as PreviewPortfolioDocumentV1} />;
  const basic = content as SiteContent;
  return <TemplateRenderer templateId={basic.activeTemplate} content={basic} works={[]} packages={basic.packages.filter(p => p.enabled)}
    bookingTemplate={["【约拍任务申请】", ...basic.bookingFields].join("\n")} booted copiedKey={interactions.copiedKey}
    isPreview onCopy={interactions.copyText} onOpenWork={() => {}} />;
}
