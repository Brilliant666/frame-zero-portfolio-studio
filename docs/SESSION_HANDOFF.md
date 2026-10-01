# 会话交接

## 最新切片：PR34 基础模板配色统一（2026-10-01）

用户授权收束历史反色业务卡片，按8浅／3深统一默认界面。见[基础配色切片](PR34_BASIC_PALETTE.md)。照片、构图、槽位、保存发布与高级独立内容保持；拍立得共享样式限定基础入口，大图外观独立于信息显示语义。当前切片在独立PR34实施，不自动更新3001；其原e038569运行和恢复见本机私有交接。

## 最新切片：PR34 四项审查修复（2026-10-01）

先读 [CURRENT_STATUS](CURRENT_STATUS.md) 与 [四项修复记录](PR34_RESPONSIVE_CACHE_SECURITY.md)。当前在独立Draft PR34实现响应式展示变体、先授权后304的公开图片缓存、停用旧全局PUT、Published品牌与白名单分享图，以及真实高级路由冷暖计量。原Site保存发布、独立内容空间、照片布局与轨道交互保持。旧全局/admin不再写D1，当前/:siteSlug/admin仍正常保存草稿和发布。

已有相关本机测试与普通/legacy构建；HTTP和8场景匿名浏览器由现有PR CI执行，结果必须核对最新Head。新增性能context无route拦截，storageState只在内存，不写会话或私人数据。本轮没有日常3001切换授权，不启动/替换日常服务，不执行真实迁移，不改草稿、Published或私人照片。PR继续Draft，不Ready不合并。

## 最新切片：PR34 轨道内滚轮浏览（2026-09-30）

当前用户授权实现照片zoom-in光标、单轨滚轮浏览和离开后连续流动。只改前台交互，不改内容或发布；相关实现与观察见[流影视廊第10节](PREMIUM_FLOW_GALLERY_PROOF.md#10-轨道内滚轮浏览)。浏览器扩展既有6场景，覆盖左右轨上下滚动、循环相位、离开后续播、暂停列表及边界、轨道外切栏目，继续原大图／焦点回归。3001保持aadbeb5，更新日常需要对应授权，PR仍Draft不合并。

## 最新切片：PR34 首页立即流动（2026-09-30）

用户明确取消1.5秒固定等待；轨道首帧开始流动，速度与暂停交互保持。本轮仍为当前PR前台优化后更新3001；测试只用隔离匿名站点，不改日常草稿或Published，无迁移。已有转场700ms回归新增前250ms启动检查，不重做历史审计。运行与恢复以本机私有交接为准，PR继续Draft，不合并。

## 最新切片：PR34 大图适应屏幕（2026-09-30）

用户明确授权修改后更新3001。只调整流影视廊灯箱默认整图适应屏幕、两倍放大及恢复、双按钮焦点循环；首页横竖同宽混排保持。无schema变更或迁移，不保存／发布用户内容。先读[CURRENT_STATUS](CURRENT_STATUS.md)与[流影视廊第9节](PREMIUM_FLOW_GALLERY_PROOF.md#9-大图适应屏幕)，实际版本、构建和恢复命令以本机私有交接为准。PR仍Draft，不合并；下方“不自动切日常”的历史记录不覆盖本轮明确授权。

## 最新切片：PR34 首页作品速览比例（2026-09-30）

当前授权是在当前Draft PR新增轨道比例；读 [CURRENT_STATUS](CURRENT_STATUS.md) 与 [流影视廊记录第8节](PREMIUM_FLOW_GALLERY_PROOF.md#8-首页作品速览宽度比例)。上轮3001已切至PR34 `e8c9efe`，现有star草稿和Published保留；本轮不自动替换日常版本。旧文档保持2∶1，新增可选比例随本空间保存与发布，无数据库迁移或跨空间同步。
下方3004/3005运行记录为历史；本机实际运行与恢复材料仍以私有交接为准。

## 最新切片：PR34 首屏稳定与专属后台（2026-09-30）

先读 [CURRENT_STATUS](CURRENT_STATUS.md) 与 [流影视廊记录](PREMIUM_FLOW_GALLERY_PROOF.md) 第 7 节。第三空间接入完成后，用户授权继续首屏偏移修复、专属后台组织，并明确确认更新 3004、3005。各模块当前内存效果、关闭回焦、长画廊灯箱和桌面／手机视口是本次回归范围；不重复历史全项目审计。
使用新建隔离数据库与匿名素材验收，原数据库、star 草稿和 Published 保留。3005 为前台 proof；日常 3001 与候选 3003 未更新。PR 保持 Draft，不合并、不 Ready、不真实迁移或部署。
以下 PR33 收口与端口记录为历史，现场运行版本、测试入口及恢复命令见本机私有交接。

---

更新：2026-09-29。当前收口：[图库、图集与本机交付总结](PR33_LOCAL_UX_CLOSEOUT.md)。3001 已按用户本轮授权更新到 `2a03913`，原数据和 Published 保持；本机测试凭据已按要求调整，详情只在私有交接中。
先读 [AGENTS](../AGENTS.md)、[CURRENT_STATUS](CURRENT_STATUS.md)，
当前交互以 [图集整卡拖动](PR33_CARD_DRAG.md) 为准，旧批量精确排序界面已按用户要求简化。
当前新增 [图库到图集的创建流程](PR33_ALBUM_CREATION_FLOW.md)：图库优先，图集新建先命名再自动选片，保留原保存与发布逻辑。
本次进展见 [本站图库、图集库与精确排序](PR33_LIBRARY_WORKSPACE.md)。
最新切片见 [图集直接排序与即时效果](PR33_COLLECTION_ORDER.md)。
再读 [PR33 后台体验当前记录](PR33_ADMIN_UX.md)，前次功能基线见 [收口记录](PR33_FUNCTIONAL_CLOSURE.md)。按任务需要读取 North Star、路线图和相关 Accepted ADR；
不要求重读旧聊天、历史审计或 Docker 恢复。

## 本轮产品决定

- 11 套基础模板共享一个基础内容空间和通用后台；高级拍立得独立后台、内容和版本。
- 同 Site 共享素材，其他 Site 的私人资源不可访问。基础与高级资料、套餐、联系方式不自动同步。
- `/` 为平台介绍，`/login` 为统一登录，`/:siteSlug/admin` 为本站后台，`/:siteSlug` 为唯一公开作品入口。
- 普通保存、Ctrl/Cmd+S 只保存草稿；“保存并发布”捕获本次编辑与原公开指针，保存成功后发布准确回执版本。
- 切后台、选模板、选片、加入内存图集、保存，都不自行改变公开页；只有显式发布或回退更新单 Site 指针。
- 基础公开模板取自该 Published 快照的 activeTemplate。切换不删除另一空间的草稿或历史。
- 文字账号与网址独立可用，联系卡为可选图片。上传仅入库、选用仅修改当前草稿；移除引用不删除资源。
- 三种预览来源保留：当前内存编辑、仅本人可见的已保存草稿、访客可见的 Published。
- 高级三构图、主题、动效及基础模板特色保留。不无人值守重做审美。

## 当前范围与证据

PR33 从高级选片扩展为发布闭环与后台完善。用户授权在同一分支持续推进、普通提交和推送；
“提交完成”“CI 绿”不是中途停止点。具体实现、测试结果、待验收项和恢复第一步只维护在
[收口记录](PR33_FUNCTIONAL_CLOSURE.md)，不要重新叠加历史恢复指令。

原高级批量选片包含筛选、48 张分页、跨页暂选、查看全部暂选、按选择顺序追加、去重、500 上限、
完整请求体上限及 CAS 保留草稿。保存并发布不得偷偷纳入尚未确认的暂选。
createdAt 仅代表加入本站时间；10000 条截断仍只支持已载入部分的筛选、排序与分页。

## 实现导航

| 范围 | 入口 |
| --- | --- |
| Site 账号与授权 | `db/accounts/runtime.mjs`、`site-entry.mjs`、`app/site-editor/page-auth.ts` |
| 草稿独立 schema 与 CAS | `app/site-editor/server.ts`、`content-schema.ts`、`draft-save.ts` |
| 发布投影、权限、单指针与回退 | `app/site-editor/publication-projection.ts`、`publication-server.ts`、`db/accounts/publications.mjs` |
| 组合主操作 | `app/site-editor/publication-controls.tsx`、`publication-state.ts`、两套既有保存函数 |
| 公开及私人渲染 | `app/site-editor/public-server.ts`、`basic-view.tsx`、`premium-view.tsx`、`draft-view.tsx` |
| 可选联系卡／元信息 | `app/site-editor/contact-card.tsx`、`contact-card-state.ts`、`asset-metadata.ts` |
| 高级选片 | `app/preview-workspace/site-photo-picker.tsx`、`photo-picker-state.ts` |
| 隔离 PG／浏览器 | `tests/local-accounts.test.mjs`、`basic-publication-*-integration.mjs`、`site-publication-browser-smoke.mjs`、`site-template-browser-matrix.mjs` |

保存时保留完整基础草稿，发布时仅投影当前实际槽位、有效公共资料与资源引用。
显式空布局不 fallback；旧缺少布局按既有受校验兼容规则处理。公开照片仅当前 Published 白名单内的展示变体，
不为旧页面延迟请求开放全部历史照片。公开页面与 metadata 共用同次读取的不可变快照。

旧 SQLite 记录 1/2601、全局 manifest 和私人 `public/photos` 只作 legacy／已批准导入来源，
不能作为新 Site 的 fallback。完整原图补档未完成，不用展示变体冒充原图归档。

## 本机与恢复边界

- PR33 独立开发工作区与日常 3001 目录不同；不在运行目录切分支或覆盖构建。
- 私有运维入口：`%LOCALAPPDATA%/PortfolioPlatform/local-m3/SESSION_HANDOFF.local.md`。
  本机命令、环境位置、备份与运行版本以该文件和现场证据为准；不输出凭据。
- 3001 为日常，前次授权已更新 ea76e48；本次 3003 候选连接独立 PG55435，仅此隔离环境用于写回归。3004 原验收环境受保护。
  star、phototest 是用户维护的本机模拟内容，不是可任意改写的测试 fixture，也不是实际客户验证。
- 新迁移 `0004_basic_publications.sql` 只放宽发布空间约束，保留旧高级历史和不可变保护。
  前次已获授权、备份后迁移日常库，现状见本机交接；本轮没有迁移。后续切换与迁移仍须另行授权，先备份后显式迁移，
  不能靠启动候选偷偷迁移业务库，也不能回退数据库快照覆盖用户后续编辑。
- Windows 服务操作分开执行：只读核对 → 停止 → 确认退出 → 启动 → 独立健康检查。
  只在确需切换时重启；不放宽 origin、Host、Cookie、CSRF 来跨端口登录。
- 历史 site-content-integration 的未提交 admin.tsx 保留；私人 photos、凭据、环境、数据库、备份不入 Git。
  只暂存具体路径。主 checkout 中的用户未提交修改不能覆盖。

本轮保持 PR OPEN + DRAFT；不 Ready／Approve／Merge／auto-merge，不修改 main 或用户 Published；本轮明确授权的 3001 更新已完成，后续切换仍需授权，
不远程部署，不声称 V1 上线。资源回收、永久删除、完整原图补档、公网与真实客户交付继续暂缓。
验证按影响相称；小改动不要求每次全项目审计。
