import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";

export type FlowEditorSection = "library" | "home" | "groups" | "pricing" | "contact";
export type FlowPreviewScene = "works" | "gallery" | "pricing" | "contact";
export const FLOW_EDITOR_MODULES: readonly { id: FlowEditorSection; label: string; position: string; purpose: string; scene: FlowPreviewScene }[] = [
  { id: "library", label: "图库", position: "本站共享素材，选入分类或设为背景后展示", purpose: "在这里上传照片；再把需要展示的照片加入完整作品分类。上传本身不改变主页。", scene: "gallery" },
  { id: "home", label: "首页", position: "打开流影视廊后看到的第一屏", purpose: "设置导航名称、首页标题与介绍、全屏背景，以及左右两条作品速览。", scene: "works" },
  { id: "groups", label: "完整作品", position: "首页“展开完整作品”进入的分类画廊", purpose: "为照片建立分类，从图库选片并确认顺序。这里的分类同时可选为首页左右作品轨。", scene: "gallery" },
  { id: "pricing", label: "价格与活动", position: "顶部导航“价格与活动”对应的页面", purpose: "填写价格项目、服务说明和活动细则；关闭展示时，正式页面导航隐藏这一项。", scene: "pricing" },
  { id: "contact", label: "联系", position: "顶部导航“联系方式”对应的页面", purpose: "填写联系账号、链接或可选二维码；各项只属于流影视廊。", scene: "contact" },
];

/** A disabled optional scene can be inspected without enabling it in the draft. */
export function flowModulePreview(document: FlowGalleryDocumentV1, section: FlowEditorSection): FlowGalleryDocumentV1 {
  if (section === "pricing" && !document.pricing.enabled || section === "contact" && !document.contact.enabled) {
    const preview: FlowGalleryDocumentV1 = JSON.parse(JSON.stringify(document));
    if (section === "pricing") preview.pricing.enabled = true;
    if (section === "contact") preview.contact.enabled = true;
    return preview;
  }
  return document;
}
