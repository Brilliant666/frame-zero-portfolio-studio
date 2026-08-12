"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isTemplateId, templateCatalog, type TemplateId } from "../../site-config";
import {
  getTemplateMaterialProfile,
  type TemplateMaterialProfile,
} from "../../templates/material-profiles";
import { AdminSection } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";
import TemplateStructurePreview from "./template-structure-preview";

const mobileModeLabels: Record<TemplateMaterialProfile["mobileBehavior"]["mode"], string> = {
  stack: "顺序堆叠",
  "horizontal-rail": "横向轨道",
  "pane-switch": "分栏切换",
  "fit-grid": "完整网格",
  "stage-roster": "主舞台 + 阵列",
};

export default function TemplateEditor() {
  const router = useRouter();
  const { content, savedContent, setContent } = useAdmin();
  const [inspectedOverride, setInspectedOverride] = useState<TemplateId | null>(null);
  const inspectedId = inspectedOverride ?? content.activeTemplate;
  const inspectedTemplate = templateCatalog.find((template) => template.id === inspectedId) ?? templateCatalog[0];
  const materialProfile = getTemplateMaterialProfile(inspectedTemplate.id);
  const inspectedIsSaved = savedContent.activeTemplate === inspectedTemplate.id;
  const inspectedIsDraft = content.activeTemplate === inspectedTemplate.id;

  const inspectTemplate = (value: string) => {
    if (isTemplateId(value)) setInspectedOverride(value);
  };

  const continueToLayout = (templateId: TemplateId) => {
    if (content.activeTemplate !== templateId) {
      setContent((current) => ({ ...current, activeTemplate: templateId }));
    }
    router.push("/admin/layout");
  };

  const detailState = inspectedIsDraft
    ? inspectedIsSaved ? "当前主页模板" : "已选为主页 · 未保存"
    : null;

  const statusLabels = (templateId: TemplateId) => [
    savedContent.activeTemplate === templateId ? "已保存" : null,
    content.activeTemplate === templateId ? "当前草稿" : null,
    inspectedId === templateId ? "正在查看" : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <AdminSection
      eyebrow="TEMPLATE"
      title="页面模板"
      description="从紧凑列表查看 11 个正式模板；同一时间只展开一个候选详情。"
    >
      <div className={styles.templateOverview}>
        <div className={styles.templateWorkbench}>
          <div className={styles.templateSelectorPane}>
            <label className={styles.templateMobileSelector}>
              <span>查看模板详情</span>
              <select
                value={inspectedId}
                onChange={(event) => inspectTemplate(event.target.value)}
                data-template-mobile-selector="true"
              >
                {templateCatalog.map((template, index) => {
                  const labels = statusLabels(template.id);
                  return (
                    <option value={template.id} key={template.id}>
                      {String(index + 1).padStart(2, "0")} · {template.name}{labels.length ? ` · ${labels.join(" / ")}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <ol className={styles.templateList} aria-label="正式页面模板">
              {templateCatalog.map((template, index) => {
                const labels = statusLabels(template.id);
                const isInspected = inspectedId === template.id;

                return (
                  <li key={template.id}>
                    <button
                      type="button"
                      className={styles.templateListButton}
                      data-template-option={template.id}
                      data-saved={savedContent.activeTemplate === template.id}
                      data-draft={content.activeTemplate === template.id}
                      data-inspected={isInspected}
                      aria-pressed={isInspected}
                      onClick={() => setInspectedOverride(template.id)}
                    >
                      <span className={styles.templateListIndex}>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{template.name}</strong>
                      <span className={styles.templateListStates}>
                        {labels.map((label) => <small key={label}>{label}</small>)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <article
            className={`${styles.templateDetail} is-${inspectedTemplate.id}`}
            data-template-detail={inspectedTemplate.id}
            data-saved={inspectedIsSaved}
            data-draft={inspectedIsDraft}
            data-inspected="true"
            aria-labelledby={`template-detail-name-${inspectedTemplate.id}`}
          >
            <div className={styles.templateDetailVisual}>
              <TemplateStructurePreview templateId={inspectedTemplate.id} />
            </div>

            <div className={styles.templateDetailBody}>
              {detailState ? (
                <div className={styles.templateDetailStates} role="status" aria-live="polite">
                  <span data-template-state={detailState}>{detailState}</span>
                </div>
              ) : null}
              <div className={styles.templateDetailHeader}>
                <span>READY · {String(templateCatalog.indexOf(inspectedTemplate) + 1).padStart(2, "0")}</span>
                <h3 id={`template-detail-name-${inspectedTemplate.id}`}>{inspectedTemplate.name}</h3>
              </div>
              <p>{inspectedTemplate.description}</p>
              <dl className={styles.templateDetailFacts}>
                <div><dt>照片槽位</dt><dd>{inspectedTemplate.photoSlots} 个</dd></div>
                <div><dt>比例计划</dt><dd>{inspectedTemplate.photoRatios}</dd></div>
              </dl>

              <section
                className={styles.templateMaterialProfile}
                data-template-material-profile={materialProfile.templateId}
                aria-labelledby={`template-material-title-${materialProfile.templateId}`}
              >
                <div className={styles.templateMaterialHeader}>
                  <div>
                    <span>MATERIAL PROFILE</span>
                    <h4 id={`template-material-title-${materialProfile.templateId}`}>素材准备建议</h4>
                  </div>
                  <strong>建议 {materialProfile.recommendedPhotoCount} 张</strong>
                </div>
                <p>
                  最少 {materialProfile.minimumUsefulPhotoCount} 张可形成有效页面；
                  素材充足时最多使用 {materialProfile.maximumUsefulPhotoCount} 张。
                </p>
                <dl className={styles.templateMaterialDemand}>
                  {([
                    ["横图", materialProfile.landscapeDemand],
                    ["竖图", materialProfile.portraitDemand],
                    ["方图", materialProfile.squareDemand],
                    ["任意方向", materialProfile.sourceAdaptiveDemand],
                  ] as const).map(([label, demand]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{demand.recommended > 0 ? `建议 ${demand.recommended} 张` : "可选回退"}</dd>
                      <small>{demand.minimum > 0 ? `至少 ${demand.minimum} 张 · ` : ""}{demand.note}</small>
                    </div>
                  ))}
                </dl>
                <div className={styles.templateMaterialSignals}>
                  <div>
                    <span>主视觉</span>
                    <strong>{materialProfile.heroSlotCount > 0 ? `${materialProfile.heroSlotCount} 张` : "无固定主视觉"}</strong>
                  </div>
                  <div data-crop-pressure={materialProfile.cropPressure.level}>
                    <span>裁切压力</span>
                    <strong>{{ low: "低", medium: "中", high: "高" }[materialProfile.cropPressure.level]}</strong>
                  </div>
                  <div>
                    <span>手机策略</span>
                    <strong>{mobileModeLabels[materialProfile.mobileBehavior.mode]}</strong>
                  </div>
                </div>
                <ul className={styles.templateMaterialNotes}>
                  {materialProfile.visualPriority.map((priority) => (
                    <li key={priority.slotIndex}>
                      <strong>槽位 {String(priority.slotIndex + 1).padStart(2, "0")}</strong>
                      <span>{priority.note}</span>
                    </li>
                  ))}
                  <li><strong>裁切</strong><span>{materialProfile.cropPressure.note}</span></li>
                  <li><strong>手机</strong><span>{materialProfile.mobileBehavior.note}</span></li>
                  {materialProfile.secondaryPresentations.map((presentation) => (
                    <li key={`${presentation.target}-${presentation.slotIndexes.join("-")}`}>
                      <strong>二次展示 {presentation.target}</strong>
                      <span>{presentation.note}</span>
                    </li>
                  ))}
                  {materialProfile.optionalNotes.map((note) => (
                    <li key={note}><strong>建议</strong><span>{note}</span></li>
                  ))}
                </ul>
              </section>

            </div>

            <div className={styles.templateDetailActions} data-template-primary-action="true">
              <button
                type="button"
                onClick={() => continueToLayout(inspectedTemplate.id)}
                title={inspectedIsDraft
                  ? "进入当前主页模板的素材排版"
                  : "将模板写入当前草稿并进入素材排版；不会自动保存"}
              >
                {inspectedIsDraft ? "进入素材排版" : "设为主页并进入素材排版"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        </div>
      </div>
    </AdminSection>
  );
}
