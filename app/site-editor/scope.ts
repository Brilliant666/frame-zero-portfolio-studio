export type SiteEditorScope = Readonly<{
  endpoint: string;
  adminBasePath: string;
  previewHref: string;
  assetsMode: "site";
  assetsEndpoint: string;
}>;
