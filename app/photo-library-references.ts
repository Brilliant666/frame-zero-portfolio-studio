import type { SiteContent, Work } from "./site-config";

const LOCAL_ASSET_ID_PATTERN = /^[a-f0-9]{64}$/;
const LOCAL_VARIANT_PATTERN = /^\/photos\/library\/([a-f0-9]{64})-(?:thumbnail|card|full)\.webp$/;

export type PhotoAssetReference = Readonly<{
  scope: "works" | "template";
  templateId: string | null;
  slotIndex: number | null;
}>;

export type PhotoAssetReferenceSummary = Readonly<{
  draft: readonly PhotoAssetReference[];
  saved: readonly PhotoAssetReference[];
}>;

function assetIdFromWork(work: Work) {
  if (typeof work.assetId === "string" && LOCAL_ASSET_ID_PATTERN.test(work.assetId)) {
    return work.assetId;
  }
  for (const source of [work.image, work.preview]) {
    const match = LOCAL_VARIANT_PATTERN.exec(source);
    if (match) return match[1];
  }
  return null;
}

function collectReferences(content: SiteContent) {
  const references = new Map<string, PhotoAssetReference[]>();
  const addWorks = (works: readonly Work[], scope: PhotoAssetReference["scope"], templateId: string | null) => {
    works.forEach((work, index) => {
      const assetId = assetIdFromWork(work);
      if (!assetId) return;
      const current = references.get(assetId) ?? [];
      current.push({
        scope,
        templateId,
        slotIndex: Number.isInteger(work.slotIndex) ? work.slotIndex as number : index,
      });
      references.set(assetId, current);
    });
  };

  addWorks(content.works, "works", null);
  for (const [templateId, works] of Object.entries(content.templateWorks)) {
    if (Array.isArray(works)) addWorks(works, "template", templateId);
  }
  return references;
}

export function buildPhotoAssetReferenceMap(
  draft: SiteContent,
  saved: SiteContent,
): ReadonlyMap<string, PhotoAssetReferenceSummary> {
  const draftReferences = collectReferences(draft);
  const savedReferences = collectReferences(saved);
  const assetIds = new Set([...draftReferences.keys(), ...savedReferences.keys()]);
  return new Map([...assetIds].sort().map((assetId) => [assetId, {
    draft: draftReferences.get(assetId) ?? [],
    saved: savedReferences.get(assetId) ?? [],
  }]));
}
