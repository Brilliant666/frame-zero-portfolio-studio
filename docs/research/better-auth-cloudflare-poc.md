# REUSE-01：Better Auth + Cloudflare D1 集成 POC

状态：研究与隔离可执行 POC 已完成。

审计日期：2026-08-10

最终结论：`ADOPT_WITH_ADAPTER`。Better Auth `1.6.25` 已在本仓库的 vinext、workerd、D1、Drizzle、username/password 与 cookie 组合中通过隔离运行验证；正式采用仍必须保留本文明确列出的安全与领域 adapter。

## 1. 研究边界

本研究只判断 Better Auth 是否适合作为未来 Hosted Authentication 基础设施，不切换当前生产认证路径，不接入现有 Admin，不创建正式 `/login`，也不把 Site、SiteSlug、SiteDocument、Asset 或 ownership 塞进 Better Auth schema。

责任边界保持为：

```text
Better Auth
  -> authentication、credential、session、auth user

Portfolio Platform
  -> User/Site 映射、Site ownership、authorization、reserved slug、审计策略
```

## 2. 精确版本快照

### 2.1 本 POC 锁定版本

| 组件 | 锁定版本 | 说明 |
| --- | --- | --- |
| `better-auth` | `1.6.25` | 2026-07-23 发布的当前稳定版 |
| Better Auth Drizzle adapter | `1.6.25` | 使用 `better-auth/adapters/drizzle` 官方 re-export；未直接声明 `@better-auth/drizzle-adapter` 依赖 |
| `auth` CLI | `1.6.25` | schema 生成必须显式 pin，不使用 `latest` |
| `drizzle-orm` | `0.45.2` | 满足 adapter 的 peer 范围 |
| `drizzle-kit` | `0.31.10` | 当前仓库锁定版本 |
| `vinext` | `0.0.50` | 当前仓库锁定版本 |
| `@cloudflare/vite-plugin` | `1.37.1` | 当前仓库锁定版本 |
| `wrangler` | `4.92.0` | 当前仓库锁定版本 |
| TypeScript | `5.9.3` | 当前仓库锁定版本 |
| `workerd` | `1.20260515.1` | 隔离 Worker 运行时 |
| `miniflare` | `4.20260515.0` | Wrangler 本地 D1/Worker harness |

POC 在 Node `22.13.1` 下运行，满足仓库 `>=22.13.0` 门槛。系统默认 Node 版本不作为兼容性证据；所有 POC 命令均显式使用该 Node 版本。

### 2.2 稳定版与 RC 边界

Better Auth `v1.6.25` release tag 指向 `07a646ea190167370fbbb60a0fa2c3be3bec5522`。审计时另有 `v1.7.0-rc.2` 预发布版，发布于 2026-07-22，不能混入本 POC。

`1.7.0-rc.2` 已经包含破坏性数据库变化：`account.accountId` 改为 `providerAccountId`、新增必填 `issuer`、credential issuer 为 `local:credential`、新增 compound index，并移动 joins 配置。它与本文记录的稳定版 `1.6.25` footprint 不同。所有 Better Auth package 和 CLI 必须同版锁定；尤其禁止用 RC CLI 为稳定运行时生成 schema。

## 3. 官方资料

### Better Auth 官方文档

- 稳定版 release：<https://github.com/better-auth/better-auth/releases/tag/v1.6.25>
- Drizzle adapter：<https://better-auth.com/docs/adapters/drizzle>
- Database、schema 与 ID：<https://better-auth.com/docs/concepts/database>
- CLI：<https://better-auth.com/docs/concepts/cli>
- Email/password：<https://better-auth.com/docs/authentication/email-password>
- Username plugin：<https://better-auth.com/docs/plugins/username>
- Admin plugin：<https://better-auth.com/docs/plugins/admin>
- Session：<https://better-auth.com/docs/concepts/session-management>
- Cookies：<https://better-auth.com/docs/concepts/cookies>
- Security：<https://better-auth.com/docs/reference/security>
- Options：<https://better-auth.com/docs/reference/options>
- Rate limiting：<https://better-auth.com/docs/concepts/rate-limit>
- Better Auth 1.5 D1 支持说明：<https://better-auth.com/blog/1-5>
- 1.7 升级说明：<https://better-auth.com/docs/guides/1-7-upgrade-guide>
- 1.7 RC release：<https://github.com/better-auth/better-auth/releases/tag/v1.7.0-rc.2>

### Better Auth `v1.6.25` 官方源码证据

- Cloudflare Worker + D1 + Drizzle smoke fixture：<https://github.com/better-auth/better-auth/blob/v1.6.25/e2e/smoke/test/fixtures/cloudflare/src/index.ts>
- fixture 的 Wrangler 配置：<https://github.com/better-auth/better-auth/blob/v1.6.25/e2e/smoke/test/fixtures/cloudflare/wrangler.json>
- fixture 的 Drizzle schema：<https://github.com/better-auth/better-auth/blob/v1.6.25/e2e/smoke/test/fixtures/cloudflare/src/auth-schema.ts>
- fixture 的 D1 migration SQL：<https://github.com/better-auth/better-auth/blob/v1.6.25/e2e/smoke/test/fixtures/cloudflare/drizzle/0000_lively_paladin.sql>
- Drizzle adapter 实现：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/drizzle-adapter/src/drizzle-adapter.ts>
- 核心 auth tables：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/core/src/db/get-tables.ts>
- Username plugin：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/plugins/username/index.ts>
- Username schema：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/plugins/username/schema.ts>
- Admin routes：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/plugins/admin/routes.ts>
- Admin schema：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/plugins/admin/schema.ts>
- Sign-up disable 实现：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/api/routes/sign-up.ts>
- Origin/CSRF middleware：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/api/middlewares/origin-check.ts>
- Cookie 实现：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/cookies/index.ts>
- Logout 实现：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/api/routes/sign-out.ts>
- 默认 ID generator：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/core/src/utils/id.ts>
- UUID 配置落点：<https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/context/create-context.ts>

### Cloudflare 与 Drizzle 官方资料

- Workers Node.js compatibility：<https://developers.cloudflare.com/workers/runtime-apis/nodejs/>
- D1 Worker API 与 `batch()` 事务语义：<https://developers.cloudflare.com/d1/worker-api/d1-database/>
- Drizzle Cloudflare D1 连接：<https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1>
- Drizzle Kit + D1：<https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit>
- Drizzle migration：<https://orm.drizzle.team/docs/drizzle-kit-migrate>

## 4. 能力审计

| 能力 | 分类 | `1.6.25` 结论 | 本项目边界 |
| --- | --- | --- | --- |
| Web `Request`/`Response` handler | CORE | `auth.handler(request)` | 优先走框架无关 handler，不假定 vinext 等同 Next.js |
| Cloudflare Workers | CORE | 官方 smoke fixture 存在 | 本仓库 workerd 已实测 |
| Cloudflare D1 | CORE | v1.5 起原生支持；也可经 Drizzle | 本项目选择 Drizzle 以保留可审 SQL migration |
| Drizzle adapter | OFFICIAL_PLUGIN/PACKAGE | 官方 `better-auth/adapters/drizzle` re-export | runtime-injected D1 与 isolate-scoped auth instance 已实测；AUTH-01 再决定 request factory 边界 |
| Email/password | CORE | 支持，默认 scrypt | 保留真实 email，不造 fake email |
| Username/password 登录 | OFFICIAL_PLUGIN | `username()` 提供 `/sign-in/username` | 日常 UX 使用 username；email 仍是账户字段 |
| Session + HttpOnly cookie | CORE | 支持 | 先禁用 cookie cache，保持撤销语义直接 |
| Logout / revoke | CORE | 支持当前、单个、其他、全部 session | Admin 侧可按 user revoke |
| Password change/reset | CORE | 支持 primitives | reset email 发送与 UI 不属于本轮 |
| 关闭 email/password public sign-up | CORE | `disableSignUp: true` | 请求级 zero-write 测试已证明 anonymous signup denied |
| 服务端创建用户 | OFFICIAL_PLUGIN | Admin plugin 的 trusted server API 可用 | 只允许内部 operator/provisioner 调用 |
| Ban、role、set password | OFFICIAL_PLUGIN | Admin plugin | V1 不引入 organization/team |
| Hooks | CORE/PLUGIN | database hooks 与 plugin hooks | 不能直接 INSERT credential 绕过它们 |
| Rate limit | CORE | 支持 memory/database/secondary/custom | Workers 不采用默认内存作为生产分布式限流 |
| Site ownership | CUSTOM_CODE_REQUIRED | 不属于 Better Auth | Portfolio domain 必须自行 enforce |
| Reserved username/site slug | CUSTOM_CODE_REQUIRED | Better Auth 不理解路由保留字 | Platform policy；`auth` 必须保留 |

## 5. Cloudflare、D1、Drizzle 与 vinext

Better Auth 官方 `v1.6.25` Cloudflare fixture 在每次请求中从 `env.DB` 创建 Drizzle client，以 `provider: "sqlite"` 配置 Drizzle adapter，并把 `/api/auth/*` 请求交给 `auth.handler(request)`。fixture 同时启用 `nodejs_compat`。这证明官方支持目标组件组合，但不能代替本仓库 vinext 的路由、cookie、build 和 bundle 实测。

Cloudflare 官方要求 `nodejs_compat` 且 compatibility date 不早于 `2024-09-23`，才提供当前 Node compatibility v2。最终配置不得为兼容本地而降低 hosted cookie 或 runtime 安全设置。

### D1 事务限制

Better Auth Drizzle adapter 的 `transaction` 默认值是 `false`。官方源码明确要求：数据库不支持该 adapter 所需的交互式事务时，应保持 `false`，此时多个操作顺序执行。D1 的原生 `batch()` 可以原子执行一组预编译语句，但 Drizzle adapter 的多步 user/account 创建不会自动折叠成 D1 batch。

后果：Admin `createUser` 在 stable `1.6.25` 中先创建 `user`，再创建 credential `account`。D1 + Drizzle 下这两步不是一个交互式事务。未来生产 provisioner 必须：

- 具备幂等键和唯一约束；
- 检测并清理或恢复 partial user；
- 不把“API 返回失败”等同于“数据库完全没有副作用”；
- 把默认 Site 创建放到 Portfolio 自己的可恢复工作流，不假装与 Better Auth credential 原子提交。

### vinext 实测结果

Better Auth 官方没有宣称或测试 vinext，因此本 POC 在 `research/better-auth-cloudflare-poc/vinext-app` 建立了完全隔离的 Worker 应用。它没有使用 `better-auth/next-js` helper，而是由 vinext catch-all route 将标准 `Request` 交给 framework-neutral `auth.handler(request)`，并原样返回标准 `Response`。route module 从 `cloudflare:workers` 注入的 `env.AUTH_POC_DB` 构造 isolate-scoped Drizzle/Better Auth instance；路由编译结果为 `/api/auth/:all+`。这证明 runtime binding 可用，但不冒充 request-scoped factory 已经实现；AUTH-01 若需要按请求注入 tenant/config，应建立明确 factory。

实测通过：

- vinext route 的标准 Request/Response 透传；
- workerd runtime-injected D1 binding 与 isolate-scoped auth instance；
- workerd 下 scrypt、Web Crypto、UUID v4 与持久化 session；
- local HTTP 与模拟 hosted HTTPS 的 cookie 名称和属性差异；
- nested production build；
- production build 配置本身不注入 runtime secret、harness token 或 base URL；测试故意在 build 进程环境放入随机 sentinel，并对完整 `dist` 逐字节扫描，生成物仍不含 sentinel。client 输出也不含 Better Auth runtime 或认证环境键。

隔离应用使用 `nodejs_compat`、`compatibility_date = 2026-05-15` 与 `workers_dev = false`。这证明技术组合可行，不构成正式生产 auth route、Admin 接线或部署。

## 6. Username + 真实 Email + Password

推荐模型：

```text
username = stable login handle
email    = real account/recovery address
password = Better Auth credential account secret
```

Better Auth 核心仍要求 `user.email` 和 `user.name`。Username plugin 是 email/password 的扩展，不会删除真实 email；它新增 `/sign-in/username`，所以产品可以只向客户暴露 username/password 登录，同时保留 email 作为真实账户与未来 recovery 字段。

Username plugin 的稳定版默认值：

- `username` 长度 3 到 30；
- 默认格式 `/^[a-zA-Z0-9_.]+$/`；
- 默认 normalization 为 lowercase；
- `user.username` 为 optional + unique + sortable；
- `displayUsername` 保留显示形式；
- plugin database hook 会覆盖 Admin `createUser` 等非 sign-up 创建路径，执行 validation、normalization 与重复检查。

分工：

- Better Auth：normalization、长度/格式验证、username unique、username credential lookup；
- Portfolio Platform：username 必填的 operator 流程、reserved names、与 `SiteSlug` 的初始建议关系、未来 rename policy；
- `Username` 与 `SiteSlug` 不永久耦合；`auth`、`api`、`admin`、`login`、静态资源和平台路由均应进入 domain reserved set。

若平台希望允许连字符，需要用自定义 `usernameValidator` 明确定义规则，因为官方默认 regex 不含 `-`。为避免“先验证还是先 normalize”的歧义，应同时明确 `validationOrder.username`；reserved 检查应基于 canonical lowercased 值。

## 7. Public sign-up 与 operator provisioning

### 7.1 关闭公开注册

稳定版 `1.6.25` 的正确选项为：

```text
emailAndPassword.enabled = true
emailAndPassword.disableSignUp = true
```

`/sign-up/email` 会返回 `EMAIL_PASSWORD_SIGN_UP_DISABLED`。这只覆盖 email/password provider；未来若加入 OAuth，还必须分别审查 provider 的 implicit sign-up 语义。

### 7.2 可信创建路径

Admin plugin 的 `auth.api.createUser` 可作为 trusted server API 调用。在 `v1.6.25` 源码中，只有当 endpoint context 带有 `request` 或 `headers` 时才要求 authoritative admin session；无 HTTP request/headers 的内部 server call 可用于 bootstrap/operator provisioner。它会：

- 验证真实 email 并 lower-case；
- 通过 internal adapter 创建 user；
- 使用 Better Auth password hasher；
- 创建 `providerId = "credential"` 的 account；
- 触发 Username plugin 的 database hook。

安全边界非常重要：这个“无 headers 的 trusted call”是进程内 capability，不是匿名 HTTP endpoint。禁止写一个公开 route 原样调用它，否则等同于把 admin provisioning 暴露给互联网。

为了让 workerd 集成测试能够触发这项进程内 capability，隔离 nested app 提供了仅供 POC 使用的 `/_poc/provision` harness。它只接受固定的 `operator`、`star`、`alice` synthetic identity，只监听 OS 分配的 loopback 端口，要求随机 bearer token，并同时验证实际 request origin 等于配置的 `http://127.0.0.1:<port>`、runtime secret 与 harness token 均至少 32 字符；任一条件不满足均返回 404/403，且 `workers_dev = false`。测试还断言无 token 的 harness 调用以及匿名 HTTP Admin `create-user` 均被拒绝。这个 harness 不是可复用的生产 route；AUTH-01 应使用 server-only operator command/job，不得发布同类 endpoint。

POC 的 `@auth-poc.example` 地址只属于保留测试域中的 synthetic fixture。生产 provisioner 仍必须要求用户真实 email，不能由 username 拼接 fake production email。

稳定版 `auth@1.6.25` CLI 没有 `create-admin` 命令。其命令集合包含 `ai`、`init`、`migrate`、`generate`、`secret`、`info`、`login`、`logout`、`mcp` 和 `upgrade`。不能照搬 RC/未来文档中的 bootstrap 命令。

### 7.3 Admin plugin 结论

结论：`ADAPT`。

采用范围：create user、role、ban/disable、set password、revoke sessions。V1 角色只需要 `operator` / `user` 的薄映射，不引入 organization、team 或复杂 RBAC。

Admin plugin 增加：

- `user.role`；
- `user.banned`，默认 false；
- `user.banReason`；
- `user.banExpires`；
- `session.impersonatedBy`。

`setUserPassword` 会 hash 新密码，但源码没有自动撤销该用户的所有既有 session。operator reset/password set 流程必须随后调用 `revokeUserSessions`。Ban 路径会撤销 sessions。

## 8. User ID Gate

Better Auth `v1.6.25` 默认 ID 不是 UUID；默认 generator 产生 32 字符随机 base62 字符串。要符合当前 Portfolio 稳定内部身份方向，必须显式配置：

```text
advanced.database.generateId = "uuid"
```

官方实现调用 `crypto.randomUUID()`；在 SQLite/D1 中仍存为 `TEXT`，Username/Admin plugin 只把 ID 当作 string，不依赖 base62 编码。

### Option A

```text
BetterAuth user.id UUID v4 == Portfolio UserId
```

优点：少一张纯映射表；session user id 可直接进入未来 `AuthorizedSiteContext`；credential/provider 变化不改变 user id。

风险控制：Portfolio 仍通过 `AuthPrincipal` / `AuthService` 包装 Better Auth，不允许 domain 代码依赖 Better Auth table shape；`SiteId` 继续独立。

### Option B

```text
BetterAuth AuthUserId
  -> auth_user_id UNIQUE
  -> Portfolio UserId UUID v4
```

优点：未来同一 Portfolio user 聚合多个 auth system/principal 时边界更强。代价是额外映射、bootstrap 顺序、失败恢复和查询成本。

### 建议

采用 Option B，并继续强制 Better Auth `generateId: "uuid"`：

```text
Better Auth user.id (AuthUserId UUID v4)
  -> Portfolio auth_user_id UNIQUE
  -> Portfolio User.id (UserId UUID v4)
  -> Site.owner_user_id
```

原因不是当前必须聚合多个登录 provider，而是让认证主体与 Portfolio 稳定领域身份保持显式边界。这样未来替换或并行迁移 auth system 时，不需要把 Better Auth 的主键契约扩散到 Site、Asset 和 authorization。代价是正式实现必须提供唯一映射、幂等 bootstrap、partial failure recovery 与一次受控查询。

POC 的纯 Portfolio adapter 已用独立 AuthUserId/Portfolio UserId/SiteId fixture 验证：`star` 可访问自己的 synthetic Site，`alice` 对该 Site 被拒绝。此 fixture 只验证 authorization seam，不新增生产 schema。无论如何都不能把 `SiteId`、username 或 slug 当作 User ID。

## 9. 数据库 footprint（stable `1.6.25`）

默认表名为单数；以下按 Drizzle SQLite/D1 generator 的 snake_case 物理列记录。所有主键在本 POC 配置下都是应用侧生成的 UUID v4，D1 类型为 `TEXT`。

### `user`

| 列 | D1 类型/约束 | 来源 |
| --- | --- | --- |
| `id` | TEXT PK | core |
| `name` | TEXT NOT NULL | core |
| `email` | TEXT NOT NULL UNIQUE | core |
| `email_verified` | INTEGER boolean NOT NULL DEFAULT false | core |
| `image` | TEXT nullable | core |
| `created_at` | INTEGER timestamp_ms NOT NULL, current-ms default | core |
| `updated_at` | INTEGER timestamp_ms NOT NULL, current-ms default/on-update | core |
| `username` | TEXT nullable UNIQUE | Username plugin |
| `display_username` | TEXT nullable | Username plugin |
| `role` | TEXT nullable | Admin plugin |
| `banned` | INTEGER boolean nullable/default false | Admin plugin |
| `ban_reason` | TEXT nullable | Admin plugin |
| `ban_expires` | INTEGER timestamp_ms nullable | Admin plugin |

Indexes/uniqueness：`user_email_unique(email)`，`user_username_unique(username)`。

### `session`

| 列 | D1 类型/约束 |
| --- | --- |
| `id` | TEXT PK |
| `expires_at` | INTEGER timestamp_ms NOT NULL |
| `token` | TEXT NOT NULL UNIQUE |
| `created_at` | INTEGER timestamp_ms NOT NULL, current-ms default |
| `updated_at` | INTEGER timestamp_ms NOT NULL |
| `ip_address` | TEXT nullable |
| `user_agent` | TEXT nullable |
| `user_id` | TEXT NOT NULL FK -> `user.id`, ON DELETE CASCADE |
| `impersonated_by` | TEXT nullable, Admin plugin；无 FK |

Indexes：`session_token_unique(token)`，`session_userId_idx(user_id)`。

### `account`

| 列 | D1 类型/约束 |
| --- | --- |
| `id` | TEXT PK |
| `account_id` | TEXT NOT NULL |
| `provider_id` | TEXT NOT NULL |
| `user_id` | TEXT NOT NULL FK -> `user.id`, ON DELETE CASCADE |
| `access_token` | TEXT nullable |
| `refresh_token` | TEXT nullable |
| `id_token` | TEXT nullable |
| `access_token_expires_at` | INTEGER timestamp_ms nullable |
| `refresh_token_expires_at` | INTEGER timestamp_ms nullable |
| `scope` | TEXT nullable |
| `password` | TEXT nullable；credential hash 在此，不在 `user` |
| `created_at` | INTEGER timestamp_ms NOT NULL, current-ms default |
| `updated_at` | INTEGER timestamp_ms NOT NULL |

Index：`account_userId_idx(user_id)`。

稳定版 generator 没有为 `(provider_id, account_id)` 生成 composite unique。它与 1.7 RC 新增的 issuer/provider account compound identity 不同。这是升级和并发 provisioning 需要显式复核的 stable-version footprint，不应被报告成已有约束。

### `verification`

| 列 | D1 类型/约束 |
| --- | --- |
| `id` | TEXT PK |
| `identifier` | TEXT NOT NULL |
| `value` | TEXT NOT NULL |
| `expires_at` | INTEGER timestamp_ms NOT NULL |
| `created_at` | INTEGER timestamp_ms NOT NULL, current-ms default |
| `updated_at` | INTEGER timestamp_ms NOT NULL, current-ms default/on-update |

Index：`verification_identifier_idx(identifier)`。

### 可选 `rateLimit`

仅当 `rateLimit.storage = "database"` 时生成：

| 列 | D1 类型/约束 |
| --- | --- |
| `id` | TEXT PK |
| `key` | TEXT NOT NULL UNIQUE |
| `count` | INTEGER/number NOT NULL |
| `last_request` | INTEGER bigint NOT NULL |

Username 与 Admin plugin 不增加独立表，只扩展 `user`/`session`。本 POC 不启用 JWT、SSO、organization、team，因此不应生成 `jwks`、`sso_provider` 或组织表。

## 10. Migration strategy

推荐链路：

```text
pin auth CLI 1.6.25
  -> generate reviewed Drizzle auth schema
  -> merge/export alongside existing db/schema.ts
  -> drizzle-kit generate
  -> review SQL migration
  -> apply through existing D1 migration workflow
```

建议命令形态：

```text
npx auth@1.6.25 generate --config <auth-config> --output <auth-schema> --yes
npm run db:generate
```

`auth migrate` 只适用于 Better Auth 内置 Kysely adapter；使用 Drizzle adapter 时，应执行 `generate` 后交给 Drizzle Kit。禁止生产 request-time DDL，禁止把生成器直接对生产数据库运行。

Cloudflare binding 只在 request runtime 中存在，因此 schema-generation config 需要一个薄 seam：共享 auth options/plugins，但提供不会执行查询的 typed placeholder adapter。运行时 factory 则从当前 request 的 `env.DB` 构造 Drizzle 和 Better Auth。社区 wrapper 的这一模式值得参考，但不需要引入它。

Migration 文件必须提交、可审、可重放；生成时固定 Better Auth 和 CLI 版本。升级到 1.7 前必须另开数据库迁移审计，不能仅更新 npm package。

### POC migration 结果

POC 使用锁定的官方 `auth@1.6.25` 配置生成 Drizzle schema，再由锁定的 Drizzle Kit 生成并审阅 SQL migration。临时 D1 中预先建立了与认证无关的 `site_settings` sentinel，随后通过 Wrangler D1 CLI 应用 migration。结果为：

- 精确新增 `user`、`session`、`account`、`verification` 四张认证表；
- Username/Admin plugin 字段、外键、唯一约束与索引均与第 9 节 footprint 一致；
- 原有 `site_settings` sentinel 保持不变；
- 第二次应用 migration 为 no-op；
- provision 三个 synthetic user 后再次应用 migration，用户与 credential 数据仍保持不变。

因此迁移链路满足“可审、可重放、不破坏既有 application table”的 POC 门槛；它不解除正式上线前独立审查生产 migration 与 backup/rollback 流程的要求。

## 11. Session 与 cookie

稳定版默认 session 参数：

- `expiresIn`：7 天；
- `updateAge`：1 天；
- `freshAge`：1 天；
- cookie cache：默认关闭。

Cookie 默认属性：

| 环境 | 默认名称 | HttpOnly | Secure | SameSite | Path |
| --- | --- | --- | --- | --- | --- |
| local HTTP | `better-auth.session_token` | true | false | Lax | `/` |
| hosted HTTPS | `__Secure-better-auth.session_token` | true | true | Lax | `/` |

cookie 中的 token 由 Better Auth secret 签名。生产 secure prefix 是 `__Secure-`，不是 `__Host-`。`baseURL = https://photo.cosflow.icu` 或显式 secure configuration 应产生 Secure cookie；本地 `http://127.0.0.1:3001` 不应为了模仿生产强塞 Secure cookie，否则浏览器不会回传。

Session 持久化在 `session` 表。`token` 列保存当前 opaque token 本身，而不是 token hash；signed cookie 包裹同一 token。当前核心 schema 没有 token-at-rest hashing option。此差异必须进入安全风险登记，而不能写成“数据库只保存 hash”。

刷新 session 会延长 expiration 并重写同一 session token，不能把它描述成每次 refresh 都 rotation。新登录会创建新 token。

Logout 的稳定版行为是：尝试从数据库删除当前 token，然后清 cookie；若数据库删除失败，源码记录错误但仍清浏览器 cookie。因此：

- 正常成功路径旧 session 不再授权；
- 数据库删除失败时，同 token 在其他客户端仍可能活到 expiry；
- POC 已断言 logout 后旧 cookie 请求被拒绝；
- hosted 可观测性应捕获 delete failure。

推荐 V1 保持 cookie cache 关闭。若未来启用 cache，revocation 可能在 cache max age 内不可见，敏感权限检查仍须 authoritative session。

### POC session/cookie 结果

- local HTTP 登录返回 `better-auth.session_token`，具有 `HttpOnly`、`SameSite=Lax`、`Path=/`，且不含 `Secure`；
- hosted HTTPS auth factory 返回 `__Secure-better-auth.session_token`，具有 `HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/`；
- username/password 登录后 `get-session` 返回正确 user、username 与 email；除无效预置 cookie 外，测试还把一个真实有效的 star cookie 带入 alice 登录，响应会发出新的 alice cookie，原 star cookie 仍解析为 star，不会发生跨用户 session fixation；
- D1 中保存 opaque token 原值，默认有效期约 7 天，credential account 只保存 scrypt hash，未出现测试明文密码；
- `star` 的两个并行 session 在撤销前均经 `get-session` 验证可用，operator 执行 `revokeUserSessions` 后两者均立即失效；`alice` 的 session 不受影响；恶意 Origin 的 revoke 与 logout 均返回 403，且不会改变原 session，随后 exact-origin 操作才生效；
- `alice` logout 后旧 cookie 无法再取得 session；
- `alice` 无权通过 Admin HTTP endpoint 撤销其他用户 session。

这些断言同时覆盖 session 隔离、全部撤销、logout 失效与 cookie 环境差异；没有启用 cookie cache。

## 12. Password 与 session revoke

Email/password 默认使用 scrypt；密码 hash 存入 credential `account.password`。默认 password length 为 8 到 128。

- `changePassword` 要求当前 session/current password；可传 `revokeOtherSessions: true`；
- password reset token 默认一小时；
- reset 默认不撤销 sessions，应配置 `emailAndPassword.revokeSessionsOnPasswordReset = true`；
- Admin plugin `setUserPassword` 后必须显式 `revokeUserSessions`；
- 支持 revoke one、revoke others、revoke all，以及 Admin 按 user 撤销。

本轮只验证 primitives，不实现正式邮件发送、reset UI 或 operator console。

## 13. CSRF、Origin 与 rate limit

### 官方默认防线

Better Auth 的全局 origin middleware：

- 对携带 cookie 的非 GET/HEAD/OPTIONS 请求校验 Origin/Referer；
- 对 callback/redirect URL 校验 `trustedOrigins`；
- 配合 SameSite=Lax cookie；
- email sign-up/sign-in 另有 `formCsrfMiddleware`，覆盖首次无 cookie 登录的 Fetch Metadata/Origin 场景。

禁止设置：

```text
advanced.disableCSRFCheck = true
advanced.disableOriginCheck = true
```

`baseURL` 应显式配置。POC 每个 auth instance 的 `trustedOrigins` 被收紧为严格单元素 `[baseURL]`：拒绝 `*` / `?` wildcard、多 origin、credentials/path/query/hash；HTTP 只允许 `127.0.0.1` loopback，hosted 只允许 HTTPS。local 与 hosted 必须创建各自实例，不能把两套 origin 合并进同一 trust list，也不能依据任意 Host header 扩张信任。

### Username 首次登录的源码发现

从 `v1.6.25` 源码可见，`/sign-in/username` 没有像 `/sign-in/email` 一样挂载 `formCsrfMiddleware`。全局 origin check 在无 cookie 且没有 callback URL 时不会强制验证 Origin。workerd 运行测试确认这不是仅有理论可能性：绕过本项目 adapter、直接调用原始 Better Auth handler 时，带恶意 Origin 的首次 cookieless username/password 请求被接受，并返回 session cookie。

POC 因此在 `/api/auth/sign-in/username` 的 browser POST 前增加 thin guard：必须提供与显式 `trustedOrigins` 完全相等的 Origin；若浏览器提供 `Sec-Fetch-Site`，其值必须为 `same-origin`。实测 adapter 拒绝缺失 Origin、恶意 Origin、host lookalike、scheme/port 不一致与 `cross-site` 请求，同时允许 exact-origin 请求。非浏览器调用可以不带 Fetch Metadata，但仍必须提供 exact Origin；无 Request 的 trusted server provisioning capability 不经过此 HTTP guard。

这是最终 verdict 使用 `ADOPT_WITH_ADAPTER` 而不是 `ADOPT` 的硬性原因。当前证据针对稳定版 `1.6.25` 的 username sign-in route；未来升级 Better Auth 时必须重新运行原始-handler回归测试，只有上游行为和正式安全评审都改变后才能考虑删除 guard。

Better Auth 的 origin/CSRF 只覆盖 `/api/auth/*`。Portfolio 的 `/api/site-content`、未来 Site/Asset mutation 仍需自行执行 session、ownership 和 CSRF/origin checks。

### Rate limit

Better Auth 内置 rate limit，生产默认启用、开发默认关闭；默认 memory storage 不适合跨 Worker isolate 的生产限流。D1 database storage 会新增 `rateLimit` 表，并使用 guarded atomic increment。生产配置应显式写定 window/max 与可信客户端 IP header，不依赖文档/源码可能变化的默认值。

敏感默认规则匹配 `/sign-in*` 和 `/sign-up*`，因此 username sign-in 在路径层面被覆盖。Cloudflare 环境只信任平台提供的 `CF-Connecting-IP`，不能盲信客户端可伪造的 forwarded header。

## 14. 推荐 thin adapter

未来 AUTH-01 只需要小而明确的边界：

```text
createAuthForRequest(env, canonicalOrigin)
AuthService.getSession(request)
AuthService.requireUser(request)
AuthService.provisionUser(command)
AuthService.revokeUserSessions(userId)
AuthService.changeOrResetPassword(...)
AuthPrincipal { userId, username, role }
```

Adapter 负责：

- request-scoped D1/Drizzle/Better Auth factory；
- local/hosted exact baseURL 与 trustedOrigins；
- username first-login exact-origin + Fetch Metadata 补强；
- operator provisioning 的幂等、partial failure 处理；
- stable auth user 到 Portfolio domain principal 的映射；
- 将 `auth` 加入 reserved slug set。

Adapter 不负责：Site repository、SiteSlug lifecycle、Site ownership policy、Site/Asset schema 或正式 Admin 接线。

## 15. `zpg6/better-auth-cloudflare` 评估

资料：

- Repository：<https://github.com/zpg6/better-auth-cloudflare>
- `v0.3.1` release：<https://github.com/zpg6/better-auth-cloudflare/releases/tag/v0.3.1>
- `v0.3.1` package metadata：<https://github.com/zpg6/better-auth-cloudflare/blob/v0.3.1/package.json>
- License：<https://github.com/zpg6/better-auth-cloudflare/blob/v0.3.1/LICENSE>

审计时版本为 `0.3.1`，2026-07-23 发布，MIT license，repository 未归档。它解决的主要 friction 包括：request-scoped Cloudflare context、D1/Drizzle 或 native D1、KV secondary storage、Cloudflare IP/geolocation、R2 helpers、OpenNext/Hono examples，以及 schema/migration CLI ergonomics。

值得参考的模式：

- `createAuth(env)` request factory；
- CLI schema generation 时的 inert/stub adapter；
- 合并 generated auth schema 与 application schema；
- Cloudflare platform IP header 处理；
- OpenNext/Worker examples。

不应直接依赖的原因：

- 它是社区 package，不是 Better Auth 或 Cloudflare 的信任根；
- 仍是 pre-1.0；
- 默认能力范围包含本项目当前不需要的 KV、R2、geolocation 与额外 client surface；
- `0.3.1` peer range 是 `better-auth ^1.5.0` / adapter `^1.5.0`，并未把本项目锁死到已审计的 `1.6.25`；
- Better Auth 官方从 v1.5 起已经直接支持 D1，官方 fixture 已覆盖 D1 + Drizzle + Worker。

结论：`REFERENCE_ONLY`。不加入 production dependencies，不把它的 CLI 当作 migration 权威。

## 16. 已知风险与版本陷阱

### P0

- 当前 POC 未发现阻止继续采用研究结论的 P0。

### P1

- Better Auth `1.6.25` 原始 Username cookieless first-login route 接受恶意 Origin；正式接入必须保留已验证的 exact-origin + Fetch Metadata adapter，并在依赖升级时回归测试。
- Admin `createUser` 的无-header调用是 trusted in-process capability；若错误包成公开 route 会成为 arbitrary user creation vulnerability。
- D1 + Drizzle 多步 user/account 创建非原子；必须设计幂等和 partial failure recovery。

### P2

- `session.token` 以原值存入数据库而非 hash；需在威胁模型中接受或规划后续缓解。
- stable `1.6.25` 没有 `(provider_id, account_id)` composite unique；并发与 1.7 升级前需复核。
- logout DB delete 失败仍会清 browser cookie；需可观测性与 bounded session lifetime。
- distributed Worker rate limit 不能用默认 memory storage。
- cookie cache 若未来开启，会弱化即时 revoke；V1 保持关闭。
- Better Auth 还会读取并追加 `BETTER_AUTH_TRUSTED_ORIGINS` 环境变量；本 POC 未配置该变量。AUTH-01 的部署门禁必须禁止未审 allowlist，或对该变量做同等严格的环境专属验证。

### 版本陷阱

- 不使用 `npx auth@latest`；固定 `auth@1.6.25`。
- `better-auth` 与 `auth` CLI 必须同版；Drizzle adapter 从 `better-auth/adapters/drizzle` 官方入口导入，不另行声明可漂移的 direct adapter dependency。
- `1.7.0-rc.2` 的 account schema 与 1.6.25 不兼容，升级必须单独 migration/backfill audit。
- stable CLI 没有 `create-admin`；不要引用 RC 命令。
- Drizzle adapter 在 D1 上保持 `transaction: false`，不能假装 interactive transaction 可用。

## 17. 可执行 POC 结果

隔离测试命令 `npm run test:auth-poc` 在 Node `22.13.1` 下通过 `1/1`，最终完整回归中的一次耗时约 `46.7s`。测试使用 OS temp 中的独立 D1 state、随机 runtime secret、随机 harness token 与随机 synthetic password；结束后停止自己的 child process 并清除自身生成的 nested build/Worker artifact。它不读取或修改真实用户 SiteContent、照片、manifest 或生产 D1。

| Gate | 状态 | 证据 |
| --- | --- | --- |
| public sign-up denied | `PASS` | `/sign-up/email` 与 trailing-slash 变体均被拒绝；空库 `user`/`account` 仍为 `0/0` |
| anonymous Admin create denied | `PASS` | HTTP Admin `create-user` 无 authoritative admin session 时被拒绝 |
| trusted provisioning succeeds | `PASS` | 官方 server `auth.api.createUser` 创建 operator/star/alice；UUID v4、normalized username、credential hash 均正确；重复创建被拒绝 |
| username/password sign-in | `PASS` | 正确 username 登录成功；错误密码与未知 username 均返回相同 `401` 外部语义 |
| session cookie on local HTTP | `PASS` | `better-auth.session_token`; HttpOnly; SameSite=Lax; Path=/; 非 Secure |
| hosted cookie contract | `PASS` | `__Secure-better-auth.session_token`; HttpOnly; Secure; SameSite=Lax; Path=/ |
| get current session | `PASS` | 返回匹配的 user id、username 与 email；replacement session 在 revoke 前被实际验证有效 |
| logout invalidates old session | `PASS` | evil-origin logout 为 403 且 alice session 仍有效；exact-origin logout 后旧 cookie 失效 |
| revoke user sessions | `PASS` | evil-origin revoke 为 403 且两个 star session 保持；exact-origin operator revoke 后二者均失效，alice 保持有效 |
| cross-user isolation | `PASS` | 使用有效 star cookie 发起 alice 登录会得到新的 alice cookie；原 star cookie 仍为 star；alice 无权调用 Admin revoke |
| synthetic Site ownership | `PASS` | Option B fixture 使用真实 `get-session` AuthUser UUID；star 对自己的 Site 为 allow、对 alice Site 为 deny |
| untrusted Origin username login | `RAW_GAP_CONFIRMED` / `ADAPTER_PASS` | 原始 handler 接受恶意 Origin 并发 cookie；adapter 拒绝 missing/evil/lookalike/scheme/port/cross-site，只接受 exact origin |
| vinext Request/Response route | `PASS` | nested catch-all route 通过标准 `auth.handler(Request)` 运行，并成功 production build |
| workerd D1 persistence | `PASS` | migration、provision、session、重启阶段查询与 migration replay 均保留预期数据 |
| D1 migration coexistence | `PASS` | 只新增四张 auth table；既有 `site_settings` sentinel 保持不变；重放为 no-op |
| isolated client artifact audit | `PASS` | 7 个 client 文件，共 `272551` bytes；不含 Better Auth runtime、环境键、随机 runtime secret 或 harness token |
| repository lint/test/build/bundle/public safety | `PASS` | `git diff --check`、lint、完整 `npm test`（含 build/bundle）、独立 build、bundle 与 public safety 均通过 |

### Dependency 与 bundle 影响

- `package.json` 仅新增 pinned `better-auth@1.6.25` production dependency 与同版 `auth@1.6.25` dev CLI；官方 Drizzle adapter 通过 `better-auth/adapters/drizzle` re-export 使用，不另加可漂移的 direct dependency。
- lockfile package entries 从 `709` 增至 `795`（`+86`、`0` 删除）；`package-lock.json` 为 `+1353/-71` 行，约 `378,778 -> 437,394` bytes；`package.json` 为 `+4/-1` 行。
- 最终完整回归中的 isolated nested build 约 `3.14s`；client 输出 `272,551` bytes / `7` files，server/Worker 输出 `2,345,662` bytes / `14` files。两者都经过随机 secret/token 全文件扫描。
- 根 production app 没有导入 research auth 模块；根 `dist/client` 对 `better-auth|AUTH_POC_` 为 `0` 命中，bundle 门禁仍为 `499.2 KiB JS / 229.3 KiB CSS`、最大 lazy template `45.0 KiB`。因此本 POC 的 Auth server code 没有进入公共 template client bundle。
- 以官方 npm registry 运行的只读 `npm audit --omit=dev` 报告当前仓库 `9` 项（`4 high / 5 moderate / 0 critical`）。高风险项来自既有 Next/Sharp/PostCSS/Nanoid 链；Better Auth 条目是经仓库既有 `drizzle-kit`/esbuild 工具链归因的 moderate。它不改变本 POC verdict，但依赖升级与 advisories 必须在 AUTH-01/launch gate 单独处理，不能执行自动 audit fix。

## 18. Adoption verdict

`ADOPT_WITH_ADAPTER`

采用核心：Better Auth stable `1.6.25` + official Username plugin + official Admin plugin + official Drizzle adapter。它满足真实 email、username/password、关闭公开注册、可信 provisioning、session/cookie、logout/revoke、password primitives 和 UUID user ID 的基础要求。

需要 adapter 的原因不是重写 Better Auth，而是明确承接：vinext framework-neutral handler、runtime D1 binding（AUTH-01 再按正式 tenancy 决定 request factory）、被运行测试证实为必要的 username first-login exact-origin 防线、operator provisioning 幂等/故障恢复，以及 Option B AuthUserId 到 Portfolio UserId/ownership 的 domain seam。

POC 不需要 patch Better Auth source，也没有引入社区 Cloudflare wrapper。它证明该组合可继续进入未来独立 AUTH-01 设计，但本研究本身不切换生产认证、不新增正式登录页、不接入 Admin，也不授权开始 LAUNCH 主线实现。
