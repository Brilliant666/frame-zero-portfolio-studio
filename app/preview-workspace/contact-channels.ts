import type { SiteContent } from "../site-config";

export type PolaroidSocialKind = "qq" | "douyin" | "xiaohongshu";
export const POLAROID_SOCIAL_LIMIT = 20;
type SocialAccount = SiteContent["social"][number];

const labels: Record<PolaroidSocialKind, readonly string[]> = {
  qq: ["qq", "qq号", "qq号码", "qq联系"],
  douyin: ["抖音", "抖音主页", "douyin"],
  xiaohongshu: ["小红书", "小红书主页", "xiaohongshu", "rednote"],
};
const defaultLabels: Record<PolaroidSocialKind, string> = { qq: "QQ", douyin: "抖音", xiaohongshu: "小红书" };

/** The first explicit channel label wins; legacy duplicates remain recoverable. */
export function readPolaroidSocial(social: readonly SocialAccount[], kind: PolaroidSocialKind): SocialAccount | undefined {
  return social.find((entry) => labels[kind].includes(entry.label.trim().toLowerCase()));
}

/** Update this content space only, preserving order and existing card references. */
export function writePolaroidSocial(social: readonly SocialAccount[], kind: PolaroidSocialKind, handle: string): SocialAccount[] {
  const current = readPolaroidSocial(social, kind);
  if (current) {
    const index = social.indexOf(current);
    return social.map((entry, itemIndex) => itemIndex === index ? { ...entry, handle } : entry);
  }
  if (!handle.trim()) return [...social];
  if (social.length >= POLAROID_SOCIAL_LIMIT) {
    throw new RangeError("平台账号已达 20 项，新增渠道前请在兼容设置中处理现有记录。");
  }
  return [...social, { label: defaultLabels[kind], handle }];
}
