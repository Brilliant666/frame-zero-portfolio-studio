"use client";

import PreviewPortfolioAdmin from "../preview-workspace/admin";
import { SitePortfolioView } from "./premium-view";
import type { SiteEditorScope } from "./scope";

export default function PremiumEditor({ siteScope }: { siteScope: SiteEditorScope }) {
  return <PreviewPortfolioAdmin key={siteScope.endpoint} siteScope={siteScope} SitePreview={SitePortfolioView} />;
}
