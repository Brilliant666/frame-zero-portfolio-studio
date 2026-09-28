# 摄影作品集平台 / Portfolio Platform

摄影师登录后管理自己的 Site，在基础十一模板或高级拍立得后台编辑内容，保存私人草稿，并通过高级拍立得发布摄影主页。

当前已具备本机可用的账号、Site 授权、两套编辑器、私有作品资源和高级发布链路。**本机验收不等于公网部署或 V1 上线**。当前 `star`、`phototest` 是模拟测试账号，不是真实客户认证证明。`FRAME//ZERO` 是历史代号和技术命名空间，不是正式品牌。

新会话先读 [AGENTS.md](AGENTS.md) → [当前状态](docs/CURRENT_STATUS.md) → [会话交接](docs/SESSION_HANDOFF.md)。本轮阶段接受、合并和日常切换的最终证据以 [PR #32](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/32) 及仓库外本机交接记录为准；不要从旧阶段文档推断现有服务状态。

## 1. 已实现的核心能力

- PostgreSQL、Better Auth 会话、账号与 Site 归属检查、模板使用授权；尚不开放公众注册。
- 十一套基础模板共用基础后台，保留模板、资料、套餐、素材排版、联系、高级设置六分区。
- 高级拍立得使用独立后台，分为图集管理、主页资料、拍摄套餐、联系约拍；保留星座/散落/跨页构图及纸面/夜空主题。
- 两套内容分别保存、分别校验 schema 和版本；版本冲突拒绝覆盖，保存中继续编辑不会被旧响应抹掉。
- 同一 Site 复用自己的作品资源；上传、选片、草稿预览和资源读取经过服务端授权，不跨用户共享私人资源。
- 高级拍立得支持保存草稿、发布已保存版本、发布历史和回退；公开页只解析 Published，保存不会自动改变公开页。
- 第一轮后台 UI 整理包含保存吸顶、照片网格、次要操作收纳，以及平台首页、登录和工作台的统一界面，不代表全部体验问题已解决。

基础模板发布尚未接线。完整原图归档、正式客户验收、公网运行及恢复演练仍未完成。

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
| `/:siteSlug/admin/preview/basic` | 本人基础版已保存草稿预览 |
| `/:siteSlug/admin/preview/premium-polaroid` | 本人高级已保存草稿预览 |
| `/test` | 本机安全模板实验室，不是全体用户共用的内容后台 |
| `/test/admin` | 本机验收配置开启时，进入当前登录者的基础后台；匿名转登录 |

`/test` 系列是内部入口，不代表开放互联网测试服务。`FRAME_ZERO_LOCAL_ACCEPTANCE=1` 控制本机验收快捷行为，目标 Site 仍检查权限。

同一验收开关下，尚未发布的 Site 可将已登录本人且有高级权限的访问私密跳转到草稿预览；匿名访客仍看到未发布，已有 Published 优先。这不是匿名公开草稿。

旧 `/admin`、`/preview`、`/preview/admin` 只属于独立 legacy 兼容路径；**Site Node runner 拒绝这些路径和旧全局内容接口**，不能绕过 Site 授权。新平台默认入口不是旧 `/preview`。当前没有 `/register` 或 `/account`；未来开放注册需单独实施。

## 3. 产品与数据边界

基础版与高级拍立得只共享本站点作品资源和必要平台支撑能力；资料、套餐、联系方式、图集/排版及专属配置独立演进，不强制同步，不自动使用账号邮箱作为公开联系方式。共享按钮外观不等于合并业务格式。

保存、预览、发布、公开访问是不同状态：

1. 当前编辑预览是内存快照，不保存、不发布。
2. 保存写入对应 Site、内容空间及预期版本的私人草稿。
3. 已保存草稿预览需要本人授权，不能用匿名参数开放。
4. 高级发布创建不可变版本并更新 Published 指针；回退不重写当前草稿。

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

## 5. 正确启动方式

在**对应工作区根目录**执行。先核对 Node、分支、构建和端口归属；不要在运行中的 3001/3003 目录切分支或覆盖构建。停服务前确认无未保存编辑和进行中的上传、保存、发布。

### A. 已有数据库和配置：正常重启

前提：现有 PostgreSQL 已运行，数据库/schema/账号可用，资源根不变；目录已有匹配版本的 `.next` 和被忽略的 `.env.accounts.local`。机器位置、外置环境文件和精确恢复命令见 `%LOCALAPPDATA%/PortfolioPlatform/local-m3/SESSION_HANDOFF.local.md`，不提交该私有记录。

```sh
npm run platform:start
```

启动日常 `http://127.0.0.1:3001/`。`--daily` 将 origin 设为 3001，沿用配置的数据库和资源根。使用外置环境文件时，按本机记录执行 `node --env-file=<本机环境文件> scripts/start-local-accounts.mjs --daily`，不输出或复制密钥到仓库。

**重启不迁移、不重新创建 star、不初始化已有数据库、不重导图库、不重新发布。** PostgreSQL 可由现有本机专用进程提供，Docker 不是日常前提。

### B. 全新开发环境：首次准备

克隆、`npm ci` 并不足以完整体验。还需：

- Node `>=22.13.0` 和专用 loopback PostgreSQL。
- 被忽略的 `.env.accounts.local`：核对 `FRAME_ZERO_LOCAL_ACCOUNTS`、`FRAME_ZERO_ACCOUNT_DATABASE_URL`、`FRAME_ZERO_ACCOUNT_ORIGIN`、`FRAME_ZERO_ACCOUNT_SECRET`；资源功能还需仓库外持久的 `FRAME_ZERO_SITE_ASSET_ROOT`。
- 按 [account-config](scripts/lib/account-config.mjs) 校验：开发数据库名 `frame_zero_accounts`、仅 loopback、origin 为本机 3001 或 3003，secret 至少 32 字符；不得复用其他人的私人目录。
- 明确属于新环境后，显式 `npm run accounts:migrate` 建 schema，再按授权用交互式 `npm run accounts:provision` 开户。不内置默认密码，不在命令行参数传密码。
- 在未运行服务的工作区执行 `npm run build`，再选择日常或候选启动方式。

隔离验证另用 `.env.accounts.test`、`frame_zero_accounts_test` 和 3004。不能对已有业务实例机械执行本节。Docker 辅助脚本仍保留，但不要求为此重启或修复 Docker。历史准备细节见 [账号基础记录](docs/LOCAL_ACCOUNT_FOUNDATION.md)，其中旧环境缺口不是当前事实。

### C. 候选验收实例

在独立候选目录完成构建，配置 `FRAME_ZERO_ACCOUNT_ORIGIN=http://127.0.0.1:3003` 后：

```sh
npm run accounts:start
```

3003 可以与 3001 共用本机业务库和资源根，**不能据端口不同当作沙盒**。写入测试用隔离库；不同端口不构成 Cookie 隔离。保留 Origin、Host、CSRF 和会话限制，不复制 token 绕过登录。

### D. Legacy 兼容与回退

`npm run dev` 启动 vinext/D1 和本地照片 companion，默认同样占用 3001；不是新平台默认启动方式，不能与日常实例争端口。旧后台、预览、全局 SQLite 和图库仅在明确保留的 legacy 目录使用。`build:legacy`、`start:legacy` 保留回归用途。

应用回退按只读核对进程 → 停止 → 确认退出 → 恢复已保留应用命令 → 健康检查执行；**不以恢复旧数据库快照回退应用**。机器专属步骤见本机交接记录。

### E. 普通生产产物不等于本机 runner

```sh
npm run build
npm run start
```

以上生成并启动 `.next/standalone/server.js`，不自动开启本机账号 runner 的 socket/Host proof、内部验收入口或现有本机配置，不能写成与 `platform:start` 等价，也不能声称换域名即可上线账号链路。

容器、Caddy 和 Linux bootstrap 有仓库侧验证；真实 DNS、TLS、服务器配置、备份恢复与公网验收仍是独立授权的部署工作。见 [Node 运行时记录](docs/stage-a-runtime.md)、[部署 bootstrap](docs/stage-a2-deployment-bootstrap.md)、[运维文档](docs/deployment-bootstrap-runbook.md)。本次不远程部署。

## 6. 测试与预算政策

常用命令（依赖须安装；构建类测试不在运行目录执行）：

```sh
npm run lint
npm run check:public
npm run test:admin
npm run test:accounts
npm run build
npm run check:bundle
npm test
```

`test:accounts` 需要准备隔离 `.env.accounts.test` 与 PostgreSQL，不能指向日常库。完整 `npm test` 包含 legacy 和 Standard Next 构建/运行时测试，不代替本机账号或浏览器验收。

CI 五项：Quality、Public repository safety、Container、Deployment Bootstrap、Local Account PostgreSQL Integration。只使用对应 head/目标的证据，PR 绿灯不替代 main 合并后的 push 检查。

体积允许合理增长：跨路由汇总和 legacy 参考超出按告警记录原因、增量与影响，不为微小 bytes 增长删产品。缺失/损坏产物、错误映射、泄漏、懒加载结构仍严格失败；Next 单模板 64 KiB 硬约束保留。详见 [M2/预算政策](docs/M2_SITE_CONTENT_EDITOR.md)、[后台验收](docs/ADMIN_WORKSPACE_LAYOUT.md)。

## 7. 限制、历史定位与交接

尚未完成：高级素材搜索/筛选/批选、基础 Site 资源元信息、分享卡新增替换、预览呈现一致性补齐、基础发布、资源回收与完整原图归档。登录后自动进入后台仅讨论过，未实施；文档交接不自动授权这些候选任务。

产品目标见 [North Star](docs/PORTFOLIO_PLATFORM_NORTH_STAR.md)，阶段映射见 [V1 路线图](docs/SELF_HOSTED_V1_ROADMAP.md)。当前能力与停止边界以 [CURRENT_STATUS](docs/CURRENT_STATUS.md) 为准，新对话按 [SESSION_HANDOFF](docs/SESSION_HANDOFF.md) 进入相关代码。

历史技术仍可追溯，但不是当前启动指引：

- [旧 README 完整快照](https://github.com/Brilliant666/frame-zero-portfolio-studio/blob/7f8701499397a6da00885a7339f24bf35ec9b9c3/README.md)：保留 D1、导入器、平台卡、模板方向和早期公共仓库发布流程。旧 `publish-public-repo.ps1` 不是现有仓库的日常发布命令。
- [SiteDocumentV1](app/site-document.ts)、[稳定 ID 规划](app/stable-id-migration.ts)、[旧内容适配](app/legacy-site-content-adapter.ts)：冻结/纯规划契约，不意味着新 Site 保存格式已统一；不得据此合并独立内容或自动迁移源记录。
- [基础 Admin V2](docs/admin-v2.md)、[旧运行时](docs/stage-a-runtime.md)：保留兼容行为与技术沿革，旧全局 API 安全假设不能套到新 Site 后台。
- [M2 编辑](docs/M2_SITE_CONTENT_EDITOR.md)、[M3 资源](docs/M3_SITE_ASSETS.md)、[受控接入](docs/M3_LOCAL_IMPORT.md)、[本机验收](docs/LOCAL_M3_HANDS_ON_ACCEPTANCE.md)、[高级发布](docs/M4_PREMIUM_PUBLICATION.md)：保留阶段证据，文中“当时未完成”不代表现在仍未完成。

本轮交接后等待用户选择目标。不自动合并新 PR、不迁移真实数据、不开放注册/公网，不把模拟账号验收写成客户上线。
