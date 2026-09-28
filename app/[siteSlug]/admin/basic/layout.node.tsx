import type { ReactNode } from "react";
import { BasicEditorLayout } from "../../../site-editor/basic-editor";
import { requireEditor } from "../../../site-editor/page-auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "基础版草稿后台", robots: { index: false, follow: false } };
export default async function BasicLayout({ children, params }: { children: ReactNode; params: Promise<{ siteSlug: string }> }) {
  const { siteSlug } = await params;
  const { scope } = await requireEditor(siteSlug, "basic");
  return <BasicEditorLayout key={siteSlug} siteScope={scope}>{children}</BasicEditorLayout>;
}
