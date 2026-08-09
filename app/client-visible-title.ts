import type { SiteContent } from "./site-config";

export type ClientVisibleTitleProfile = Readonly<
  Pick<SiteContent["profile"], "brand" | "photographer" | "mark">
>;

export function getClientVisiblePortfolioTitle(profile: ClientVisibleTitleProfile) {
  const brand = profile.brand.trim();
  if (brand) return brand.endsWith("作品集") ? brand : `${brand}的作品集`;

  const photographer = profile.photographer.trim();
  return photographer ? `${photographer}的作品集` : "摄影作品集";
}
