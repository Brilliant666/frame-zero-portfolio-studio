"use client";

/* eslint-disable @next/next/no-img-element -- legacy previews point at existing normalized site content. */

import { useMemo, useState } from "react";
import type { Work } from "../../site-config";
import { AdminField, AdminSection, AdminToggle } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";
import ResetExampleDialog from "./reset-example-dialog";

export default function AdvancedEditor() {
  const { content, setContent } = useAdmin();
  const [legacyOpen, setLegacyOpen] = useState(false);
  const visibleWorkCount = useMemo(
    () => content.works.filter((work) => work.enabled).length,
    [content.works],
  );

  const updateWork = (index: number, patch: Partial<Work>) => {
    setContent((current) => ({
      ...current,
      works: current.works.map((work, workIndex) => workIndex === index ? { ...work, ...patch } : work),
    }));
  };

  const moveWork = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= content.works.length) return;
    setContent((current) => {
      const works = [...current.works];
      [works[index], works[target]] = [works[target], works[index]];
      return { ...current, works };
    });
  };

  return (
    <AdminSection
      eyebrow="ADVANCED"
      title="高级设置"
      description="兼容数据与危险操作集中在这里；日常编辑通常不需要进入本分区。"
    >
      <div className={styles.advancedStack}>
        <section className={styles.legacyDisclosure}>
          <button
            type="button"
            className={styles.legacySummary}
            aria-expanded={legacyOpen}
            aria-controls="legacy-works-panel"
            onClick={() => setLegacyOpen((open) => !open)}
          >
            <span>LEGACY</span>
            <span>
              <strong>旧版兼容作品</strong>
              <small>保留 {visibleWorkCount} / {content.works.length} 组 · 仅在模板尚无显式槽位排版时使用</small>
            </span>
            <span aria-hidden="true">{legacyOpen ? "−" : "+"}</span>
          </button>

          <div id="legacy-works-panel" className={styles.legacyPanel} hidden={!legacyOpen}>
            <p className={styles.advancedHint}>
              这些数据用于兼容旧主页。为某个模板完成一次智能排版或手动选片后，该模板会改用素材排版中的显式槽位数据。
            </p>
            <div className={styles.legacyGrid}>
              {content.works.map((work, index) => (
                <article className={styles.legacyCard} data-enabled={work.enabled} key={`${work.image}-${index}`}>
                  <img className={styles.legacyPreview} src={work.preview} width={work.previewWidth} height={work.previewHeight} loading="lazy" decoding="async" alt="" />
                  <div className={styles.legacyCardBody}>
                    <div className={styles.legacyCardHead}>
                      <strong>{String(index + 1).padStart(2, "0")} · {work.code}</strong>
                      <AdminToggle checked={work.enabled} onChange={(enabled) => updateWork(index, { enabled })} label={work.enabled ? "显示" : "隐藏"} />
                    </div>
                    <AdminField label="作品代码" value={work.code} onChange={(value) => updateWork(index, { code: value })} />
                    <AdminField label="作品标题" value={work.title} onChange={(value) => updateWork(index, { title: value })} />
                    <AdminField label="作品描述" value={work.subtitle} onChange={(value) => updateWork(index, { subtitle: value })} />
                    <AdminField label="画面焦点" value={work.position} help="沿用 CSS object-position，例如 50% 50%。" onChange={(value) => updateWork(index, { position: value })} />
                    <dl className={styles.legacyMeta}>
                      <div><dt>图片引用</dt><dd>{work.image}</dd></div>
                      <div><dt>预览引用</dt><dd>{work.preview}</dd></div>
                    </dl>
                    <div className={styles.legacyOrder}>
                      <button type="button" onClick={() => moveWork(index, -1)} disabled={index === 0}>向前移动</button>
                      <button type="button" onClick={() => moveWork(index, 1)} disabled={index === content.works.length - 1}>向后移动</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.dangerZone} aria-labelledby="danger-zone-title">
          <div className={styles.dangerHeader}>
            <div>
              <span>DANGER ZONE</span>
              <h3 id="danger-zone-title">恢复示例草稿</h3>
            </div>
            <p>仅替换当前浏览器中的草稿，不会立即保存。确认前请检查是否仍有需要保留的未保存修改。</p>
          </div>
          <ResetExampleDialog />
        </section>
      </div>
    </AdminSection>
  );
}
