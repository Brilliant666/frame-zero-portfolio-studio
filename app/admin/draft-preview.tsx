"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { TemplateId } from "../site-config";
import styles from "./admin-v2.module.css";

export type DraftPreviewScope = "admin" | "candidate";

const DraftPreviewDialog = dynamic(() => import("./draft-preview-dialog"), {
  ssr: false,
  loading: () => <span role="status">正在准备草稿预览…</span>,
});

export default function DraftTemplatePreviewTrigger({
  templateId,
  label,
  className,
  scope,
}: Readonly<{
  templateId: TemplateId;
  label: string;
  className?: string;
  scope: DraftPreviewScope;
}>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const candidate = scope === "candidate";

  const closeAndRestoreFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        data-admin-draft-preview-trigger={scope === "admin" ? "true" : undefined}
        data-template-candidate-preview-trigger={candidate ? templateId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {scope === "admin" ? <span className={styles.previewText}>{label}</span> : label} <span aria-hidden="true">◐</span>
      </button>
      {open ? (
        <DraftPreviewDialog
          templateId={templateId}
          scope={scope}
          onRequestClose={closeAndRestoreFocus}
        />
      ) : null}
    </>
  );
}
