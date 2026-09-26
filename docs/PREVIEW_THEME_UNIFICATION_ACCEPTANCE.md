# /preview 主题统一验收

## 范围

本轮只统一新版公开作品集主题。原版 `/`、旧版模板 CSS、数据契约及生产访问限制不变。后台嵌入预览保留局部纸面 token，不向后台 html 写入主题。未读取或写入正在编辑的记录 2601，未复制或提交私人图库。

参考：[React Bits 导航栏主题按钮](https://github.com/DavidHDev/react-bits/blob/main/src/components/landingnew/Navbar/Navbar.jsx)。使用独立 SVG 图标与原生 View Transitions，不新增组件依赖。

## 逐项验收

| 要求 | 结果与证据 |
| --- | --- |
| 38px 月亮/太阳按钮、准确 aria-label | 通过：1440 与 390 下均为 38×38；纸面“切换到夜空”，夜空“切换到纸面” |
| 图标旋转缩放 300ms、从按钮中心圆形展开 | 通过：图标 300ms；新主题 View Transition 圆形展开 450ms；无 API 与减少动态效果直接切换 |
| html 标记与刷新防闪屏 | 通过：开发环境 head 内联脚本仅匹配精确 `/preview`；真实点击保存夜空后刷新，额外延迟脚本请求 500ms，500 次 RAF 采样始终为夜空，加载底色为 rgb(6,8,15) |
| 相纸、文字、边线、占位色跟随主题 | 通过：首页封面、图集相纸、大图相框统一 token；夜空纸面 #1c2333，主文字 #e8ecf5，次要文字 #9aa6bd，边线白色 6%，占位 #2a3246，深色阴影 |
| 套餐和联系约拍视觉统一 | 通过：3 张合成套餐验证圆角细边、软阴影、思源宋体 Heavy、强调编号价格、渐变胶囊；联系卡/便签/平台账号/手机操作条使用相同主题变量 |
| 切换时布局不跳动 | 通过：桌面及手机 header、nav、封面、按钮、卡片、大图框的矩形不变 |
| 20 张截图 | 通过：纸面/夜空 × 作品/套餐/联系/图集/大图 × 1440/390；套餐与联系使用非空合成内容 |
| 大面积背景扫描 | 通过：20 个视图均无异常面板；阈值、排除项见下节 |
| 原版 `/` 回归 | 通过：390px 修改前后像素完全一致；1440px 仅 4 个像素通道差 1，属于抗锯齿噪声；原版无主题 html 标记 |

截图与浏览器脚本仅使用隔离匿名合成图片。真实摄影素材的观感仍由人工验收。

## 扫描脚本

`scripts/scan-preview-theme.mjs` 导出 `scanPreviewTheme`，可在已配置隔离请求拦截的 Playwright 页面中执行 `await page.evaluate(scanPreviewTheme)`。只读 DOM，不发请求、不访问存储。

- 大块定义：面积 ≥ 20,000 CSS px²，宽 ≥ 120px，高 ≥ 80px。
- 解析背景色及渐变，alpha ≥ .5 的颜色与主题基底合成，再计算线性 sRGB 相对亮度。
- 夜空报告亮度 > .5；纸面报告亮度 < .06。
- 排除图片、canvas、SVG 像素与低透明度装饰，不把照片颜色当作 UI 错误。
- 有意保留的小面积高对比元素：夜空金色主按钮、太阳/星形图标、编号及价格。胶囊按钮高度不足 80px，不构成大块面板。纸面没有刻意保留的深色大块。
- 这是 CSS 大块异常扫描，不替代逐像素截图与人工视觉检查。

## 证据

本机目录：`$CODEX_HOME/artifacts/preview-theme-unification/`。

- `index.html`：20 图与原版前后截图索引。
- `after-{paper,night}-{work,packages,contact,collection,lightbox}-{1440,390}.png`。
- `baseline-legacy-{1440,390}.png` 与 `after-legacy-{1440,390}.png`。
- `rich.json`：完整合成内容截图、扫描与布局检查。
- `diagnostic.json`：持久夜空刷新、加载底色与实际字体诊断。
- `legacy-pixel-diff.json`：原版截图比较。

## 自动检查

主题 bootstrap/作用域 5 项测试通过；`test:polish` 共 116 项通过；原版页面、后台、API 回归 36 项通过。ESLint、TypeScript、两套生产构建与原预算检查通过，未放宽预算。保留现有 CI 与生产 `/preview` 关闭状态。
