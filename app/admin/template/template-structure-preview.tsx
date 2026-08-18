/* eslint-disable @next/next/no-img-element -- committed diagrams are already fixed-size WebP files. */

import type { TemplateId } from "../../site-config";
import { getTemplateCatalogItem } from "../../templates/catalog";
import { getTemplateStructurePreview } from "../../templates/structure-previews";
import styles from "./template-structure-preview.module.css";

export default function TemplateStructurePreview({ templateId }: Readonly<{ templateId: TemplateId }>) {
  const template = getTemplateCatalogItem(templateId);
  const preview = getTemplateStructurePreview(templateId);

  return (
    <figure
      className={styles.figure}
      data-template-structure-preview={templateId}
      data-user-materials="false"
    >
      <img
        className={styles.image}
        src={preview.src}
        width={preview.width}
        height={preview.height}
        alt={`${template.name}模板结构示意图`}
        draggable={false}
      />
      <figcaption className={styles.caption}>
        <strong>模板结构示意</strong>
        <span>仅展示版式与槽位关系，不包含照片或当前草稿内容</span>
      </figcaption>
    </figure>
  );
}
