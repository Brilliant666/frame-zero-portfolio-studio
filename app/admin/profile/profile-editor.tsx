"use client";

import { AdminField, AdminSection, FormGroup } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";

export default function ProfileEditor() {
  const { content, setContent } = useAdmin();

  return (
    <AdminSection
      eyebrow="PROFILE"
      title="基本资料"
      description="优先维护摄影师、首页文案与信任信息；品牌内容作为项目可选项收起。"
    >
      <div className={styles.groupStack}>
        <FormGroup title="摄影师资料" description="对外展示的身份、城市与档期。">
          <div className={styles.formGrid}>
            <AdminField label="摄影师名称" value={content.profile.photographer} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, photographer: value } }))} />
            <AdminField label="身份描述" value={content.profile.role} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, role: value } }))} />
            <AdminField label="可约城市" value={content.profile.city} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, city: value } }))} />
            <AdminField label="档期状态" value={content.profile.availability} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, availability: value } }))} />
            <div className={styles.fullSpan}>
              <AdminField area label="个人简介" value={content.profile.intro} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, intro: value } }))} />
            </div>
          </div>
        </FormGroup>

        <FormGroup title="首页 Hero" description="主页首屏的眉题、标题与服务摘要。">
          <div className={styles.formGrid}>
            <div className={styles.fullSpan}>
              <AdminField label="首页英文眉题" value={content.hero.eyebrow} onChange={(value) => setContent((current) => ({ ...current, hero: { ...current.hero, eyebrow: value } }))} />
            </div>
            <AdminField label="首页主标题" value={content.hero.title} onChange={(value) => setContent((current) => ({ ...current, hero: { ...current.hero, title: value } }))} />
            <AdminField label="服务摘要" value={content.hero.services} onChange={(value) => setContent((current) => ({ ...current, hero: { ...current.hero, services: value } }))} />
          </div>
        </FormGroup>

        <FormGroup title="信任信息" description="主页用于快速说明城市、价格、交付与档期的四组信息。">
          <div className={styles.pairGrid}>
            {content.trustItems.map((item, index) => (
              <div className={styles.pairRow} key={index}>
                <AdminField label={`信息 ${index + 1} 标签`} value={item.label} onChange={(value) => setContent((current) => ({
                  ...current,
                  trustItems: current.trustItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: value } : entry),
                }))} />
                <AdminField label={`信息 ${index + 1} 内容`} value={item.value} onChange={(value) => setContent((current) => ({
                  ...current,
                  trustItems: current.trustItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, value } : entry),
                }))} />
              </div>
            ))}
          </div>
        </FormGroup>

        <details className={styles.optionalDisclosure} data-optional-brand-content="true">
          <summary className={styles.optionalSummary}>
            <span>OPTIONAL</span>
            <span>
              <strong>可选品牌内容</strong>
              <small>展示名、短标与主页宣言都在这里统一设置。</small>
            </span>
            <span className={styles.optionalDisclosureIcon} aria-hidden="true" />
          </summary>
          <div className={styles.optionalDisclosureBody}>
            <FormGroup title="展示身份（可选）" description="所有主页模板和网站标题统一读取这里的展示名称；短标只用于紧凑视觉位置，不需要逐个模板修改。">
              <div className={styles.formGrid}>
                <AdminField label="展示名称 / 品牌名" help="可填写品牌、个人网名或对外展示名称；留空时网站标题使用摄影师名称。" value={content.profile.brand} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, brand: value } }))} />
                <AdminField label="短标 / 缩写（可留空）" help="留空时使用展示名称，不会生成或恢复示例字样。" value={content.profile.mark} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, mark: value } }))} />
              </div>
            </FormGroup>

            <FormGroup title="主页 Statement（可选）" description="独立的主页宣言文案，不会从展示名称自动生成。">
              <div className={styles.formGrid}>
                <div className={styles.fullSpan}>
                  <AdminField label="英文眉题" value={content.statement.eyebrow} onChange={(value) => setContent((current) => ({ ...current, statement: { ...current.statement, eyebrow: value } }))} />
                </div>
                <AdminField label="中文第一行" value={content.statement.lineOne} onChange={(value) => setContent((current) => ({ ...current, statement: { ...current.statement, lineOne: value } }))} />
                <AdminField label="中文第二行" value={content.statement.lineTwo} onChange={(value) => setContent((current) => ({ ...current, statement: { ...current.statement, lineTwo: value } }))} />
              </div>
            </FormGroup>
          </div>
        </details>
      </div>
    </AdminSection>
  );
}
