export type ContactPlatform = "douyin" | "xiaohongshu" | "qq" | "wechat";

/** Presentation only: labels and known public profile hosts, never account values. */
export function contactPlatform(label: string, href?: string): ContactPlatform | null {
  const channel = label.trim().toLowerCase();
  if (/^(?:抖音(?:主页)?|douyin|tiktok)$/.test(channel)) return "douyin";
  if (/^(?:小红书(?:主页)?|xiaohongshu|rednote)$/.test(channel)) return "xiaohongshu";
  if (/^qq(?:号|号码|联系)?$/.test(channel)) return "qq";
  if (/^(?:微信(?:号|号码|联系)?|wechat|weixin)$/.test(channel)) return "wechat";
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const belongsTo = (host: string) => url.hostname === host || url.hostname.endsWith(`.${host}`);
    if (["douyin.com", "iesdouyin.com", "tiktok.com"].some(belongsTo)) return "douyin";
    if (["xiaohongshu.com", "xhslink.com", "xhslink.cn"].some(belongsTo)) return "xiaohongshu";
  } catch { /* An unknown or invalid contact keeps its existing text presentation. */ }
  return null;
}
