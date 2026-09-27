import { notFound } from "next/navigation";
import { requireEditor } from "../../../../site-editor/page-auth";
import { isContentSpace } from "../../../../site-editor/content-schema";
import { handleDraftRequest } from "../../../../site-editor/server";
import DraftView from "../../../../site-editor/draft-view";
import styles from "../../../../site-editor/preview-notice.module.css";
import { PREVIEW_THEME_BOOTSTRAP_CSS, PREVIEW_THEME_KEY } from "../../../../preview-workspace/preview-theme";
export const dynamic = "force-dynamic";
export const metadata = { title: "私人草稿预览", robots: { index: false, follow: false } };
export default async function DraftPreview({ params }: { params: Promise<{ siteSlug: string; space: string }> }) {
  const { siteSlug, space } = await params;
  if (!isContentSpace(space)) notFound();
  const { request, scope } = await requireEditor(siteSlug, space);
  const response = await handleDraftRequest(request, siteSlug, space);
  if (!response.ok) throw new Error("草稿暂不可读");
  const { content } = await response.json();
  return <>{space === "premium-polaroid" && <><style dangerouslySetInnerHTML={{ __html: PREVIEW_THEME_BOOTSTRAP_CSS }} /><script dangerouslySetInnerHTML={{ __html: `(function(){var t='paper';try{if(localStorage.getItem('${PREVIEW_THEME_KEY}')==='night')t='night'}catch(e){}document.documentElement.dataset.previewTheme=t;document.documentElement.dataset.starTheme=t})()` }} /></>}<p data-site-preview-notice className={styles.notice}>{process.env.FRAME_ZERO_LOCAL_ACCEPTANCE === "1" ? "私人草稿验收，尚未发布" : "私人草稿预览 · 尚未发布"} · <a href={scope.adminBasePath + (space === "basic" ? "/profile" : "")}>返回后台</a></p><DraftView space={space} content={content} assetsEndpoint={scope.assetsEndpoint} /></>;
}
