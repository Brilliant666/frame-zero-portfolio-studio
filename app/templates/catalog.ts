export type PhotoRatio = "3:2" | "2:3" | "16:9";

type TemplateCatalogDefinition = {
  id: string;
  name: string;
  description: string;
  status: "ready";
  photoSlots: number;
  photoRatios: string;
  slotRatios: readonly PhotoRatio[];
};

export const templateCatalog = [
  {
    id: "cinematic-light",
    name: "明亮电影感",
    description: "白底、橙色强调、电影取景框",
    status: "ready",
    photoSlots: 9,
    photoRatios: "16:9 × 3 · 3:2 × 5 · 2:3 × 1",
    slotRatios: ["16:9", "3:2", "2:3", "3:2", "3:2", "16:9", "3:2", "3:2", "16:9"],
  },
  {
    id: "neon-hud",
    name: "霓虹取景器",
    description: "赛博 HUD、曝光切换、磁吸索引",
    status: "ready",
    photoSlots: 9,
    photoRatios: "16:9 × 3 · 3:2 × 5 · 2:3 × 1",
    slotRatios: ["16:9", "3:2", "2:3", "3:2", "3:2", "16:9", "3:2", "3:2", "16:9"],
  },
  {
    id: "film-rail",
    name: "无限胶片轨道",
    description: "横向胶片、帧号时间轴、电影颗粒",
    status: "ready",
    photoSlots: 9,
    photoRatios: "3:2 × 9",
    slotRatios: ["3:2", "3:2", "3:2", "3:2", "3:2", "3:2", "3:2", "3:2", "3:2"],
  },
  {
    id: "manga-panels",
    name: "漫画分镜册",
    description: "漫画格、章节阅读、朱红强调",
    status: "ready",
    photoSlots: 9,
    photoRatios: "16:9 × 2 · 3:2 × 6 · 2:3 × 1",
    slotRatios: ["2:3", "3:2", "16:9", "3:2", "3:2", "3:2", "16:9", "3:2", "3:2"],
  },
  {
    id: "prism-liquid",
    name: "流体棱镜",
    description: "高亮留白、液态光场、棱镜转场",
    status: "ready",
    photoSlots: 9,
    photoRatios: "16:9 × 1 · 3:2 × 7 · 2:3 × 1",
    slotRatios: ["3:2", "2:3", "3:2", "3:2", "3:2", "16:9", "3:2", "3:2", "3:2"],
  },
  {
    id: "orbital-portal",
    name: "轨道门户",
    description: "镜头光圈、空间轨道、角色聚焦",
    status: "ready",
    photoSlots: 8,
    photoRatios: "2:3 × 8 · 主视觉 3:2",
    slotRatios: ["2:3", "2:3", "2:3", "2:3", "2:3", "2:3", "2:3", "2:3"],
  },
  {
    id: "archive-os",
    name: "摄影档案系统",
    description: "素材管理器、筛选检索、Quick Look",
    status: "ready",
    photoSlots: 12,
    photoRatios: "16:9 × 3 · 3:2 × 8 · 2:3 × 1",
    slotRatios: ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2", "3:2", "16:9", "3:2"],
  },
  {
    id: "editorial-duet",
    name: "双页时装刊",
    description: "跨页编排、黏性文字、摄影长卷",
    status: "ready",
    photoSlots: 9,
    photoRatios: "16:9 × 3 · 3:2 × 5 · 2:3 × 1",
    slotRatios: ["2:3", "3:2", "16:9", "3:2", "3:2", "16:9", "3:2", "3:2", "16:9"],
  },
  {
    id: "polaroid-field",
    name: "漂浮拍立得",
    description: "无限画布、卡片星座、自由探索",
    status: "ready",
    photoSlots: 9,
    photoRatios: "16:9 × 2 · 3:2 × 6 · 2:3 × 1",
    slotRatios: ["3:2", "16:9", "3:2", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"],
  },
  {
    id: "character-select",
    name: "角色选择大厅",
    description: "角色阵列、选中演出、任务确认",
    status: "ready",
    photoSlots: 9,
    photoRatios: "3:2 / 2:3 × 9 · 按素材方向自适应",
    slotRatios: ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"],
  },
  {
    id: "museum-depth",
    name: "深度影像展厅",
    description: "空间展框、纵深行进、极简标牌",
    status: "ready",
    photoSlots: 7,
    photoRatios: "16:9 × 2 · 3:2 × 4 · 2:3 × 1",
    slotRatios: ["3:2", "3:2", "2:3", "16:9", "3:2", "3:2", "16:9"],
  },
] as const satisfies readonly TemplateCatalogDefinition[];

export type TemplateId = (typeof templateCatalog)[number]["id"];
export type TemplateCatalogItem = (typeof templateCatalog)[number];

const templateIds = new Set<string>(templateCatalog.map((template) => template.id));

export function isTemplateId(value: string | null): value is TemplateId {
  return value !== null && templateIds.has(value);
}

export function getTemplateCatalogItem(id: TemplateId): TemplateCatalogItem {
  return templateCatalog.find((template) => template.id === id) ?? templateCatalog[0];
}

export function getTemplateSlotRatios(id: TemplateId): readonly PhotoRatio[] {
  return getTemplateCatalogItem(id).slotRatios;
}
