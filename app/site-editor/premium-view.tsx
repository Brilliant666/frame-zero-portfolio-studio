"use client";

import { lazy, Suspense, useMemo } from "react";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import type { SiteContent } from "../site-config";
import { useTemplateInteractions } from "../templates/shared/use-template-interactions";

const PolaroidFieldTemplate = lazy(() => import("../templates/polaroid-field/template"));
const NO_SITE_ASSETS = [] as const;

/** Node-authorized Site preview. This module must not be imported by legacy routes. */
export function SitePortfolioView({ document, embedded = false, initialCollectionId }: { document: PreviewPortfolioDocumentV1; embedded?: boolean; initialCollectionId?: string }) {
  const content = useMemo<SiteContent>(() => {
    const { profile, hero, trustItems, packages, contact, social, bookingFields, statement } = document;
    return { profile, hero, trustItems, packages, contact, social, bookingFields, statement, activeTemplate: "polaroid-field", works: [], templateWorks: {} };
  }, [document]);
  const interactions = useTemplateInteractions([]);
  return <Suspense fallback={<p role="status">正在载入本站草稿…</p>}><PolaroidFieldTemplate
    templateId="polaroid-field" content={content} works={[]} packages={content.packages.filter(item => item.enabled)}
    bookingTemplate={["【约拍任务申请】", ...content.bookingFields].join("\n")} booted copiedKey={interactions.copiedKey}
    isPreview={embedded} onCopy={interactions.copyText} onOpenWork={() => {}}
    collectionWorkspace={{ collections: document.collections, initialCollectionId, assets: NO_SITE_ASSETS }}
  /></Suspense>;
}
