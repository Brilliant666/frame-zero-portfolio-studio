import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requirePreviewWorkspace } from "../preview-workspace/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "新版摄影作品集", robots: { index: false, follow: false } };

export default async function PreviewWorkspaceLayout({ children }: { children: ReactNode }) {
  if (!await requirePreviewWorkspace()) notFound();
  return children;
}
