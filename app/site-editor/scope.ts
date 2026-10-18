import type { ContentSpace } from "./content-schema";

export type SiteEditorScope = Readonly<{
  endpoint: string;
  adminBasePath: string;
  previewHref: string;
  assetsMode: "site";
  assetsEndpoint: string;
  publicationEndpoint?: string;
  publicHref?: string;
  /** Content spaces this account may edit (basic plus granted premium spaces), for the workbench switcher. */
  spaces?: readonly ContentSpace[];
}>;
