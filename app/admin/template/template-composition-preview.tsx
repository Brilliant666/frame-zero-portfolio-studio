"use client";

/* eslint-disable @next/next/no-img-element -- preview thumbnails come from the validated local manifest. */

import {
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import type { PhotoAsset, PhotoOrientation } from "../../photo-library";
import {
  normalizePrimaryAssignmentRatio,
  primaryPhotoRatioForDimensions,
  templateSlotOrientationMode,
} from "../../photo-ratio-policy";
import type { TemplateId, Work } from "../../site-config";
import { getTemplateMaterialProfile } from "../../templates/material-profiles";
import {
  applyTemplateCompositionPreview,
  planTemplateCompositionPreview,
  type TemplatePreviewMaterialStatus,
} from "../../templates/template-preview-composition";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";

const TemplatePreviewDialog = dynamic(() => import("../template-preview-dialog"), {
  ssr: false,
});

type PreviewLibraryState = "loading" | "ready" | "empty" | "error";

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

export function LayoutCompositionPreview({
  templateId,
  assets,
  libraryState,
  libraryMessage,
  busy,
  onRefresh,
}: Readonly<{
  templateId: TemplateId;
  assets: readonly PhotoAsset[];
  libraryState: PreviewLibraryState;
  libraryMessage: string;
  busy: boolean;
  onRefresh: () => void | Promise<unknown>;
}>) {
  const { content, setContent } = useAdmin();
  const [dialogOpen, setDialogOpen] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const profile = getTemplateMaterialProfile(templateId);
  const existingWorks = useMemo(
    () => content.templateWorks[templateId] ?? [],
    [content.templateWorks, templateId],
  );
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
    if (!planned || planned.templateId !== content.activeTemplate) return;
    setContent((current) => (
      current.activeTemplate === planned.templateId
        ? applyTemplateCompositionPreview(current, planned)
        : current
    ));
  };

  const closePreview = () => {
    setDialogOpen(false);
    window.requestAnimationFrame(() => previewTriggerRef.current?.focus());
  };

  return (
    <section
      className={styles.templateCompositionPreview}
      data-layout-composition-preview={templateId}
      aria-labelledby={`layout-preview-heading-${templateId}`}
    >
      <div className={styles.templateCompositionPreviewHeader}>
        <div>
          <span>LAYOUT RECOMMENDATION</span>
          <h3 id={`layout-preview-heading-${templateId}`}>当前模板推荐排版</h3>
          <p>{libraryMessage}</p>
        </div>
        <button
          type="button"
          data-layout-preview-generate={templateId}
          onClick={() => void onRefresh()}
          disabled={libraryState === "loading" || busy}
        >
          {libraryState === "loading" ? "正在读取…" : "刷新排版建议"}
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
              <span>推荐使用</span>
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

          <details className={styles.templatePreviewSlotDisclosure} data-layout-recommendation-details={templateId}>
            <summary>查看 {profile.recommendedPhotoCount} 个推荐槽位</summary>
            <div className={styles.templatePreviewSlotMap} data-preview-template={templateId}>
              {profile.slotAspectTargets.map((ratio, slotIndex) => {
                const work = workBySlot.get(slotIndex);
                const priority = priorityBySlot.get(slotIndex);
                const presentationRatio = templateSlotOrientationMode(templateId, slotIndex) === "source-adaptive"
                  ? work
                    ? primaryPhotoRatioForDimensions(work.previewWidth, work.previewHeight)
                      ?? normalizePrimaryAssignmentRatio(ratio)
                    : normalizePrimaryAssignmentRatio(ratio)
                  : ratio;
                return (
                  <article
                    key={slotIndex}
                    className={styles.templatePreviewSlot}
                    data-template-preview-slot={slotIndex}
                    data-ratio={presentationRatio}
                    data-priority={priority?.level ?? "standard"}
                  >
                    <div
                      className={styles.templatePreviewSlotMedia}
                      style={{ aspectRatio: presentationRatio.replace(":", " / ") }}
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
                      ) : <span>待补充 {presentationRatio}</span>}
                    </div>
                    <small>{String(slotIndex + 1).padStart(2, "0")} · {priority?.role ?? "gallery"}</small>
                  </article>
                );
              })}
            </div>
          </details>

          <div className={styles.templateCompositionPreviewActions} data-action-count="2">
            <button
              ref={previewTriggerRef}
              type="button"
              data-layout-preview-open={templateId}
              aria-haspopup="dialog"
              aria-expanded={dialogOpen}
              onClick={() => setDialogOpen(true)}
            >
              预览推荐排版
            </button>
            <button
              type="button"
              data-layout-preview-apply={templateId}
              onClick={applyPreview}
              disabled={applied || busy}
              title="只更新当前模板的本地草稿，不会自动保存"
            >
              {applied ? "推荐排版已在草稿中" : "采用推荐到草稿"}
            </button>
          </div>
          <p className={styles.templateCompositionPreviewBoundary}>
            采用推荐排版只更新当前模板的本地草稿；仍需点击顶栏“保存修改”才会持久化。
          </p>
          {dialogOpen ? (
            <TemplatePreviewDialog
              templateId={templateId}
              works={planned.works}
              title="推荐排版预览"
              description="使用当前草稿内容和本次推荐 · 关闭不会采用或保存"
              previewSource="recommendation"
              onRequestClose={closePreview}
            />
          ) : null}
        </>
      ) : libraryState === "loading" ? (
        <div className={styles.templateCompositionPreviewEmpty} role="status">正在为 {profile.templateId} 准备推荐…</div>
      ) : libraryState === "empty" ? (
        <div className={styles.templateCompositionPreviewEmpty} role="status">没有可用于推荐排版的在库素材。</div>
      ) : libraryState === "error" ? (
        <div className={styles.templateCompositionPreviewEmpty} role="alert">{libraryMessage}</div>
      ) : (
        <div className={styles.templateCompositionPreviewEmpty} role="alert">
          {preview.status === "planned" ? "推荐素材尚未就绪。" : preview.reason}
        </div>
      )}
    </section>
  );
}
