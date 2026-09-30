import FlowGalleryAdmin from "../../../site-editor/flow-gallery-admin";
import { requireEditor } from "../../../site-editor/page-auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "流影视廊后台", robots: { index: false, follow: false } };
export default async function FlowGalleryEditor({ params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const { scope } = await requireEditor(siteSlug, "premium-flow-gallery");
  return <FlowGalleryAdmin key={siteSlug} siteScope={scope} />;
}
