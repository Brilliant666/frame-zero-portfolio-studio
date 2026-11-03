import { cache } from "react";
import { headers } from "next/headers";
import { accountRequestAllowed, completedSiteExists, getAccountRuntime } from "../../db/accounts/http.mjs";
import { isSiteSlug } from "../../db/accounts/site-slug.mjs";
import { readPublished, readPublishedAssets } from "../../db/accounts/publications.mjs";
import { assetDto } from "../../db/accounts/assets.mjs";
import type { PhotoAsset } from "../photo-library";
import { unpublishedAcceptanceRedirect } from "../../db/accounts/local-acceptance.mjs";

// Shared request cache keeps page and metadata on one immutable publication.
export const publicSite = cache(async (slug: string) => {
  if (!isSiteSlug(slug)) return null;
  const runtime = getAccountRuntime();
  const request = new Request(`http://127.0.0.1/${encodeURIComponent(slug)}`, { headers: new Headers(await headers()) });
  if (!accountRequestAllowed(request, runtime.config, { publicRead: true })) return null;
  if (!await completedSiteExists(runtime.pool, slug)) return null;
  const snapshot = await readPublished(runtime.pool, slug);
  if (!snapshot) {
    const acceptance = await unpublishedAcceptanceRedirect(request, runtime, slug);
    return { snapshot: null, assets: [] as PhotoAsset[], acceptanceHref: acceptance?.headers.get("location") ?? null };
  }
  const rows = await readPublishedAssets(runtime.pool, snapshot);
  const assets: PhotoAsset[] = rows.map((row: Parameters<typeof assetDto>[0]) => {
    const dto = assetDto(row, slug) as PhotoAsset;
    for (const kind of ["thumbnail", "card", "full"] as const) dto.variants[kind].src = `/api/public-sites/${encodeURIComponent(slug)}/assets/${dto.id}/${kind}`;
    return dto;
  });
  return { snapshot, assets };
});
