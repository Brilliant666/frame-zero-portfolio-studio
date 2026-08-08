"use client";

import { useState } from "react";
import { templateCatalog, type TemplateId } from "../../site-config";
import { AdminSection } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";

export default function TemplateEditor() {
  const { content, savedContent, setContent } = useAdmin();
  const [inspectedId, setInspectedId] = useState<TemplateId | null>(null);
  const inspected = templateCatalog.find((template) => template.id === inspectedId)
    ?? templateCatalog.find((template) => template.id === content.activeTemplate)
    ?? templateCatalog[0];
  const draftChanged = content.activeTemplate !== savedContent.activeTemplate;
  const inspectedIsDraft = inspected.id === content.activeTemplate;

  const chooseTemplate = () => {
    setContent((current) => ({ ...current, activeTemplate: inspected.id }));
  };

  return (
    <AdminSection
      eyebrow="TEMPLATE"
      title="页面模板"
      description="先浏览模板，再明确选择。预览不会改变当前草稿。"
    >
      <div className={styles.templateWorkbench}>
        <div className={styles.templateList} role="list" aria-label="正式页面模板">
          {templateCatalog.map((template, index) => {
            const isInspected = inspected.id === template.id;
            const isDraft = content.activeTemplate === template.id;
            const isSaved = savedContent.activeTemplate === template.id;
            return (
              <button
                type="button"
                className={styles.templateListItem}
                data-selected={isInspected}
                aria-pressed={isInspected}
                onClick={() => setInspectedId(template.id)}
                key={template.id}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                </span>
                <span className={styles.templateListStatus}>
                  {isDraft && isSaved ? "当前使用" : isDraft ? "当前草稿" : isSaved ? "已保存" : "查看"}
                </span>
              </button>
            );
          })}
        </div>

        <article className={styles.templateDetail} aria-live="polite">
          <div className={`template-swatch is-${inspected.id} ${styles.templateHero}`} aria-hidden="true">
            <i /><b />
          </div>
          <div className={styles.templateDetailHeader}>
            <div>
              <span>{inspected.id}</span>
              <h3>{inspected.name}</h3>
            </div>
            <strong>{inspectedIsDraft ? (draftChanged ? "草稿已选择" : "当前使用") : "仅查看"}</strong>
          </div>
          <p className={styles.templateDescription}>{inspected.description}</p>

          <dl className={styles.templateFacts}>
            <div><dt>照片槽位</dt><dd>{inspected.photoSlots} 个</dd></div>
            <div><dt>比例计划</dt><dd>{inspected.photoRatios}</dd></div>
            <div><dt>已保存模板</dt><dd>{templateCatalog.find((item) => item.id === savedContent.activeTemplate)?.name}</dd></div>
            <div><dt>当前草稿</dt><dd>{templateCatalog.find((item) => item.id === content.activeTemplate)?.name}</dd></div>
          </dl>

          {!inspectedIsDraft ? (
            <div className={styles.templateNotice} role="note">
              将从“{templateCatalog.find((item) => item.id === content.activeTemplate)?.name}”切换到“{inspected.name}”。
              各模板已有的显式槽位排版会继续保留，不会在这里静默删除。
            </div>
          ) : null}

          <div className={styles.templateActions}>
            <button type="button" onClick={chooseTemplate} disabled={inspectedIsDraft}>
              {inspectedIsDraft ? "已选择此模板" : "选择此模板"}
            </button>
            <a href={`/?template=${inspected.id}`} target="_blank" rel="noreferrer">
              独立预览 <span aria-hidden="true">↗</span>
            </a>
          </div>
        </article>
      </div>
    </AdminSection>
  );
}
