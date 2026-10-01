import type { SiteContent } from "../site-config";
import { getTemplateCatalogItem } from "../templates/catalog";
import { buildPhotoSlots } from "../templates/shared/photo-slots";
import { getImmediateTemplateWorks } from "../templates/shared/template-work-fallback";
import { contentAssetIds, parseSpaceContent, parseSitePremiumDocument, type ContentSpace } from "./content-schema";
import { parseFlowGalleryDocument, type FlowGalleryDocumentV1 } from "./flow-gallery-document";

/** Freeze the actual layout, not the full editor document. Asset availability
 * and ownership are checked inside the publication transaction before commit. */
export function preparePublication(value: unknown, space: ContentSpace = "premium-polaroid") {
  if (space === "premium-flow-gallery") {
    const parsed = parseFlowGalleryDocument(value);
    const groups = parsed.groups.filter(g => g.visible);
    const visibleGroup = (id: string | null) => id && groups.some(g => g.id === id) ? id : null;
    const content: FlowGalleryDocumentV1 = {
      ...parsed, groups,
      rails: { ...parsed.rails, leftGroupId: visibleGroup(parsed.rails.leftGroupId), rightGroupId: visibleGroup(parsed.rails.rightGroupId) },
      pricing: parsed.pricing.enabled ? { ...parsed.pricing, packages: parsed.pricing.packages.filter(p => p.enabled) } : { enabled: false, heading: "", introduction: "", packages: [] },
      contact: parsed.contact.enabled ? { ...parsed.contact, items: parsed.contact.items.filter(i => i.value.trim() || i.href || i.qrAssetId) } : { enabled: false, heading: "", intro: "", items: [] },
    };
    return { content, assetIds: contentAssetIds(space, content), templateId: space };
  }
  if (space === "premium-polaroid") {
    const parsed = parseSitePremiumDocument(value);
    const content = { ...parsed, collections: parsed.collections.filter(c => c.visible),
      packages: parsed.packages.filter(p => p.enabled), social: parsed.social.filter(s => s.handle.trim() || s.qrAssetId) };
    return { content, assetIds: contentAssetIds(space, content), templateId: space };
  }
  const parsed = parseSpaceContent("basic", value) as SiteContent;
  const templateId = parsed.activeTemplate;
  const immediate = getImmediateTemplateWorks(parsed, templateId);
  // An explicit [] stays empty. Missing layouts use the existing slot assignment
  // rules; the transaction validates every resulting protected image variant.
  const candidates = immediate.status === "explicit" ? immediate.works : parsed.works.filter(w => w.enabled);
  const works = buildPhotoSlots(candidates, getTemplateCatalogItem(templateId).slotRatios, { templateId })
    .flatMap(slot => slot.work ? [{ ...slot.work, slotIndex: slot.index }] : []);
  const content: SiteContent = { ...parsed, works: [], templateWorks: { [templateId]: works },
    packages: parsed.packages.filter(p => p.enabled), social: parsed.social.filter(s => s.handle.trim() || s.qrAssetId) };
  return { content, assetIds: contentAssetIds(space, content), templateId };
}
