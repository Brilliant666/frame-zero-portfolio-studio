# PR35：两项确认显示缺陷修复

日期：2026-10-13。基线：`43320e993d2bdee13ea1af4f118826d0e3b3ff83`。仅实施 [Designeer 评审](DESIGNEER_INFORMED_PLATFORM_REVIEW.md) 的 F1、F2。

## F1：Prism 手机空槽撑宽

现场原问题标题为“光影之间的故事”。390×844 时有效宽度375px，hero 内可用343px，九个空槽各42.39px、间距4.8px，使单列自动最小宽度达到419.89px；标题容器右边435.89px，介绍右边432px。祖先裁切导致 document.scrollWidth 看似正常。

改动仅在 Prism 手机 CSS：单列使用允许收缩的网格约束，三个网格子项允许收缩；照片按钮与空槽同为32px；≤380px 时仅选择组改为五列两行。保留九槽、字体、斜体、色彩、主照片比例和浏览逻辑。

| 视口 | 修改前：空 / 少 / 混 / 满 | 修改后：四种组合 | 修改后 hero 内容宽 |
| --- | --- | --- | --- |
| 320×844 | 4组均越界 | 4组均通过 | 273px |
| 390×844 | 空、少、混越界；满通过 | 4组均通过 | 343px |
| 1440×900 | 4组均通过 | 4组均通过，桌面几何不变 | 437.78px（左文案列） |

测量包括九槽数量、按钮数量、网格/子项宽度、标题与介绍的 Range 边界、图片加载及自然尺寸。配合截图检查字形完整、两行色轨及主照片可见区域，并非只检查页面总宽。320px 混合槽现场完成第9槽选择、下一张循环、上一张、真实灯箱打开/关闭；空槽保持非可点击语义。

## F2：拍立得预览主题所有权

3001 只读复现及 CDP matched rules 确认：后台 `.workspace[data-site-editor="premium"] button` 覆盖主题字色，普通 `.workspace button` 提供白底/边框，后台 focus-visible 又覆盖夜空焦点色。不是所有公开夜空按钮都坏了。

在 `CollectionLivePreview` 根声明局部预览边界，通用后台控件、链接、焦点及标题规则排除该子树；补全该预览工具按钮自己的尺寸、边框、主题、悬停、禁用与焦点。后台保存、筛选、关闭控件保留原规则；全屏 Portfolio 已通过 portal 位于后台 workspace 外，无需迁移。没有全局改白或新增 `!important`。

| 实测主题开关 | 前景 | 有效背景 / 状态 | 对比度 |
| --- | --- | --- | --- |
| 修复前夜空正常/悬停/焦点 | #233047 | rgba(23,33,57,.88) 覆盖 #1c2333 | 1.20:1 |
| 修复后夜空正常/焦点 | #e8ecf5 | 同上 | 13.49:1 |
| 修复后夜空悬停 | #e8ecf5 | rgba(28,35,51,.96) 覆盖 #1c2333 | 13.27:1 |
| 修复后纸面 | #1c2433 | rgba(255,255,255,.66) 覆盖白底 | 15.56:1 |

夜空焦点由后台蓝色恢复为 #f1c86a；选中轮廓与键盘焦点可区分。上述比值按实际 computed color 与不透明预览底色之上的 alpha 合成计算，只针对这些实测控件，不宣称整个照片背景页面满足全部对比度要求。

浏览器覆盖：1440×900 下修改前/后、后台内嵌/脱离后台组件、纸面/夜空、三构图；390×844 补局部手机构图。真实 `PreviewPortfolioExperience` 的全屏嵌入与独立场景分别检查两主题、三构图实际选中状态、关闭、返回及真实灯箱。构图点击存在转场，最终以实际 aria-pressed 确认，不将已发出点击冒称切换成功。后台主按钮、禁用按钮及筛选对照仍使用后台样式。

## 验证与复现

- 52项相关测试通过：photo-layout、preview-theme、composer-view/layout、polaroid-preview-focus。
- lint 与 TypeScript 检查通过。lint 有已有 jsx-eslint TSNonNullExpression 解析提示，无失败。
- 在清理后保留、未运行的候选位置完成标准 Next 生产构建。初次 shell 命中了 Node18，版本检查即退出；显式使用现有 Node24 重跑成功，没有安装或重建依赖。
- 浏览器使用实际 React 组件、生产 CSS、匿名 SVG 和真实灯箱。无业务 API、账号创建或数据库写入。
- `tests/display-fixes-fixture.mjs` 可在仓库外指定小型证据目录构建基线/current 两份静态 fixture；可见测量按钮显示真实 DOM 布局/颜色 PASS 或 FAIL。before 从 Git 读取基线，不覆盖工作区。构建/服务示例见脚本头注释。
- 第一次 fixture 的 CSS 导入顺序及匿名照片辅助路径与生产不符，F2 初版证据不作为验收。修正工具后，r2 复现同生产的1.20:1，再验证修复。完整前后数据、关键截图及首次无效尝试留在本机证据目录，不提交原始DOM/私人截图。
- 本轮未在带真实业务数据的候选应用里执行保存/发布；生产构建通过与匿名真实组件浏览器验证是两类证据。未做真机 Safari、触屏硬件或全平台重新审查。
- 十套基础模板此前的空库观察不等于完成其非空摄影作品全链验收；本轮仅额外验证 Prism 的匿名组合。

## 边界与状态

`F1_PRISM_MOBILE_LAYOUT = FIXED_AND_VERIFIED`

`F2_POLAROID_PREVIEW_THEME = FIXED_AND_VERIFIED`

`OTHER_DESIGN_PROPOSALS = NOT_IMPLEMENTED`

`DAILY_3001 = UNCHANGED`

`BUSINESS_DATA_AND_PUBLISHED = UNCHANGED`

PR35 保持 OPEN + DRAFT。原有未提交的 AGENTS / SESSION_HANDOFF 保留规则原样保留，不混入本次提交。最终 Head 与既有 CI 结果以本次 PR 更新记录为准；无合并、日常切换或后续切片授权。
