# 摄影作品集平台 / Portfolio Platform

摄影师登录后管理自己的 Site，在基础十一模板、高级拍立得或流影视廊后台编辑内容，保存私人草稿，并发布摄影主页。

当前已具备本机可用的账号、Site 授权、三类独立内容空间与编辑器、私有作品资源和发布链路。**本机验收不等于公网部署或 V1 上线**。本机账号验收不是真实客户认证证明。`FRAME//ZERO` 是历史代号和技术命名空间，不是正式品牌。

生产Site接入候选的严格配置与私有持久化方式见[运行合同](docs/PRODUCTION_SITE_DEPLOYMENT.md)，
同一镜像的隔离HTTPS链见[验收边界](docs/PRODUCTION_SITE_RUNTIME_ACCEPTANCE.md)。这不是日常升级、真实迁入或公网部署记录。

新会话先读 [AGENTS.md](AGENTS.md) → [当前状态](docs/CURRENT_STATUS.md) → [会话交接](docs/SESSION_HANDOFF.md) 的最新检查点；按 [开发与交付流程](docs/DEVELOPMENT_WORKFLOW.md) 选择本次操作。分支、PR、授权和验收进度由当前检查点记录，实际运行目录与构建由仓库外本机交接核实；不从历史记录推断服务是否正在运行。

## 1. 已实现的核心能力

- PostgreSQL、Better Auth 会话、账号与 Site 归属检查、模板使用授权；尚不开放公众注册。
- 十一套基础模板共用基础后台，保留模板、资料、套餐、素材排版、联系、高级设置六分区。
- 高级拍立得使用独立后台，分为图库、图集、主页资料、拍摄套餐、联系约拍；保留星座/散落/跨页构图及纸面/夜空主题，深浅主题使用同一套布局与操作结构。
- 流影视廊使用专属后台管理首页作品速览、分类、价格与活动及联系方式；前台支持作品轨道、分类浏览、大图与联系入口。
- 基础版、拍立得和流影视廊内容分别保存、分别校验 schema 和版本；版本冲突拒绝覆盖，保存中继续编辑不会被旧响应抹掉。
- 同一 Site 复用自己的作品资源；上传、选片、草稿预览和资源读取经过服务端授权，不跨用户共享私人资源。
- 三类内容空间均支持保存草稿、发布、发布历史和回退；公开页只解析 Published，保存不会自动改变公开页。相同发布内容复用已有记录，历史按保留策略去重；回退不覆盖当前草稿。
- 后台已整理预览与发布状态、基础编辑路径，以及高级图库筛选、跨页选择、图集整理、预览返回和套餐重排；不代表全部体验问题已解决。

新上传保存原图和展示变体；部分历史导入只有展示变体，不能将它们标成原图。正式客户验收、公网运行及恢复演练仍需独立完成。手机拍立得内嵌预览存在已接受的本机阶段剩余风险，见第 7 节。

## 2. 页面与后台入口

以下是 Site Node 本机运行路径。`siteSlug` 由服务器查归属，不直接等同于用户名。

| 路径 | 职责 |
| --- | --- |
| `/` | 平台介绍 |
| `/login` | 统一登录；成功后提供本人工作台链接，尚未自动跳转 |
| `/:siteSlug` | 已发布摄影主页；无发布内容时明确未发布 |
| `/:siteSlug/admin` | 本人 Site 工作台，选择获授权的编辑器 |
| `/:siteSlug/admin/basic/template` | 基础后台；同层还有 `profile`、`packages`、`layout`、`contact`、`advanced` |
| `/:siteSlug/admin/premium-polaroid` | 高级拍立得后台 |
| `/:siteSlug/admin/premium-flow-gallery` | 流影视廊后台 |
| `/:siteSlug/admin/preview/basic` | 本人基础版已保存草稿预览 |
| `/:siteSlug/admin/preview/premium-polaroid` | 本人拍立得已保存草稿预览 |
| `/:siteSlug/admin/preview/premium-flow-gallery` | 本人流影视廊已保存草稿预览 |
| `/test` | 本机安全模板实验室，不是全体用户共用的内容后台 |
| `/test/admin` | 本机验收配置开启时，进入当前登录者的基础后台；匿名转登录 |

`/test` 系列是内部入口，不代表开放互联网测试服务。`FRAME_ZERO_LOCAL_ACCEPTANCE=1` 控制本机验收快捷行为，目标 Site 仍检查权限。

同一验收开关下，尚未发布的 Site 可将已登录本人且有高级权限的访问私密跳转到草稿预览；匿名访客仍看到未发布，已有 Published 优先。这不是匿名公开草稿。

旧 `/admin`、`/preview`、`/preview/admin` 只属于独立 legacy 兼容路径；**Site Node runner 拒绝这些路径和旧全局内容接口**，不能绕过 Site 授权。新平台默认入口不是旧 `/preview`。当前没有 `/register` 或 `/account`；未来开放注册需单独实施。

## 3. 产品与数据边界

基础版、高级拍立得与流影视廊共享本站点作品资源和必要平台支撑能力；资料、套餐、联系方式、图集/排版及专属配置独立演进，不强制同步，不自动使用账号邮箱作为公开联系方式。共享按钮外观不等于合并业务格式。

保存、预览、发布、公开访问是不同状态：

1. 当前编辑预览是内存快照，不保存、不发布。
2. 保存写入对应 Site、内容空间及预期版本的私人草稿。
3. 已保存草稿预览需要本人授权，不能用匿名参数开放。
4. 发布在权限校验后创建或复用不可变内容版本，并更新 Published 指针；回退不重写当前草稿。

高级模板使用权不等于平台管理员权限。旧 SQLite 记录 `1` / `2601`、全局 manifest、catalog 和平台卡是兼容/受控接入来源，不是多用户权威存储，也不是新 Site 的 fallback。

私人照片、`public/photos`（包括链接目录）、数据库和凭据永远不提交 Git。展示变体可用不等于原图已归档；缺原图资源必须如实标记。受控导入不是正常启动步骤。

## 4. 技术栈与目录

平台使用 Standard Next.js Node、React、TypeScript、Better Auth、Drizzle/PostgreSQL、Sharp。锁定版本见 [package.json](package.json) 和 lockfile，Node 要求 `>=22.13.0`。vinext/Cloudflare D1 保留为 legacy 兼容实现，不是当前 Site 数据库。

| 位置 | 用途 |
| --- | --- |
| [app](app) | 页面、十一模板、图集交互和路由 |
| [app/admin](app/admin) | 基础编辑器及六分区 |
| [app/preview-workspace](app/preview-workspace) | 高级独立业务格式及编辑器 |
| [app/site-editor](app/site-editor) | Site 编辑适配、草稿和发布操作 UI |
| [db/accounts](db/accounts) | 会话、Site、草稿、资源与发布服务端边界 |
| [scripts](scripts) | 构建、本机运行、显式迁移和验证 |
| [tests](tests) | 单测、隔离 PostgreSQL、编辑器和运行时回归 |
| [docs](docs) | 产品决定、路线图、阶段证据与交接 |

## 5. 选择正确的运行入口

先核对工作区角色、Node、分支、构建和进程／端口归属；运行目录不切分支、不覆盖构建。

| 本次目标 | 使用入口与前提 |
| --- | --- |
| 已由 Windows 独立管理的日常3001 | 先用本机交接所列入口查看状态；已运行则直接检查，需要恢复时通过既有 Windows 日常任务启动。不要再从 Codex 终端创建第二个托管实例。 |
| 全新开发环境 | 按下方首次准备条件配置；初始化、schema迁移和开户分别确认，不能套用于已有业务实例。 |
| Site 账号候选 | 独立候选目录已有匹配构建和配置后运行 `npm run accounts:start`（3003）；写入验收必须另用真正隔离的测试库。 |
| 手工诊断 Site 日常入口 | `npm run platform:start`（runner的`--daily`模式，3001）仅在确认原日常任务未运行且明确选用人工托管时使用，不是当前机器的默认恢复入口。 |
| Legacy兼容 | `npm run dev` 启动vinext/D1及照片companion，也默认占用3001；仅在明确的legacy环境使用。 |
| Standard Next／Stage A2 | `npm run start` 启动standalone产物；不自动接入本机账号runner与业务配置。Linux部署另按有界 [Stage A2 runbook](docs/deployment-bootstrap-runbook.md) 和独立授权执行。 |

机器专属的运行目录、BUILD、外置配置和状态／启动／停止命令只记录在仓库外本机交接，不提交真实路径或密钥。
**日常恢复不迁移、不重新开户、不初始化已有数据库、不重导图库、不重新发布。** Docker不是现有Windows日常的前提。
3003与3001可能共用业务库和资源根；端口不同不代表数据或Cookie隔离。

首次全新环境需要 Node `>=22.13.0`、专用loopback PostgreSQL、被忽略的账号环境文件和仓库外私有素材根。
按 [account-config](scripts/lib/account-config.mjs) 核对配置形状，明确新目标后才显式执行 `accounts:migrate`、按授权交互式 `accounts:provision`，并在闲置目录构建一次。
隔离测试使用专用测试库；具体场景、依赖与验收见 [开发与交付流程](docs/DEVELOPMENT_WORKFLOW.md)。
应用回退使用已保留且兼容的应用构建，**不以旧数据库快照覆盖新业务数据**。真实服务器、DNS、TLS、迁移和公网验收均需要对应授权。

## 6. 测试与预算政策

按 [验证矩阵](docs/DEVELOPMENT_WORKFLOW.md#按改动范围验证) 选相关检查，不逐行执行全部命令索引。
`npm test` 已包含legacy和Standard Next构建／运行时检查；`test:node-runtime` 自带Next构建，`build:node`是`build`别名。相同源码验收后不再机械追加重复构建。
`test:accounts`需要一次性隔离环境；不指向日常库或长期人工样本，不代替实体手机或真实HTTPS验收。

CI保留Quality、Public repository safety、Container、Deployment Bootstrap、Local Account PostgreSQL Integration。
以对应Head、目标分支和实际检查范围为准；`DOCS_ONLY`明确表示未执行重型业务检查，PR检查不替代合并后的main push验证。

体积允许合理增长：跨路由汇总和 legacy 参考超出按告警记录原因、增量与影响，不为微小 bytes 增长删产品。缺失/损坏产物、错误映射、泄漏、懒加载结构仍严格失败；Next 单模板 64 KiB 硬约束保留。详见 [M2/预算政策](docs/M2_SITE_CONTENT_EDITOR.md)、[后台验收](docs/ADMIN_WORKSPACE_LAYOUT.md)。

## 7. 限制、历史定位与交接

已知剩余风险：手机拍立得内嵌预览从图集返回图集首页时，内部滚动位置可能不准确。状态保持 `PREVIEW_RETURN = UNRESOLVED`、`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE`，不代表已修复或频率很低。保留首次失败、诊断及原位置、焦点、后台滚动断言；同路径有新证据或出现更严重影响时重新评估，后续 CI 失败仍按真实结果处理。见[风险接受决定](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/35#issuecomment-6213969172)。

资源回收、历史原图完整映射和正式公网交付仍需独立工作。现有CI的非空生成照片覆盖不等于全部模板槽位、真实摄影作品、弱网或实体手机全链验收；匿名组件样本也不替代真实持久化验收。文档同步不自动启动这些后续任务。

产品目标见 [North Star](docs/PORTFOLIO_PLATFORM_NORTH_STAR.md)，阶段映射见 [V1 路线图](docs/SELF_HOSTED_V1_ROADMAP.md)。当前能力与停止边界以 [CURRENT_STATUS](docs/CURRENT_STATUS.md) 为准，新对话按 [SESSION_HANDOFF](docs/SESSION_HANDOFF.md) 进入相关代码。

历史技术仍可追溯，但不是当前启动指引：

- [旧 README 完整快照](https://github.com/Brilliant666/frame-zero-portfolio-studio/blob/7f8701499397a6da00885a7339f24bf35ec9b9c3/README.md)：保留 D1、导入器、平台卡、模板方向和早期公共仓库发布流程。旧 `publish-public-repo.ps1` 已退役，执行时会在Git／GitHub操作前拒绝；正文仅供追溯。
- [SiteDocumentV1](app/site-document.ts)、[稳定 ID 规划](app/stable-id-migration.ts)、[旧内容适配](app/legacy-site-content-adapter.ts)：冻结/纯规划契约，不意味着新 Site 保存格式已统一；不得据此合并独立内容或自动迁移源记录。
- [基础 Admin V2](docs/admin-v2.md)、[旧运行时](docs/stage-a-runtime.md)：保留兼容行为与技术沿革，旧全局 API 安全假设不能套到新 Site 后台。
- [M2 编辑](docs/M2_SITE_CONTENT_EDITOR.md)、[M3 资源](docs/M3_SITE_ASSETS.md)、[受控接入](docs/M3_LOCAL_IMPORT.md)、[本机验收](docs/LOCAL_M3_HANDS_ON_ACCEPTANCE.md)、[高级发布](docs/M4_PREMIUM_PUBLICATION.md)：保留阶段证据，文中“当时未完成”不代表现在仍未完成。

合并、真实数据迁移和公网部署按当前明确授权执行；不把历史任务授权或模拟账号验收转成新的合并／上线授权。
