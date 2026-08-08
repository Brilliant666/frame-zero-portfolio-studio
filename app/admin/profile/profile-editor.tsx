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
      description="按内容语义分组维护品牌、摄影师、首页文案与信任信息。"
    >
      <div className={styles.groupStack}>
        <FormGroup title="品牌身份" description="用于主页品牌标识与简写。">
          <div className={styles.formGrid}>
            <AdminField label="品牌名" value={content.profile.brand} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, brand: value } }))} />
            <AdminField label="品牌缩写" value={content.profile.mark} onChange={(value) => setContent((current) => ({ ...current, profile: { ...current.profile, mark: value } }))} />
          </div>
        </FormGroup>

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

        <FormGroup title="品牌 Statement" description="主页底部的品牌宣言。">
          <div className={styles.formGrid}>
            <div className={styles.fullSpan}>
              <AdminField label="英文眉题" value={content.statement.eyebrow} onChange={(value) => setContent((current) => ({ ...current, statement: { ...current.statement, eyebrow: value } }))} />
            </div>
            <AdminField label="中文第一行" value={content.statement.lineOne} onChange={(value) => setContent((current) => ({ ...current, statement: { ...current.statement, lineOne: value } }))} />
            <AdminField label="中文第二行" value={content.statement.lineTwo} onChange={(value) => setContent((current) => ({ ...current, statement: { ...current.statement, lineTwo: value } }))} />
          </div>
        </FormGroup>
      </div>
    </AdminSection>
  );
}
