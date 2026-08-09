import type { Metadata } from "next";
import type { SiteContent } from "./site-config";

const NEUTRAL_SITE_NAME = "摄影作品集";

function trimSentence(value: string | undefined) {
  return value?.trim().replace(/[。.!！?？]+$/u, "") ?? "";
}

export function getPublicSiteName(content: SiteContent) {
  return content.profile.brand.trim()
    || content.profile.photographer.trim()
    || NEUTRAL_SITE_NAME;
}

export function buildPublicMetadata(content: SiteContent, origin: string): Metadata {
  const siteName = getPublicSiteName(content);
  const city = content.profile.city.trim();
  const role = content.profile.role.trim();
  const titleContext = [city, role].filter(Boolean).join(" ");
  const title = titleContext ? `${siteName}｜${titleContext}` : siteName;
  const descriptionParts = [
    content.hero.services,
    content.trustItems[1]?.value,
    content.profile.intro,
  ].map(trimSentence).filter(Boolean);
  const description = descriptionParts.length > 0
    ? `${descriptionParts.join("。")}。`
    : "摄影作品与约拍信息。";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: origin,
      siteName,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
