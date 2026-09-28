import { notFound } from "next/navigation";
import { BasicEditorSectionView, type BasicEditorSection } from "../../../../site-editor/basic-editor";
import { requireEditor } from "../../../../site-editor/page-auth";
export const dynamic = "force-dynamic";
export default async function BasicSection({ params }: { params: Promise<{ siteSlug: string; section: string }> }) {
  const { siteSlug, section } = await params;
  await requireEditor(siteSlug, "basic");
  if (!["template", "profile", "packages", "layout", "contact", "advanced"].includes(section)) notFound();
  return <BasicEditorSectionView section={section as BasicEditorSection} />;
}
