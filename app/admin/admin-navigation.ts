export const ADMIN_SECTIONS = [
  {
    id: "template",
    href: "/admin/template",
    label: "页面模板",
    description: "选择主页视觉与照片槽位方案",
  },
  {
    id: "profile",
    href: "/admin/profile",
    label: "基本资料",
    description: "维护摄影师资料与首页文案",
  },
  {
    id: "packages",
    href: "/admin/packages",
    label: "套餐价格",
    description: "编辑服务、价格与交付内容",
  },
  {
    id: "layout",
    href: "/admin/layout",
    label: "素材排版",
    description: "为当前模板安排照片槽位",
  },
  {
    id: "contact",
    href: "/admin/contact",
    label: "联系约拍",
    description: "设置联系方式与约拍清单",
  },
  {
    id: "advanced",
    href: "/admin/advanced",
    label: "高级设置",
    description: "管理兼容数据与危险操作",
  },
] as const;

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]["id"];

export function getAdminSection(pathname: string) {
  return ADMIN_SECTIONS.find((section) => pathname === section.href) ?? ADMIN_SECTIONS[0];
}
