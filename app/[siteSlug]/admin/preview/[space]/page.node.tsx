import { notFound } from "next/navigation";
import { requireEditor } from "../../../../site-editor/page-auth";
import { isContentSpace } from "../../../../site-editor/content-schema";
import { handleDraftRequest } from "../../../../site-editor/server";
import { handleAssetsRequest } from "../../../../site-editor/assets-server";
import { parseSiteAssets } from "../../../../site-editor/assets-client";
import DraftView from "../../../../site-editor/draft-view";
import styles from "../../../../site-editor/preview-notice.module.css";
import { PREVIEW_THEME_BOOTSTRAP_CSS, PREVIEW_THEME_KEY } from "../../../../preview-workspace/preview-theme";
import { HOME_INTRO_BOOTSTRAP } from "../../../../templates/polaroid-field/home-intro";
export const dynamic = "force-dynamic";
export const metadata = { title: "私人草稿预览", robots: { index: false, follow: false } };
export default async function DraftPreview({ params }: { params: Promise<{ siteSlug: string; space: string }> }) {
  const { siteSlug, space } = await params;
  if (!isContentSpace(space)) notFound();
  const { request, scope } = await requireEditor(siteSlug, space);
  // Same handlers as the draft and Site asset APIs, so authorization and ownership stay
  // theirs; the manifest is read here instead of after hydration. Any failure is a
  // visible state, never a fallback to another library.
  const [response, assetsResponse] = await Promise.all([handleDraftRequest(request, siteSlug, space), handleAssetsRequest(request, siteSlug)]);
  if (!response.ok) throw new Error("草稿暂不可读");
  const { content } = await response.json();
  const manifest = assetsResponse.ok ? parseSiteAssets(await assetsResponse.json().catch(() => null), scope.assetsEndpoint) : null;
  return <>{space === "premium-polaroid" && <><style dangerouslySetInnerHTML={{ __html: PREVIEW_THEME_BOOTSTRAP_CSS }} /><script dangerouslySetInnerHTML={{ __html: `(function(){var t='night';try{if(localStorage.getItem('${PREVIEW_THEME_KEY}')==='paper')t='paper'}catch(e){}document.documentElement.dataset.previewTheme=t;document.documentElement.dataset.starTheme=t})();${HOME_INTRO_BOOTSTRAP}` }} /></>}<div className={styles.frame} data-site-preview-frame><p data-site-preview-notice className={styles.notice}>已保存草稿预览 · 仅本人可见 · <a href={scope.adminBasePath + (space === "basic" ? "/profile" : "")}>返回后台</a></p><div className={styles.canvas} data-site-preview-canvas><div className={styles.scrollport} data-preview-scrollport><DraftView key={`${scope.assetsEndpoint}:${space}`} space={space} content={content} assets={manifest?.assets ?? null} /></div></div></div></>;
}
