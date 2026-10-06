import type { GalleryDocument, GalleryPhoto } from "./model";

const picture = (id: string, kind: "portrait" | "background" | "closeup", width: number, height: number, alt: string): GalleryPhoto => ({
  id, url: `/preview/flow-gallery/asset/${kind}`, width, height, alt,
});

/** Anonymous, repeatable proof content. Never reads a Site, draft or photo library. */
export function galleryFixture(variant?: string): GalleryDocument {
  const background = picture("scene", "background", 1536, 1024, "匿名测试：温室里的午后");
  const document: GalleryDocument = {
    profile: { brand: "流影", title: "作品画廊", intro: "光影与人物的片刻，可以单独点开欣赏。" },
    background,
    groups: [
      { id: "stories", name: "光影叙事", photos: Array.from({ length: 9 }, (_, i) => i % 4 === 0
        ? picture(`story-${i}`, "portrait", 1024, 1536, `午后肖像 ${i + 1}`)
        : picture(`story-${i}`, "background", 1536, 1024, `温室记忆 ${i + 1}`)) },
      { id: "portraits", name: "人物特写", photos: Array.from({ length: 8 }, (_, i) => picture(`portrait-${i}`, "closeup", 1024, 1024, `窗边人物 ${i + 1}`)) },
    ],
    pricing: { heading: "拍摄与预约", introduction: "记录自然的表情，也记录光线经过的地方。\n\n可预约内容\n环境人像 · 主题创作 · 人物特写\n\n拍摄前一起确认场地、时间与想留下的故事。", packages: [
      { id: "portrait", name: "01 / 环境人像", price: "示例方案 A", description: "在熟悉的地方，用光线记录真实而放松的瞬间。", details: ["拍摄前沟通", "自然光与环境"] },
      { id: "story", name: "02 / 主题创作", price: "示例方案 B", description: "从一个想法出发，共同完成有叙事感的影像。", details: ["主题与造型讨论", "场景与色彩设计"] },
      { id: "detail", name: "03 / 人物特写", price: "示例方案 C", description: "让画面安静下来，关注神态、细节与情绪。", details: ["简洁布景", "精细后期"] },
    ] },
    contact: { heading: "一起留下片刻", intro: "这里可以放你的预约说明与联系方式。", items: [
      { id: "social", label: "作品动态", value: "个人主页" },
      { id: "booking", label: "预约方式", value: "先聊聊拍摄想法" },
      { id: "message", label: "文字联系", value: "匿名测试内容" },
      { id: "location", label: "拍摄地点", value: "城市与目的地" },
    ] },
  };
  if (variant === "empty") { document.groups = []; delete document.pricing; delete document.contact; }
  if (variant === "long") {
    document.profile.title = "记录旅途与城市之间那些安静而漫长的瞬间";
    document.profile.brand = "长名字摄影工作室";
    document.groups[0].name = "光线走过城市与山野的漫长摄影创作记录";
    document.groups[0].photos = Array.from({ length: 37 }, (_, i) => ({ ...document.groups[0].photos[i % 9], id: `varied-${i}` }));
    document.profile.intro = "";
    delete document.contact;
  }
  return document;
}
