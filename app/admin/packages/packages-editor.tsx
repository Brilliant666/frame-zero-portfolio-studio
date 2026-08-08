"use client";

import { useState } from "react";
import type { PhotographyPackage } from "../../site-config";
import { AdminField, AdminSection, AdminToggle } from "../admin-form";
import { useAdmin } from "../admin-provider";
import { splitAdminTextareaLines } from "../admin-state";
import styles from "../admin-v2.module.css";

export default function PackagesEditor() {
  const { content, setContent } = useAdmin();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const updatePackage = (index: number, patch: Partial<PhotographyPackage>) => {
    setContent((current) => ({
      ...current,
      packages: current.packages.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  return (
    <AdminSection
      eyebrow="PACKAGES"
      title="套餐价格"
      description="收起时快速扫描，展开后编辑完整套餐与交付内容。"
    >
      <div className={styles.disclosureList}>
        {content.packages.map((item, index) => {
          const open = openIndex === index;
          const panelId = `package-panel-${index}`;
          return (
            <article className={styles.disclosureCard} data-open={open} key={`${item.number}-${index}`}>
              <button
                type="button"
                className={styles.disclosureSummary}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
              >
                <span className={styles.disclosureIndex}>{item.number}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.english}</small>
                </span>
                <span className={styles.packageMeta}><strong>{item.price}</strong><small>{item.duration}</small></span>
                <span className={styles.enabledState} data-enabled={item.enabled}>{item.enabled ? "已启用" : "已隐藏"}</span>
                <span className={styles.disclosureIcon} aria-hidden="true">{open ? "−" : "+"}</span>
              </button>

              <div id={panelId} className={styles.disclosurePanel} hidden={!open}>
                <div className={styles.packageToolbar}>
                  <AdminToggle
                    checked={item.enabled}
                    onChange={(checked) => updatePackage(index, { enabled: checked })}
                    label={item.enabled ? "主页显示 · 已启用" : "主页隐藏 · 已隐藏"}
                  />
                </div>
                <div className={styles.formGrid}>
                  <AdminField label="套餐编号" value={item.number} onChange={(value) => updatePackage(index, { number: value })} />
                  <AdminField label="英文名称" value={item.english} onChange={(value) => updatePackage(index, { english: value })} />
                  <AdminField label="中文名称" value={item.name} onChange={(value) => updatePackage(index, { name: value })} />
                  <AdminField label="价格" value={item.price} onChange={(value) => updatePackage(index, { price: value })} />
                  <AdminField label="拍摄时长" value={item.duration} onChange={(value) => updatePackage(index, { duration: value })} />
                  <div className={styles.fullSpan}>
                    <AdminField area label="套餐说明" value={item.description} onChange={(value) => updatePackage(index, { description: value })} />
                  </div>
                  <div className={styles.fullSpan}>
                    <AdminField
                      area
                      label="交付内容"
                      help="每行填写一项，保存时继续使用原有字符串数组格式。"
                      value={item.deliverables.join("\n")}
                      onChange={(value) => updatePackage(index, { deliverables: splitAdminTextareaLines(value) })}
                    />
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </AdminSection>
  );
}
