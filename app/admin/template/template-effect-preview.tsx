"use client";

import DraftTemplatePreviewTrigger from "../draft-preview";
import type { TemplateId } from "../../site-config";
import styles from "../admin-v2.module.css";

export default function TemplateEffectPreview({ templateId }: { templateId: TemplateId }) {
  return (
    <section
      className={styles.templateCompositionPreview}
      data-template-candidate-preview={templateId}
      data-preview-readonly="true"
      aria-labelledby={`template-preview-heading-${templateId}`}
    >
      <div className={styles.templateCompositionPreviewHeader}>
        <div>
          <span>CANDIDATE DRAFT PREVIEW</span>
          <h4 id={`template-preview-heading-${templateId}`}>查看模板效果</h4>
          <p>使用当前草稿内容和该模板已有排版；没有显式排版时按正式槽位规则生成回退。</p>
        </div>
      </div>
      <div className={styles.templateCompositionPreviewActions} data-action-count="1">
        <DraftTemplatePreviewTrigger
          templateId={templateId}
          label="查看模板效果"
          scope="candidate"
        />
      </div>
      <p className={styles.templateCompositionPreviewBoundary}>
        预览不会选择模板、读取素材库、修改草稿或发送保存请求。
      </p>
    </section>
  );
}
