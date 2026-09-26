import PreviewPortfolioAdmin from "../../../site-editor/premium-editor";
import { requireEditor } from "../../../site-editor/page-auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "拍立得草稿后台", robots: { index: false, follow: false } };
export default async function PremiumEditor({ params }: { params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const { scope } = await requireEditor(siteSlug, "premium-polaroid");
  return <PreviewPortfolioAdmin key={siteSlug} siteScope={scope} />;
}
