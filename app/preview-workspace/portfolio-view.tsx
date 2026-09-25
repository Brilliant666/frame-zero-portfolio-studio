"use client";

import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { PreviewPortfolioDocumentV1 } from "./document";
import type { SiteContent, Work } from "../site-config";
import { getClientVisiblePortfolioTitle } from "../client-visible-title";
import Lightbox from "../templates/shared/lightbox";
import { useTemplateInteractions } from "../templates/shared/use-template-interactions";
import { PreviewLoading } from "./preview-loading";

// Keep local-only design assets out of both production runtime artifacts.
const StarMotionShell = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW === "1" ? lazy(() => import("./star-motion-shell")) : Fragment;
const StarThemeToggle = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW === "1" ? lazy(() => import("./star-motion-shell").then(module => ({ default: module.StarThemeToggle }))) : () => null;

const PolaroidFieldTemplate = lazy(() => import("../templates/polaroid-field/template"));

// A rendering adapter only: no legacy defaults, reads, normalization or writes.
export function previewDisplayContent(document: PreviewPortfolioDocumentV1): SiteContent {
  const { profile, hero, trustItems, packages, contact, social, bookingFields, statement } = document;
  return { profile, hero, trustItems, packages, contact, social, bookingFields, statement,
    activeTemplate: "polaroid-field", works: [], templateWorks: {} };
}

export const PreviewPortfolioView = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW === "1" ? PreviewPortfolioExperience : () => null;

function PreviewPortfolioExperience({ document, embedded = false, initialCollectionId }: { document: PreviewPortfolioDocumentV1; embedded?: boolean; initialCollectionId?: string }) {
  const content = useMemo(() => previewDisplayContent(document), [document]);
  const interactions = useTemplateInteractions(content.works);
  const { setActiveWork } = interactions;
  const [origin, setOrigin] = useState<{left:number;top:number;width:number;height:number}|null>(null);
  const openWork = (work: Work, works?: readonly Work[]) => {
    const source = work.assetId ? window.document.querySelector(`[data-card-id="${CSS.escape(work.assetId)}"]`) : null;
    const box = source?.getBoundingClientRect();
    setOrigin(box ? {left:box.left,top:box.top,width:box.width,height:box.height} : null);
    interactions.openWork(work, works);
  };
  const close = useCallback(() => setActiveWork(null), [setActiveWork]);
  useEffect(() => {
    if (!embedded) window.document.title = getClientVisiblePortfolioTitle(document.profile);
  }, [document.profile, embedded]);
  return <Suspense fallback={<PreviewLoading />}><StarMotionShell>
    <Suspense fallback={<PreviewLoading />}><PolaroidFieldTemplate templateId="polaroid-field" content={content} works={content.works}
      packages={content.packages.filter(p => p.enabled)} bookingTemplate={["【约拍任务申请】", ...content.bookingFields].join("\n")}
      booted copiedKey={interactions.copiedKey} isPreview={embedded} onCopy={interactions.copyText}
      onOpenWork={openWork} onBeforeViewChange={close}
      collectionWorkspace={{ collections: document.collections, initialCollectionId, headerAccessory: <StarThemeToggle /> }} /></Suspense>
    {interactions.activeWork && <Lightbox theme="light" safeMissingImage separateControls motionOrigin={origin} work={interactions.activeWork} works={[...interactions.lightboxWorks]}
      frameRef={interactions.lightboxRef} closeButtonRef={interactions.closeButtonRef} onMove={interactions.moveActiveWork} onClose={close} />}
  </StarMotionShell></Suspense>;
}
