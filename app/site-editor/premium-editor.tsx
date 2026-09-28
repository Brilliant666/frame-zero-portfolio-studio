"use client";

import PreviewPortfolioAdmin from "../preview-workspace/admin";
import { SitePortfolioView } from "./premium-view";
import type { SiteEditorScope } from "./scope";
import PublicationControls from "./publication-controls";
import { useMemo } from "react";

export default function PremiumEditor({ siteScope }: { siteScope: SiteEditorScope }) {
  const Controls = useMemo(() => function Controls(props: { revision: number; dirty: boolean; disabled: boolean }) {
    return siteScope.publicationEndpoint && siteScope.publicHref ? <PublicationControls {...props} endpoint={siteScope.publicationEndpoint} publicHref={siteScope.publicHref} /> : null;
  }, [siteScope.publicationEndpoint, siteScope.publicHref]);
  return <PreviewPortfolioAdmin key={siteScope.endpoint} siteScope={siteScope} SitePreview={SitePortfolioView} PublicationControls={Controls} />;
}
