"use client";

/* eslint-disable @next/next/no-img-element -- preview thumbnails come from the validated local manifest. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  parsePhotoLibraryManifest,
  type PhotoAsset,
  type PhotoOrientation,
} from "../../photo-library";
import type { TemplateId } from "../../site-config";
import { getTemplateMaterialProfile } from "../../templates/material-profiles";
import {
  applyTemplateCompositionPreview,
  planTemplateCompositionPreview,
  type PlannedTemplateCompositionPreview,
  type TemplatePreviewMaterialStatus,
} from "../../templates/template-preview-composition";
import TemplateRenderer from "../../templates/template-renderer";
import Lightbox from "../../templates/shared/lightbox";
import { useTemplateInteractions } from "../../templates/shared/use-template-interactions";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";

const manifestUrl = "/photos/library-manifest.json";

const materialStatusLabels: Record<TemplatePreviewMaterialStatus, string> = {
  "material-ready": "素材充足",
  "material-usable": "可形成页面",
  "material-short": "素材不足",
};

const orientationLabels: Record<PhotoOrientation, string> = {
  landscape: "横图",
  portrait: "竖图",
  square: "方图",
};

function mappingSignature(works: readonly { assetId?: string; slotIndex?: number; locked?: boolean }[]) {
  return works
    .map((work, fallbackIndex) => `${work.slotIndex ?? fallbackIndex}:${work.assetId ?? "legacy"}:${work.locked === true ? 1 : 0}`)
    .sort()
    .join("|");
}

function PreviewDialog({
  open,
  onClose,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  preview: PlannedTemplateCompositionPreview;
}) {
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
  } = useTemplateInteractions(preview.works);
  const previewContent = useMemo(() => applyTemplateCompositionPreview(
    { ...content, activeTemplate: preview.templateId },
    preview,
  ), [content, preview]);
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
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const closePreview = () => {
    setActiveWork(null);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.templatePreviewDialog}
      data-template-real-preview={preview.templateId}
      aria-label="真实模板只读预览"
      onCancel={(event) => {
        event.preventDefault();
        if (activeWork) setActiveWork(null);
        else closePreview();
      }}
      onClose={closePreview}
    >
      <div className={styles.templatePreviewDialogToolbar}>
        <div>
          <strong>真实模板预览</strong>
          <span>使用当前本地素材的推荐排版 · 不修改草稿 · 不保存</span>
        </div>
        <button type="button" onClick={closePreview}>退出预览 ×</button>
      </div>
      {open ? (
        <div className={styles.templatePreviewDialogSurface}>
          <TemplateRenderer
            key={`${preview.templateId}-${mappingSignature(preview.works)}`}
            templateId={preview.templateId}
            content={previewContent}
            works={[...preview.works]}
            packages={enabledPackages}
            bookingTemplate={bookingTemplate}
            booted
            copiedKey={copiedKey}
            isPreview
            onCopy={copyText}
            onOpenWork={setActiveWork}
          />
          {activeWork ? (
            <Lightbox
              work={activeWork}
              works={[...preview.works]}
              frameRef={lightboxRef}
              closeButtonRef={closeButtonRef}
              onMove={moveActiveWork}
              onClose={() => setActiveWork(null)}
            />
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export default function TemplateCompositionPreview({ templateId }: { templateId: TemplateId }) {
  const { content, setContent } = useAdmin();
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [libraryState, setLibraryState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [libraryMessage, setLibraryMessage] = useState("正在读取本地素材库…");
  const [dialogOpen, setDialogOpen] = useState(false);
  const requestRef = useRef(0);
  const profile = getTemplateMaterialProfile(templateId);
  const existingWorks = useMemo(
    () => content.templateWorks[templateId] ?? [],
    [content.templateWorks, templateId],
  );

  const loadLibrary = useCallback(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLibraryState("loading");
    setLibraryMessage("正在刷新预览素材…");
    try {
      const response = await fetch(`${manifestUrl}?preview=${Date.now()}`, { cache: "no-store" });
      if (request !== requestRef.current) return;
      if (response.status === 404) {
        setAssets([]);
        setLibraryState("empty");
        setLibraryMessage("素材库还为空；请先到“素材排版”添加素材。");
        return;
      }
      if (!response.ok) throw new Error(`素材库读取失败（${response.status}）`);
      const manifest = parsePhotoLibraryManifest(await response.json());
      if (!manifest) throw new Error("素材库清单格式无效，请先恢复有效清单。" );
      if (request !== requestRef.current) return;
      setAssets(manifest.assets);
      setLibraryState(manifest.assets.length > 0 ? "ready" : "empty");
      setLibraryMessage(manifest.assets.length > 0
        ? `已使用 ${manifest.assets.length} 张本地素材生成只读推荐。`
        : "素材库还为空；请先到“素材排版”添加素材。");
    } catch (error) {
      if (request !== requestRef.current) return;
      setLibraryState("error");
      setLibraryMessage(error instanceof Error ? error.message : "素材库读取失败");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary(), 0);
    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [loadLibrary]);

  const preview = useMemo(() => planTemplateCompositionPreview({
    templateId,
    assets,
    existingWorks,
  }), [assets, existingWorks, templateId]);
  const planned = preview.status === "planned" ? preview : null;
  const applied = planned !== null && mappingSignature(existingWorks) === mappingSignature(planned.works);
  const priorityBySlot = useMemo(
    () => new Map(profile.visualPriority.map((priority) => [priority.slotIndex, priority])),
    [profile.visualPriority],
  );
  const workBySlot = useMemo(
    () => new Map(planned?.works.map((work, fallbackIndex) => [work.slotIndex ?? fallbackIndex, work]) ?? []),
    [planned],
  );

  const applyPreview = () => {
    if (!planned) return;
    setContent((current) => applyTemplateCompositionPreview(current, planned));
  };

  return (
    <section
      className={styles.templateCompositionPreview}
      data-template-composition-preview={templateId}
      data-preview-readonly="true"
      aria-labelledby={`template-preview-heading-${templateId}`}
    >
      <div className={styles.templateCompositionPreviewHeader}>
        <div>
          <span>REAL LIBRARY PREVIEW</span>
          <h4 id={`template-preview-heading-${templateId}`}>当前素材排版预览</h4>
          <p>{libraryMessage}</p>
        </div>
        <button type="button" onClick={() => void loadLibrary()} disabled={libraryState === "loading"}>
          {libraryState === "loading" ? "正在读取…" : "刷新预览素材"}
        </button>
      </div>

      {libraryState === "ready" && planned ? (
        <>
          <div className={styles.templateCompositionPreviewSummary} role="status" aria-live="polite">
            <div data-material-status={planned.materialStatus}>
              <span>素材适配</span>
              <strong>{materialStatusLabels[planned.materialStatus]}</strong>
            </div>
            <div>
              <span>当前使用</span>
              <strong>{planned.filledPhotoCount} / {profile.recommendedPhotoCount} 张</strong>
            </div>
            <div>
              <span>保留空槽</span>
              <strong>{planned.placeholderCount} 个</strong>
            </div>
          </div>

          <div
            className={styles.templatePreviewShortages}
            data-shortage-count={planned.shortages.filter(({ recommendedMissing }) => recommendedMissing > 0).length + planned.heroMissingCount}
            data-hero-missing={planned.heroMissingCount}
          >
            {planned.shortages.some(({ recommendedMissing }) => recommendedMissing > 0) || planned.heroMissingCount > 0 ? (
              <>
                <strong>建议继续补充</strong>
                <ul>
                  {planned.shortages.flatMap((shortage) => shortage.recommendedMissing > 0 ? [(
                    <li key={shortage.orientation}>
                      {orientationLabels[shortage.orientation]} {shortage.recommendedMissing} 张
                      {shortage.minimumMissing > 0 ? "（低于最低建议）" : ""}
                    </li>
                  )] : [])}
                  {planned.heroMissingCount > 0 ? (
                    <li>主视觉 {planned.heroMissingCount} 张（当前没有兼容素材）</li>
                  ) : null}
                </ul>
              </>
            ) : <span>当前素材已达到此模板的推荐方向组合。</span>}
          </div>

          <div className={styles.templatePreviewSlotMap} data-preview-template={templateId}>
            {profile.slotAspectTargets.map((ratio, slotIndex) => {
              const work = workBySlot.get(slotIndex);
              const priority = priorityBySlot.get(slotIndex);
              return (
                <article
                  key={slotIndex}
                  className={styles.templatePreviewSlot}
                  data-template-preview-slot={slotIndex}
                  data-ratio={ratio}
                  data-priority={priority?.level ?? "standard"}
                  style={{ aspectRatio: ratio.replace(":", " / ") }}
                >
                  {work ? (
                    <img
                      src={work.preview}
                      width={work.previewWidth}
                      height={work.previewHeight}
                      alt=""
                      style={{ objectPosition: work.position }}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : <span>待补充 {ratio}</span>}
                  <small>{String(slotIndex + 1).padStart(2, "0")} · {priority?.role ?? "gallery"}</small>
                </article>
              );
            })}
          </div>

          <div className={styles.templateCompositionPreviewActions}>
            <button type="button" onClick={() => setDialogOpen(true)}>打开真实模板预览</button>
            <button
              type="button"
              data-template-preview-apply={templateId}
              onClick={applyPreview}
              disabled={applied}
              title="只更新当前本地草稿，不会自动保存"
            >
              {applied ? "当前草稿已使用此排版" : "应用此排版到草稿"}
            </button>
          </div>
          <p className={styles.templateCompositionPreviewBoundary}>
            预览不会选择模板、修改草稿或发送保存请求；只有“应用此排版到草稿”会更新该模板的本地排版，仍需“保存全部修改”才会持久化。
          </p>
          <PreviewDialog open={dialogOpen} onClose={() => setDialogOpen(false)} preview={planned} />
        </>
      ) : libraryState === "loading" ? (
        <div className={styles.templateCompositionPreviewEmpty} role="status">正在为 {profile.templateId} 准备预览…</div>
      ) : libraryState === "empty" ? (
        <div className={styles.templateCompositionPreviewEmpty} role="status">没有可用于预览的本地素材。</div>
      ) : libraryState === "error" ? (
        <div className={styles.templateCompositionPreviewEmpty} role="alert">{libraryMessage}</div>
      ) : (
        <div className={styles.templateCompositionPreviewEmpty} role="alert">
          {preview.status === "planned" ? "预览素材尚未就绪。" : preview.reason}
        </div>
      )}
    </section>
  );
}
