import { notFound } from "next/navigation";
import { requireEditor } from "../../../../site-editor/page-auth";
import { isContentSpace } from "../../../../site-editor/content-schema";
import { handleDraftRequest } from "../../../../site-editor/server";
import DraftView from "../../../../site-editor/draft-view";
export const dynamic = "force-dynamic";
export const metadata = { title: "私人草稿预览", robots: { index: false, follow: false } };
export default async function DraftPreview({ params }: { params: Promise<{ siteSlug: string; space: string }> }) {
  const { siteSlug, space } = await params;
  if (!isContentSpace(space)) notFound();
  const { request, scope } = await requireEditor(siteSlug, space);
  const response = await handleDraftRequest(request, siteSlug, space);
  if (!response.ok) throw new Error("草稿暂不可读");
  const { content } = await response.json();
  return <><p style={{ padding: 12 }}>私人草稿预览 · 尚未发布 · <a href={scope.adminBasePath + (space === "basic" ? "/profile" : "")}>返回后台</a></p><DraftView space={space} content={content} /></>;
}
