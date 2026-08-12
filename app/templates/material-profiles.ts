import {
  templateCatalog,
  type PhotoRatio,
  type TemplateId,
} from "./catalog";
import { templateSlotOrientationMode } from "../photo-ratio-policy";

export type TemplateMaterialDemand = Readonly<{
  minimum: number;
  recommended: number;
  note: string;
}>;

export type TemplateMaterialPriority = Readonly<{
  slotIndex: number;
  level: "critical" | "high";
  role: "hero" | "cover" | "feature" | "panorama" | "focal" | "support";
  note: string;
}>;

export type TemplateSecondaryPresentation = Readonly<{
  slotIndexes: readonly number[];
  target: PhotoRatio | "1:1" | "variable";
  critical: boolean;
  note: string;
}>;

export type TemplateMaterialProfile = Readonly<{
  templateId: TemplateId;
  minimumUsefulPhotoCount: number;
  recommendedPhotoCount: number;
  maximumUsefulPhotoCount: number;
  heroSlotCount: number;
  landscapeDemand: TemplateMaterialDemand;
  portraitDemand: TemplateMaterialDemand;
  squareDemand: TemplateMaterialDemand;
  sourceAdaptiveDemand: TemplateMaterialDemand;
  slotAspectTargets: readonly PhotoRatio[];
  visualPriority: readonly TemplateMaterialPriority[];
  cropPressure: Readonly<{
    level: "low" | "medium" | "high";
    note: string;
  }>;
  mobileBehavior: Readonly<{
    mode: "stack" | "horizontal-rail" | "pane-switch" | "fit-grid" | "stage-roster";
    note: string;
  }>;
  secondaryPresentations: readonly TemplateSecondaryPresentation[];
  optionalNotes: readonly string[];
}>;

export type TemplateMaterialPlanSummary = Readonly<{
  totalSlots: number;
  fixedLandscapeCount: number;
  fixedPortraitCount: number;
  sourceAdaptiveCount: number;
  fixedWideCropCount: number;
}>;

type ProfileMetadata = Omit<
  TemplateMaterialProfile,
  "templateId" | "maximumUsefulPhotoCount" | "slotAspectTargets" | "sourceAdaptiveDemand"
>;

const allSlots = (count: number) => Object.freeze(Array.from({ length: count }, (_, index) => index));

const profileMetadata = {
  "cinematic-light": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 3, recommended: 8, note: "横向主视觉与电影档案墙是主体。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "一张竖图为档案节奏提供停顿。" },
    squareDemand: { minimum: 0, recommended: 0, note: "可作回退素材，但不是设计目标。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "hero", note: "首屏全宽主视觉。" },
      { slotIndex: 8, level: "high", role: "support", note: "末段宣言背景会再次使用。" },
    ],
    cropPressure: { level: "high", note: "主视觉与档案卡均为 cover 裁切，人物主体需留安全边距。" },
    mobileBehavior: { mode: "stack", note: "主视觉缩短，档案卡改单列/双列堆叠。" },
    secondaryPresentations: [],
    optionalNotes: ["优先选择主体位置稳定、横向留白充足的首图。"],
  },
  "neon-hud": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 3, recommended: 8, note: "HUD 主视窗、索引和档案区以横图为主。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "竖图丰富角色与节奏变化。" },
    squareDemand: { minimum: 0, recommended: 0, note: "只作为横竖槽位的可裁切回退。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "hero", note: "首次进入时的 HUD 目标图。" },
      { slotIndex: 8, level: "high", role: "support", note: "宣言段背景。" },
    ],
    cropPressure: { level: "high", note: "任一索引图都可能进入固定 16:9 主视窗。" },
    mobileBehavior: { mode: "stack", note: "主视窗、目标信息和索引在窄屏纵向排列。" },
    secondaryPresentations: [
      { slotIndexes: allSlots(9), target: "16:9", critical: true, note: "被选中的任意素材会进入横向 HUD 主视窗。" },
    ],
    optionalNotes: ["人物居中或已设置 focus 的图片更适合作为可切换主视图。"],
  },
  "film-rail": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 4, recommended: 9, note: "整套胶片轨道均按 3:2 横图组织。" },
    portraitDemand: { minimum: 0, recommended: 0, note: "竖图不属于本模板的正式槽位需求。" },
    squareDemand: { minimum: 0, recommended: 0, note: "方图只作为裁切回退，优先补横图。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "hero", note: "首帧承担开场主视觉。" },
    ],
    cropPressure: { level: "medium", note: "全部展示面统一 3:2；方向匹配时裁切压力稳定。" },
    mobileBehavior: { mode: "horizontal-rail", note: "窄屏仍保留可横向滚动与吸附的胶片轨道。" },
    secondaryPresentations: [],
    optionalNotes: ["同一系列、相近色调的连续横图最能形成电影叙事。"],
  },
  "manga-panels": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 3, recommended: 8, note: "章节分镜主要依靠横图推进。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "封面槽必须保留一张强竖图。" },
    squareDemand: { minimum: 0, recommended: 0, note: "局部分镜可接受方图裁切，但不必专门准备。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "cover", note: "2:3 漫画封面与首个叙事锚点。" },
      { slotIndex: 2, level: "high", role: "feature", note: "第一张宽幅章节画面。" },
      { slotIndex: 6, level: "high", role: "feature", note: "第二张宽幅章节画面。" },
    ],
    cropPressure: { level: "medium", note: "分镜比例多样，但每个槽位有明确方向目标。" },
    mobileBehavior: { mode: "stack", note: "桌面拼贴在窄屏改为按章节顺序阅读。" },
    secondaryPresentations: [],
    optionalNotes: ["封面应使用轮廓清楚、上下留有标题空间的竖图。"],
  },
  "prism-liquid": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 3, recommended: 8, note: "主视觉、流体组图和全景段以横图为主。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "一张竖图打破横向组图节奏。" },
    squareDemand: { minimum: 0, recommended: 0, note: "可作为组图回退，不是主要目标。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "hero", note: "首屏棱镜主视觉。" },
      { slotIndex: 5, level: "critical", role: "panorama", note: "独立宽幅全景段。" },
      { slotIndex: 1, level: "high", role: "feature", note: "首组对照中的竖向节奏点。" },
    ],
    cropPressure: { level: "high", note: "固定 3:2 主视窗与不规则 clip-path 会放大边缘裁切。" },
    mobileBehavior: { mode: "stack", note: "流体组图在手机端拆成纵向卡组，保留主次。" },
    secondaryPresentations: [
      { slotIndexes: [0], target: "3:2", critical: true, note: "首槽始终进入固定 3:2 棱镜主视窗。" },
    ],
    optionalNotes: ["主图与全景图应避免把关键主体压在画面四角。"],
  },
  "orbital-portal": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 8,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 0, recommended: 0, note: "正式轨道卡槽全部为 2:3。" },
    portraitDemand: { minimum: 4, recommended: 8, note: "八张竖向角色图构成完整轨道。" },
    squareDemand: { minimum: 0, recommended: 0, note: "方图会承受较高的双重裁切压力。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "hero", note: "首次激活的门户主视觉。" },
    ],
    cropPressure: { level: "high", note: "2:3 槽位素材还会进入 3:2 门户主视图，必须关注 focus。" },
    mobileBehavior: { mode: "stack", note: "门户与轨道卡在手机端转为单列/四列可选布局。" },
    secondaryPresentations: [
      { slotIndexes: allSlots(8), target: "3:2", critical: true, note: "被激活的任意竖图会再次进入横向门户。" },
    ],
    optionalNotes: ["优先使用环境留白足够的全身或半身竖图，并校准焦点。"],
  },
  "archive-os": {
    minimumUsefulPhotoCount: 6,
    recommendedPhotoCount: 12,
    heroSlotCount: 0,
    landscapeDemand: { minimum: 5, recommended: 11, note: "高密度素材管理器主要展示横图。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "一张竖图丰富档案类型与 Quick Look。" },
    squareDemand: { minimum: 0, recommended: 0, note: "允许回退，但网格和列表都将再次裁切。" },
    visualPriority: [
      { slotIndex: 0, level: "high", role: "focal", note: "首次选中的 Quick Look 素材。" },
    ],
    cropPressure: { level: "medium", note: "Quick Look 保留原方向，网格 3:2、列表 16:9 会产生二次裁切。" },
    mobileBehavior: { mode: "pane-switch", note: "桌面三栏在手机端变为素材/检查器分页切换。" },
    secondaryPresentations: [
      { slotIndexes: allSlots(12), target: "16:9", critical: false, note: "列表视图中的所有缩略图统一为 16:9。" },
    ],
    optionalNotes: ["数量越接近 12 张，档案系统的密度与检索感越完整。"],
  },
  "editorial-duet": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 3, recommended: 8, note: "章节长卷以横向摄影为主体。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "2:3 封面是编辑叙事的必要起点。" },
    squareDemand: { minimum: 0, recommended: 0, note: "可回退到章节图，但不是首选。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "cover", note: "时装刊封面。" },
      { slotIndex: 2, level: "high", role: "feature", note: "第一处宽幅章节。" },
      { slotIndex: 5, level: "high", role: "feature", note: "中段宽幅章节。" },
      { slotIndex: 8, level: "high", role: "feature", note: "收束章节宽幅画面。" },
    ],
    cropPressure: { level: "medium", note: "封面与章节都使用 cover，但比例与正式槽位一致。" },
    mobileBehavior: { mode: "stack", note: "双页与黏性章节在手机端按阅读顺序展开。" },
    secondaryPresentations: [],
    optionalNotes: ["封面和三张宽幅章节图应优先保持同一组视觉语言。"],
  },
  "polaroid-field": {
    minimumUsefulPhotoCount: 5,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 4, recommended: 8, note: "星图外围以横向拍立得为主。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "中央 FRAME 05 需要一张强竖图。" },
    squareDemand: { minimum: 0, recommended: 0, note: "可作为外围卡片回退，但不是正式槽位目标。" },
    visualPriority: [
      { slotIndex: 4, level: "critical", role: "hero", note: "中央最大、最高层级的 FRAME 05。" },
      { slotIndex: 8, level: "high", role: "support", note: "第二层级的前景卡片。" },
    ],
    cropPressure: { level: "medium", note: "卡片按槽位比例 cover；旋转影响边界但不改变裁切目标。" },
    mobileBehavior: { mode: "fit-grid", note: "桌面可缩放星图在手机端降级为完整可读网格。" },
    secondaryPresentations: [],
    optionalNotes: ["中央竖图承担视觉中心；外围横图宜保持色调连续。"],
  },
  "character-select": {
    minimumUsefulPhotoCount: 5,
    recommendedPhotoCount: 9,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 0, recommended: 0, note: "横图按 3:2 主目标进入自适应角色行，不设固定数量。" },
    portraitDemand: { minimum: 0, recommended: 0, note: "竖图按 2:3 主目标进入自适应角色行，不设固定数量。" },
    squareDemand: { minimum: 0, recommended: 0, note: "方图保留真实素材身份，展示时使用 3:2 裁切目标。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "hero", note: "首次选中的 Fighter 主舞台。" },
      { slotIndex: 4, level: "high", role: "feature", note: "中央角色位随来源方向使用 3:2 或 2:3。" },
    ],
    cropPressure: { level: "medium", note: "角色阵列、主舞台与档案区统一遵循来源方向的 3:2 / 2:3 主目标。" },
    mobileBehavior: { mode: "stage-roster", note: "主舞台保持优先，角色阵列在窄屏仍按三列方向自适应行完整展示。" },
    secondaryPresentations: [
      { slotIndexes: allSlots(9), target: "variable", critical: true, note: "激活图还会进入随素材方向调整宽度的主舞台。" },
    ],
    optionalNotes: ["人脸或角色主体应靠近 focus，避免 3:2 / 2:3 展示裁掉头部与武器。"],
  },
  "museum-depth": {
    minimumUsefulPhotoCount: 4,
    recommendedPhotoCount: 7,
    heroSlotCount: 1,
    landscapeDemand: { minimum: 3, recommended: 6, note: "展厅主视觉与大部分画框为横向作品。" },
    portraitDemand: { minimum: 1, recommended: 1, note: "一张竖向展品打破长卷节奏。" },
    squareDemand: { minimum: 0, recommended: 0, note: "可回退，但不是正式展框目标。" },
    visualPriority: [
      { slotIndex: 0, level: "critical", role: "hero", note: "入口大厅主视觉。" },
      { slotIndex: 2, level: "high", role: "feature", note: "唯一竖向展品。" },
    ],
    cropPressure: { level: "medium", note: "桌面展品以 contain 为主，入口与手机端仍会 cover 裁切。" },
    mobileBehavior: { mode: "stack", note: "纵深展厅在手机端转为顺序展览，画框使用全宽。" },
    secondaryPresentations: [],
    optionalNotes: ["横图适合保留环境；竖图应选择主体集中、边缘干净的作品。"],
  },
} as const satisfies Record<TemplateId, ProfileMetadata>;

function freezeDemand(demand: TemplateMaterialDemand) {
  return Object.freeze({ ...demand });
}

function orientationDemandsForPolicy(
  templateId: TemplateId,
  slotRatios: readonly PhotoRatio[],
  metadata: ProfileMetadata,
) {
  const adaptiveSlotCount = slotRatios.filter(
    (_, slotIndex) => templateSlotOrientationMode(templateId, slotIndex) === "source-adaptive",
  ).length;
  if (adaptiveSlotCount === 0) {
    return {
      landscapeDemand: metadata.landscapeDemand,
      portraitDemand: metadata.portraitDemand,
      squareDemand: metadata.squareDemand,
      sourceAdaptiveDemand: {
        minimum: 0,
        recommended: 0,
        note: "该模板保持固定方向构图，不使用来源方向自适应槽位。",
      },
    };
  }

  const fixedRatios = slotRatios.filter(
    (_, slotIndex) => templateSlotOrientationMode(templateId, slotIndex) === "fixed",
  );
  const fixedLandscapeCount = fixedRatios.filter((ratio) => ratio !== "2:3").length;
  const fixedPortraitCount = fixedRatios.length - fixedLandscapeCount;
  return {
    landscapeDemand: {
      minimum: fixedLandscapeCount,
      recommended: fixedLandscapeCount,
      note: "仅结构性横向槽位需要固定横图；普通图集槽位可使用任意来源方向。",
    },
    portraitDemand: {
      minimum: fixedPortraitCount,
      recommended: fixedPortraitCount,
      note: "仅结构性竖向槽位需要固定竖图；普通图集槽位可使用任意来源方向。",
    },
    squareDemand: {
      minimum: 0,
      recommended: 0,
      note: "方图可作为普通图集槽位的回退，并以 3:2 主目标展示。",
    },
    sourceAdaptiveDemand: {
      minimum: Math.max(0, metadata.minimumUsefulPhotoCount - fixedRatios.length),
      recommended: Math.max(0, metadata.recommendedPhotoCount - fixedRatios.length),
      note: "普通图集槽位按来源方向展示：横图 3:2、竖图 2:3，不要求预先凑齐固定横竖配额。",
    },
  };
}

function freezeProfile(templateId: TemplateId): TemplateMaterialProfile {
  const catalog = templateCatalog.find((template) => template.id === templateId);
  if (!catalog) throw new Error(`Missing template catalog entry for ${templateId}.`);
  const metadata = profileMetadata[templateId];
  const demands = orientationDemandsForPolicy(templateId, catalog.slotRatios, metadata);

  return Object.freeze({
    templateId,
    minimumUsefulPhotoCount: metadata.minimumUsefulPhotoCount,
    recommendedPhotoCount: metadata.recommendedPhotoCount,
    maximumUsefulPhotoCount: catalog.photoSlots,
    heroSlotCount: metadata.heroSlotCount,
    landscapeDemand: freezeDemand(demands.landscapeDemand),
    portraitDemand: freezeDemand(demands.portraitDemand),
    squareDemand: freezeDemand(demands.squareDemand),
    sourceAdaptiveDemand: freezeDemand(demands.sourceAdaptiveDemand),
    slotAspectTargets: Object.freeze([...catalog.slotRatios]),
    visualPriority: Object.freeze(metadata.visualPriority.map((priority) => Object.freeze({ ...priority }))),
    cropPressure: Object.freeze({ ...metadata.cropPressure }),
    mobileBehavior: Object.freeze({ ...metadata.mobileBehavior }),
    secondaryPresentations: Object.freeze(metadata.secondaryPresentations.map((presentation) => Object.freeze({
      ...presentation,
      slotIndexes: Object.freeze([...presentation.slotIndexes]),
    }))),
    optionalNotes: Object.freeze([...metadata.optionalNotes]),
  });
}

export const templateMaterialProfiles = Object.freeze(
  templateCatalog.map((template) => freezeProfile(template.id)),
);

const profileByTemplateId = new Map<TemplateId, TemplateMaterialProfile>(
  templateMaterialProfiles.map((profile) => [profile.templateId, profile]),
);

const planSummaryByTemplateId = new Map<TemplateId, TemplateMaterialPlanSummary>(
  templateMaterialProfiles.map((profile) => {
    let fixedLandscapeCount = 0;
    let fixedPortraitCount = 0;
    let sourceAdaptiveCount = 0;
    let fixedWideCropCount = 0;
    profile.slotAspectTargets.forEach((ratio, slotIndex) => {
      if (templateSlotOrientationMode(profile.templateId, slotIndex) === "source-adaptive") {
        sourceAdaptiveCount += 1;
        return;
      }
      if (ratio === "2:3") fixedPortraitCount += 1;
      else fixedLandscapeCount += 1;
      if (ratio === "16:9") fixedWideCropCount += 1;
    });
    const summary = Object.freeze({
      totalSlots: profile.maximumUsefulPhotoCount,
      fixedLandscapeCount,
      fixedPortraitCount,
      sourceAdaptiveCount,
      fixedWideCropCount,
    });
    const plannedSlots = summary.fixedLandscapeCount
      + summary.fixedPortraitCount
      + summary.sourceAdaptiveCount
      + profile.squareDemand.recommended;
    if (plannedSlots !== summary.totalSlots) {
      throw new Error(`Material plan for ${profile.templateId} must account for every photo slot.`);
    }
    if (
      summary.fixedLandscapeCount !== profile.landscapeDemand.recommended
      || summary.fixedPortraitCount !== profile.portraitDemand.recommended
      || summary.sourceAdaptiveCount !== profile.sourceAdaptiveDemand.recommended
    ) {
      throw new Error(`Material guidance for ${profile.templateId} must match its slot policy.`);
    }
    return [profile.templateId, summary];
  }),
);

export function getTemplateMaterialProfile(templateId: TemplateId) {
  const profile = profileByTemplateId.get(templateId);
  if (!profile) throw new Error(`Missing material profile for ${templateId}.`);
  return profile;
}

export function getTemplateMaterialPlanSummary(templateId: TemplateId) {
  const summary = planSummaryByTemplateId.get(templateId);
  if (!summary) throw new Error(`Missing material plan summary for ${templateId}.`);
  return summary;
}

export function formatTemplateMaterialDirectionSummary(summary: TemplateMaterialPlanSummary) {
  return [
    summary.fixedLandscapeCount > 0 ? `固定横图 ${summary.fixedLandscapeCount} 张` : null,
    summary.fixedPortraitCount > 0 ? `固定竖图 ${summary.fixedPortraitCount} 张` : null,
    summary.sourceAdaptiveCount > 0 ? `任意方向 ${summary.sourceAdaptiveCount} 张` : null,
  ].filter((part): part is string => Boolean(part)).join(" · ");
}
