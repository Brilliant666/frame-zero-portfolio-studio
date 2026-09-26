import { redirect } from "next/navigation";
import { requireEditor } from "../../../site-editor/page-auth";
export const dynamic = "force-dynamic";
export default async function BasicIndex({ params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const { scope } = await requireEditor(siteSlug, "basic");
  redirect(`${scope.adminBasePath}/profile`);
}
