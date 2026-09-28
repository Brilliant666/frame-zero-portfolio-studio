"use client";

import PreviewPortfolioAdmin from "../preview-workspace/admin";
import { SitePortfolioView } from "./premium-view";
import type { SiteEditorScope } from "./scope";
import PublicationControls, { type PublicationEditorProps } from "./publication-controls";
import { useMemo } from "react";

export default function PremiumEditor({ siteScope }: { siteScope: SiteEditorScope }) {
  const Controls = useMemo(() => function Controls(props: PublicationEditorProps) {
    return siteScope.publicationEndpoint && siteScope.publicHref ? <PublicationControls {...props} space="premium-polaroid" endpoint={siteScope.publicationEndpoint} publicHref={siteScope.publicHref} /> : null;
  }, [siteScope.publicationEndpoint, siteScope.publicHref]);
  return <PreviewPortfolioAdmin key={siteScope.endpoint} siteScope={siteScope} SitePreview={SitePortfolioView} PublicationControls={Controls} />;
}
