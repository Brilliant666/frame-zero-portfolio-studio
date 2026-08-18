"use client";

import type { TemplateId } from "../site-config";
import { useTemplateWorks } from "../templates/shared/use-template-works";
import { useAdmin } from "./admin-provider";
import type { DraftPreviewScope } from "./draft-preview";
import TemplatePreviewDialog from "./template-preview-dialog";

export default function DraftPreviewDialog({
  templateId,
  scope,
  onRequestClose,
}: Readonly<{
  templateId: TemplateId;
  scope: DraftPreviewScope;
  onRequestClose: () => void;
}>) {
  const { content } = useAdmin();
  const { works } = useTemplateWorks(content, templateId);
  const candidate = scope === "candidate";

  return (
    <TemplatePreviewDialog
      templateId={templateId}
      works={works}
      title={candidate ? "候选模板草稿预览" : "当前草稿预览"}
      description={candidate
        ? "使用当前未保存内容查看此模板 · 不修改草稿 · 不保存"
        : "直接使用当前内存草稿 · 不读取已保存主页 · 不保存"}
      previewSource="draft"
      draftScope={scope}
      onRequestClose={onRequestClose}
    />
  );
}
