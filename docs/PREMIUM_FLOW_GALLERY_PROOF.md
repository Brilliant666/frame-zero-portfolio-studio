# 新高级模板：流影视廊前台设计验证

更新：2026-09-30。工作名“流影视廊”，拟用产品／空间 ID `premium-flow-gallery`；尚未登记为正式模板。
Base：`06c0a22179726c2e0d9a26e6341e1620d65f4b90`（PR33 已合并）。
分支：`codex/premium-reference-template-v1`。本轮仅前台候选，视觉确认后再接第三内容空间。

## 1. 来源和实际观察

参考：[shaomaimai.icu](https://www.shaomaimai.icu/)。这是第三方网站，用户无源码、后台权限或素材复用授权。
2026-09-30 使用本机 Chrome 实际查看公开首页、`/works`、大图、价格和联系场景，未登录、探测私有接口或提交表单。
未复制网站 HTML/JS、照片、品牌、联系方式、字体或装饰文件。截图仅作本机比对证据，不提交仓库。

### 实际观察到

| 页面／状态 | 桌面 1440×900 | 手机 390×844 |
| --- | --- | --- |
| `/` → `/#works` | 全屏照片背景；居中浮动深绿导航（790×62，top16）；左侧大标题、小荧光按钮和说明；右侧双轨约2:1 | 导航top10、高55；标题约42px、按钮同排；双轨依然2:1，x20、top210 |
| 首页照片 | 两个分类；照片原比例；左右轨缓慢反向流动；窗口上下渐隐；可直接打开大图 | 同样双轨，窄轨显示特写；首页提示向左划切价格 |
| 展开完整例图 `/works` | 背景保留；返回箭头和标题；宽分类标题条；三列，横图一行、竖图跨两行 | 两列，约165px宽、9px间隔；竖图约248px、横图119px；普通纵向滚动 |
| 大图 | 暗色模糊背景，竖图约960px宽，可上下滚动看完整照片；关闭按钮、Escape返回 | 照片约330px宽；关闭按钮；原图比例 |
| `/#pricing` | 深绿半透明大面板，标题、较长介绍、三张服务卡 | 单列内容可纵向滚动 |
| `/#contact` | 左侧标题及下方2×2联系卡，背景照片仍占整屏 | 联系导航存在；本轮未展开外部联系或二维码动作 |
| 导航/手势 | 点击导航更新hash；首页滚轮向下进入价格；返回入口回首页 | CDP触摸模拟左划进入价格；不是实体手机验收 |

动效截图会受到观察时刻影响。两次公开DOM采样相隔29.94秒，双轨分别移动约26.53px；后台节流可能影响速率，不能当成原站精确设计参数。
点击后的短暂状态中观察到新旧场景重叠，稳定后旧场景消失。没有录制视频，只有顺序截图。

### 前端信息推断及未确认

- 公开DOM显示重复照片组和 translateY，推断通过复制轨道实现循环；未读取整站源码证明具体算法。
- 窗口 computed mask 为顶部7%、底部92%渐隐；背景为cover图片。本次未观察到实际播放的视频，不能声明视频背景已还原。
- 精确转场曲线、长时间循环接缝、原站完整触屏兼容性、外部联系跳转结果未确认。
- 未发现独立单作品详情文章页；本轮核心链是首页 → 完整画廊 → 大图 → 返回。

## 2. 候选范围与可见差异

真实 React 组件位于 `app/premium-gallery-proof`，不复用拍立得布局、固定槽位或模板引擎。
只读 `GalleryDocument` prop 注入内容，图片和摄影文字不写死在组件中。

忠实保留：全屏照片背景、悬浮导航、左文右双轨、两列约2:1、分组完整画廊、竖图跨行、大图原比例、三场景浏览。

平台化替换：原创“流影”测试品牌；独立文字、分类和服务；匿名测试影像。使用系统 KaiTi/STKaiti/serif，不取原站字体文件；不同系统字体外观会有差异。

必要适配：

- 候选在独立hash `#gallery` 展开完整画廊，不占用正式 `/:siteSlug` 或顶层 `/works`。
- 加入暂停动效、减少动态效果、键盘回焦及可滚动静态轨，避免动画遮住键盘焦点。
- 当前不模拟原站自定义光标、鼠标轨迹或未证实的视频效果。
- 原站场景转场的精确时间尚未确认；候选独立实现短淡入，不能称为像素级相同。
- 候选双轨按实际内容高度保持约3px/s、入场停留1.5秒；参考后台采样约0.886px/s。另一次实际悬停观察确认原站照片 transform 为 scale(1.2)，伴随荧光边框、亮度/饱和度和阴影变化；候选目前仅轻微放大，放大幅度尚未对齐，列为视觉验收待确认项。
- 联系卡只演示可替换字段；示例没有原站账号、二维码和提交地址。

本机三张 imagegen 原创影像分别是温室环境、浅色棚拍竖向肖像、方形人物特写，重复为17个照片条目，用来验证比例与长度。它们不是原站Cosplay合成作品；重复素材的丰富度、人物、亮度与色彩差异会影响气质。不能据此宣称视觉已被用户接受，也不能用素材不同解释导航位置或比例错误。
公共仓库不包含这些PNG。无本机素材根时只提供原创几何SVG测试图，几何图只证明布局行为。

## 3. 内容结构和专属后台草案

拟定独立 `FlowGalleryDocumentV1`，不修改冻结 SiteDocumentV1：

| 字段 | 职责与专属编辑界面 |
| --- | --- |
| schemaVersion / profile.brand / title / intro | 新模板身份与首页文字；不从基础或拍立得自动同步 |
| background.assetId / focalPoint | 从本站图库选背景；明确背景裁切焦点 |
| groups[]: id, name, photoIds[], 首页轨道选择 | 图集列表、新建命名、图库选片、顺序；首页两轨分别指定分类，完整页展示全部分类 |
| 图片说明及必要的展示裁切 | 本空间引用层配置；不修改本站原素材 |
| pricing?: heading, introduction, packages[] | 本模板价格面板；摘要和逐卡编辑，空栏目可省略 |
| contact?: heading, intro, items[] | 本模板联系卡；文字/网址与可选二维码，不强制上传 |

当前proof使用解析后的 `GalleryPhoto{id,url,width,height,alt}`，不是未来持久化格式；正式草稿保存Site资产ID，授权后解析URL。
后台草案：作品分类 → 背景与首页 → 价格与活动 → 联系方式。每区提供同位置即时预览；保留仅保存草稿、保存并发布、私人预览及发布状态。
图集与轨道的排序均由用户显式决定，不为照片变化自动重新分组。

## 4. 第三个空间正式接入清单（本轮不实施）

| 位置 | 最小明确扩展 |
| --- | --- |
| `app/site-editor/content-schema.ts` | 新space、版本化document、严格parser、资产引用提取；三种schema互斥 |
| `app/site-editor/server.ts` authorizeEditor / handleDraftRequest | 高级空间逐product校验grant；新空间独立空草稿及CAS |
| `db/accounts/site-entry.mjs`、page-auth.ts | 新授权卡片和专属后台路由，不复用拍立得后台壳 |
| 新专属editor + `draft-save.ts` | 复用底层保存回执；保留独立业务字段 |
| `draft-view.tsx`、admin/preview/[space] | 显式三空间私人渲染，不能继续basic/else二分 |
| `publication-projection.ts` | 新模板专属可见投影及资源白名单 |
| `db/accounts/publications.mjs` changePublication / summary | 新产品事务内grant、准确模板摘要；唯一Site Published指针不变 |
| publicationHistory / `publication-server.ts` | 用已授权space集合替代allowPremium布尔，避免拍立得授权查看新模板历史 |
| `publication-controls.tsx` | 名称、合法space和回退地址显式支持第三空间 |
| `app/[siteSlug]/page.node.tsx` | 明确renderer分派；未知space失败关闭，不默认为拍立得 |
| `public-server.ts` | 继续仅按Published快照和其资产白名单读取；不得读取新模板草稿 |
| `db/accounts/schema.mjs` 与追加迁移 | 扩展 known_template_product / known_content_space / publication_known_space；不改已应用迁移、旧快照、不可变触发器 |

正式验收需覆盖：逐产品授权、跨Site拒绝、三个草稿互不改写、撤权/CAS/资源失效、发布同地址切换和历史回退、旧Published仍可读。旧开户、导入和账号流程不因新模板重做。

## 5. 本机候选与验证

候选入口：`http://127.0.0.1:3005/preview/flow-gallery`。
使用已有loopback preview runner及随机proof，不连接数据库，不读取star素材，不设置正式产品授权。
需要独立local-preview构建、`FRAME_ZERO_FLOW_GALLERY_PROOF=1`和通过原preview gate；正常生产入口保持404。
素材目录由本机 `FRAME_ZERO_FLOW_GALLERY_ASSET_ROOT` 指定，仅固定三个文件名可读。凭据、绝对路径、图片与截图不写入仓库。

替换容错入口：`?fixture=long`（长标题、37张分类及空可选联系）、`?fixture=empty`（无图集、无可选栏目）。
构建版本、截图索引、运行PID与恢复命令保存在本机交接。候选 BUILD_ID：`0yVtK0M7jJXtCQkNvVmjN`。

本机验证：

- 20项相关测试通过（新入口/素材gate、现有local preview、preview composition）；ESLint、TypeScript、普通Next与local-preview构建通过。
- 正常生产构建即使设置proof开关，页面与素材端点仍分别404；候选3005两者200。未放宽原loopback proof、Host或origin检查。
- 1440×900与390×844：首页、完整画廊、灯箱截图；导航、Escape、Tab焦点、灯箱关闭回焦、图库浏览器返回恢复（844px→844px）通过。
- 减少动态模式两个轨道animation为none，屏外照片键盘聚焦后进入可视区域；窗口无横向溢出。
- 手机长标题原本覆盖轨道，修复后标题bottom305.56、分组top353.56；37张分类可展开，空图集/空可选栏目有明确回退。
- 原站通过Chrome观察，候选通过应用内浏览器验收。Chrome对本机候选报ERR_BLOCKED_BY_CLIENT，未更改任何安全或代理设置；应用内浏览器不支持Input.dispatchTouchEvent，所以候选触屏横划仍需实体手机人工确认。手机视口检查不等于真实手机验证。
- 新组件独立产物：JS 10,409字节、CSS 20,533字节（raw，不是传输或运行成本）。新依赖0；不进入旧模板入口。既有跨路由CSS318,209字节触发原307,200参考告警，硬门禁通过；未抬高限制或为微小预算删除功能。

完整同视口原站/候选对照在本机 `premium-reference-proof/comparison.html`，包含桌面首页/画廊/灯箱与手机首页/画廊/灯箱。截图不是录屏。

## 停止点

`FORMAL_PLATFORM_INTEGRATION = PLANNED_NOT_IMPLEMENTED`；`HUMAN_VISUAL_APPROVAL = PENDING`。
`REFERENCE_INSPECTION = COMPLETE`（上述未确认项保留）；`NEW_PREMIUM_DESIGN_PROOF = READY`（供视觉验收，非正式可发布产品）。
原十一模板、高级拍立得、3001/3003/3004、star草稿和Published均不修改。
新PR保持Draft，不Ready、不合并、不自动发布。用户确认前台方向后，下一切片才接专属后台、保存和发布。

