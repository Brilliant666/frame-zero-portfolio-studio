import type { TemplateId } from "./catalog";

export type TemplateStructurePreview = Readonly<{
  src: `/template-structure-previews/${TemplateId}.webp`;
  width: 1200;
  height: 675;
  revision: 1;
}>;

function preview(templateId: TemplateId): TemplateStructurePreview {
  return Object.freeze({
    src: `/template-structure-previews/${templateId}.webp`,
    width: 1200,
    height: 675,
    revision: 1,
  });
}

/**
 * Public, photo-free diagrams of the eleven formal template contracts.
 *
 * These are deliberately not live screenshots and never read editable
 * Admin state, local photography, or filesystem paths.
 */
export const templateStructurePreviews = Object.freeze({
  "cinematic-light": preview("cinematic-light"),
  "neon-hud": preview("neon-hud"),
  "film-rail": preview("film-rail"),
  "manga-panels": preview("manga-panels"),
  "prism-liquid": preview("prism-liquid"),
  "orbital-portal": preview("orbital-portal"),
  "archive-os": preview("archive-os"),
  "editorial-duet": preview("editorial-duet"),
  "polaroid-field": preview("polaroid-field"),
  "character-select": preview("character-select"),
  "museum-depth": preview("museum-depth"),
} satisfies Record<TemplateId, TemplateStructurePreview>);

export function getTemplateStructurePreview(templateId: TemplateId) {
  return templateStructurePreviews[templateId];
}
