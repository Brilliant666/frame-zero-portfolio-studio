// Public-preview source: only authored illustrations, never Site or account data.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../../app/globals.css";
import { PreviewPortfolioExperience } from "../../../app/preview-workspace/portfolio-view";
import FlowGallery from "../../../app/premium-gallery-proof/gallery";
import { PREVIEW_THEME_KEY } from "../../../app/preview-workspace/preview-theme";

const subject = new URLSearchParams(location.search).get("subject") ?? "star";
const identifiers = Array.from({ length: 6 }, (_, i) => `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const assets = identifiers.map((id, index) => {
  const portrait = index === 0 || index === 2 || index === 4;
  const width = portrait ? 800 : 1200, height = portrait ? 1200 : 800;
  return { id, originalName: `authored-light-study-${index + 1}.svg`, width, height,
    aspectRatio: width / height, orientation: portrait ? "portrait" : "landscape",
    variants: Object.fromEntries(["thumbnail", "card", "full"].map(kind => [kind, {
      src: `/api/public-sites/showcase/assets/${id}/${kind}`, width, height,
    }])) };
});

const document = {
  schemaVersion: 1,
  profile: { mark: "光", brand: "光间", photographer: "光间", role: "摄影与视觉记录", city: "光影 · 空间 · 日常", availability: "作品集", intro: "收集光线停留的片刻。" },
  hero: { eyebrow: "LIGHT / FORM / MEMORY", title: "光间", services: "空间叙事 · 静物光影 · 远山记忆" },
  trustItems: [], packages: [], contact: { wechat: "", email: "", note: "" }, social: [], bookingFields: [],
  statement: { eyebrow: "", lineOne: "", lineTwo: "" },
  collections: ["空间叙事", "静物光影", "远山记忆"].map((name, index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name, description: "自绘光影素材 · 模板布局示意", visible: true,
    assetIds: identifiers, coverAssetId: identifiers[index], focusAssetId: null,
    coverFit: "natural", coverFocusX: 50, coverFocusY: 50,
  })),
};
const photo = (index, suffix = "") => ({ id: `${identifiers[index]}${suffix}`, url: assets[index].variants.card.src,
  width: assets[index].width, height: assets[index].height, alt: `自绘光影素材 ${index + 1}` });
const flow = {
  profile: { brand: "光间", title: "光影之间", intro: "收集光线经过的地方。\n空间、静物与远山，在画面之间流动。" },
  background: photo(5), backgroundFocus: { x: 50, y: 50 },
  featuredGroupIds: { left: "spaces", right: "light" },
  groups: [
    { id: "spaces", name: "空间叙事", photos: [0, 3, 2, 5].map((index, i) => photo(index, `-space-${i}`)) },
    { id: "light", name: "静物光影", photos: [1, 4, 3, 0].map((index, i) => photo(index, `-light-${i}`)) },
  ],
  pricing: { heading: "拍摄与预约", introduction: "从光线、空间和情绪出发。", packages: [] },
  contact: { heading: "一起记录片刻", intro: "模板布局示意", items: [] },
};

if (subject === "star") {
  localStorage.setItem(PREVIEW_THEME_KEY, "paper");
  window.document.documentElement.dataset.previewTheme = "paper";
  window.document.documentElement.dataset.starTheme = "paper";
}
createRoot(window.document.getElementById("root")).render(subject === "flow"
  ? <FlowGallery document={flow} />
  : <div data-site-premium><PreviewPortfolioExperience document={document} assets={assets} embedded={false} /></div>);
