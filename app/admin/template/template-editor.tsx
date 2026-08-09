"use client";

import { templateCatalog, type TemplateId } from "../../site-config";
import { AdminSection } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";

export default function TemplateEditor() {
  const { content, savedContent, setContent } = useAdmin();
  const savedTemplate = templateCatalog.find((template) => template.id === savedContent.activeTemplate);
  const draftTemplate = templateCatalog.find((template) => template.id === content.activeTemplate);

  const chooseTemplate = (templateId: TemplateId) => {
    setContent((current) => ({ ...current, activeTemplate: templateId }));
  };

  return (
    <AdminSection
      eyebrow="TEMPLATE"
      title="页面模板"
      description="11 个正式模板一次展开浏览；选择与独立预览仍是两个不同操作。"
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
        </div>

        <div className={styles.templateNotice} role="note">
          选择另一模板只会更新当前草稿。模板槽位数量或比例可能不同，当前主页的素材排版可能变化；
          各模板已有的显式槽位排版会继续保留，不会在这里静默删除。独立预览不会修改草稿。
        </div>

        <section className={styles.templateGrid} aria-label="正式页面模板">
          {templateCatalog.map((template, index) => {
            const isDraft = content.activeTemplate === template.id;
            const isSaved = savedContent.activeTemplate === template.id;
            const status = isDraft
              ? (isSaved ? "当前使用" : "草稿已选择")
              : (isSaved ? "上次保存" : "可选择");

            return (
              <article
                className={`${styles.templateCard} is-${template.id}`}
                data-template-card={template.id}
                data-selected={isDraft}
                aria-labelledby={`template-name-${template.id}`}
                key={template.id}
              >
                <div className={styles.templateCardVisual}>
                  <div className={`template-swatch ${styles.templateCardSwatch}`} aria-hidden="true">
                    <i /><b />
                  </div>
                  <span className={styles.templateCardState}>{status}</span>
                </div>

                <div className={styles.templateCardBody}>
                  <div className={styles.templateCardHeader}>
                    <span>READY · {String(index + 1).padStart(2, "0")}</span>
                    <h3 id={`template-name-${template.id}`}>{template.name}</h3>
                  </div>
                  <p>{template.description}</p>
                  <dl className={styles.templateCardFacts}>
                    <div><dt>照片槽位</dt><dd>{template.photoSlots} 个</dd></div>
                    <div><dt>比例计划</dt><dd>{template.photoRatios}</dd></div>
                  </dl>
                </div>

                <div className={styles.templateCardActions}>
                  <button type="button" onClick={() => chooseTemplate(template.id)} disabled={isDraft}>
                    {isDraft ? status : "选择此模板"}
                  </button>
                  <a
                    href={`/?template=${template.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`独立预览${template.name}`}
                  >
                    独立预览 <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </AdminSection>
  );
}
