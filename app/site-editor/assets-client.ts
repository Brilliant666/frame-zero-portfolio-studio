import { assetToWork, parsePhotoLibraryManifest, type PhotoLibraryManifest, type PhotoAsset } from "../photo-library";
import type { SiteContent } from "../site-config";

/** Separate Site transport: never relax the legacy /photos/library validator. */
export function parseSiteAssets(value: unknown, endpoint: string): PhotoLibraryManifest | null {
  if (!/^\/api\/sites\/[a-z0-9-]+\/assets$/.test(endpoint) || !value || typeof value !== "object") return null;
  const raw = value as { version?: unknown; assets?: unknown };
  if (!Array.isArray(raw.assets)) return null;
  const sources = new Map<string, string>();
  const assets = raw.assets.map((item: unknown) => {
    if (!item || typeof item !== "object") return null;
    const asset = item as Record<string, unknown>;
    if (typeof asset.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(asset.id)) return null;
    if (!asset.variants || typeof asset.variants !== "object") return null;
    const variants = Object.fromEntries(["thumbnail", "card", "full"].map(kind => {
      const variant = (asset.variants as Record<string, unknown>)[kind];
      if (!variant || typeof variant !== "object") return [kind, null];
      const entry = variant as Record<string, unknown>;
      const expected = `${endpoint}/${asset.id}/${kind}`;
      if (entry.src !== expected) return [kind, null];
      const placeholder = `/photos/library/${asset.id}-${kind}.webp`;
      sources.set(placeholder, expected);
      return [kind, { ...entry, src: placeholder }];
    }));
    return { ...asset, variants };
  });
  const checked = parsePhotoLibraryManifest({ version: raw.version, assets });
  if (!checked) return null;
  for (const asset of checked.assets) for (const variant of Object.values(asset.variants)) variant.src = sources.get(variant.src)!;
  return checked;
}

export async function loadSiteAssets(endpoint: string) {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("本站素材读取失败，请确认登录状态。");
  const manifest = parseSiteAssets(await response.json(), endpoint);
  if (!manifest) throw new Error("本站素材响应无效，未读取其他图库。");
  return manifest;
}

export function hydrateSiteWorks(content: SiteContent, assets: readonly PhotoAsset[]): SiteContent {
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const hydrate = (works: SiteContent["works"]) => works.flatMap((work, index) => {
    const asset = byId.get(work.assetId ?? "");
    if (!asset) return [{ ...work, image: "", preview: "" }];
    const resolved = assetToWork(asset, work.slotIndex ?? index);
    return [{ ...work, image: resolved.image, preview: resolved.preview, previewWidth: resolved.previewWidth, previewHeight: resolved.previewHeight, fullWidth: resolved.fullWidth }];
  });
  return { ...content, works: hydrate(content.works), templateWorks: Object.fromEntries(Object.entries(content.templateWorks).map(([id, works]) => [id, hydrate(works ?? [])])) };
}

/** A successful draft response has already passed server-side asset ownership.
 * Reconstruct only its protected URLs, without a second network dependency that
 * could turn an acknowledged CAS write into a stale-revision "save failure".
 * Image GET/HEAD still independently authorize the actual session and Site.
 */
export function hydrateConfirmedSiteWorks(content: SiteContent, endpoint: string): SiteContent {
  if (!/^\/api\/sites\/[a-z0-9-]+\/assets$/.test(endpoint)) throw new Error("Invalid Site asset endpoint");
  const hydrate = (works: SiteContent["works"]) => works.map(work => {
    const valid = typeof work.assetId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(work.assetId);
    return { ...work, image: valid ? `${endpoint}/${work.assetId}/full` : "", preview: valid ? `${endpoint}/${work.assetId}/card` : "" };
  });
  return { ...content, works: hydrate(content.works), templateWorks: Object.fromEntries(Object.entries(content.templateWorks).map(([id, works]) => [id, hydrate(works ?? [])])) };
}
