# Phase 0 实施基线

本页把 [`NORTH_STAR.md`](../NORTH_STAR.md) 的长期边界转换为可执行、可审查的
Phase 0 工作顺序。Phase 0 的目标是保护现有私人摄影主页，在不新增模板、不删除
D1 或本地照片兼容能力的前提下，建立版本化内容、稳定标识、owner 授权、可回滚发布
和真实服务端渲染的基础。

## 当前架构摘要

- 首页是客户端入口，先渲染 `siteConfig`，再从 `/api/site-content` 读取 D1 内容。
- D1 只保存固定 `id = 1` 的全局 JSON，GET 失败时回退到演示配置。
- 本地回环地址可直接写入；远端写入依赖 ChatGPT Sites 注入的用户头。
- 11 套模板共享 `SiteContent`，模板独立懒加载，并保留各自固定照片槽位。
- 本地导入器已提供去重、EXIF 方向处理、元数据移除、WebP 变体和损坏文件隔离；其
  SHA-256 manifest ID 仍是待迁移的 legacy fingerprint。
- GitHub 已执行公开仓库安全扫描，以及 lint、测试、生产构建和体积预算门禁。

## Phase 0 差距

| 能力 | 当前状态 | Phase 0 验收状态 |
| --- | --- | --- |
| 项目治理 | PR 模板、ADR 模板和 Phase 0 跟踪页已建立 | 已完成 |
| CI | 公开安全与完整质量工作流均已在 `main` 运行通过 | 已完成 |
| 内容模型 | 独立 `SiteDocumentV1` 契约、严格验证与纯 legacy adapter 已建立；运行时仍使用无版本 `SiteContent` | 进行中 |
| 稳定标识 | UUID v4、pending 恢复和 site-scoped fingerprint 映射规划契约已建立；尚未持久化或接线 | 进行中 |
| 数据访问 | API 直接读写 D1，没有 repository 边界 | 待实施 |
| 授权 | 本地放行，远端只判断是否存在认证用户 | 待实施 |
| 修订与发布 | 保存立即成为公开内容，没有草稿、发布指针或回滚 | 待实施 |
| SSR | 首页在浏览器加载真实内容，首屏和 SEO 使用演示数据 | 待实施 |
| 模板契约 | 已共享 props，但尚未完全隔离存储与资源解析 | 待实施 |
| 回归覆盖 | 已具备导入、排版、API 行为和源码特征测试，仍缺 11 模板烟测 | 待实施 |

## 依赖顺序

```text
治理与 CI
  -> 现有行为特征测试
  -> SiteDocumentV1 纯内容契约
  -> 稳定 ID 迁移设计与测试
  -> 旧 SiteContent 兼容适配器
  -> repository 接口与兼容迁移
  -> owner 授权
  -> revision / publish / rollback
  -> 真实内容 SSR
  -> 模板纯渲染契约与 11 模板烟测
```

任何数据库变更必须和迁移、兼容读取、失败恢复及回滚方式一起审查。owner 授权必须在
写入新模型之前建立；真实 SSR 必须在公开读取只指向已发布 revision 后切换。

## Epic 与 PR 拆分

### Epic 00：治理和持续集成

- **PR-00A：治理基线（已完成）** — PR 模板、ADR 模板、Phase 0 跟踪页。
- **PR-00B：完整 CI（已完成）** — 在公开安全扫描之外执行 lint、测试、构建和体积预算。
- **PR-00C：行为特征测试（已完成）** — 锁定当前 GET、PUT、本地写入、远端拒绝和失败回退行为。

### Epic 01：版本化内容与稳定标识

- **决策门：ADR-0002（Accepted）** — 明确 Site 租户边界、SiteDocumentV1 的可移植内容边界
  和单站点迁移约束。
- **PR-01A：SiteDocumentV1 纯内容契约（已完成）** — 定义 `schemaVersion: 1`、冻结的
  11 个 V1 模板身份和只通过 `assetId` 表达的构图引用规则；文档不包含 `siteId`、
  所有权、存储路径或固定 URL，不是自包含素材包，也不实现跨 Site 导入；主题覆盖等待
  独立版本决策；保持现有页面、API 与持久化行为不变。
- **PR-01B：稳定 ID 迁移设计与测试（已完成）** — 定义
  `migrationKey = legacy:site_settings:1`、服务端 UUID v4 Site/Asset ID、首次
  `persist-pending`、pending 重跑复用、completed no-op、同 Site fingerprint 映射、跨
  Site 新 Asset ID、冻结 V1 模板身份的运行时校验和 unresolved 报告；没有 unresolved
  时规划 `ready-to-complete` 与 completed `nextCheckpoint`，存在 unresolved 时以
  `blocked-by-unresolved` 保持 pending，冲突不产生完成 checkpoint。这里只完成未接线的
  纯规划协议与行为测试，不写入或覆盖原数据。public Asset ID、公开 URL 和对象存储 key
  等待 ADR-0008。
- **PR-01C：兼容适配器（本 PR）** — 接收未经 `normalizeSiteContent()` 掩盖的 raw
  `unknown` legacy JSON，严格验证根内容，并将 11 个冻结模板一对一映射为
  `templateVersion: 1` 的 V1 compositions。每个模板的 raw `templateWorks` 自有 key 使用
  explicit 布局（显式 `[]` 保留为空 composition），key 缺失则使用调用方预计算的全局
  `works` fallback；不只转换 active template。

PR-01C 的调用方必须传入覆盖全部 11 个模板的单 Site、slot-aware、深只读素材解析快照。
快照显式记录 `siteId`、模板身份和版本、`explicit | fallback` mode、legacy 来源位置、
`slotIndex`，以及 resolved UUID v4 `assetId` 或 unresolved reason。adapter 不调用
`buildPhotoSlots()`，不读取 D1、文件、manifest、私有 importer state 或网络，不分配 UUID，
也不从路径、URL、文件名、`work.code`、SHA-256 或旧 `assetId` 推导身份。

adapter 结果固定为三态：`ready.document` 是唯一可由未来执行器持久化的结果；
`blocked-by-unresolved.documentPreview` 仅供审计或预览，未解析槽位从 composition 省略且
不得推进 completed；`invalid.document` 为 `null`。ready document 与 blocked preview 均须
通过 `parseSiteDocumentV1()`，resolved ID 还须单独通过 UUID v4 门禁。errors、unresolved
和聚合 warnings 使用稳定 code 并确定性排序；unsupported `theme`、丢弃的 `work.code` 和
`fullWidth` 不得静默消失。当前 legacy API、页面、后台和 D1 行为保持不变；repository、
双读、数据库迁移、checkpoint/原子持久化、运行时接线和 importer 修改不属于 PR-01C。

`siteId` 只属于 Site、带租户范围的持久化信封及授权上下文；PR-01B 的规划结果要求后续
迁移器先持久化 pending checkpoint，再继续资产映射；最终必须在同一个原子事务中提交
`newMappings` 和 completed checkpoint，unresolved 未处理完前不得标记 completed。
PR-01B 只描述该规划要求，真实原子数据库持久化、双读和回滚仍由后续独立 migration PR
完成；completed 重跑继续稳定返回 no-op。

### Epic 02：持久化边界

- **PR-02A：repository 契约** — 从 API 路由中分离站点、revision 和资源访问，不移动
  无关目录。
- **PR-02B：新增表与迁移器** — 新增 `sites`、`site_revisions`、`assets`、
  `asset_variants`；保留 `site_settings`。
- **PR-02C：双读与迁移报告** — 优先读取已发布 revision，否则回退旧记录；提供 dry-run
  和恢复步骤。

### Epic 03：owner 授权

- **PR-03A：AuthProvider 边界 ADR 与接口** — 明确 ChatGPT Sites 只是适配器，不把认证头
  写入领域模型。
- **PR-03B：站点 owner 授权** — 所有写入同时校验用户和站点范围，并增加未授权与越权测试。
- **PR-03C：本地开发策略** — 保留 `127.0.0.1` 工作流，同时明确生产环境禁止回环放行逻辑。

### Epic 04：修订、发布与回滚

- **PR-04A：不可变 revision** — 后台保存只创建草稿 revision。
- **PR-04B：发布指针** — 原子切换公开 revision，不让普通保存破坏线上主页。
- **PR-04C：回滚** — owner 可切回历史 revision，并记录可验证的发布结果。

### Epic 05：公开渲染和模板边界

- **PR-05A：真实内容 SSR** — 服务端解析站点并读取已发布 revision；浏览器不再二次替换
  首屏内容。
- **PR-05B：资源解析边界** — 模板只接收标准文档和已解析 URL。
- **PR-05C：11 模板烟测** — 覆盖缺图、横竖图、移动端和模板切换，建立可审查基线。

## 决策门

下列事项必须先形成 ADR 草案，不能在实现中默认决定：

- PostgreSQL 参考实现与 D1 适配边界。
- Site 作为租户边界及 owner/editor 权限。
- 不可变 revision、发布指针和回滚语义。
- AuthProvider 接口与本地开发放行策略。
- 稳定公开 Asset ID 的生成方式。
- 开源许可证、数据保留期限及第三方模板代码策略。

前三项实现可依据 NORTH_STAR 的既定方向准备 Proposed ADR；许可证、保留期限和重大权限
变化必须等待维护者明确决策。

## 主要风险

| 风险 | 本阶段控制方式 |
| --- | --- |
| 平台化改造破坏当前私人主页 | 小 PR、行为特征测试、双读、保留旧表与回滚入口 |
| 过早多租户化导致复杂度失控 | Phase 0 只建立站点边界和 owner 路径，不开放在线多用户功能 |
| D1 与未来 PostgreSQL 分叉 | 先定义 repository 契约，再实现适配器 |
| 认证头被伪造或跨站点写入 | 集中授权、站点范围查询、未授权和越权测试 |
| SSR 切换导致 11 模板回归 | 只读已发布 revision，并在切换前完成模板烟测 |
| 稳定 ID 泄露原始路径或内容关联 | 使用随机公开 ID；原始哈希和本地路径保持私有 |
| CI 只验证源码特征产生假安全 | 补充 API 行为、迁移演练、E2E 和视觉验证 |

## PR-00A 验收与回滚

- GitHub 能自动加载统一 PR 模板。
- 新 ADR 可从 `docs/adr/0000-template.md` 创建，并覆盖数据、安全、迁移和回滚字段。
- 后续工作可映射到本页的单一 Epic / PR，不在一个 PR 同时改认证、数据库、模板和 UI。
- `npm run check:public` 与 `git diff --check` 通过。
- 本 PR 只新增文档；回滚时删除新增文件即可，不影响运行时、数据库或用户数据。
