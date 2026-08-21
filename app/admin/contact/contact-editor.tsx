"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AdminField, AdminSection, FormGroup } from "../admin-form";
import { useAdmin } from "../admin-provider";
import { getPlatformQrAssetPath } from "../../platform-qr";
import { getSafeSocialUrl } from "../../social-links";
import { completePlatformQrUpload, type PlatformQrUploadTarget } from "./platform-qr-attachment";
import { platformQrUploadAccept, uploadPlatformQr } from "./platform-qr-client";
import styles from "../admin-v2.module.css";

const MAX_SOCIAL_LINKS = 8;

export default function ContactEditor() {
  const { content, localPhotoImportOrigin, localPhotoImportState, setContent } = useAdmin();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadMessages, setUploadMessages] = useState<Record<number, string>>({});
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => uploadAbortRef.current?.abort(), []);

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
    setUploadMessages({});
    setContent((current) => current.social.length >= MAX_SOCIAL_LINKS ? current : ({
      ...current,
      social: [...current.social, { label: "", handle: "" }],
    }));
  };

  const removeSocialItem = (index: number) => {
    setUploadMessages({});
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

  const clearSocialQr = (index: number) => {
    setContent((current) => ({
      ...current,
      social: current.social.map((entry, itemIndex) => {
        if (itemIndex !== index) return entry;
        const withoutQr = { ...entry };
        delete withoutQr.qrAssetId;
        return withoutQr;
      }),
    }));
    setUploadMessages((current) => ({ ...current, [index]: "二维码引用已从草稿移除；保存后主页生效。" }));
  };

  const handleSocialQrFile = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !localPhotoImportOrigin || uploadingIndex !== null) return;

    const expectedEntry = content.social[index];
    if (!expectedEntry) return;
    const expected: PlatformQrUploadTarget = {
      label: expectedEntry.label,
      handle: expectedEntry.handle,
      qrAssetId: expectedEntry.qrAssetId,
    };
    const controller = new AbortController();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = controller;
    setUploadingIndex(index);
    setUploadMessages((current) => ({ ...current, [index]: "正在安全处理二维码图片…" }));

    try {
      const result = await uploadPlatformQr(localPhotoImportOrigin, file, { signal: controller.signal });
      let completionMessage = "平台条目在上传期间发生变化，请重新选择图片。";
      setContent((current) => {
        const completion = completePlatformQrUpload(current.social, index, expected, result);
        completionMessage = completion.message;
        return completion.attached
          ? { ...current, social: completion.social }
          : current;
      });
      setUploadMessages((current) => ({
        ...current,
        [index]: completionMessage,
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setUploadMessages((current) => ({
        ...current,
        [index]: error instanceof Error ? error.message : "二维码上传失败。",
      }));
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      setUploadingIndex((current) => current === index ? null : current);
    }
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
          description="每个平台可填写账号或主页链接，并单独上传一张二维码图片；全部模板共用这里保存的内容，不再根据链接自动生成二维码。"
        >
          <div className={`${styles.pairGrid} ${styles.socialGrid}`}>
            {content.social.map((item, index) => {
              const safeUrl = getSafeSocialUrl(item.handle);
              const linkHelp = safeUrl
                ? "已识别安全 HTTPS 链接；离开输入框后会自动精简为链接。"
                : item.handle.toLowerCase().includes("https://")
                  ? "未识别：分享文案必须只包含一个无账号密码的 HTTPS 链接。"
                  : "普通账号会作为文本展示；二维码图片请在下方单独上传。";
              const qrSrc = getPlatformQrAssetPath(item.qrAssetId);
              const uploadAvailable = localPhotoImportState === "configured" && Boolean(localPhotoImportOrigin);
              const uploading = uploadingIndex === index;
              return (
              <div className={styles.pairRow} key={index} aria-busy={uploading}>
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
                <div className={styles.platformQrEditor} data-has-image={Boolean(qrSrc)}>
                  <div className={styles.platformQrPreview}>
                    {qrSrc ? (
                      <a href={qrSrc} target="_blank" rel="noopener noreferrer" aria-label={`查看${item.label || `平台 ${index + 1}`}二维码原图`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrSrc} alt={`${item.label || `平台 ${index + 1}`}二维码预览`} />
                      </a>
                    ) : <span aria-hidden="true">QR</span>}
                  </div>
                  <div className={styles.platformQrControls}>
                    <strong>二维码图片 {index + 1}</strong>
                    <p>{uploadAvailable
                      ? "支持 JPG、PNG、WebP，最大 10 MiB；保持原比例展示。"
                      : localPhotoImportState === "hosted"
                        ? "当前上线阶段尚未启用持久化二维码上传。"
                        : "请使用 npm run dev 完整启动本地编辑服务。"}</p>
                    <div>
                      <label aria-disabled={!uploadAvailable || uploadingIndex !== null}>
                        <input
                          type="file"
                          aria-label={`${item.label || `平台 ${index + 1}`}二维码图片 ${index + 1}`}
                          accept={platformQrUploadAccept}
                          disabled={!uploadAvailable || uploadingIndex !== null}
                          onChange={(event) => void handleSocialQrFile(index, event)}
                        />
                        <span>{uploading ? "正在上传…" : qrSrc ? "替换图片" : "上传图片"}</span>
                      </label>
                      {qrSrc ? (
                        <button type="button" onClick={() => clearSocialQr(index)} disabled={uploadingIndex !== null}>从主页移除</button>
                      ) : null}
                    </div>
                    {qrSrc ? <p>移除只会解除主页引用，本机私有原文件会保留，避免误删其他草稿正在使用的图片。</p> : null}
                    {uploadMessages[index] ? <small role="status">{uploadMessages[index]}</small> : null}
                  </div>
                </div>
                <div className={`${styles.rowActions} ${styles.socialRowActions}`}>
                  <button type="button" onClick={() => removeSocialItem(index)} disabled={uploadingIndex !== null} aria-label={`删除平台账号 ${index + 1}`}>删除平台</button>
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
