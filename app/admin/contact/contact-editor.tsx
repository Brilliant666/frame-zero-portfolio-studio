"use client";

import { AdminField, AdminSection, FormGroup } from "../admin-form";
import { useAdmin } from "../admin-provider";
import { getSafeSocialUrl } from "../../social-links";
import styles from "../admin-v2.module.css";

const MAX_SOCIAL_LINKS = 8;

export default function ContactEditor() {
  const { content, setContent } = useAdmin();

  const updateBookingField = (index: number, value: string) => {
    setContent((current) => ({
      ...current,
      bookingFields: current.bookingFields.map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  };

  const moveBookingField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= content.bookingFields.length) return;
    setContent((current) => {
      const bookingFields = [...current.bookingFields];
      [bookingFields[index], bookingFields[target]] = [bookingFields[target], bookingFields[index]];
      return { ...current, bookingFields };
    });
  };

  const addSocialItem = () => {
    setContent((current) => current.social.length >= MAX_SOCIAL_LINKS ? current : ({
      ...current,
      social: [...current.social, { label: "", handle: "" }],
    }));
  };

  const removeSocialItem = (index: number) => {
    setContent((current) => ({
      ...current,
      social: current.social.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateSocialHandle = (index: number, handle: string) => {
    setContent((current) => ({
      ...current,
      social: current.social.map((entry, itemIndex) => itemIndex === index ? { ...entry, handle } : entry),
    }));
  };

  const normalizeSocialHandle = (index: number, value: string) => {
    const href = getSafeSocialUrl(value);
    if (href) updateSocialHandle(index, href);
  };

  return (
    <AdminSection
      eyebrow="CONTACT"
      title="联系约拍"
      description="集中管理联系渠道、社交账号与客户需要填写的约拍信息。"
    >
      <div className={styles.groupStack}>
        <FormGroup title="联系方式" description="主页公开展示的约拍入口。">
          <div className={styles.formGrid}>
            <AdminField label="微信号" value={content.contact.wechat} onChange={(value) => setContent((current) => ({ ...current, contact: { ...current.contact, wechat: value } }))} />
            <AdminField label="邮箱" value={content.contact.email} onChange={(value) => setContent((current) => ({ ...current, contact: { ...current.contact, email: value } }))} />
            <div className={styles.fullSpan}>
              <AdminField area label="联系区说明" value={content.contact.note} onChange={(value) => setContent((current) => ({ ...current, contact: { ...current.contact, note: value } }))} />
            </div>
          </div>
        </FormGroup>

        <FormGroup
          title="平台账号与二维码"
          description="可填写普通账号、完整 HTTPS 链接，或直接粘贴只含一个链接的平台分享文案；识别出的链接会在漂浮拍立得中提供本地生成的二维码。"
        >
          <div className={styles.pairGrid}>
            {content.social.map((item, index) => {
              const safeUrl = getSafeSocialUrl(item.handle);
              const linkHelp = safeUrl
                ? "已识别安全 HTTPS 链接；离开输入框后会自动精简为链接。"
                : item.handle.toLowerCase().includes("https://")
                  ? "未识别：分享文案必须只包含一个无账号密码的 HTTPS 链接。"
                  : "普通账号会作为文本展示，不生成二维码。";
              return (
              <div className={styles.pairRow} key={index}>
                <AdminField label={`平台 ${index + 1}`} value={item.label} onChange={(value) => setContent((current) => ({
                  ...current,
                  social: current.social.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: value } : entry),
                }))} />
                <AdminField
                  label={`账号、主页链接或分享文案 ${index + 1}`}
                  value={item.handle}
                  placeholder="账号、https:// 链接，或平台分享文案"
                  help={linkHelp}
                  onChange={(value) => updateSocialHandle(index, value)}
                  onBlur={(value) => normalizeSocialHandle(index, value)}
                />
                <div className={`${styles.rowActions} ${styles.socialRowActions}`}>
                  <button type="button" onClick={() => removeSocialItem(index)} aria-label={`删除平台账号 ${index + 1}`}>删除</button>
                </div>
              </div>
              );
            })}
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={addSocialItem}
            disabled={content.social.length >= MAX_SOCIAL_LINKS}
          >
            {content.social.length >= MAX_SOCIAL_LINKS ? "已达到 8 个平台账号" : "添加平台账号"}
          </button>
        </FormGroup>

        <FormGroup title="约拍表单字段" description="主页复制的约拍清单顺序；可使用键盘完成编辑和排序。">
          <ol className={styles.bookingList}>
            {content.bookingFields.map((item, index) => (
              <li key={index}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <label>
                  <span className="sr-only">约拍字段 {index + 1}</span>
                  <input value={item} onChange={(event) => updateBookingField(index, event.target.value)} />
                </label>
                <div className={styles.rowActions}>
                  <button type="button" onClick={() => moveBookingField(index, -1)} disabled={index === 0} aria-label={`上移约拍字段 ${index + 1}`}>↑</button>
                  <button type="button" onClick={() => moveBookingField(index, 1)} disabled={index === content.bookingFields.length - 1} aria-label={`下移约拍字段 ${index + 1}`}>↓</button>
                  <button type="button" onClick={() => setContent((current) => ({ ...current, bookingFields: current.bookingFields.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`删除约拍字段 ${index + 1}`}>删除</button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setContent((current) => ({ ...current, bookingFields: [...current.bookingFields, "新字段："] }))}
          >
            添加约拍字段
          </button>
        </FormGroup>
      </div>
    </AdminSection>
  );
}
