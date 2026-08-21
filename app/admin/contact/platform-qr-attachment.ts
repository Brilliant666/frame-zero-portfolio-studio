import type { SiteContent } from "../../site-config";

type PlatformAccount = SiteContent["social"][number];

export type PlatformQrUploadTarget = Readonly<Pick<
  PlatformAccount,
  "label" | "handle" | "qrAssetId"
>>;

export type PlatformQrUploadResult = Readonly<{
  assetId: string;
  height: number;
  width: number;
}>;

export type PlatformQrAttachment = Readonly<{
  attached: boolean;
  message: string;
  social: SiteContent["social"];
}>;

export function completePlatformQrUpload(
  social: SiteContent["social"],
  index: number,
  expected: PlatformQrUploadTarget,
  upload: PlatformQrUploadResult,
): PlatformQrAttachment {
  const entry = social[index];
  const attached = Boolean(
    entry
    && entry.label === expected.label
    && entry.handle === expected.handle
    && entry.qrAssetId === expected.qrAssetId
  );

  if (!attached) {
    return {
      attached: false,
      message: "平台条目在上传期间发生变化，请重新选择图片。",
      social,
    };
  }

  return {
    attached: true,
    message: `图片已加入当前草稿（${upload.width} × ${upload.height}）；保存后主页生效。`,
    social: social.map((item, itemIndex) => (
      itemIndex === index ? { ...item, qrAssetId: upload.assetId } : item
    )),
  };
}
