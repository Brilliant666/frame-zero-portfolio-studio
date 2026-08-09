"use client";

import { useState } from "react";
import { isTemplateId, templateCatalog, type TemplateId } from "../../site-config";
import { AdminSection } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";

export default function TemplateEditor() {
  const { content, savedContent, setContent } = useAdmin();
  const [inspectedOverride, setInspectedOverride] = useState<TemplateId | null>(null);
  const inspectedId = inspectedOverride ?? content.activeTemplate;
  const savedTemplate = templateCatalog.find((template) => template.id === savedContent.activeTemplate);
  const draftTemplate = templateCatalog.find((template) => template.id === content.activeTemplate);
  const inspectedTemplate = templateCatalog.find((template) => template.id === inspectedId) ?? templateCatalog[0];
  const inspectedIsSaved = savedContent.activeTemplate === inspectedTemplate.id;
  const inspectedIsDraft = content.activeTemplate === inspectedTemplate.id;

  const inspectTemplate = (value: string) => {
    if (isTemplateId(value)) setInspectedOverride(value);
  };

  const chooseTemplate = (templateId: TemplateId) => {
    setContent((current) => ({ ...current, activeTemplate: templateId }));
  };

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
        <div className={styles.templateSelectionSummary} role="status" aria-live="polite">
          <div>
            <span>已保存模板</span>
            <strong>{savedTemplate?.name ?? savedContent.activeTemplate}</strong>
          </div>
          <div>
            <span>当前草稿</span>
            <strong>{draftTemplate?.name ?? content.activeTemplate}</strong>
          </div>
          <div>
            <span>当前查看</span>
            <strong>{inspectedTemplate.name}</strong>
          </div>
        </div>

        <div className={styles.templateNotice} role="note">
          查看候选详情不会修改草稿；只有点击“选择此模板”才会更新当前草稿。模板槽位数量或比例可能不同，
          当前主页的素材排版可能变化；各模板已有的显式槽位排版会继续保留，不会在这里静默删除。
        </div>

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
              <div className={`template-swatch ${styles.templateDetailSwatch}`} aria-hidden="true">
                <i /><b />
              </div>
            </div>

            <div className={styles.templateDetailBody}>
              <div className={styles.templateDetailStates} aria-label="当前候选模板状态">
                <span data-active={inspectedIsSaved}>{inspectedIsSaved ? "已保存选择" : "不是已保存选择"}</span>
                <span data-active={inspectedIsDraft}>{inspectedIsDraft ? "当前草稿" : "不是当前草稿"}</span>
                <span data-active="true">正在查看</span>
              </div>
              <div className={styles.templateDetailHeader}>
                <span>READY · {String(templateCatalog.indexOf(inspectedTemplate) + 1).padStart(2, "0")}</span>
                <h3 id={`template-detail-name-${inspectedTemplate.id}`}>{inspectedTemplate.name}</h3>
              </div>
              <p>{inspectedTemplate.description}</p>
              <dl className={styles.templateDetailFacts}>
                <div><dt>照片槽位</dt><dd>{inspectedTemplate.photoSlots} 个</dd></div>
                <div><dt>比例计划</dt><dd>{inspectedTemplate.photoRatios}</dd></div>
              </dl>
            </div>

            <div className={styles.templateDetailActions}>
              <button
                type="button"
                onClick={() => chooseTemplate(inspectedTemplate.id)}
                disabled={inspectedIsDraft}
              >
                {inspectedIsDraft ? "当前草稿模板" : "选择此模板"}
              </button>
              <a
                href={`/?template=${inspectedTemplate.id}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`独立预览${inspectedTemplate.name}`}
              >
                独立预览 <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        </div>
      </div>
    </AdminSection>
  );
}
