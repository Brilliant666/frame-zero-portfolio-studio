# 会话交接

更新：2026-09-29。先读 [AGENTS](../AGENTS.md)、[CURRENT_STATUS](CURRENT_STATUS.md)，
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

本轮保持 PR OPEN + DRAFT；不 Ready／Approve／Merge／auto-merge，不修改 main、日常 3001 或用户 Published，
不远程部署，不声称 V1 上线。资源回收、永久删除、完整原图补档、公网与真实客户交付继续暂缓。
验证按影响相称；小改动不要求每次全项目审计。
