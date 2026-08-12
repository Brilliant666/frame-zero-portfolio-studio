"use client";

import { useMemo } from "react";
import type { SiteContent, TemplateId } from "../site-config";
import { getTemplateCatalogItem } from "../templates/catalog";
import { buildPhotoSlots } from "../templates/shared/photo-slots";
import { useAdmin } from "./admin-provider";
import type { DraftPreviewScope } from "./draft-preview";
import TemplatePreviewDialog from "./template-preview-dialog";

function draftWorksForTemplate(content: SiteContent, templateId: TemplateId) {
  const template = getTemplateCatalogItem(templateId);
  const selected = content.templateWorks[templateId];
  if (selected !== undefined) {
    return selected
      .filter((work) => work.enabled)
      .sort((left, right) => (left.slotIndex ?? 999) - (right.slotIndex ?? 999))
      .slice(0, template.photoSlots);
  }

  return buildPhotoSlots(
    content.works.filter((work) => work.enabled),
    template.slotRatios,
    { templateId },
  ).flatMap((slot) => slot.work ? [{ ...slot.work, slotIndex: slot.index }] : []);
}

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
  const works = useMemo(
    () => draftWorksForTemplate(content, templateId),
    [content, templateId],
  );
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
