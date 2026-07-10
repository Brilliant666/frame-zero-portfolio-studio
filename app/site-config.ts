export const templateCatalog = [
  { id: "cinematic-light", name: "明亮电影感", description: "白底、橙色强调、电影取景框" },
  { id: "noir-archive", name: "暗色档案感", description: "黑底、暖橙信号、夜景氛围" },
  { id: "minimal-editorial", name: "极简画册感", description: "留白、克制排版、作品优先" },
] as const;

export type TemplateId = (typeof templateCatalog)[number]["id"];

export type Work = {
  code: string;
  title: string;
  subtitle: string;
  image: string;
  preview: string;
  position: string;
  previewWidth: number;
  previewHeight: number;
  fullWidth: number;
  enabled: boolean;
};

export type PhotographyPackage = {
  number: string;
  english: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  deliverables: string[];
  enabled: boolean;
};

export type SiteContent = {
  activeTemplate: TemplateId;
  profile: {
    brand: string;
    mark: string;
    photographer: string;
    role: string;
    city: string;
    availability: string;
    intro: string;
  };
  hero: { eyebrow: string; title: string; services: string };
  trustItems: Array<{ label: string; value: string }>;
  works: Work[];
  packages: PhotographyPackage[];
  contact: { wechat: string; email: string; note: string };
  social: Array<{ label: string; handle: string }>;
  bookingFields: string[];
  statement: { eyebrow: string; lineOne: string; lineTwo: string };
};

export const siteConfig: SiteContent = {
  activeTemplate: "cinematic-light",
  profile: {
    brand: "FRAME//ZERO",
    mark: "F//0",
    photographer: "林默",
    role: "Cosplay 摄影师 / 视觉叙事",
    city: "上海 · 杭州可约",
    availability: "2026 JUL · 接受预约",
    intro: "把角色从屏幕里拖进现实。",
  },
  hero: {
    eyebrow: "COSPLAY PHOTOGRAPHY / SHANGHAI · HANGZHOU",
    title: "BREAK THE FRAME",
    services: "漫展场照 · 主题私影 · 影棚创作",
  },
  trustItems: [
    { label: "BASE", value: "上海 / 杭州" },
    { label: "PRICE", value: "¥399 起" },
    { label: "DELIVERY", value: "7–14 天" },
    { label: "BOOKING", value: "本月余 4 档" },
  ],
  works: [
    {
      code: "B-04",
      title: "BATTLEFIELD",
      subtitle: "废墟 / 战斗 / 角色叙事",
      image: "/photos/photo-04-full.webp",
      preview: "/photos/photo-04-card.webp",
      position: "50% 48%",
      previewWidth: 1100,
      previewHeight: 744,
      fullWidth: 2200,
      enabled: true,
    },
    {
      code: "N-13",
      title: "NEON UNDERGROUND",
      subtitle: "霓虹 / 夜景 / 赛博氛围",
      image: "/photos/photo-13-full.webp",
      preview: "/photos/photo-13-card.webp",
      position: "48% 44%",
      previewWidth: 1100,
      previewHeight: 733,
      fullWidth: 2200,
      enabled: true,
    },
    {
      code: "O-17",
      title: "ORIENTAL DREAM",
      subtitle: "东方 / 棚景 / 画意人像",
      image: "/photos/photo-17-full.webp",
      preview: "/photos/photo-17-card.webp",
      position: "50% 50%",
      previewWidth: 1100,
      previewHeight: 733,
      fullWidth: 2200,
      enabled: true,
    },
    {
      code: "C-10",
      title: "CRYSTAL TIDE",
      subtitle: "蓝白 / 梦幻 / 高调布景",
      image: "/photos/photo-10-full.webp",
      preview: "/photos/photo-10-card.webp",
      position: "50% 48%",
      previewWidth: 1100,
      previewHeight: 733,
      fullWidth: 2200,
      enabled: true,
    },
    {
      code: "S-15",
      title: "SCARLET ROOM",
      subtitle: "红调 / 复古 / 情绪肖像",
      image: "/photos/photo-15-full.webp",
      preview: "/photos/photo-15-card.webp",
      position: "50% 28%",
      previewWidth: 733,
      previewHeight: 1100,
      fullWidth: 1466,
      enabled: true,
    },
    {
      code: "S-02",
      title: "SOFT LIGHT",
      subtitle: "柔光 / 室内 / 角色日常",
      image: "/photos/photo-02-full.webp",
      preview: "/photos/photo-02-card.webp",
      position: "50% 50%",
      previewWidth: 1100,
      previewHeight: 733,
      fullWidth: 2200,
      enabled: true,
    },
    {
      code: "F-03",
      title: "FESTIVE SIGNAL",
      subtitle: "节日 / 暖调 / 场景设计",
      image: "/photos/photo-03-full.webp",
      preview: "/photos/photo-03-card.webp",
      position: "50% 44%",
      previewWidth: 1100,
      previewHeight: 733,
      fullWidth: 2200,
      enabled: true,
    },
    {
      code: "R-12",
      title: "ROYAL BLUE",
      subtitle: "礼服 / 棚拍 / 质感人像",
      image: "/photos/photo-12-full.webp",
      preview: "/photos/photo-12-card.webp",
      position: "50% 42%",
      previewWidth: 1100,
      previewHeight: 733,
      fullWidth: 2200,
      enabled: true,
    },
    {
      code: "A-18",
      title: "AZURE GARDEN",
      subtitle: "花景 / 清透 / 梦幻角色",
      image: "/photos/photo-18-full.webp",
      preview: "/photos/photo-18-card.webp",
      position: "50% 42%",
      previewWidth: 1100,
      previewHeight: 733,
      fullWidth: 2200,
      enabled: true,
    },
  ],
  packages: [
    {
      number: "01",
      english: "CONVENTION",
      name: "漫展场照",
      description: "快速判断现场光线与动线，在有限时间内完成角色高光。",
      price: "¥399 起",
      duration: "45 MIN",
      deliverables: ["底片 80–120 张", "精修 6 张", "7 天内交付"],
      enabled: true,
    },
    {
      number: "02",
      english: "PRIVATE",
      name: "主题私影",
      description: "从参考、分镜到情绪走向，让一组照片拥有完整叙事。",
      price: "¥899 起",
      duration: "2 HOURS",
      deliverables: ["底片 150–250 张", "精修 12 张", "10 天内交付"],
      enabled: true,
    },
    {
      number: "03",
      english: "STUDIO",
      name: "影棚创作",
      description: "灯光、置景与色彩统一，把角色设定落成可触摸的世界。",
      price: "¥1299 起",
      duration: "3 HOURS",
      deliverables: ["底片 200–350 张", "精修 18 张", "14 天内交付"],
      enabled: true,
    },
  ],
  contact: {
    wechat: "FRAMEZERO_DEMO",
    email: "booking@framezero.example",
    note: "当前为示例联系方式与价格，后续可在后台统一替换。",
  },
  social: [
    { label: "小红书", handle: "@FRAMEZERO_COS" },
    { label: "抖音", handle: "@FRAMEZERO_STUDIO" },
    { label: "闲鱼", handle: "FRAMEZERO 约拍" },
  ],
  bookingFields: [
    "角色 / 作品：",
    "日期 / 漫展：",
    "城市 / 场地：",
    "单人 / 多人：",
    "选择套餐：",
    "想要的视觉风格：",
    "参考图链接：",
    "预算范围：",
    "联系方式：",
  ],
  statement: {
    eyebrow: "PHOTOGRAPHY IS NOT PROOF.",
    lineOne: "它是角色",
    lineTwo: "存在过的证据。",
  },
};

const templateIds = new Set<TemplateId>(templateCatalog.map((template) => template.id));

export function cloneSiteContent(content: SiteContent = siteConfig): SiteContent {
  return JSON.parse(JSON.stringify(content)) as SiteContent;
}

export function normalizeSiteContent(value: unknown): SiteContent {
  if (!value || typeof value !== "object") return cloneSiteContent();

  const incoming = value as Partial<SiteContent>;
  const normalized = cloneSiteContent();
  const copyStringFields = <T extends object>(target: T, source: unknown) => {
    if (!source || typeof source !== "object") return;
    for (const key of Object.keys(target) as Array<keyof T>) {
      const next = (source as Partial<Record<keyof T, unknown>>)[key];
      if (typeof next === "string") target[key] = next as T[keyof T];
    }
  };

  if (typeof incoming.activeTemplate === "string" && templateIds.has(incoming.activeTemplate as TemplateId)) {
    normalized.activeTemplate = incoming.activeTemplate as TemplateId;
  }
  copyStringFields(normalized.profile, incoming.profile);
  copyStringFields(normalized.hero, incoming.hero);
  copyStringFields(normalized.contact, incoming.contact);
  copyStringFields(normalized.statement, incoming.statement);

  if (Array.isArray(incoming.trustItems)) {
    normalized.trustItems = incoming.trustItems.slice(0, 8).map((item, index) => ({
      label: typeof item?.label === "string" ? item.label : `INFO ${index + 1}`,
      value: typeof item?.value === "string" ? item.value : "",
    }));
  }
  if (Array.isArray(incoming.social)) {
    normalized.social = incoming.social.slice(0, 8).map((item, index) => ({
      label: typeof item?.label === "string" ? item.label : `平台 ${index + 1}`,
      handle: typeof item?.handle === "string" ? item.handle : "",
    }));
  }
  if (Array.isArray(incoming.bookingFields)) {
    normalized.bookingFields = incoming.bookingFields
      .filter((field): field is string => typeof field === "string")
      .slice(0, 30);
  }
  if (Array.isArray(incoming.works)) {
    normalized.works = incoming.works.slice(0, 40).map((work, index) => {
      const fallback = siteConfig.works[index] ?? siteConfig.works[0];
      return {
        code: typeof work?.code === "string" ? work.code : fallback.code,
        title: typeof work?.title === "string" ? work.title : fallback.title,
        subtitle: typeof work?.subtitle === "string" ? work.subtitle : fallback.subtitle,
        image: typeof work?.image === "string" ? work.image : fallback.image,
        preview: typeof work?.preview === "string" ? work.preview : fallback.preview,
        position: typeof work?.position === "string" ? work.position : fallback.position,
        previewWidth: typeof work?.previewWidth === "number" ? work.previewWidth : fallback.previewWidth,
        previewHeight: typeof work?.previewHeight === "number" ? work.previewHeight : fallback.previewHeight,
        fullWidth: typeof work?.fullWidth === "number" ? work.fullWidth : fallback.fullWidth,
        enabled: typeof work?.enabled === "boolean" ? work.enabled : true,
      };
    });
  }
  if (Array.isArray(incoming.packages)) {
    normalized.packages = incoming.packages.slice(0, 12).map((item, index) => {
      const fallback = siteConfig.packages[index] ?? siteConfig.packages[0];
      return {
        number: typeof item?.number === "string" ? item.number : String(index + 1).padStart(2, "0"),
        english: typeof item?.english === "string" ? item.english : fallback.english,
        name: typeof item?.name === "string" ? item.name : fallback.name,
        description: typeof item?.description === "string" ? item.description : fallback.description,
        price: typeof item?.price === "string" ? item.price : fallback.price,
        duration: typeof item?.duration === "string" ? item.duration : fallback.duration,
        deliverables: Array.isArray(item?.deliverables)
          ? item.deliverables.filter((entry): entry is string => typeof entry === "string").slice(0, 12)
          : fallback.deliverables,
        enabled: typeof item?.enabled === "boolean" ? item.enabled : true,
      };
    });
  }

  return normalized;
}
