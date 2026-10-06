"use client";

import type { PhotoAsset } from "../photo-library";
import FlowGallery from "../premium-gallery-proof/gallery";
import type { GalleryDocument, GalleryPhoto } from "../premium-gallery-proof/model";
import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";

/** Resolve only supplied Site assets; a missing resource never falls back to proof or global photos. */
export function resolveFlowGalleryDocument(document: FlowGalleryDocumentV1, assets: readonly PhotoAsset[]): GalleryDocument {
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const photo = (id: string | null, caption = ""): GalleryPhoto | null => {
    const asset = id ? byId.get(id) : undefined;
    if (!asset) return null;
    return {
      id: asset.id, url: asset.variants.card.src, fullUrl: asset.variants.full.src,
      variants: [asset.variants.thumbnail, asset.variants.card, asset.variants.full].map(variant => ({ url: variant.src, width: variant.width })),
      width: asset.variants.full.width, height: asset.variants.full.height, alt: caption || "作品照片",
    };
  };
  return {
    profile: document.profile,
    background: photo(document.background.assetId),
    backgroundFocus: document.background.focalPoint,
    featuredGroupIds: { left: document.rails.leftGroupId, right: document.rails.rightGroupId },
    ...(document.rails.leftWidthPercent !== undefined ? { leftRailWidthPercent: document.rails.leftWidthPercent } : {}),
    groups: document.groups.filter(group => group.visible).map(group => ({ id: group.id, name: group.name, photos: group.assetIds.flatMap(id => { const item = photo(id, group.captions[id]); return item ? [item] : []; }) })),
    ...(document.pricing.enabled ? { pricing: { heading: document.pricing.heading, introduction: document.pricing.introduction, packages: document.pricing.packages.filter(item => item.enabled) } } : {}),
    ...(document.contact.enabled ? { contact: { heading: document.contact.heading, intro: document.contact.intro, items: document.contact.items.map(item => { const qrPhoto = photo(item.qrAssetId ?? null, `${item.label}二维码`); return { id: item.id, label: item.label, value: item.value, href: item.href, ...(qrPhoto ? { qrPhoto } : {}) }; }) } } : {}),
  };
}

const EMPTY: readonly PhotoAsset[] = [];
export function SiteFlowGalleryView({ document, assets = EMPTY, previewGroupId }: { document: FlowGalleryDocumentV1; assets?: readonly PhotoAsset[]; previewGroupId?: string }) {
  return <FlowGallery document={resolveFlowGalleryDocument(document, assets)} previewGroupId={previewGroupId} />;
}
