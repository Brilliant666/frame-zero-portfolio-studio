# 生产上线差距审计与最小上线计划

审计日期：2026-10-27（UTC+8）。审计分支：`docs/production-readiness-audit`。
代码基线：main `58a92d2fd419af4e1ebaf1b57ad48ba7cab2a406`（PR46 Squash）。
面向本人或少量受邀摄影师，不以开放注册、收费 SaaS 为前提。

## 结论

**产品的账号、Site、素材、草稿、发布业务核可以复用；现有生产部署仍是 Stage A2 安全骨架，尚未接通这些业务。**
只把当前镜像部署到域名上，不会得到本机已有的真实摄影站点与后台。

当前最重要的差距是：

1. 生产运行时、可信 HTTPS 入口、项目 PostgreSQL 与私有素材持久化尚未接通。
2. 锁定的 Next／图像处理依赖与 Node 基础镜像落后于已发布安全更新，需要先做有界安全升级与兼容验证。
3. 缺少仓库可重复执行的现有 PostgreSQL＋素材一致迁移、异机备份及隔离恢复证据。
4. 开放上传前需处理清理异常的并发名额释放，并补请求体、容量和中断失败边界。
5. 真实目标服务器的 HTTPS、同机共存、业务健康、故障通知及完整编辑发布链尚未验收。

建议先做 **PR-A：生产依赖安全基线**，随后做 **PR-B：接通生产 Site 运行与持久化**。
前者处理任何公网入口都要面对的已知版本风险，后者解决“本机可用而生产不能承载真实 Site”的主要功能阻塞。
本报告只是审计与计划，以下措施均未实施。

## A. 基线、方法与限制

本轮新证据：读取合并后的源码、锁文件、部署配置、测试和有效记录；在线核对官方安全公告；
GitHub 实时核对 PR46、审核线程、仓库规则、文件树和实际 main push CI。
独立复核了账号入口、公开 Site、素材处理、代理路由和健康检查的关键控制流。
本机仅核对进程、端口、构建标识和健康响应，不保存或发布真实内容。

历史证据：现有五项 CI 的真实运行结果、测试源码及此前有边界的本机验收记录。
“测试存在且本次 CI 成功”不等于本轮重新执行了所有测试，更不等于已经验证真实 Linux／HTTPS／实体手机。
本轮没有新构建、安装依赖、创建完整环境副本、访问服务器、执行故障注入或业务数据写入。

未读取真实凭据、数据库内容、私人照片或私人备份；本机交接仅用于确认运行目录及保留关系。
服务器端口、现存代理、域名／证书、PG、磁盘、外部备份和告警均 **UNKNOWN**。
本报告不包含私人路径、原始诊断或账号配置。

PR46 合并前 Head 为 `b8f27e79f3c1927a1ed300eb969988136f3143ab`，
Squash 后 main 为上述基线；两者 Git tree 均为 `f4d311fa4af3996ca54ab404407fee8f489f7411`。
原工作分支、工作区及回退保留；未因合并部署或重启日常应用。

实际 Squash SHA 的检查全部是 `event=push / branch=main / attempt=1 / conclusion=success`：

| 检查 | main push 证据 |
| --- | --- |
| Quality | [40522257729](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40522257729) |
| Public repository safety | [40522257679](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40522257679) |
| Container | [40522257632](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40522257632) |
| Deployment Bootstrap | [40522257623](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40522257623) |
| Local Account PostgreSQL Integration | [40522257657](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40522257657) |

判定用语：**已实现且已验证**仅指列明的环境与路径；**已实现待目标验证**、**仅文档／计划**、
**缺少实现**、**UNKNOWN**分别列出，不把没有测试证据直接等同于已发生缺陷。

## B. 当前能力与证据矩阵

| 能力 | 判定 | 当前证据及可复用边界 |
| --- | --- | --- |
| Standard Next standalone、非 root 容器、Node PID1、SIGTERM、CMD override | 已实现且已验证（CI） | [Dockerfile](../Dockerfile#L28)；`scripts/verify-production-container.mjs:193–283,318–325`。PR44 的缺省／null／空 Entrypoint 兼容保留，不能重建一套启动平台。 |
| Compose 生命周期与日志轮转 | 已实现待目标验证 | `scripts/deployment-bootstrap.mjs:147–222`；`deploy/compose.yaml:36–40,88–92`。已有幂等启动、更新、回切和每服务约 3×10MiB 日志限额；不等于业务恢复演练。 |
| 账号、受邀开户、会话、退出与撤销 | 已实现且已验证（本机隔离 PG／HTTP） | `db/accounts/auth-options.mjs:9–22`；`tests/local-accounts.test.mjs:356–396`。禁止公众注册，24h 会话、关闭 cookie cache，固定错误且不向 JS 返回 session token。生产 HTTPS 尚缺适配与证据。 |
| Site owner、grant、跨 Site 拒绝、三个内容空间 | 已实现且已验证（本机隔离） | `db/accounts/http.mjs:34–45`；`app/site-editor/server.ts:7–26,55–67`；`tests/local-accounts.test.mjs:305–339`。复用权限与资源归属，不合并三套内容。 |
| 草稿 CAS、409、发布快照、回退、Published-only | 已实现且已验证（本机集成） | `db/accounts/publications.mjs:59–67`；`tests/flow-gallery-http-integration.mjs`；`tests/site-template-browser-matrix.mjs:147–337`。生产接入不得降低并发与快照边界。 |
| 新上传原图和三档展示图 | 已实现且已验证（隔离测试） | [assets.mjs:91–103](../db/accounts/assets.mjs#L91) 保存原字节并生成最长边 480／1100／2200 的 WebP；`tests/site-assets.test.mjs:34–59`、`tests/site-assets-integration.mjs:17–55` 验证原字节、去重、访问与重启持久化。不能报告“普遍缺原图”。 |
| 公开／私有媒体与缓存撤回 | 已实现且已验证（本机集成） | `app/site-editor/assets-server.ts:6–19`；`app/api/public-sites/[siteSlug]/assets/[assetId]/[variant]/route.node.ts:9–20`；`db/accounts/public-asset-response.mjs:13–27`。公开仅三档变体，先重查当前 Published 成员再 304；原图始终私有。 |
| 上传基本限制与恢复表达 | 已实现；部分异常待验证 | `db/accounts/assets.mjs:6–10,30–48,68–109`：服务端 25MiB／4000万像素、格式与比例校验、2并发、30s读取和每个变体的Sharp处理上限15s。`app/admin-kit/library-upload.ts:2,18–31` 前端20MiB，429最多重试3次，断线等标记结果待核对。 |
| 十一套基础与两类高级的非空流程 | 已实现且已验证（生成照片 CI） | `tests/site-template-browser-matrix.mjs:147–210` 给十一套各配两张生成图片，覆盖当前编辑预览／已存草稿／公开页、大图、联系入口；不是只有空库。`:226–337` 覆盖拍立得四图集和独立内容；`tests/flow-gallery-ux-browser.mjs:25–26,612–624,1132–1162` 覆盖Flow多视口分类预览／返回和公开照片。不是全部槽位、真实大图库或实体手机证据。 |
| 首屏素材与动效执行优化 | 已实现；真实设备待验证 | `app/site-editor/flow-gallery-view.tsx:16–19` 轨道 card、大图 full、响应式源；`app/templates/polaroid-field/entry-photos.ts:1–48` 复用同源解码；PR45/46 保留原运动并修正前景测量。局部调用优化不证明整体 FPS。 |
| 本机验收与 legacy 门禁 | 已实现且已验证（CI） | `app/test/layout.tsx:9–13` 与 `tests/next-node-runtime.test.mjs:191–201`；全局 `PUT /api/site-content` 已410。本机 Host 头写绕过不是当前事实；旧全局 admin 仍依赖入口拒绝，生产适配须保留。 |
| 生产 Site runtime／PG／素材卷／业务代理 | **缺少实现** | 见 C1：当前业务核被本机 origin、loopback、runner proof 约束；Stage A2 Compose 与代理没有业务通路。不是只填几个 env 就已具备。 |
| 当前 PG＋素材一致备份、迁移、异机恢复 | **仅文档／计划；仓库未找到可执行闭环** | `docs/SELF_HOSTED_V1_ROADMAP.md:416,492–497`。schema migration、legacy SQLite importer 和应用镜像回退不能替代。私人备份是否可用为 UNKNOWN。 |
| 业务 readiness、磁盘／备份失败通知 | 部分缺少实现；外部能力 UNKNOWN | `app/api/health/ready/route.ts:6–11` 恒返回200，未探测PG／素材；已有日志和限额，未找到业务告警交付。目标机外部监控未读取。 |

## C. 分级问题与最小处置

### 上线阻塞（按阶段，非全部 P0）

**C1｜生产业务通路未接通——真实 Published Site 只读、受邀编辑、正式 V1。**

- 证据：`scripts/lib/account-config.mjs:3–24` 限定本机开关、环回PG和固定HTTP origin；
  `db/accounts/http.mjs:5–20` 还要求 Node 账号 runtime 与随机 local proof。
  `scripts/start-local-accounts.mjs:20–38` 只在环回 socket／Host 核验后注入 proof。
  标准镜像 `Dockerfile:53` 直接 `node server.js`，`deploy/compose.yaml:11–23` 没有账号配置、PG接入和私有可写素材卷。
- `/star` 不是脱离数据库的静态页：`app/site-editor/public-server.ts:13–26` 与公开图片 API 也依赖该 runtime。
  `deploy/caddy/portfolio-proxy.caddy:14–23,49–61` 明确拒绝登录、租户后台及其他 API，并剥 Cookie。
  这是早期安全契约的有效实现，不能误判为一次回归，也不能直接删除门禁。
- 最小措施：新增严格生产配置／可信入口适配，复用当前 owner、grant、草稿、快照与素材业务核；
  接入项目PG、私有持久素材根和UID1000权限，按路由／方法放行所需接口。
  不公开 local proof，不把 localhost 白名单直接扩大成任意 Host。
- 验收：一次性隔离 Linux 环境中验证公开 Published 图片、登录→上传→当前图集归属→草稿→预览→发布；
  重启／应用替换后数据保持；匿名私有资源、跨Site、无grant、错误Host／Origin和伪造转发头继续拒绝。

**C2｜公网安全依赖基线待刷新——所有公网应用入口。**

- 锁文件实值：Next `16.3.3`、直接 sharp `0.34.5`、Next 嵌套 sharp `0.35.4`、React `19.2.6`、Better Auth `1.7.6`、pg `8.23.0`。
  `Dockerfile:5,28` 固定 Node `22.22.3-bookworm-slim` 及摘要；本机PG集成workflow使用Node `22.13.1`，不是目标镜像版本。
- [Next 2026-10-14 官方更新](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
  及 [SVG Image Optimization 公告](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)
  将上述Next版本列入受影响范围，修复版为16.4.1，图像路径缓解要求其实际使用的sharp至少0.35.5。
  [Cache Components 公告](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) 的触发有特定返回值条件；
  [Server Actions DoS 公告](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) 要求至少一个Server Action。
  本仓库未发现 `use server`／`use cache` 声明，也未启用cacheComponents，不能据版本号声称这些攻击已在本项目复现。
- Next配置未显式关闭图像优化，镜像为glibc Linux；SVG优化实际可达性和构建最终依赖解析未做攻击验证。
  自有上传白名单拒绝SVG，不等于已经证明所有Next图像入口不可达。
  这里确认的是版本与官方修补范围不一致，不是已证实当前站点可被RCE。
- [Node 2026-10-21 官方安全更新](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
  提供22.23.4修补版本；当前镜像早于它。具体DNS、TLS、Brotli等触发取决于实际调用，未逐项复现。
- 最小措施：独立升级与核对生产实际解析的Next／React兼容组合、直接及嵌套图像依赖、Node基础镜像摘要；
  对Better Auth／pg及传递依赖补同日官方／锁文件安全核对。本次不是完整依赖审计，未核对项不声明安全。
- 验收：可重现锁文件与镜像版本、既有五项CI、重点上传／SSR／动效／容器运行回归；不得仅刷新浮动标签。
  本轮未更新依赖；未来实施前应再次核对届时公告与修补版本。

**C3｜HTTPS身份、请求边界与上传异常尚不满足外部写入闭环——受邀编辑、正式 V1。**

- 本机已有精确Host／Origin、cross-site和proof保护；`auth-options.mjs:9–18` 使用本机trustedOrigin、
  `useSecureCookies:false`、HttpOnly／SameSite=Lax和空转发IP头列表。这是本机HTTP设置，不能直接作为生产HTTPS契约。
- 登录已启用10次／60秒规则（`:12`，`tests/local-accounts.test.mjs:497–506`已有429测试），并非无限制。
  计数存储、真实客户端IP／代理信任、进程重启后的限流范围仍需在单实例生产模型下确认，不默认要求Redis。
- `db/accounts/http.mjs:59–60`、`app/site-editor/server.ts:44–45` 先读完整请求再检查大小；当前代理未设置业务请求体上限。
  对外开放前应加入口大小／超时边界，保留内部校验；上传已有流式上限也应与代理一致。
- 已确认控制流问题：`db/accounts/assets.mjs:107–109` 先等待目录清理再 `processing--`。
  若清理因锁／权限失败，释放语句被跳过；重复发生可耗尽2个名额，持续429直到重启。
  未注入该故障，也未声称它已在日常发生。最小修复为嵌套finally保证释放并记录固定错误，隔离测试清理失败。
- 文件先写最终目录、后插入DB（`:87–108`）；硬退出可能留下无DB引用目录。
  普通异常清理已测，不等于ENOSPC／断电一致性已证明。
  先补有界故障测试、只读一致性检查和人工处理说明，不自动删除孤儿文件或建设GC平台。
- 验收：HTTPS Secure Cookie、正确及错误Origin／Host、退出／撤销／过期、真实代理下限流；
  超大体／慢请求／并发／清理失败／磁盘满／中断／重启后核对成功资源与元数据，不改409和归属断言。

**C4｜现有真实数据的搬迁与可恢复性未形成交付——真实Site迁入前；尤其权威写入前。**

- 当前迁移对象是已有项目PostgreSQL、Site和私有assets，不是重新执行legacy开户导入。
  `db/accounts/schema.mjs:16–73`、`publications.mjs:59–67` 关联owner、grant、三空间草稿、Asset UUID、历史与当前Published指针；
  `assets.mjs:19–22` 使用相对键，不依赖Windows盘符或旧manifest。
- `scripts/account-migrate.mjs` 仅做schema migration，`legacy-import.mjs` 仅处理旧来源；
  镜像rollback也不是数据恢复。所查仓库未找到当前PG＋素材一致备份／恢复执行流程，不能推断私人备份不存在。
- 最小措施：在单独授权的有界写入暂停窗口取得完整项目PG与关联assets一致快照，生成文件键／数量／摘要清单；
  保留ID、草稿revision、Published指针、历史、授权和迁移记录。Linux仅调整根路径与权限，不重新Provision。
  建立受保护异机副本，在隔离目标恢复并核对关联与读取；真实切换另行授权。
- 验收：恢复后登录、三个草稿、历史／当前公开版本、图片摘要与成员关系匹配，私有拒绝正常，恢复后写入可用。
  先确认允许数据丢失量和恢复耗时目标；不能以“备份文件生成成功”代替恢复演练。
  应用回退先核对schema兼容，保留切换后新增业务数据，不能用旧数据库覆盖代替应用回退。

**C5｜目标部署与最小运维证据不足——公网阶段的目标验收；正式V1的持续保障。**

- `scripts/lib/deployment-config.mjs:111–116` 当前production profile要求本项目Caddy占用0.0.0.0:80／443；
  未读取服务器，不能假设端口空闲或必须再部署独占代理。先只读盘点，再决定复用现有TLS入口或经确认独占。
- `ready/route.ts:6–11` 恒200；`deployment-bootstrap-runbook.md:209–210` 也明确不代表PG／Auth／Asset健康。
  接通业务时补有界依赖预检／readiness；live保持轻量，不让探测输出凭据或执行迁移。
- 已有日志、轮转和敏感哨兵检查，缺的是新业务路径的目标日志抽查，以及5xx、磁盘余量、备份失败／过期的可发现性。
  若目标已有监控应复用；没有时先做简单状态检查、低频检查和失败通知，不建设新平台。
- 验收：真实HTTPS、共存入口、异常依赖返回非ready、存储权限与容量、故障日志脱敏、备份失败能通知责任人；
  用两个不同应用版本演练更新／兼容回退。现有bootstrap在`:350`将同一image A再tag为B，不能冒充不同业务版本回退。

### 上线前建议

| 项目 | 影响与证据 | 最小处置／验收 | 阶段 |
| --- | --- | --- | --- |
| 容量预算与人工上限 | 有每文件／进程并发限制，未见Site总存储配额；目标内存、磁盘未知 | 先按受邀人数和现有素材量定磁盘余量、上传预算、日志／备份保留和满盘处理；跑两并发资源测量，不宣称已测容量 | 受邀测试前确定；扩大规模前落实强制配额 |
| 手机／弱网／大图库 | CI生成素材不能代表实体机解码、GPU、上传中断和海量分页 | 用获授权的隔离样本做320／390及桌面代表流程、真实弱网与会话过期；不要求重设计所有后台 | 受邀阶段补重点；正式V1确认支持边界 |
| PR35内嵌返回风险 | 见下节；位置可能恢复不准，当前无证据指向发布内容损坏 | 维持原断言／超时，生产前单独决定修复或明确接受适用范围；有新证据才重开定位 | 不阻塞纯匿名展示；编辑上线需独立决策 |
| 文档阶段漂移 | README顶部仍是PR43，本路线图含早期阶段措辞，而当前已合并PR46 | 发布实施时同步真实运行方式、用途和阶段；本轮仅在Current／Handoff加入最新入口 | 对外使用前 |
| 聚合预算与真实体验 | `scripts/check-next-build-budget.mjs:90–93` 聚合JS／CSS仍为warning；模板chunk／产物结构另有硬断言 | 保留真实含义，记录目标设备首屏、请求和内存证据；不是凭CI绿灯宣称性能达标，也不在本轮改评分门禁 | 上线前观察，按证据处理 |

### 上线后优化

按实际瓶颈再考虑CDN、对象存储、多副本、跨进程队列、强制配额自动化和资源回收。
不把Redis、微服务、公众注册、付款、新模板或全后台重设计作为本次上线前提。
旧导入资源的 `legacy-derived-only`／原图未映射来源说明应保留（`tests/site-legacy-import-integration.mjs:61–63`）；
是否补原图由产品承诺决定，不因少数历史资源没有原图而一律阻塞摄影展示。
North Star对正式V1原图／变体的要求不在本轮改写；新上传已实现，历史例外需明确承诺。

## D. 完整链证据与已知风险

| 链路 | 有效证据 | 不应外推为 |
| --- | --- | --- |
| 受控开户→登录→Site／grant | `tests/local-accounts.test.mjs` 的一次性PG测试和已有本机运行记录 | 公众注册已开放；本轮重新开户；生产HTTPS已通过 |
| 上传→成员归属→跨图集筛选 | `tests/site-assets-integration.mjs`、PR44上传修复回归与此前有界浏览器验收 | “先不加入”独立上传完成、Flow内部选片上传专项、真实弱网全部已测 |
| 编辑→CAS保存→预览→发布→匿名→修改→回退 | PG集成、`tests/flow-gallery-http-integration.mjs`、模板浏览器矩阵；此前真实持久化只限记录列明的路径 | 本轮对真实账号写入，或目标容器＋HTTPS＋真实Site全链已验收 |
| 十一套基础模板 | 每套两张生成照片；1440／390全部，320只对指定模板补测，当前／已存／公开及大图 | 每套320、所有槽位／真实摄影比例／大图库／物理设备全部通过 |
| 两类高级空间 | 非空隔离内容、独立空间、1440／390／320主要预览与公开路径；本机真实照片历史观察 | 每种主题／构图／异常全组合或所有真实账号都已验收 |
| 自动保存／异步素材恢复 | PR44／46回归，保留409、迟到请求、失败保留旧素材与重试边界 | 所有网络失败及会话过期无损恢复已在实体手机验证 |

既有风险继续保持：

```text
PREVIEW_RETURN = UNRESOLVED
RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE
```

[首次失败38709416138 attempt1](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/38709416138/attempts/1)、
[本机风险接受评论](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/35#issuecomment-6213969172)
及 [既有诊断](design/PR35_OCT15_CLOSEOUT.md)继续保留。
手机高级拍立得内嵌预览返回图集首页时可能恢复到不准确的位置；原±2px、封面焦点、后台scrollY断言和超时未放宽。
本机接受不自动成为生产接受；后续绿灯也不能证明首次失败根因修复。
本轮不重复复现，不因文档审计把它改为FIXED／误报／低频。

## E. 三种上线范围

| 范围 | 已有条件 | 必要差距与现在可做的工作 | 仍需输入／独立授权 |
| --- | --- | --- | --- |
| 公网只读展示 | 平台首页匿名示意素材、standalone和安全容器骨架；Site Published业务与媒体边界已有本机实现 | 仅平台`/`可先做目标部署配置验收，但不能称真实摄影Site已上线；真实`/:slug`仍需C1生产PG／素材读取与公开API、C2安全基线、C4一致迁入、C5 HTTPS共存验证。可先做隔离生产通路，后台保持关闭 | 域名／TLS及已有入口拓扑、服务器资源、真实素材可公开范围、迁移／部署授权 |
| 本人／少量受邀用户可编辑上传发布 | 现有账号、grant、图库、草稿、预览、发布与回退可复用 | 只读条件外，加C3 HTTPS会话与写请求／上传异常边界、C4恢复演练、业务readiness与最低容量／失败通知；明确预览风险生产决策。先在一次性隔离数据中闭环 | 受邀人数、容量／恢复目标、开户流程、风险接受、实际业务切换授权 |
| 正式V1 | 以上代码基础与CI、视觉和部分真实素材验收可作为基线 | 加异机恢复、不同版本兼容回退、真实设备与故障路径、可发现的运维失败；确认North Star支持范围与历史资产原图例外。不能靠“CI全绿”宣布V1 | 支持的设备／浏览器、可接受恢复时间／丢失量、运维责任人及最终上线认可 |

原[North Star](PORTFOLIO_PLATFORM_NORTH_STAR.md)和[路线图](SELF_HOSTED_V1_ROADMAP.md)继续作为目标。
M1–M5并非重新开发清单；已有本机业务的生产适配才是当前差距。
若只做少量受邀单实例，可用现有PG＋私有本地文件盘＋简单异机备份，不默认增加新的基础设施。

## F. 最小实施顺序（后续另行授权）

| 顺序 | 建议交付 | 类型、范围与验收 |
| --- | --- | --- |
| **PR-A，推荐先做** | **生产依赖安全基线** | 代码／锁文件／基础镜像更新。依官方公告核对实际解析版本，做最小兼容升级；复用五项CI，加必要图像、SSR与容器回归。只处理安全基线，不借机改UI。移除已知版本范围问题，才能把新的生产通路建立在可公开运行的依赖上。 |
| PR-B，依赖A | **接通现有Site生产运行与持久化** | 生产配置、可信HTTPS代理、PG／私有素材卷、精确公开／受邀路由、有界readiness与请求限制；同组修复上传清理名额释放。一次性Linux隔离PG验证完整纵向链、跨Site拒绝、重启持久化与异常边界。复用现有业务核，不改三空间模型。入口拓扑先确认，优先兼容已有反代。 |
| PR-C，依赖B的数据与配置契约 | **现有PG＋素材迁移、备份与恢复闭环** | 小型运维脚本／文档／隔离演练，不建设管理平台。支持明确来源／目标、只读清单与摘要、一致快照、异机保留、失败状态、干净恢复及schema兼容回退；保留全部现有ID／指针。先隔离验证，真实导出迁入与切换另获授权。 |
| 目标部署验收，依赖A–C | **真实HTTPS小范围试运行** | 主要为配置、部署与验收；只有配置／记录需要入库才开PR。只读盘点目标服务器，选共存方案；单独授权部署与真实数据迁移后验收登录、上传、发布、匿名读取、退出、恢复与故障通知，实体手机补重点。再决定正式V1，不默认新增开发PR或公开注册。 |

PR-A可以先实施而无需接触服务器或真实数据；PR-B的目标拓扑／配置决策需用户提供信息，不能由本报告猜测。
PR-C必须在目标环境成为真实权威写入环境前完成；不能把备份恢复无限延后到上线后。

## G. 本轮检查与停止点

本轮只新增此报告并小幅更新当前检查点／交接链接。原始证据留在本机，不随报告公开。
文档差异、相对链接和公开安全检查另以本分支最终Head结果记录；不为审计重复构建或搭建数据库。
审计PR沿用既有五项CI，不改workflow、断言、超时或分支规则。文档PR的新CI结果只证明其实际检查范围。

```text
PR46 = MERGED (SQUASH)
PR46_MAIN_PUSH_CI = 5/5 SUCCESS
PRODUCTION_READINESS = NOT_YET_DEMONSTRATED
AUDIT_IMPLEMENTATION = NOT_PERFORMED
PREVIEW_RETURN = UNRESOLVED
RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE
DAILY_VERSION_UPGRADE = NOT_PERFORMED
BUSINESS_DATA_AND_PUBLISHED = UNCHANGED
NEW_FULL_ENVIRONMENT_COPIES = NONE
```

审计分支保持Draft，不合并。本轮到此停止；不自动开始PR-A、部署、迁移或生产修复。
