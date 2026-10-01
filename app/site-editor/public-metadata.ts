import type { Metadata } from "next";
import type { PhotoAsset } from "../photo-library";
import type { SiteContent } from "../site-config";
import type { PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";
import type { ContentSpace, SpaceContent } from "./content-schema";
import { getClientVisiblePortfolioTitle } from "../client-visible-title";

type PublishedMetadataSnapshot = {
  slug: string; space: ContentSpace; content: SpaceContent; assetIds: readonly string[];
};

/** The origin comes from validated platform configuration, never request headers.
 * Assets are the same Published whitelist used by public rendering, not drafts. */
export function publishedSiteMetadata(snapshot: PublishedMetadataSnapshot, assets: readonly PhotoAsset[], configuredOrigin: string): Metadata {
  const origin = new URL(configuredOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid public metadata origin");
  if (!/^[a-z][a-z0-9_-]{2,29}$/.test(snapshot.slug)) throw new Error("Invalid public metadata Site slug");
  const { profile } = snapshot.content;
  const brand = profile.brand.trim();
  const title = snapshot.space === "premium-flow-gallery" ? brand || "摄影作品集" : getClientVisiblePortfolioTitle(profile as SiteContent["profile"]);
  const siteName = brand || title;
  const description = profile.intro;
  const pageUrl = new URL(`/${encodeURIComponent(snapshot.slug)}`, origin).href;
  const ids: (string | null)[] = [];
  if (snapshot.space === "premium-flow-gallery") {
    const content = snapshot.content as FlowGalleryDocumentV1;
    ids.push(content.background.assetId, ...content.groups.filter(group => group.visible).flatMap(group => group.assetIds));
  } else if (snapshot.space === "premium-polaroid") {
    const content = snapshot.content as PreviewPortfolioDocumentV1;
    for (const collection of content.collections.filter(item => item.visible)) ids.push(collection.coverAssetId, ...collection.assetIds);
  } else {
    const content = snapshot.content as SiteContent;
    ids.push(...(content.templateWorks?.[content.activeTemplate] ?? content.works).filter(work => work.enabled).map(work => work.assetId ?? null));
  }
  const allowed = new Set(snapshot.assetIds);
  const byId = new Map(assets.filter(asset => allowed.has(asset.id)).map(asset => [asset.id, asset]));
  const selected = ids.flatMap(id => {
    const asset = id ? byId.get(id) : undefined;
    if (!asset) return [];
    const card = asset.variants.card;
    // Do not accept private Site routes, remote URLs, or a legacy public file.
    const expected = `/api/public-sites/${snapshot.slug}/assets/${asset.id}/card`;
    if (card.src !== expected || !Number.isSafeInteger(card.width) || card.width < 1 || !Number.isSafeInteger(card.height) || card.height < 1) return [];
    return [{ url: new URL(expected, origin).href, width: card.width, height: card.height, alt: `${siteName}作品照片` }];
  })[0];
  return {
    metadataBase: origin, title: { absolute: title }, description,
    alternates: { canonical: pageUrl },
    openGraph: { type: "website", locale: "zh_CN", url: pageUrl, siteName, title, description, images: selected ? [selected] : [] },
    twitter: { card: selected ? "summary_large_image" : "summary", title, description, images: selected ? [selected] : [] },
  };
}
