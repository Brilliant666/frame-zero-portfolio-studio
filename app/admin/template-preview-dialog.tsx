"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { TemplateId, Work } from "../site-config";
import TemplateRenderer from "../templates/template-renderer";
import Lightbox from "../templates/shared/lightbox";
import { useTemplateInteractions } from "../templates/shared/use-template-interactions";
import { useAdmin } from "./admin-provider";
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
  const { content } = useAdmin();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const {
    activeWork,
    closeButtonRef,
    copiedKey,
    copyText,
    lightboxRef,
    moveActiveWork,
    setActiveWork,
  } = useTemplateInteractions(works);
  const closeActiveWork = useCallback(() => setActiveWork(null), [setActiveWork]);
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

  return (
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
        <TemplateRenderer
          key={`${templateId}-${mappingSignature(works)}`}
          templateId={templateId}
          content={previewContent}
          works={[...works]}
          packages={enabledPackages}
          bookingTemplate={bookingTemplate}
          booted
          copiedKey={copiedKey}
          isPreview
          onCopy={copyText}
          onBeforeViewChange={closeActiveWork}
          onOpenWork={setActiveWork}
        />
        {activeWork ? (
          <Lightbox
            work={activeWork}
            works={[...works]}
            frameRef={lightboxRef}
            closeButtonRef={closeButtonRef}
            onMove={moveActiveWork}
            onClose={() => setActiveWork(null)}
          />
        ) : null}
      </div>
    </dialog>
  );
}
