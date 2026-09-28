# 新会话交接指南

更新：2026-09-28。五分钟阅读路径：
[AGENTS](../AGENTS.md) → [CURRENT_STATUS](CURRENT_STATUS.md) → 本文。
然后按本次任务读取相关模块或 Accepted ADR；不要求先读完全部历史。
本轮交接完成后等待用户选择下一项，不自动开始下列建议。

## 项目现在是什么

这是可在本机使用的摄影作品集平台，而不是单一静态模板站：

- 账号经 Better Auth 登录；服务端确认本人 Site 和模板授权（PR28/29）。
- 11 套基础模板复用基础后台；高级拍立得使用独立后台与内容格式（PR30）。
  两边分别保存资料、套餐、联系和配置，版本也独立；共享外观不等于共享业务文档。
- 同 Site 使用本站 Asset 池，受归属校验；不向其他用户开放私人图库（PR31）。
- 高级拍立得保存 PostgreSQL 草稿，显式发布不可变快照，可查看历史和回退公开指针；
  回退不替换当前草稿，公开渲染及图片权限以当前 Published 为准（PR31）。
- 基础六分区、高级四分区、平台/登录/站点入口已做第一轮 UI 整理（PR32）。
  [实现及验证](ADMIN_WORKSPACE_LAYOUT.md)不是完整后台重构完成声明。

PR28–31 已合并；PR32 的最终收口事实看
[PR32 最终评论](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/32)。
实际 Squash、main push CI 和日常切换证据在发生后记录于该处与本机交接，
不要求版本化文档不断追写自己的提交 SHA。

日常入口 `http://127.0.0.1:3001/`，候选端口 3003，隔离测试端口 3004。
本机有专用 PostgreSQL 进程；Docker 不是正常启动前提。
star/phototest 是模拟账号；展示变体已接入不等于完整原图归档，也不等于真实客户认证。
没有公网部署，没有 V1 上线。

## 已确定的产品决定

1. 基础版和各高级模板的后台/业务内容独立演进，只共享本站作品资源、授权、CAS 等支撑能力。
2. `/` 是介绍，`/login` 统一登录，`/:siteSlug/admin` 是鉴权后的站点工作台，不是另一套登录。
   当前没有 `/register` 或 `/account`；未来注册另行设计。登录后自动跳转未实现、未批准。
3. `/test` 是安全模板实验室。`FRAME_ZERO_LOCAL_ACCEPTANCE=1` 下 `/test/admin`
   是本人基础后台快捷入口，不是所有免费用户共用的内容后台。
4. Save 保存草稿；当前编辑预览可含未保存内存数据；私人预览读取已保存草稿；Publish 才改变公开内容。
5. 高级模板使用权不等于平台管理员权限。浏览器提供的 slug、空间、AssetId 都要经服务端授权。
6. 已接受的拍立得、星座/散落/跨页、纸面/夜空和公开动效是保留基线，不借后台工作重做。
7. 原图缺失须明确标记，不能拿展示图伪造完整原图。移出图集只是移除引用，不是删除文件。
8. 合理功能增长可以形成体积告警并说明；不能因微小 bytes 增长扭曲产品。
   安全、完整性、明确硬门禁仍必须通过，不能随手放宽阈值。

## 代码导航

以下路径与测试均相对仓库；测试不是每次启动必跑命令。

| 能力 | 真实实现 | 对应验证 |
| --- | --- | --- |
| 账号、Site、授权入口 | [runtime](../db/accounts/runtime.mjs)、[site-entry](../db/accounts/site-entry.mjs)、[page-auth](../app/site-editor/page-auth.ts) | [local-accounts](../tests/local-accounts.test.mjs) |
| 基础后台 | [basic-editor](../app/site-editor/basic-editor.tsx)、[admin](../app/admin) | [admin-v2](../tests/admin-v2.test.mjs)、[真实编辑器](../tests/site-editor-browser-smoke.mjs) |
| 高级后台 | [premium-editor](../app/site-editor/premium-editor.tsx)、[admin](../app/preview-workspace/admin.tsx) | [preview-admin-state](../tests/preview-admin-state.test.mjs)、真实编辑器测试 |
| 本站共享资源 | [assets-server](../app/site-editor/assets-server.ts)、[assets](../db/accounts/assets.mjs)、[assets-client](../app/site-editor/assets-client.ts) | [资产集成](../tests/site-assets-integration.mjs)、[浏览器素材](../tests/site-assets-browser-smoke.mjs) |
| 独立草稿、schema、CAS | [server](../app/site-editor/server.ts)、[content-schema](../app/site-editor/content-schema.ts) | [schema](../tests/site-editor-schema.test.mjs)、local-accounts 与真实编辑器测试 |
| 发布/历史/回退 | [publication-server](../app/site-editor/publication-server.ts)、[publications](../db/accounts/publications.mjs)、[controls](../app/site-editor/publication-controls.tsx) | [发布集成](../tests/site-publication-integration.mjs) |
| 公开与私人渲染 | [public-server](../app/site-editor/public-server.ts)、[public-site-gate](../db/accounts/public-site-gate.mjs)、[draft-view](../app/site-editor/draft-view.tsx) | 发布集成、local-accounts |
| 启动与边界 | [runner](../scripts/start-local-accounts.mjs)、[config](../scripts/lib/account-config.mjs)、[legacy 边界](../scripts/lib/local-platform-boundary.mjs) | [边界测试](../tests/local-platform-boundary.test.mjs)、[本机验收入口](../tests/local-acceptance.test.mjs) |
| 体积政策 | [Next 预算](../scripts/check-next-build-budget.mjs)、[legacy 预算](../scripts/check-build-budget.mjs) | [Next 预算测试](../tests/next-build-budget.test.mjs)、[legacy 预算测试](../tests/legacy-build-budget.test.mjs) |

`app/admin` 与 `app/preview-workspace` 是既有编辑组件；`app/site-editor` 适配 Site 数据源。
外观组件、授权、资源、错误反馈可共享，`SiteContent` 与 `PreviewPortfolioDocumentV1`
的 schema、写入空间、版本独立，不能因为字段同名强制合并。

旧 SQLite 记录 1/2601、全局 manifest 和私人 `public/photos` 是保留的 legacy/迁移来源，
不是新 Site 的全局 fallback。平台 runner 阻止旧 `/admin`、`/preview`、全局写接口及私有静态源；
旧独立 legacy 进程才提供兼容回退。不能解除这些限制来解决新 Site 编辑问题。
本机验收开关下，未发布站点仅对已登录本人且具有高级授权时私密重定向至草稿预览；
匿名依然未发布，不能用这一捷径声称公开发布完成。
历史导入协议见 [M3_LOCAL_IMPORT](M3_LOCAL_IMPORT.md)，不能把它当正常启动脚本。

## 已知问题与最多三个候选

证据来自 2026-09-28 只读后台审查和 PR32 当前实现。
完整私有截图在本机 `closure/` 和 `admin-layout/`，不提交照片到 Git。

| 问题、用户影响 | 状态及证据 | 依赖 / 建议优先级 |
| --- | --- | --- |
| 高级图库没有独立入口、搜索/方向筛选/分页/批选，大库逐张操作成本高 | 未实现；`app/preview-workspace/admin.tsx`。PR32 已改成员网格，不等于完整选片工作流；未做 500 张压测 | 本站 Asset API；P1 |
| 基础 Site 资源时间/批次元信息缺失，“最近/最早”排序退化 | 未解决；`app/admin/layout/layout-workspace.tsx` 的 `unmanagedLibraryItem` 与排序逻辑 | 服务端真实元信息或去掉无依据承诺；P1 |
| 分享卡已有引用可读/移除，但不能在 Site 表单新增替换；部分说明仍沿用 legacy 承诺 | 未接线；`app/admin/contact/contact-editor.tsx`、高级 admin Site 分支 | Site 资源选择/上传，各空间独立引用；P1 |
| 内嵌当前编辑预览和私人/公开预览的导航外观仍不同 | 未统一；`app/preview-workspace/portfolio-view.tsx` 的 embedded 分支 | 保持三个数据来源语义，只统一呈现；P2 |
| 基础模板不能发布 | 明确未实现，服务端返回 422；`app/site-editor/publication-server.ts` | 独立范围和验收，不能自动同步高级；P1 能力候选 |
| 资源引用总览、回收、完整原图归档 | 未实现；导入仅保存展示变体，资源删除不能用移出替代 | 备份、引用分析、迁移批准；P2/另立任务 |

已解决并从待办移出：高级分区稳定 hash、套餐/联系拆分、成员网格、状态词区分、
发布历史折叠、Site 保存吸顶、平台/登录/工作台第一轮界面。详见 UI 记录。
其他保留行为：公开首页三封面但只有前两个快捷按钮，并非草稿丢失；公开页本轮未改。

下一轮最多三个建议（等待用户选择）：

1. **本站图库与选片**：高级独立入口/搜索筛选批选、基础真实元信息，优先解决日常照片管理。
2. **联系与预览接线**：分享卡新增替换、三种预览呈现一致，仍保留独立保存语义。
3. **基础模板发布**：补齐基础用户从草稿到公开的完整流程，独立确认范围。

## 工作方式、运行与禁止重复

沿用 Mission 的小切片、真实授权、最多两层待审核依赖、完整验证原则；
**本轮终点优先：新会话只恢复和复述，等待新目标。**
不重做 Auth POC、Docker 治理、模拟账号开户、图库导入或微小预算清零。
不因历史失败记录阻塞已经验证的能力，不继续往已合并分支追加新功能。
CI、本机模拟验证、真实客户验证必须分开描述。

启动前读 [README](../README.md) 的五类运行方式区别。
有本机权限时读 `%LOCALAPPDATA%/PortfolioPlatform/local-m3/SESSION_HANDOFF.local.md`：
那里才有当前进程目录、PostgreSQL、备份、启动/停止/恢复命令与实际功能版本。
不要输出凭据内容。没有本机权限只能核对仓库，明确本机状态未经现场复核。

3001 与候选3003共用非沙盒业务数据；不要用 star/已有 phototest 做写入验收。
写入回归使用隔离 PG fixture 和3004。启动应用不等于迁移、开户、导入或发布。
不要复制 Cookie 或关闭 CSRF/Host 检查跨端口登录；用正常登录产生当前会话。
PID 只是快照，操作前查所有者、路径、端口。Windows 启停和 HTTP 健康检查分步执行。

私人照片/凭据/数据库备份/环境与完整审查报告永不入库，只暂存具体路径。
不得无新授权合并 PR、迁移真实数据、重置账号、发布内容或开放公网。

## 新对话启动词

请接手 Brilliant666/frame-zero-portfolio-studio。先读仓库 AGENTS.md、docs/CURRENT_STATUS.md、docs/SESSION_HANDOFF.md，再按本次目标读取相关代码、North Star 或 ADR，不要求重读旧聊天。先只读核对最新 main、当前分支、未提交修改与运行实例，不擅自切分支或覆盖构建。有本机权限时再读取约定位置的 SESSION_HANDOFF.local.md，核对日常3001、候选3003、数据库、运行版本及恢复命令，勿输出凭据；若只有 GitHub 访问，请明确本机状态未经现场复核。请简短复述已完成能力、未完成项和授权边界，区分基础与高级独立内容、本站共享资源、保存草稿与发布、本机模拟验证与真实客户验证。不重新做 Auth POC、Docker 排障、开户、图库迁移或微小预算压缩；保护私人照片、数据库、草稿和 Published 指针。本轮收口不构成后续合并、真实迁移或部署授权。交接中的三个候选只是建议，请等待我说明本次目标后再实施。
