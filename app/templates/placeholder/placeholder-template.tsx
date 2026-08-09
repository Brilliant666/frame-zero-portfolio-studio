"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { resolveBrandIdentity, withBrandPrefix } from "../../brand-identity";
import { getTemplateCatalogItem } from "../catalog";
import type { TemplateProps } from "../types";
import styles from "./placeholder.module.css";

export default function PlaceholderTemplate({ templateId, content, works, onOpenWork }: TemplateProps) {
  const brand = resolveBrandIdentity(content.profile);
  const template = getTemplateCatalogItem(templateId);
  const leadWork = works[0];

  return (
    <main className={styles.shell} data-template={templateId}>
      <header className={styles.header}>
        <span>{withBrandPrefix(brand.mark, "TEMPLATE SYSTEM", " / ")}</span>
        <a href="/admin">返回模板后台 ↗</a>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <small>{template.id.toUpperCase()} · BRANCH READY</small>
          <h1>{template.name}</h1>
          <p>{template.description}。独立动态入口已经建立，后续对应模板分支只需要替换这个目录，不会把其他十套页面一起打进入口。</p>
        </div>
        {leadWork && (
          <div className={styles.media}>
            <img
              src={leadWork.preview}
              width={leadWork.previewWidth}
              height={leadWork.previewHeight}
              alt={leadWork.subtitle}
              style={{ objectPosition: leadWork.position }}
            />
          </div>
        )}
      </section>

      <p className={styles.index}>SHARED CONTENT · {String(works.length).padStart(2, "0")} WORKS AVAILABLE</p>
      <section className={styles.works} aria-label="共享作品预览">
        {works.slice(0, 3).map((work) => (
          <button key={work.code} type="button" onClick={() => onOpenWork(work)}>
            <img
              src={work.preview}
              width={work.previewWidth}
              height={work.previewHeight}
              alt={work.subtitle}
              loading="lazy"
              style={{ objectPosition: work.position }}
            />
            <span><small>{work.code}</small><strong>{work.title}</strong></span>
          </button>
        ))}
      </section>
    </main>
  );
}
