# LOCAL_ACCOUNT_FOUNDATION_01

## 授权与当前状态

基线 `main@92a81ee274ab9d7df829c7437219f0f42c273390`；分支
`feat/local-account-site-foundation`。本轮有限解冻本机 PostgreSQL、身份、登录、
Site 和模板使用授权；不是生产 Auth 上线。远程部署继续冻结。

```text
FOUNDATION_IMPLEMENTATION = INCOMPLETE (verification in progress)
LOCAL_POSTGRES_VERIFIED = NO (Docker engine currently unresponsive)
STAR_PROVISIONING = WAITING_FOR_OPERATOR_INPUT
CONTENT_MIGRATION = NOT_STARTED
REMOTE_DEPLOYMENT = NOT_AUTHORIZED
```

## 运行时与版本

同一 Next 应用、同一认证配置；不复制应用或建立第二套认证服务。
原 3001 vinext/workerd + D1 路径保持；本机 Node 验证使用 3003，隔离测试使用 3004。
`.node.ts(x)` 路由扩展仅由 Standard Next 配置识别，Worker 不加载认证依赖。
普通生产启动没有本机启用配置及 socket runner proof，身份操作失败关闭。
构建过程不连接 PostgreSQL，不读取账号库。

- Better Auth 与官方 `auth` schema CLI：精确锁定 `1.7.6`。
- Drizzle ORM 保持 `0.45.2`；PG 驱动 `8.23.0`，类型 `8.23.1`。
- 用户明确同意最小安全升级：Next 与 eslint-config-next `16.3.3`。
  原 `16.2.6` 命中 [Windows RCE 公告](https://github.com/advisories/GHSA-p293-qw3h-jr36)。
- 已查看 [发行记录](https://better-auth.com/changelog)、
  [安全公告](https://github.com/better-auth/better-auth/security/advisories)、
  [Drizzle 适配](https://better-auth.com/docs/adapters/drizzle)、
  [运营 createUser](https://better-auth.com/docs/plugins/admin)。
- 不搬用 PR16 的 Cloudflare/D1 POC；保留其研究状态。

## 数据与权限

官方 CLI 生成 `db/accounts/auth-schema.mjs`，包括 username/admin 插件及私有开户标识。
`db/accounts/schema.mjs` 添加四张业务表：开户意图、PortfolioUser、Site、模板授权。
AuthUser UUID、PortfolioUser UUID、Site UUID 相互独立；username、email、slug 唯一规范化，
第一版 owner 唯一保证一人一 Site。保留用户名覆盖系统路由及静态资源入口。

链路：真实 HttpOnly cookie 会话 → auth_user_id 唯一映射 → 完成开户的 PortfolioUser
→ owner 条件限定的 Site → 此 Site 的模板授权。显式 siteId 和 owner 在同一 SQL 中过滤。
免费十一模板由服务端固定目录赋权；`polaroid-field` 不等于 `premium-polaroid`。
高级授权来源仅 `operator-test`；Auth role 始终 `user`。

运营开户先持久化不含密码的 intent，然后持有 advisory lock，用同一个 PG PoolClient
事务调用官方 `createUser`（由认证库哈希），建立业务关系、授权和完成标志。
Drizzle adapter 显式 `transaction:false`，避免嵌套事务；故障回滚 Auth 与业务写入，
intent 保留。重跑只恢复同组规范化输入；已完成不改邮箱、密码或授权。
不同用户名/邮箱/slug 冲突明确停止，既有无关 AuthUser 不被接管。

## 安全界限

- 服务端 `disableSignUp`，HTTP 再白名单限制 username 登录、退出和撤销会话；无 Admin HTTP。
- 会话 24 小时，cookieCache 关闭，退出/撤销后查库拒绝旧 cookie。
- 本机 HTTP cookie 为 HttpOnly、SameSite=Lax，非 Secure；未来 HTTPS 必须另行启用 Secure。
- 写操作要求精确 Origin，拒绝跨站 Fetch Metadata 和客户端转发头；不信任旧 oai 身份头。
- 本机 runner 先验证 socket 与 Host，覆盖随机 proof；仅内部 Next 补充的头被移除。
- 显式开发限流：username 登录每 60 秒最多 10 次，错误不区分账号存在与否。
- 不传 session token 给页面脚本、不使用 localStorage，不支持任意 next/returnTo。
- 邮箱保持未验证。本轮受邀本地测试允许未验证邮箱登录；无发信、找回密码或邮件验证平台。
- 旧 `/admin` 与 `/preview/admin` 尚未接入这套身份系统，不能据此宣称它们已受保护。

## 本机操作

使用 Node >=22.13，项目根目录执行。配置 `.env.accounts.local` 与 `.env.accounts.test`
被 Git 和容器忽略；init 不覆盖已有配置，随机密码不打印。不要将配置内容粘贴进聊天或 PR。

```sh
npm run accounts:db -- init
npm run accounts:db -- up development
npm run accounts:db -- up test
npm run accounts:migrate
node --env-file=.env.accounts.test scripts/account-migrate.mjs
npm run build
npm run accounts:start
# http://127.0.0.1:3003/login
npm run accounts:provision
npm run test:accounts
npm run accounts:db -- status development
npm run accounts:db -- stop development
npm run accounts:db -- stop test
```

开户 CLI 交互填写 username=star、slug=star、真实邮箱、内部测试授权；密码不回显。
没有默认邮箱/密码。不在命令行参数传凭据。当前尚未获得这些真实输入，因此不创建 star。
停止 Node 用启动终端 Ctrl+C。Compose 项目 `frame-zero-accounts`，开发与测试分别
loopback 55432/55433，命名卷 `frame-zero-accounts_development-data` /
`frame-zero-accounts_test-data`。stop 保留卷，禁止 down -v。测试清理仅限明确测试库，
先核对 current_database，再清理显式列出的表，不使用 CASCADE。

Schema 再生成：
`node node_modules/auth/dist/index.mjs generate --config db/accounts/auth-generation.mjs --output db/accounts/auth-schema.mjs --yes`。
迁移生成：`node --env-file=.env.accounts.local node_modules/drizzle-kit/bin.cjs generate --config=drizzle.accounts.config.ts`。
迁移目录与旧 SQLite 的 drizzle 完全分离；没有 GET/启动时建表或 schema push。

## 独立内容与共享作品库（下一轮边界）

同一 Site 的基础版与高级拍立得分别拥有摄影师资料、文案、套餐、联系方式和配置。
保存范围是 Site + 模板产品/编辑器身份，各自版本冲突互不覆盖。账号邮箱/名称不是
公开摄影资料的权威来源。可未来显式复制一次作为起点，复制后不自动同步；本轮不实现。

未来同一 Site 共享 Asset 引用而非复制照片；不跨 Site 暴露素材；移除模板引用不删除素材。
删除素材前需汇总各内容空间引用。图集、封面、排序、裁切、排版仍允许按模板独立，
不合成强制全局配置、不做万能表单引擎。

记录 1 与 2601、SQLite、本机照片与 manifest 不迁移、不复制、不双写。
本轮没有公共 profile/packages/contact 业务表或资源迁移表。

下一轮才实施 `/` 平台介绍、`/:siteSlug`、`/:siteSlug/admin` 与 `/test` 对照区。
本轮仅 `/login` 和必要身份读取；不把全局 2601 同时伪装成多个用户站点。

## 验证记录

验证进行中；真实 PostgreSQL 集成检查独立列入 CI，不以 mock 或 SQLite 代替。
最终结果在本文件收口后记录，不把代码、CI、本机 PG 和真实开户合并称为完成。
