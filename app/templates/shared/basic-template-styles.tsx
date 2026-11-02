import type { TemplateId } from "../catalog";

/** Include cinematic CSS in server HTML as well as client-only template previews. */
export default async function BasicTemplateStyles({ templateId }: { templateId: TemplateId }) {
  if (templateId !== "cinematic-light") return null;
  const { default: CinematicPublicStyles } = await import("../cinematic-light/public-styles");
  return <CinematicPublicStyles />;
}
