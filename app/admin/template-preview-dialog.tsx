"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { TemplateId, Work } from "../site-config";
import BasicTemplateHost from "../templates/shared/basic-template-host";
import { useTemplateInteractions } from "../templates/shared/use-template-interactions";
import { useAdmin } from "./admin-provider";
import { PlatformAssetContext } from "../templates/shared/asset-context";
import type { DraftPreviewScope } from "./draft-preview";
import styles from "./template-preview-dialog.module.css";

export type TemplatePreviewSource = "draft" | "recommendation";

function mappingSignature(works: readonly Work[]) {
  return works
    .map((work, fallbackIndex) => JSON.stringify([
      work.slotIndex ?? fallbackIndex,
      work.assetId ?? null,
      work.locked === true,
      work.code,
      work.title,
      work.subtitle,
      work.image,
      work.preview,
      work.position,
      work.previewWidth,
      work.previewHeight,
      work.fullWidth,
      work.enabled,
    ]))
    .sort()
    .join("|");
}

export default function TemplatePreviewDialog({
  templateId,
  works,
  title,
  description,
  previewSource,
  draftScope,
  onRequestClose,
}: Readonly<{
  templateId: TemplateId;
  works: readonly Work[];
  title: string;
  description: string;
  previewSource: TemplatePreviewSource;
  draftScope?: DraftPreviewScope;
  onRequestClose: () => void;
}>) {
  const { content, siteScope } = useAdmin();
  const platformAssets = useMemo(() => siteScope ? new Map(content.social.flatMap(s => s.qrAssetId
    ? [[s.qrAssetId, `${siteScope.assetsEndpoint}/${s.qrAssetId}/full`] as const] : [])) : null, [content.social, siteScope]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const interactions = useTemplateInteractions(works);
  const { activeWork, setActiveWork } = interactions;
  const previewContent = useMemo(() => ({
    ...content,
    activeTemplate: templateId,
    templateWorks: {
      ...content.templateWorks,
      [templateId]: works.map((work) => ({ ...work })),
    },
  }), [content, templateId, works]);
  const enabledPackages = useMemo(
    () => previewContent.packages.filter((item) => item.enabled),
    [previewContent.packages],
  );
  const bookingTemplate = useMemo(
    () => ["【约拍任务申请】", ...previewContent.bookingFields].join("\n"),
    [previewContent.bookingFields],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const closePreview = () => {
    setActiveWork(null);
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onRequestClose();
  };

  // Native top-layer placement does not remove DOM ancestors. Mount outside
  // the editor so its navigation/link styles cannot change preview content.
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-template-real-preview={templateId}
      data-preview-source={previewSource}
      data-admin-draft-preview-dialog={draftScope === "admin" ? "true" : undefined}
      data-template-candidate-preview-dialog={draftScope === "candidate" ? templateId : undefined}
      data-layout-preview-dialog={previewSource === "recommendation" ? templateId : undefined}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (activeWork) setActiveWork(null);
        else closePreview();
      }}
      onClose={() => {
        setActiveWork(null);
        onRequestClose();
      }}
    >
      <div className={styles.toolbar}>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <button type="button" onClick={closePreview}>退出预览 ×</button>
      </div>
      <div className={styles.surface}>
        <div className={styles.scrollport} data-preview-scrollport>
        <PlatformAssetContext.Provider value={platformAssets}>
        <BasicTemplateHost
          rendererKey={`${templateId}-${mappingSignature(works)}`}
          templateId={templateId}
          content={previewContent}
          works={[...works]}
          packages={enabledPackages}
          bookingTemplate={bookingTemplate}
          booted
          isPreview
          interactions={interactions}
          lightboxTemplate={templateId}
        />
        </PlatformAssetContext.Provider>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
