import { notFound } from "next/navigation";
import { requireEditor } from "../../../../site-editor/page-auth";
import { isContentSpace } from "../../../../site-editor/content-schema";
import LivePreviewFrame from "../../../../site-editor/live-preview-frame";
import { PREVIEW_THEME_BOOTSTRAP_CSS, PREVIEW_THEME_KEY } from "../../../../preview-workspace/preview-theme";
export const dynamic = "force-dynamic";
export const metadata = { title: "实时预览", robots: { index: false, follow: false } };

/** The editor's live preview iframe. Same editor authorization as the draft preview; it reads no draft and writes nothing. */
export default async function LivePreview({ params }: { params: Promise<{ siteSlug: string; space: string }> }) {
  const { siteSlug, space } = await params;
  if (!isContentSpace(space)) notFound();
  const { scope } = await requireEditor(siteSlug, space);
  return <>{space === "premium-polaroid" && <><style dangerouslySetInnerHTML={{ __html: PREVIEW_THEME_BOOTSTRAP_CSS }} /><script dangerouslySetInnerHTML={{ __html: `(function(){var t='night';try{if(localStorage.getItem('${PREVIEW_THEME_KEY}')==='paper')t='paper'}catch(e){}document.documentElement.dataset.previewTheme=t;document.documentElement.dataset.starTheme=t})()` }} /></>}
    <LivePreviewFrame space={space} assetsEndpoint={scope.assetsEndpoint} />
  </>;
}
