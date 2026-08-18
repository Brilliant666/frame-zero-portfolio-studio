import type { SiteContent, Work } from "../../site-config";
import { getTemplateCatalogItem, type TemplateId } from "../catalog";
import { buildPhotoSlots } from "./photo-slots";

export type TemplateWorkFallbackStatus = "explicit" | "valid-legacy" | "layout-required";

export type TemplateWorkFallbackResolution = Readonly<{
  status: TemplateWorkFallbackStatus;
  works: Work[];
}>;

export type TemplateMediaProbe = (source: string) => Promise<boolean>;

function enabledWorksForTemplate(works: readonly Work[], templateId: TemplateId) {
  const template = getTemplateCatalogItem(templateId);
  return works
    .filter((work) => work.enabled)
    .sort((left, right) => (left.slotIndex ?? 999) - (right.slotIndex ?? 999))
    .slice(0, template.photoSlots);
}

function legacyWorksForTemplate(content: SiteContent, templateId: TemplateId) {
  const template = getTemplateCatalogItem(templateId);
  return buildPhotoSlots(
    content.works.filter((work) => work.enabled),
    template.slotRatios,
    { templateId },
  ).flatMap((slot) => slot.work ? [{ ...slot.work, slotIndex: slot.index }] : []);
}

export function getImmediateTemplateWorks(
  content: SiteContent,
  templateId: TemplateId,
): TemplateWorkFallbackResolution {
  if (Object.prototype.hasOwnProperty.call(content.templateWorks, templateId)) {
    return {
      status: "explicit",
      works: enabledWorksForTemplate(content.templateWorks[templateId] ?? [], templateId),
    };
  }

  // Legacy media is intentionally withheld until both of its render sources
  // have been verified. This keeps an unavailable fallback out of the DOM.
  return { status: "layout-required", works: [] };
}

export async function resolveTemplateWorkFallback(
  content: SiteContent,
  templateId: TemplateId,
  probe: TemplateMediaProbe,
): Promise<TemplateWorkFallbackResolution> {
  const immediate = getImmediateTemplateWorks(content, templateId);
  if (immediate.status === "explicit") return immediate;

  const candidates = legacyWorksForTemplate(content, templateId);
  if (candidates.length === 0) return immediate;

  const sourceAvailability = new Map<string, Promise<boolean>>();
  const sourceIsAvailable = (source: string) => {
    const normalized = source.trim();
    if (!normalized) return Promise.resolve(false);

    const existing = sourceAvailability.get(normalized);
    if (existing) return existing;

    const pending = Promise.resolve().then(() => probe(normalized)).catch(() => false);
    sourceAvailability.set(normalized, pending);
    return pending;
  };

  const verified = await Promise.all(candidates.map(async (work) => (
    await sourceIsAvailable(work.preview) && await sourceIsAvailable(work.image)
      ? work
      : null
  )));
  const works = verified.flatMap((work) => work === null ? [] : [work]);

  return {
    status: works.length === candidates.length ? "valid-legacy" : "layout-required",
    works,
  };
}
