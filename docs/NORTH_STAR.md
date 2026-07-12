# FRAME//ZERO 北极星计划

> 面向 Codex、维护者与未来贡献者的长期产品与技术执行纲领\
> 建议仓库路径：`docs/NORTH_STAR.md`

------------------------------------------------------------------------

## 0. 文档控制

  ----------------------------------------------------------------------------------------
  字段                                值
  ----------------------------------- ----------------------------------------------------
  项目                                FRAME//ZERO Portfolio Studio

  文档状态                            Proposed / 待采用

  版本                                1.0

  基线日期                            2026-07-11

  当前仓库                            `Brilliant666/frame-zero-portfolio-studio`

  当前基线分支                        `main`

  当前基线提交                        `782a8e0b6ecedaebce6f14742502acc1653d3551`

  当前产品形态                        私人摄影主页

  长期产品形态                        可开源、自托管、支持多用户制作与发布摄影主页的平台

  本文档用途                          约束长期方向、阶段目标、架构边界、Codex
                                      执行方式和验收标准

  复审频率                            每完成一个阶段，或至少每 6 周复审一次

  最高优先级原则                      安全与数据隔离 \> 可恢复性 \> 正确性 \> 用户体验 \>
                                      扩展性 \> 模板数量
  ----------------------------------------------------------------------------------------

### 0.1 文档权威性

本文件是项目的长期方向文档，不是某个迭代的临时需求列表。

当以下内容互相冲突时，优先级依次为：

1.  已确认的安全与数据保护要求；
2.  本文件中的北极星目标和架构边界；
3.  已接受的 ADR（Architecture Decision Record）；
4.  当前阶段的里程碑文档；
5.  GitHub Issue；
6.  临时提示词或单次对话中的实现偏好。

任何会改变产品边界、数据所有权、租户隔离、发布模型、许可证或部署基线的决定，都必须先形成
ADR，不能由 Codex 在实现过程中自行猜测。

------------------------------------------------------------------------

# 1. 北极星

## 1.1 一句话定义

FRAME//ZERO
是一个让摄影师在不编写代码的情况下，登录、上传素材、编辑资料、选择视觉模板、完成智能排版，并发布独立摄影主页的开源建站平台。

## 1.2 北极星用户旅程

一个新用户应当能够完成以下流程：

``` text
注册或登录
→ 创建摄影站点
→ 填写摄影师资料和服务套餐
→ 上传照片
→ 系统生成安全、响应式的图片版本
→ 选择模板
→ 自动排版并微调焦点
→ 预览草稿
→ 发布到站点地址
→ 随时修改、回滚或更换模板
```

## 1.3 北极星体验目标

在素材已经准备好的前提下，一名首次使用的摄影师应能在 **15
分钟内**发布一个视觉完整、移动端可用、可被搜索引擎正确读取的摄影主页。

这不是要求每位用户都在 15
分钟完成，而是要求产品不因部署知识、图片格式、手工改代码或数据库操作阻碍这一流程。

## 1.4 长期产品目标

FRAME//ZERO 最终同时支持三种运行方式：

### A. 单用户自托管

适合摄影师本人部署：

-   一个安装实例；
-   一个站点所有者；
-   可隐藏多用户和团队功能；
-   本地或对象存储均可；
-   最少配置即可运行。

### B. 多用户自托管

适合工作室、社群或组织：

-   多个用户；
-   多个摄影站点；
-   站点成员和角色；
-   独立素材库；
-   独立发布版本；
-   管理员负责基础设施与容量。

### C. 官方托管服务

适合无需运维的最终用户：

-   注册即用；
-   托管存储和图片处理；
-   子域名和自定义域名；
-   配额、套餐、审计、风控和运营能力；
-   与开源核心共用同一套领域模型。

三种模式必须共享核心业务代码，不能长期维护三个产品分支。

------------------------------------------------------------------------

# 2. 当前仓库定位

## 2.1 当前已具备的核心价值

当前仓库已经拥有以下值得保留和产品化的能力：

1.  **11 套独立摄影主页模板**\
    每套模板是独立的懒加载 React 入口，而不是同一页面换色。

2.  **统一内容模型与后台编辑器**\
    摄影师资料、套餐、联系方式、社交账号和约拍清单可集中修改。

3.  **固定照片槽位契约**\
    每套模板声明照片数量与画幅比例，缺图时保留有设计感的占位。

4.  **自动排版算法**\
    根据素材方向与宽高比，对模板槽位进行全局匹配，并支持锁定与焦点位置。

5.  **较完整的本地图片导入链路**\
    包括递归扫描、SHA-256 去重、EXIF 方向处理、元数据移除、三档 WebP
    和损坏文件隔离。

6.  **公开仓库安全扫描与构建体积预算**\
    已具备防止照片、路径、联系方式和凭证意外进入 Git 历史的意识。

## 2.2 当前仍属于单用户原型的部分

以下结构不能直接作为未来平台基础：

-   内容存储在固定 ID 为 `1` 的单条 D1 记录；
-   所有请求共享同一份站点内容；
-   远程写权限主要依赖是否存在 ChatGPT 认证头；
-   用户素材位于本地忽略目录和 `public/photos`；
-   页面先渲染演示数据，再由浏览器读取真实内容；
-   没有草稿、发布版本、修订历史和回滚；
-   没有用户、站点、成员、域名、上传任务和配额模型；
-   模板、存储、认证与当前运行环境仍有耦合；
-   没有强制执行的持续集成门禁。

## 2.3 当前代码基线索引

Codex 在开始架构工作前，至少应阅读：

``` text
README.md
package.json
app/site-config.ts
app/page.tsx
app/api/site-content/route.ts
app/chatgpt-auth.ts
app/admin/admin-editor.tsx
app/admin/photo-library-editor.tsx
app/photo-library.ts
app/templates/catalog.ts
app/templates/template-renderer.tsx
app/templates/shared/photo-slots.tsx
scripts/lib/photo-import.mjs
scripts/check-public-safety.mjs
scripts/check-build-budget.mjs
tests/photo-import.test.mjs
tests/photo-layout.test.mjs
tests/rendered-html.test.mjs
db/schema.ts
.openai/hosting.json
vite.config.ts
worker/index.ts
```

------------------------------------------------------------------------

# 3. 产品边界

## 3.1 核心用户

第一优先级用户：

-   独立摄影师；
-   Cosplay 摄影师；
-   人像摄影师；
-   小型摄影工作室；
-   需要强视觉表达但不愿维护代码的创作者。

第二优先级用户：

-   摄影社团；
-   视觉设计师；
-   小型创意团队；
-   为摄影师代运营主页的编辑。

## 3.2 核心任务

平台首先解决：

-   建站；
-   素材管理；
-   模板排版；
-   内容编辑；
-   草稿预览；
-   发布；
-   回滚；
-   域名访问；
-   自托管。

## 3.3 非目标

在基础平台稳定前，不把以下内容列为核心目标：

-   社交网络；
-   照片社区；
-   在线修图软件；
-   RAW 专业显影；
-   客户完整 CRM；
-   大型图库销售；
-   支付和订单系统；
-   在线合同与电子签名；
-   用户任意上传 React/JavaScript 模板；
-   通用网页搭建器；
-   AI 自动生成摄影作品或虚构摄影案例。

这些能力未来可以通过扩展实现，但不能破坏核心架构。

------------------------------------------------------------------------

# 4. 北极星指标

指标用于判断方向是否正确，不应成为虚假增长目标。

## 4.1 激活指标

-   新用户完成创建站点；
-   至少上传 7 张有效素材；
-   选择一套模板；
-   完成首次发布。

目标：首次登录后的有效用户中，至少 60% 能在一次会话或 24
小时内完成首次发布。

## 4.2 核心使用指标

-   每周发布或更新站点的活跃站点数；
-   成功完成图片处理的素材数；
-   草稿到发布的转化率；
-   发布后 7 天内仍保留站点的比例；
-   模板切换后未回滚的比例。

## 4.3 可靠性指标

阶段性目标：

  指标                       目标
  -------------------------- ---------------------------
  跨租户数据泄露             0
  发布操作可回滚率           100%
  图片处理成功率             ≥ 99%（有效且受支持输入）
  公开页面缓存命中时可用性   ≥ 99.9%
  公开页面移动端 LCP         目标 \< 2.5 秒
  发布后内容生效             目标 \< 30 秒
  自托管全新安装             目标 15 分钟内完成
  破坏性迁移前备份覆盖       100%

## 4.4 质量指标

-   每个模板都有桌面与移动端视觉基线；
-   每个公共 API 都有授权测试；
-   每个数据库迁移都有升级测试；
-   每个阶段结束时没有未记录的关键架构决定；
-   默认分支不允许绕过 CI 合并。

------------------------------------------------------------------------

# 5. 设计原则

## 5.1 站点是核心租户

系统核心实体是 `Site`，而不是 `User`。

原因：

-   一个用户将来可能拥有多个站点；
-   一个站点可能有多个成员；
-   站点可以转移所有权；
-   站点拥有自己的素材、域名、草稿、发布版本和配额。

禁止将用户 ID 直接当成站点 ID。

## 5.2 草稿与发布完全分离

公开页面只能读取已发布版本。

后台编辑只能修改草稿。

任何保存操作都不能直接破坏线上主页。

## 5.3 模板是纯渲染层

模板只接收标准化的发布文档与已解析的素材 URL。

模板不得直接：

-   查询数据库；
-   读取登录会话；
-   访问对象存储；
-   依赖某个云平台的环境变量；
-   修改站点数据；
-   发起上传任务。

## 5.4 图片是资产，不是内容字段

内容文档只引用 `assetId` 和构图设置。

文件路径、格式、尺寸、存储 key 与 CDN URL 由资产服务负责。

## 5.5 所有数据访问都必须带租户范围

任何资源查询都必须在数据库层包含 `siteId` 或等价租户条件。

禁止：

``` ts
const asset = await findAssetById(assetId);
if (asset.siteId !== siteId) throw forbidden();
```

应使用：

``` ts
const asset = await findAsset({
  id: assetId,
  siteId: authorizedSiteId,
});
```

## 5.6 可恢复优先于聪明

-   所有发布都可回滚；
-   所有删除先进入回收期；
-   所有破坏性迁移有备份；
-   图片清理默认 dry-run；
-   数据损坏时明确报错，不静默覆盖；
-   自动排版可以建议，但不能不可逆地改写用户锁定内容。

## 5.7 开源核心不依赖单一云厂商

默认参考实现应能运行在标准服务器上。

Cloudflare、R2、D1 等能力通过适配器支持，而不是成为领域模型的一部分。

## 5.8 安全不是后续功能

认证、授权、租户隔离、上传验证、审计、限流和数据删除必须随着对应功能一起实现。

不能先实现多用户，再"以后补权限"。

------------------------------------------------------------------------

# 6. 目标架构

## 6.1 逻辑架构

``` text
┌───────────────────────────────────────────────────────────────┐
│                        Browser / Client                       │
│  Public Site | Studio Editor | Asset Manager | Admin Console  │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│                           Web App                             │
│  SSR Public Renderer | Auth | Site API | Publish API          │
│  Upload Coordination | Preview | Domain Resolution            │
└───────────────┬────────────────────┬──────────────────────────┘
                │                    │
        ┌───────▼────────┐   ┌──────▼──────────────────┐
        │   PostgreSQL   │   │ S3-Compatible Storage  │
        │ users/sites    │   │ originals/variants     │
        │ revisions/jobs │   │ private/public assets  │
        └───────┬────────┘   └──────────┬─────────────┘
                │                       │
                └──────────┬────────────┘
                           │
                 ┌─────────▼──────────┐
                 │   Image Worker     │
                 │ validate/process   │
                 │ metadata/variants  │
                 └────────────────────┘
```

## 6.2 建议代码结构

``` text
apps/
  web/
    app/
      (marketing)/
      (public-sites)/
      studio/
      api/
    server/
      auth/
      domains/
      publishing/
      repositories/

  image-worker/
    src/
      worker.ts
      jobs/
      processing/

packages/
  domain/
    users.ts
    sites.ts
    permissions.ts
    site-document.ts
    revisions.ts
    assets.ts
    jobs.ts

  templates/
    registry.ts
    contract.ts
    shared/
    cinematic-light/
    neon-hud/
    ...

  composition-engine/
    assignment.ts
    compatibility.ts
    crop-score.ts
    focus.ts

  database/
    schema/
    migrations/
    repositories/
    postgres/
    d1/

  storage/
    contract.ts
    s3.ts
    r2.ts
    filesystem.ts

  auth/
    contract.ts
    oidc.ts

  image-processing/
    contract.ts
    validate.ts
    metadata.ts
    variants.ts

  validation/
    site-document.ts
    api.ts

deploy/
  docker/
  cloudflare/
  examples/

docs/
  NORTH_STAR.md
  ROADMAP.md
  SECURITY.md
  SELF_HOSTING.md
  TEMPLATE_SDK.md
  adr/
```

不要求第一阶段立即完成 monorepo
重构。只有当模块边界已经通过接口和测试稳定后，再移动目录。禁止为了"看起来像目标结构"而进行无行为收益的大规模搬迁。

------------------------------------------------------------------------

# 7. 领域模型

## 7.1 User

``` ts
type User = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "disabled" | "pending_deletion";
  createdAt: string;
  updatedAt: string;
};
```

## 7.2 Site

``` ts
type Site = {
  id: string;
  ownerUserId: string;
  slug: string;
  displayName: string;
  status: "draft" | "published" | "suspended" | "deleting";
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
};
```

## 7.3 SiteMember

``` ts
type SiteRole = "owner" | "editor" | "viewer";

type SiteMember = {
  siteId: string;
  userId: string;
  role: SiteRole;
  createdAt: string;
};
```

权限基线：

  能力              owner   editor   viewer
  --------------- ------- -------- --------
  查看后台              ✓        ✓        ✓
  修改内容              ✓        ✓
  上传/删除素材         ✓        ✓
  发布/回滚             ✓        ✓
  修改域名              ✓
  管理成员              ✓
  删除站点              ✓

## 7.4 SiteDocument

当前 `SiteContent` 应演进为显式版本化文档：

``` ts
const SITE_DOCUMENT_V1_TEMPLATE_IDS = [
  "cinematic-light",
  "neon-hud",
  "film-rail",
  "manga-panels",
  "prism-liquid",
  "orbital-portal",
  "archive-os",
  "editorial-duet",
  "polaroid-field",
  "character-select",
  "museum-depth",
] as const;

type SiteDocumentV1TemplateId =
  (typeof SITE_DOCUMENT_V1_TEMPLATE_IDS)[number];

type SiteDocumentV1 = {
  schemaVersion: 1;
  activeTemplate: SiteDocumentV1TemplateId;
  profile: ProfileContent;
  hero: HeroContent;
  trustItems: TrustItem[];
  packages: PhotographyPackage[];
  contact: ContactContent;
  social: SocialLink[];
  bookingFields: string[];
  statement: StatementContent;
  compositions: Partial<Record<SiteDocumentV1TemplateId, TemplateComposition>>;
};
```

V1 的模板身份集合属于版本化文档契约，不能从当前运行时 `templateCatalog` 动态推导。
运行时 catalog 新增、删除、重命名或修改展示元数据，都不得静默改变历史 V1 文档的
结构有效性。当前安装能否渲染某个 `(templateId, templateVersion)`，由独立的兼容性
校验负责；新增文档模板身份必须经过显式的版本契约决策。

首个可执行 V1 不接受 `theme`。主题覆盖仍是后续产品概念；只有在字段集合、清洗规则和
版本兼容策略通过独立决策后，才能加入一个明确版本的可执行契约，不能静默扩展 V1。

## 7.5 TemplateComposition

``` ts
type TemplateComposition = {
  templateVersion: number;
  slots: SlotComposition[];
};

type SlotComposition = {
  slotIndex: number;
  assetId: string;
  locked: boolean;
  focus: {
    x: number;
    y: number;
  };
  title?: string;
  subtitle?: string;
};
```

禁止继续以展示编号 `code` 作为程序身份。

Site 与 Asset 使用服务端生成、不可由业务字段推导的随机 UUID v4。其他实体也必须使用
稳定、不可变且非展示字段的身份；其具体格式由对应领域决策确定。

## 7.6 Revision

``` ts
type SiteRevision = {
  id: string;
  siteId: string;
  parentRevisionId: string | null;
  schemaVersion: number;
  content: SiteDocumentV1;
  createdBy: string;
  createdAt: string;
  note: string | null;
};
```

推荐采用不可变修订记录：

-   保存草稿时创建新 revision；
-   发布只更新 `publishedRevisionId`；
-   回滚是将旧 revision 复制为新的草稿或重新指向发布版本；
-   不直接修改历史 revision 内容。

## 7.7 Asset

``` ts
type AssetStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "deleted";

type Asset = {
  id: string;
  siteId: string;
  createdBy: string;
  status: AssetStatus;
  originalStorageKey: string;
  sourceFingerprint: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  orientation: "landscape" | "portrait" | "square" | null;
  mimeType: string | null;
  bytes: number | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
```

`Asset.id` 是内部随机 UUID v4。`sourceFingerprint` 是带 Site 范围的私有去重/迁移信息，
不是 Asset ID；相同照片跨 Site 迁移时必须重新生成 `Asset.id`。

## 7.8 AssetVariant

``` ts
type AssetVariantKind =
  | "thumbnail"
  | "card"
  | "full"
  | "social";

type AssetVariant = {
  id: string;
  assetId: string;
  kind: AssetVariantKind;
  storageKey: string;
  width: number;
  height: number;
  bytes: number;
  format: "webp" | "avif" | "jpeg";
  createdAt: string;
};
```

## 7.9 Domain

``` ts
type SiteDomain = {
  id: string;
  siteId: string;
  hostname: string;
  kind: "platform_subdomain" | "custom";
  status: "pending" | "verifying" | "active" | "failed";
  verificationToken: string | null;
  createdAt: string;
};
```

------------------------------------------------------------------------

# 8. 数据库基线

## 8.1 默认数据库

开源参考部署默认使用 PostgreSQL。

原因：

-   普通服务器和 Docker 环境普遍可用；
-   适合多用户关系模型；
-   事务、唯一约束、行锁和迁移工具成熟；
-   便于备份和恢复；
-   不绑定单一云平台。

Cloudflare D1 作为可选适配器保留，但不得决定核心领域模型。

## 8.2 建议关系表

``` text
users
accounts / auth_sessions
sites
site_members
site_revisions
assets
asset_variants
upload_sessions
processing_jobs
site_domains
audit_logs
deletion_requests
```

## 8.3 必要约束

至少包括：

``` text
sites.slug UNIQUE
site_members(site_id, user_id) UNIQUE
asset_variants(asset_id, kind) UNIQUE
site_domains.hostname UNIQUE
site_revisions.site_id FK sites.id
assets.site_id FK sites.id
```

所有租户资源表都必须直接包含 `site_id`，即使可以通过其他外键间接推导。

这样可以让授权查询更简单、更容易审计。

## 8.4 迁移规则

-   正常请求中禁止执行 `CREATE TABLE IF NOT EXISTS`；
-   所有 schema 变化必须形成迁移；
-   每个迁移必须经过空数据库升级测试；
-   重要迁移必须经过旧版本数据升级测试；
-   破坏性迁移必须提供备份和恢复说明；
-   不能删除字段后立即假设所有旧 revision 已升级；
-   文档 schema 与数据库 schema 分别版本化。

------------------------------------------------------------------------

# 9. 认证与授权

## 9.1 认证抽象

``` ts
interface AuthProvider {
  getSession(request: Request): Promise<AppSession | null>;
  requireSession(request: Request): Promise<AppSession>;
}
```

领域层只识别内部 `userId`，不识别特定供应商的请求头或 token 结构。

可选实现：

-   OIDC；
-   GitHub OAuth；
-   Google OAuth；
-   邮箱 Magic Link；
-   Passkey；
-   自托管身份供应商。

## 9.2 授权入口

``` ts
async function requireSitePermission(
  userId: string,
  siteId: string,
  permission: SitePermission,
): Promise<AuthorizedSiteContext>;
```

所有后台路由、API、上传和发布操作必须调用同一权限层。

## 9.3 禁止的授权模式

禁止仅判断：

-   用户已登录；
-   请求来自本地 hostname；
-   前端隐藏了按钮；
-   URL 中的 slug 属于当前用户；
-   客户端提交的 owner ID；
-   未签名的代理请求头。

## 9.4 本地开发模式

本地免登录只能由明确环境变量开启：

``` env
AUTH_MODE=development-bypass
```

生产构建启动时如果检测到该模式，必须拒绝启动或输出阻断级错误。

不能再单纯根据 `localhost` 判断写权限。

## 9.5 审计

以下操作写入 `audit_logs`：

-   创建/删除站点；
-   邀请/移除成员；
-   修改角色；
-   创建上传；
-   删除素材；
-   发布；
-   回滚；
-   修改域名；
-   修改所有权；
-   管理员封禁。

审计记录不能包含原图、token 或敏感请求体。

------------------------------------------------------------------------

# 10. 多租户隔离

## 10.1 基本规则

所有租户资源操作必须同时验证：

1.  当前用户身份；
2.  当前站点成员关系；
3.  所需权限；
4.  资源确实属于该站点。

## 10.2 必须测试的攻击路径

-   用户 A 读取用户 B 的站点；
-   用户 A 修改用户 B 的 revision；
-   用户 A 使用用户 B 的 assetId；
-   用户 A 请求用户 B 的上传 URL；
-   用户 A 删除用户 B 的素材；
-   用户 A 发布用户 B 的站点；
-   用户 A 将用户 B 的域名绑定到自己的站点；
-   viewer 执行 editor 操作；
-   editor 执行 owner 操作；
-   被移除成员继续使用旧会话；
-   预签名上传 URL 被替换对象 key；
-   通过批量 API 混入其他 siteId。

多租户功能不得在这些测试缺失时标记完成。

------------------------------------------------------------------------

# 11. 素材上传与图片处理

## 11.1 存储原则

生产用户素材必须存储在对象存储中，不能写入：

-   Git 仓库；
-   应用镜像；
-   Next.js `public` 目录；
-   无共享能力的容器本地磁盘；
-   数据库 BLOB。

## 11.2 存储抽象

``` ts
interface ObjectStorage {
  createUpload(input: CreateUploadInput): Promise<SignedUpload>;
  stat(key: string): Promise<StoredObjectMetadata>;
  read(key: string): Promise<ReadableStream>;
  write(key: string, body: ReadableStream, metadata?: object): Promise<void>;
  delete(keys: string[]): Promise<void>;
}
```

实现至少包括：

-   S3-compatible；
-   Cloudflare R2；
-   本地文件系统，仅开发和单用户模式。

## 11.3 上传流程

``` text
1. 用户选择文件
2. Web API 验证站点权限和配额
3. 创建 Asset 与 UploadSession
4. 生成短期上传凭证
5. 浏览器直传对象存储
6. 客户端调用 finalize
7. 服务端重新检查对象大小与存在性
8. 创建 ProcessingJob
9. Worker 验证实际文件并解码
10. 生成衍生图
11. 写入 AssetVariant
12. Asset 进入 ready
13. Studio 素材库刷新
```

## 11.4 上传安全

必须验证：

-   最大文件大小；
-   最大像素数；
-   实际文件类型；
-   解码是否成功；
-   动画帧数；
-   超大图片解压炸弹；
-   路径和对象 key；
-   上传 URL 有效期；
-   用户与站点配额；
-   同一用户上传速率；
-   恶意重复任务；
-   SVG 和可执行内容。

默认不接受 SVG 作为摄影素材。

## 11.5 图片处理输出

第一阶段延续当前三档：

  类型        目标用途
  ----------- ----------------
  thumbnail   素材库
  card        模板列表和卡片
  full        灯箱和主视觉

可选增加：

-   `social`：Open Graph；
-   AVIF 版本；
-   模糊占位或主色；
-   主体/人脸检测结果。

## 11.6 隐私 ID

原始文件哈希可用于私有去重，但不能直接作为内部 Asset ID、公开素材 ID 或公开 URL。
当前本地 importer 产生的原始 SHA-256 只作为 legacy/source fingerprint，用于同一 Site
内的去重和迁移重跑。

推荐：

``` text
asset.id = server-generated random UUID v4
legacySourceFingerprint = SHA-256(originalBytes) // private, Site-scoped migration input
futureSourceFingerprint = HMAC-SHA256(tenantSecret, originalBytes) // optional future policy
```

同一照片在不同 Site 中拥有不同 `asset.id`。public Asset ID、公开 URL 编码和对象存储
key 由 ADR-0008 决定；在该 ADR 接受前不能从本节推断公开编码方案。

## 11.7 删除策略

删除素材分为：

1.  标记删除；
2.  检查是否被草稿或发布 revision 引用；
3.  默认进入回收期；
4.  真正清理对象存储前生成清理清单；
5.  删除操作可审计。

禁止在仍被已发布版本引用时直接删除衍生图。

------------------------------------------------------------------------

# 12. 图片处理 Worker

## 12.1 独立进程

图片转换不能长期运行在 Web 请求进程中。

Worker 职责：

-   领取任务；
-   锁定任务；
-   下载原始对象；
-   验证和解码；
-   清除元数据；
-   旋转与色彩转换；
-   生成 variants；
-   上传输出；
-   更新数据库；
-   记录失败原因；
-   重试暂时性错误。

## 12.2 队列抽象

初始自托管版本可以使用 PostgreSQL 作业表，后续支持：

-   Cloudflare Queues；
-   Redis/BullMQ；
-   SQS；
-   其他消息队列。

领域接口：

``` ts
interface JobQueue {
  enqueue(job: ImageProcessingJob): Promise<void>;
  lease(workerId: string): Promise<LeasedJob | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: JobFailure): Promise<void>;
}
```

## 12.3 幂等性

同一个 Asset 的同一处理版本重复执行时：

-   不产生重复 variants；
-   已成功结果可以复用；
-   部分失败不会留下假 `ready` 状态；
-   pipeline 版本变化时可以安全重建。

当前本地导入器的 `PIPELINE_VERSION` 思路应保留。

------------------------------------------------------------------------

# 13. 草稿、发布与回滚

## 13.1 保存草稿

保存草稿必须使用乐观锁：

``` text
客户端读取 revision 20
客户端提交 baseRevisionId = 20
服务端发现当前草稿仍为 20 → 创建 21
否则返回 409 Conflict
```

避免两个标签页无提示覆盖。

## 13.2 预览

预览读取草稿 revision，并通过短期、不可猜测的预览 token 或授权后台访问。

预览 URL 不得被搜索引擎索引。

## 13.3 发布

发布动作：

1.  验证 revision；
2.  验证所有引用素材存在且 ready；
3.  验证模板版本兼容；
4.  更新 `publishedRevisionId`；
5.  写审计记录；
6.  失效站点缓存；
7.  触发 OG 或静态衍生资源更新。

## 13.4 回滚

回滚不删除历史。

推荐：

-   选择历史 revision；
-   创建一个新的草稿 revision；
-   用户确认后发布；
-   保留原始时间线。

## 13.5 发布门禁

发布前检查：

-   品牌名称；
-   主页标题；
-   联系方式；
-   至少一套有效 composition；
-   所有引用 asset ready；
-   不存在失效 assetId；
-   slug/domain 有效；
-   文档 schema 可读取；
-   模板版本受支持。

警告项可以允许继续；阻断项必须禁止发布。

------------------------------------------------------------------------

# 14. 公共页面渲染

## 14.1 服务端首屏

公开页面必须服务端读取并渲染已发布内容。

禁止：

``` text
先输出演示内容
→ 浏览器挂载
→ 再请求真实内容
```

公开 HTML、标题、描述、Open Graph 和结构化数据必须来自同一 published
revision。

## 14.2 域名解析

请求 Host 的解析顺序：

``` text
自定义域名
→ 平台子域名
→ 路径 slug（开发或兼容）
```

Host 必须经过规范化和数据库验证，不能直接信任并用于生成任意绝对 URL。

## 14.3 缓存

公开页面可缓存；后台和草稿预览默认不缓存。

缓存 key 至少包含：

-   siteId；
-   publishedRevisionId；
-   hostname；
-   locale（未来）。

发布后定向失效，不能全站清缓存。

## 14.4 SEO

每个站点支持：

-   动态 title；
-   description；
-   canonical；
-   Open Graph；
-   Twitter Card；
-   favicon；
-   robots；
-   sitemap；
-   自定义域名；
-   可选结构化数据；
-   预览环境 noindex。

------------------------------------------------------------------------

# 15. 模板系统

## 15.1 模板契约

``` ts
type TemplateDefinition = {
  id: TemplateId;
  version: number;
  name: string;
  description: string;
  contentSchemaVersion: number;
  slots: readonly TemplateSlotDefinition[];
  capabilities: TemplateCapabilities;
  render: React.ComponentType<PublishedTemplateProps>;
};
```

``` ts
type TemplateSlotDefinition = {
  index: number;
  role: "hero" | "gallery" | "statement" | "cover";
  ratio: "3:2" | "2:3" | "16:9";
  required: boolean;
  cropTolerance?: number;
};
```

## 15.2 模板版本

修改以下内容必须提升模板版本：

-   槽位数量；
-   槽位顺序；
-   槽位比例；
-   slot role；
-   composition 数据含义。

只修改 CSS 或不影响 composition 的视觉问题可不提升版本。

## 15.3 模板迁移

当模板版本变化：

-   旧 composition 仍可渲染；
-   或提供显式 migrator；
-   不允许静默丢弃用户槽位；
-   后台提示用户重新检查排版；
-   发布前验证兼容。

## 15.4 模板 SDK

开源阶段提供：

-   模板契约类型；
-   示例模板；
-   槽位组件；
-   图片组件；
-   可访问性要求；
-   性能预算；
-   视觉测试工具；
-   发布前模板验证器。

## 15.5 托管版模板安全

托管平台只运行构建时已经审核并打包的模板。

第一阶段禁止用户上传任意 JS/React 模板代码。

未来模板市场必须有：

-   构建隔离；
-   依赖白名单；
-   静态分析；
-   签名；
-   审核；
-   版本冻结；
-   撤下与兼容策略。

------------------------------------------------------------------------

# 16. 自动排版引擎

## 16.1 当前能力

保留：

-   横竖方向兼容；
-   比例代价；
-   全局最小匹配；
-   锁定槽位；
-   缺素材时留白；
-   焦点位置。

## 16.2 演进方向

依次增加：

1.  最大裁切损失阈值；
2.  hero 槽位权重；
3.  主体或人脸位置；
4.  已设置焦点的实际裁切评分；
5.  连续照片避免相邻重复；
6.  图片明暗和色彩分布；
7.  用户偏好；
8.  排版前差异预览。

## 16.3 行为要求

自动排版必须：

-   不修改已锁定且仍兼容的槽位；
-   不重复使用同一 asset；
-   不强行把横图放入竖槽；
-   不删除用户自定义标题；
-   可撤销；
-   生成明确的变更摘要；
-   算法升级不应无提示改变已发布页面。

------------------------------------------------------------------------

# 17. Studio 后台

## 17.1 信息架构

建议分为：

``` text
概览
内容
素材
模板与排版
预览
发布历史
域名
成员
站点设置
```

## 17.2 编辑体验

必须提供：

-   自动保存草稿或明确保存状态；
-   未保存变化提示；
-   撤销/重做；
-   稳定列表 ID；
-   冲突提示；
-   发布前检查；
-   历史 revision；
-   错误恢复；
-   移动端基本可用；
-   键盘可访问。

## 17.3 素材库

长期能力：

-   上传进度；
-   处理中状态；
-   失败重试；
-   横/竖/方筛选；
-   文件名和标签搜索；
-   拍摄日期；
-   角色或作品集；
-   使用位置；
-   未使用素材；
-   批量选择；
-   安全删除；
-   替换但保留 composition；
-   焦点编辑。

本地私有元数据可以保存原文件名；公开站点和公开 API 不应暴露。

------------------------------------------------------------------------

# 18. API 设计

## 18.1 建议资源路由

``` text
POST   /api/sites
GET    /api/sites
GET    /api/sites/:siteId
PATCH  /api/sites/:siteId

GET    /api/sites/:siteId/draft
PUT    /api/sites/:siteId/draft
POST   /api/sites/:siteId/publish
POST   /api/sites/:siteId/rollback

GET    /api/sites/:siteId/revisions
GET    /api/sites/:siteId/revisions/:revisionId

POST   /api/sites/:siteId/uploads
POST   /api/sites/:siteId/uploads/:uploadId/finalize

GET    /api/sites/:siteId/assets
GET    /api/sites/:siteId/assets/:assetId
DELETE /api/sites/:siteId/assets/:assetId
POST   /api/sites/:siteId/assets/:assetId/retry

GET    /api/sites/:siteId/members
POST   /api/sites/:siteId/members
PATCH  /api/sites/:siteId/members/:userId
DELETE /api/sites/:siteId/members/:userId

GET    /api/sites/:siteId/domains
POST   /api/sites/:siteId/domains
DELETE /api/sites/:siteId/domains/:domainId
```

## 18.2 API 规则

-   所有写接口进行 schema 验证；
-   所有资源接口进行站点授权；
-   错误返回稳定 error code；
-   不向客户端返回数据库堆栈；
-   支持幂等请求 key 的关键操作应使用幂等机制；
-   发布、上传 finalize 和删除必须可审计；
-   批量接口限制数量；
-   大请求体设置上限；
-   状态冲突返回 `409`；
-   权限不足使用 `403`，未登录使用 `401`；
-   不存在或无权查看时可根据安全策略统一返回 `404`。

------------------------------------------------------------------------

# 19. 自托管基线

## 19.1 参考部署

``` text
Caddy/nginx
    ↓
Next.js Web
    ↓
PostgreSQL
    ↓
MinIO / S3
    ↓
Image Worker
```

## 19.2 Docker Compose

开源阶段必须提供：

-   Web；
-   Worker；
-   PostgreSQL；
-   MinIO；
-   一次性 migration；
-   可选邮件测试服务；
-   healthcheck；
-   数据卷；
-   示例 `.env`。

## 19.3 安装体验

目标命令：

``` bash
cp .env.example .env
docker compose up -d
docker compose run --rm migrate
```

首次访问完成管理员初始化。

## 19.4 备份

文档必须覆盖：

-   PostgreSQL 备份；
-   对象存储备份；
-   恢复顺序；
-   版本兼容；
-   加密；
-   定期恢复演练。

只备份数据库不等于完整备份；revision 引用的图片对象也必须恢复。

## 19.5 升级

每个正式版本提供：

-   schema 迁移说明；
-   环境变量变化；
-   模板版本变化；
-   备份要求；
-   已知不兼容；
-   回滚方法。

------------------------------------------------------------------------

# 20. Cloudflare 部署适配

Cloudflare 模式可继续支持：

-   Vinext/Vite；
-   Worker；
-   R2；
-   D1 或外部 PostgreSQL；
-   Cloudflare Queues；
-   自定义域名与边缘缓存。

但 Cloudflare 专属代码必须位于 adapter 或 deploy 层。

模板、领域模型、权限规则和文档 schema 不得依赖：

-   `cloudflare:workers`；
-   D1 特有 API；
-   R2 特有类型；
-   ChatGPT Sites 请求头。

------------------------------------------------------------------------

# 21. 安全基线

## 21.1 Web 安全

至少配置：

-   Content-Security-Policy；
-   `frame-ancestors 'none'` 或等价策略；
-   `X-Content-Type-Options: nosniff`；
-   Referrer-Policy；
-   Permissions-Policy；
-   安全 Cookie；
-   CSRF/Origin 检查；
-   请求体上限；
-   登录和写接口限流；
-   上传限流；
-   错误信息清理。

## 21.2 文件安全

-   不信任扩展名；
-   不信任客户端 MIME；
-   不直接公开原图；
-   对象 key 不包含原文件名；
-   上传 URL 短期有效；
-   每个上传绑定 siteId、assetId 和预期大小；
-   Worker 使用受限资源；
-   限制像素、帧数和处理时间；
-   临时文件按任务隔离；
-   失败时清理临时输出。

## 21.3 秘密管理

-   `.env.example` 只包含占位；
-   测试不使用真实凭证；
-   日志不输出 token；
-   预签名 URL 不进入持久日志；
-   公共仓库继续运行安全扫描；
-   引入 secret scanning；
-   定期轮换生产凭证。

## 21.4 数据删除

需要定义：

-   用户删除；
-   站点删除；
-   成员移除；
-   素材删除；
-   回收期；
-   最终擦除；
-   审计保留；
-   备份中的删除延迟。

------------------------------------------------------------------------

# 22. 可访问性和体验基线

每套模板必须：

-   支持键盘导航；
-   有可见焦点；
-   Lightbox 正确锁定焦点；
-   Escape 可关闭；
-   不与全局方向键事件冲突；
-   支持 `prefers-reduced-motion`；
-   图片有合理 alt；
-   占位状态可被辅助技术理解；
-   颜色对比达到基本可用；
-   移动端不依赖 hover；
-   不因缺图崩溃；
-   不因 JavaScript 延迟显示错误联系人。

后台必须：

-   表单有 label；
-   错误关联字段；
-   状态通知可感知；
-   不用可编辑文本作为 React key；
-   复杂拖拽提供键盘替代。

------------------------------------------------------------------------

# 23. 性能基线

## 23.1 模板预算

保留并逐步完善现有构建预算：

-   单模板 JS；
-   单模板 CSS；
-   总客户端 JS；
-   总 CSS；
-   图片请求数量；
-   首屏图片大小；
-   第三方脚本。

## 23.2 公开页原则

-   只加载当前模板代码；
-   首屏只优先加载必要图片；
-   其余图片 lazy load；
-   使用响应式 `srcset/sizes`；
-   动画尊重 reduced motion；
-   不让后台代码进入公开页面 bundle；
-   published revision 可缓存；
-   真实内容服务端渲染。

## 23.3 后台原则

素材库分页或虚拟化；

不能一次渲染上万张图片；

上传和处理进度使用轻量轮询、SSE 或适配后的事件机制；

避免每次输入都写数据库。

------------------------------------------------------------------------

# 24. 测试与 CI

## 24.1 默认流水线

每个 PR 至少执行：

``` text
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run check:bundle
npm run check:public
npm run test:e2e
```

实际脚本名称可以调整，但能力不能缺失。

## 24.2 测试分层

### 单元测试

-   文档规范化；
-   权限矩阵；
-   自动排版；
-   图片清单解析；
-   revision 冲突；
-   发布验证；
-   路由参数和 slug；
-   存储 key 生成。

### 集成测试

-   PostgreSQL repository；
-   migration；
-   上传 finalize；
-   Worker 幂等；
-   publish/rollback；
-   多租户隔离；
-   删除引用检查；
-   域名解析。

### E2E

-   注册/登录；
-   创建站点；
-   编辑资料；
-   上传照片；
-   处理完成；
-   自动排版；
-   预览；
-   发布；
-   公开访问；
-   回滚；
-   权限角色。

### 视觉测试

矩阵：

``` text
11 个模板
× 桌面
× 移动端
× 有完整素材
× 缺少素材
```

不必每次 PR 运行所有重型矩阵，但默认分支和发布候选必须运行。

### 安全测试

-   IDOR/跨租户；
-   未认证写入；
-   角色越权；
-   上传伪造；
-   路径穿越；
-   超大图片；
-   CSRF；
-   Host header；
-   预览 token；
-   删除已发布素材。

## 24.3 分支保护

默认分支：

-   必须通过 CI；
-   禁止 force push；
-   至少一个 review，个人仓库早期可由明确的自审清单替代；
-   迁移或权限代码需要专项检查；
-   不允许直接提交用户素材。

------------------------------------------------------------------------

# 25. 可观测性

至少记录：

-   请求 ID；
-   userId（允许时）；
-   siteId；
-   route；
-   status；
-   latency；
-   publish revision；
-   processing job ID；
-   storage operation；
-   failure code。

禁止记录：

-   原图内容；
-   完整预签名 URL；
-   OAuth token；
-   Magic Link token；
-   密码；
-   真实私密联系人之外的不必要个人信息。

关键指标：

-   登录失败率；
-   API 错误率；
-   数据库延迟；
-   发布失败率；
-   Worker 队列长度；
-   处理耗时；
-   图片失败类型；
-   存储容量；
-   每站点流量；
-   缓存命中率。

------------------------------------------------------------------------

# 26. 开源策略

## 26.1 开源边界

建议开源：

-   Web 应用；
-   模板；
-   图片处理；
-   存储与数据库适配器；
-   Docker Compose；
-   模板 SDK；
-   文档与迁移工具。

托管服务可额外保留：

-   计费；
-   风控；
-   平台运营；
-   滥用检测；
-   托管域名自动化；
-   商业支持集成。

## 26.2 许可证决策

许可证必须通过 ADR 确认。

需要在以下方向中做明确选择：

-   MIT/Apache-2.0：更宽松，利于传播与商业采用；
-   AGPL-3.0：要求网络服务修改版本开放源代码，更适合保护托管型开源产品；
-   Open-core：核心开源，部分托管运营能力独立许可。

在许可证决定前，不发布"正式开源版"承诺。

## 26.3 贡献规范

开源前需要：

-   `CONTRIBUTING.md`；
-   `CODE_OF_CONDUCT.md`；
-   `SECURITY.md`；
-   Issue 模板；
-   PR 模板；
-   ADR 模板；
-   版本策略；
-   发布说明；
-   模板贡献规范；
-   演示素材许可说明。

------------------------------------------------------------------------

# 27. 路线图

## Phase 0：稳定当前私人站并建立边界

### 目标

保持当前私人站可用，同时移除阻碍未来多用户改造的全局假设。

### 交付物

-   `SiteDocumentV1`；
-   `schemaVersion`；
-   稳定 `siteId`；
-   稳定 `assetId/workId`；
-   `SiteRepository` 接口；
-   `AssetResolver` 接口；
-   `AuthProvider` 接口；
-   服务端读取真实发布内容；
-   owner 白名单或明确 owner 记录；
-   revision、draft、publish、rollback 的单站点版本；
-   正式数据库迁移；
-   CI；
-   修复当前已知后台和模板问题。

### 必修问题

-   任意认证用户可能写入；
-   演示内容服务端首屏；
-   空数组无法恢复旧版回退；
-   可编辑文本作为 React key；
-   `work.code` 被当作身份；
-   模板硬编码示例文案与年份；
-   槽位 DOM 编号不一致；
-   运行时 DDL；
-   无 CI 记录。

### 退出标准

-   当前站点公开 HTML 直接包含真实 published 内容；
-   owner 之外用户无法保存；
-   保存冲突返回 409；
-   任一历史 revision 可回滚；
-   默认分支 CI 绿色；
-   现有 11 模板全部通过桌面和移动端冒烟测试；
-   当前用户无需重新上传照片即可完成迁移。

------------------------------------------------------------------------

## Phase 1：单服务器多用户 MVP

### 目标

在一个受控服务器环境中支持真实多用户、多站点和网页上传。

### 交付物

-   PostgreSQL；
-   users/sites/site_members；
-   登录；
-   每用户至少可创建一个站点；
-   S3/MinIO；
-   预签名上传；
-   图片 Worker；
-   素材状态；
-   草稿/发布；
-   `/:slug` 公开站点；
-   租户隔离测试；
-   上传配额；
-   基础限流；
-   审计日志。

### 暂不包含

-   支付；
-   自定义域名；
-   团队邀请 UI；
-   模板市场；
-   任意第三方模板；
-   高级分析。

### 退出标准

-   两个用户的数据完全隔离；
-   用户可以从零创建并发布主页；
-   上传过程不经过 Web 进程转存大文件；
-   Worker 可重试且幂等；
-   删除素材不会破坏已发布站点；
-   关键流程有 E2E；
-   安全测试覆盖跨租户路径。

------------------------------------------------------------------------

## Phase 2：开源自托管 Beta

### 目标

让第三方能够在自己的服务器可靠安装、升级、备份和恢复。

### 交付物

-   Docker Compose；
-   PostgreSQL + MinIO 默认栈；
-   安装向导；
-   管理员初始化；
-   邮件配置；
-   环境变量检查；
-   migration 工具；
-   备份恢复文档；
-   升级文档；
-   示例站点；
-   开源许可证；
-   贡献规范；
-   安全披露流程；
-   发布版本和 changelog。

### 退出标准

-   全新 Linux 主机可按文档安装；
-   不修改源代码即可运行；
-   备份可在干净环境恢复；
-   从前一个稳定版本升级成功；
-   文档通过未参与开发者的安装验证；
-   默认配置不包含开发绕过。

------------------------------------------------------------------------

## Phase 3：官方托管 Alpha

### 目标

用同一核心代码运行受控托管服务。

### 交付物

-   平台子域名；
-   托管对象存储；
-   托管 Worker；
-   管理员运营后台；
-   存储与上传配额；
-   滥用限制；
-   账号删除；
-   数据导出；
-   监控告警；
-   用户支持工具；
-   服务条款与隐私说明。

### 退出标准

-   小规模受邀用户可稳定使用；
-   资源成本可计算；
-   账号删除可完成；
-   安全事件可审计；
-   单个用户无法耗尽全平台处理资源。

------------------------------------------------------------------------

## Phase 4：域名、协作与商业化

### 目标

支持正式摄影工作室与付费托管。

### 交付物

-   自定义域名；
-   成员邀请；
-   owner/editor/viewer；
-   所有权转移；
-   套餐与计费；
-   更高配额；
-   定时发布；
-   表单或预约扩展；
-   基础访问统计。

### 退出标准

-   域名验证可靠；
-   团队权限经过越权测试；
-   计费失败不会造成数据丢失；
-   降级和取消订阅策略明确；
-   用户可导出内容和素材清单。

------------------------------------------------------------------------

## Phase 5：模板生态

### 目标

形成可维护的模板 SDK 和审核生态。

### 交付物

-   模板 SDK；
-   CLI；
-   模板校验；
-   视觉测试工具；
-   版本兼容；
-   签名与审核；
-   模板目录；
-   社区模板贡献流程。

### 退出标准

-   新模板无需修改核心业务代码；
-   模板不能访问租户秘密；
-   老站点在模板升级后仍可渲染；
-   不合格模板无法进入托管平台。

------------------------------------------------------------------------

# 28. 前 90 天建议

## 第 1--30 天

-   建立 `docs/NORTH_STAR.md`、ADR 目录和 PR 模板；
-   建立 CI；
-   引入 `SiteDocumentV1` 和 schemaVersion；
-   引入稳定 Site/Asset ID；
-   抽象 SiteRepository、AssetResolver、AuthProvider；
-   将当前主页改为服务端读取真实内容；
-   建立单站点 revision/publish；
-   修复当前安全阻断和明确功能缺陷；
-   给 11 模板建立视觉冒烟测试。

## 第 31--60 天

-   引入 PostgreSQL schema；
-   编写现有 D1/JSON 到新模型迁移器；
-   users/sites/site_members；
-   通用登录；
-   基础站点列表；
-   S3/MinIO storage adapter；
-   UploadSession；
-   Worker 原型；
-   Asset/AssetVariant 表；
-   多租户授权集成测试。

## 第 61--90 天

-   完成浏览器直传；
-   完成 Worker 三档衍生图；
-   Studio 素材库接入远程资产；
-   slug 公开页面；
-   完整草稿/发布/回滚；
-   Docker Compose 开发栈；
-   首次多用户 E2E；
-   安全测试；
-   准备 Phase 1 MVP 内测。

------------------------------------------------------------------------

# 29. 初始 Epic 与依赖

## Epic 00：项目治理

-   添加北极星文档；
-   添加 ADR 模板；
-   添加 PR 模板；
-   定义标签与里程碑；
-   建立 CI；
-   配置分支保护。

依赖：无。

## Epic 01：单站点生产安全

-   owner 授权；
-   服务端真实内容；
-   生产故障处理；
-   安全响应头；
-   移除运行时建表；
-   稳定错误码。

依赖：Epic 00。

## Epic 02：领域模型 V1

-   SiteDocumentV1；
-   schemaVersion；
-   Site；
-   Revision；
-   stable IDs；
-   文档校验；
-   旧内容 migrator。

依赖：Epic 00。

## Epic 03：发布模型

-   draft revision；
-   optimistic locking；
-   publish；
-   rollback；
-   history；
-   preview。

依赖：Epic 02。

## Epic 04：模板内核

-   TemplateDefinition；
-   template version；
-   slot role；
-   composition model；
-   模板兼容测试；
-   移除身份对 `code` 的依赖。

依赖：Epic 02。

## Epic 05：存储抽象

-   ObjectStorage interface；
-   filesystem adapter；
-   S3 adapter；
-   R2 adapter；
-   URL resolver；
-   私有/public object policy。

依赖：Epic 02。

## Epic 06：图片处理内核

-   从本地 importer 提取纯处理函数；
-   输入验证；
-   pipeline version；
-   variant 生成；
-   幂等测试；
-   隐私 ID。

依赖：Epic 05。

## Epic 07：用户与站点

-   users；
-   sites；
-   members；
-   AuthProvider；
-   权限矩阵；
-   站点列表；
-   多租户测试。

依赖：Epic 01、02。

## Epic 08：在线上传

-   upload session；
-   presigned upload；
-   finalize；
-   processing jobs；
-   Worker；
-   Studio 状态；
-   retry。

依赖：Epic 05、06、07。

## Epic 09：公开路由与域名

-   slug；
-   host resolver；
-   SSR published content；
-   cache；
-   SEO；
-   preview noindex。

依赖：Epic 03、07。

## Epic 10：自托管

-   PostgreSQL；
-   Docker Compose；
-   MinIO；
-   migration；
-   admin bootstrap；
-   backup/restore；
-   docs。

依赖：Epic 07、08、09。

------------------------------------------------------------------------

# 30. Codex 执行协议

## 30.1 每次开始任务前

Codex 必须：

1.  阅读本文件；
2.  阅读当前阶段的 Roadmap；
3.  阅读相关 ADR；
4.  检查默认分支和现有测试；
5.  确认任务属于当前阶段；
6.  列出会修改的边界、数据和兼容性；
7.  给出最小可验证计划；
8.  不在未说明的情况下扩展任务范围。

## 30.2 每次实现必须回答

``` text
问题是什么？
为什么现在解决？
属于哪个 Phase / Epic？
有哪些不做的内容？
会修改哪些数据结构？
是否涉及租户隔离？
是否涉及破坏性迁移？
如何测试？
如何回滚？
是否需要 ADR？
```

## 30.3 PR 约束

-   一个 PR 聚焦一个可验证目标；
-   避免同时改认证、数据库、模板和 UI；
-   普通 PR 尽量控制在约 800 行人工代码以内；
-   生成文件、锁文件和迁移可单独说明；
-   重构必须保持行为测试；
-   数据迁移必须与 schema 改动一起评审；
-   新抽象至少有两个明确调用场景，避免空洞接口；
-   不允许为了目标目录结构进行无收益搬迁；
-   不允许删除兼容路径而没有迁移计划。

## 30.4 Codex 不得自行决定

-   开源许可证；
-   付费方案；
-   是否允许任意第三方模板代码；
-   数据保留期限；
-   法律与隐私条款；
-   owner/editor 权限边界重大变化；
-   破坏性删除用户数据；
-   停止支持某个部署模式；
-   修改北极星产品定义。

遇到这些问题，Codex 应创建 ADR 草案或决策清单，并停止相关范围的实现。

## 30.5 完成后必须更新

-   测试；
-   迁移；
-   文档；
-   相关 ADR；
-   Roadmap 状态；
-   风险；
-   兼容性说明；
-   发布说明（适用时）。

------------------------------------------------------------------------

# 31. Definition of Done

一个任务只有同时满足以下条件才算完成：

## 功能

-   用户场景可实际完成；
-   错误路径有明确反馈；
-   不只通过源码正则证明存在；
-   不依赖手工数据库操作。

## 安全

-   认证和授权已覆盖；
-   所有租户资源带 siteId 范围；
-   输入已验证；
-   敏感信息不进入日志；
-   上传和删除有防护。

## 数据

-   migration 已提供；
-   旧数据可升级；
-   失败可恢复；
-   并发行为明确；
-   删除和回滚语义明确。

## 测试

-   单元或集成测试覆盖核心逻辑；
-   E2E 覆盖关键用户路径；
-   CI 通过；
-   视觉变化有基线更新；
-   多租户功能有越权测试。

## 文档

-   API/配置有说明；
-   新环境变量进入 `.env.example`；
-   架构变化记录 ADR；
-   自托管操作有升级说明。

## 运维

-   有日志和稳定错误码；
-   有健康检查；
-   有合理超时；
-   有回滚方法；
-   不在请求中执行高成本图片处理。

------------------------------------------------------------------------

# 32. 风险登记

  ---------------------------------------------------------------------------------------
  风险                         影响                    缓解
  ---------------------------- ----------------------- ----------------------------------
  过早多租户化导致复杂度失控   延迟所有功能            Phase 0
                                                       先建立边界，不立即做完整平台

  模板代码与平台逻辑继续耦合   无法开源复用            通过纯 TemplateDefinition 和 props
                                                       契约隔离

  用户上传造成资源耗尽         平台不可用              直传、配额、限流、独立
                                                       Worker、像素限制

  跨租户数据泄露               严重安全事件            DB 查询带
                                                       siteId、集中授权、攻击路径测试

  图片删除破坏已发布站点       页面失效                引用检查、回收期、发布资源保护

  D1 与 PostgreSQL 双实现分叉  维护成本高              先定义 repository
                                                       contract，Postgres 为参考实现

  大规模目录重构拖慢产品       高风险无收益            先接口化，后移动代码

  自动排版升级改变线上页面     用户页面意外变化        已发布 composition
                                                       固定，算法只作用于草稿

  模板数量继续膨胀             QA 负担失控             Phase 0--2 暂停新增模板

  开源和托管目标冲突           产品分裂                单一领域核心，部署能力适配

  认证供应商锁定               自托管困难              AuthProvider/OIDC 边界

  数据迁移损坏当前私人站       丢失现有内容            双读迁移、备份、保留旧表一个版本

  公开素材哈希可被关联         隐私下降                随机公开 ID，私有 HMAC 指纹

  只做源码测试导致假安全       回归无法发现            行为测试、E2E、视觉与越权测试
  ---------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 33. 架构决策记录清单

至少需要以下 ADR：

``` text
ADR-0001：PostgreSQL 为参考数据库，D1 为适配器
ADR-0002：Site 是租户边界
ADR-0003：不可变 Site Revision 与发布指针
ADR-0004：S3-compatible 对象存储
ADR-0005：图片处理使用独立 Worker
ADR-0006：认证供应商通过 AuthProvider 解耦
ADR-0007：模板为预编译受信代码
ADR-0008：公开 Asset ID 使用随机 ID
ADR-0009：开源许可证
ADR-0010：单用户、多用户、托管模式的功能开关
ADR-0011：队列参考实现
ADR-0012：自定义域名与 Host 解析
```

ADR 状态：

``` text
Proposed
Accepted
Superseded
Rejected
Deprecated
```

------------------------------------------------------------------------

# 34. 当前代码到目标模型的映射

  ---------------------------------------------------------------------------
  当前                                    目标
  --------------------------------------- -----------------------------------
  `SiteContent`                           `SiteDocumentV1`

  `siteConfig`                            示例 seed，不再是生产回退联系人

  `site_settings(id=1)`                   `sites + site_revisions`

  `templateWorks`                         `compositions[templateId].slots`

  `Work.assetId`                          `SlotComposition.assetId`

  `Work.image/preview`                    AssetResolver 生成

  `public/photos/library-manifest.json`   `assets + asset_variants`

  `.frame-zero/photo-import-state.json`   本地 importer 私有索引

  `scripts/lib/photo-import.mjs`          `image-processing` 核心 + local
                                          adapter

  `getChatGPTUser()`                      AuthProvider 的一个临时 adapter

  `/api/site-content`                     draft/publish/revision APIs

  `activeTemplate`                        SiteDocument 的模板选择

  `templateCatalog`                       Template Registry

  `buildPhotoSlots()`                     composition-engine

  `PhotoFallbackController`               统一 React 图片组件与 asset 状态
  ---------------------------------------------------------------------------

------------------------------------------------------------------------

# 35. Phase 0 迁移策略

为保护当前私人站，采用渐进迁移：

## Step 1：定义版本化内容契约，不改变运行时行为

-   定义 `SiteDocumentV1.schemaVersion: 1`；
-   文档不包含 `siteId`，构图只引用不透明 `assetId`；
-   保持旧 `SiteContent`、API 和 D1 数据不变。

默认 Site 的随机 `siteId` 持久化、公开 Asset ID 决策、稳定 ID 迁移和旧内容兼容读取，
分别由后续独立 PR 按照已接受 ADR 与 Phase 0 路线图实现，不在内容契约中隐式完成。

PR-01B 已建立未接线的稳定 ID 迁移规划契约：旧来源由
`migrationKey = legacy:site_settings:1` 定位；首次正式执行只产生待立即持久化的 UUID v4
pending checkpoint；重跑复用该 `siteId`；dry-run 不生成临时 ID；completed 重跑为
no-op。资产规划只使用带 Site 范围的私有 fingerprint 映射，缺失 fingerprint 的槽位
进入 unresolved 报告。该契约不创建表、不写 D1，也不接入当前 API 或 importer。

## Step 2：引入新表

创建：

``` text
sites
site_revisions
assets
asset_variants
```

不删除 `site_settings`。

## Step 3：迁移器

迁移器：

-   读取 `site_settings`；
-   以 `legacy:site_settings:1` 定位来源，生成默认 Site UUID v4，并先持久化 pending；
-   失败重跑时读取并复用 pending `siteId`，完成后重跑为 no-op；
-   创建初始 Revision；
-   将本地 manifest 的私有 fingerprint 映射为当前 Site 下的随机 UUID v4 Asset；
-   无法确认 fingerprint 的路径型作品写入 unresolved 报告；
-   保存旧 asset path 作为临时 resolver 数据；
-   输出迁移报告。

## Step 4：双读

读取顺序：

``` text
新模型有 published revision → 新模型
否则 → 旧 site_settings
```

写入只写新模型。

## Step 5：切换

确认：

-   真实页面一致；
-   11 模板一致；
-   图片引用一致；
-   后台可保存；
-   回滚可用。

然后停止旧表写入。

## Step 6：保留期

至少保留旧表一个稳定版本，只读，用于紧急回退。

之后通过单独迁移删除。

------------------------------------------------------------------------

# 36. Codex 首次执行指令模板

将以下内容作为首次长期任务提示词：

``` text
你正在维护 FRAME//ZERO Portfolio Studio。

在执行任何代码修改前：

1. 阅读 docs/NORTH_STAR.md。
2. 阅读 README.md、package.json，以及 NORTH_STAR.md 第 2.3 节列出的当前代码基线。
3. 确认当前工作仅属于 Phase 0，不实现 Phase 1 之后的在线多用户功能。
4. 先输出：
   - 当前架构摘要；
   - Phase 0 差距；
   - 依赖关系；
   - 建议拆分的 Epic 和 PR；
   - 风险和需要 ADR 的问题。
5. 不要立即进行大规模目录重构。
6. 不要新增模板。
7. 不要删除当前 D1/本地照片兼容能力。
8. 任何数据库变化都必须提供迁移和回滚方式。
9. 任何授权变化都必须增加未授权和越权测试。
10. 所有完成声明必须以实际测试结果为依据。

首个目标：
建立项目治理与 Phase 0 实施基线，包括 CI、ADR 模板、SiteDocumentV1 计划、稳定 ID 迁移计划，以及 owner 授权和服务端真实内容渲染的任务拆分。

先提交计划，不要在同一轮同时改动所有模块。
```

------------------------------------------------------------------------

# 37. 日常 Codex 任务模板

``` text
背景：
- 阅读 docs/NORTH_STAR.md。
- 当前 Phase：
- 当前 Epic：
- 相关 ADR：
- 关联 Issue：

任务：
[清晰描述单一目标]

明确不做：
- [...]
- [...]

验收标准：
- [...]
- [...]

安全要求：
- 是否涉及认证：
- 是否涉及站点权限：
- 是否涉及跨租户数据：
- 是否涉及文件上传：
- 是否涉及用户删除：

数据要求：
- 是否需要迁移：
- 是否需要旧数据兼容：
- 回滚方式：

测试要求：
- 单元：
- 集成：
- E2E：
- 视觉：

交付：
1. 先检查当前实现。
2. 输出最小改动计划。
3. 实现。
4. 运行测试。
5. 总结修改、测试结果、风险与遗留项。
6. 更新 Roadmap/ADR/文档。
```

------------------------------------------------------------------------

# 38. 决策门

以下门槛未通过，不进入下一阶段。

## Phase 0 → Phase 1

-   真实内容 SSR；
-   owner 授权；
-   revision/publish；
-   stable IDs；
-   CI；
-   migration；
-   11 模板冒烟；
-   当前私人站迁移验证。

## Phase 1 → Phase 2

-   多租户隔离；
-   网页直传；
-   Worker；
-   PostgreSQL；
-   Docker 开发栈；
-   关键 E2E；
-   上传配额；
-   审计。

## Phase 2 → Phase 3

-   自托管安装验证；
-   备份恢复验证；
-   升级验证；
-   许可证；
-   安全文档；
-   版本发布流程。

## Phase 3 → Phase 4

-   托管稳定性；
-   成本可观测；
-   删除和导出；
-   风控；
-   运营工具；
-   用户支持流程。

------------------------------------------------------------------------

# 39. 项目成功的判断

FRAME//ZERO 的成功不是拥有最多模板。

成功意味着：

-   摄影师不懂代码也能发布具有个人风格的主页；
-   自托管者能够掌控自己的数据；
-   托管用户不会因一个错误保存破坏线上页面；
-   用户之间的数据严格隔离；
-   图片处理安全且可恢复；
-   模板可以持续演进而不破坏旧站点；
-   当前私人站可以平稳迁移，不被平台化重写牺牲；
-   开源版本和托管版本共享核心，不互相分叉；
-   Codex 和人类贡献者都能依据相同边界长期工作。

------------------------------------------------------------------------

# 40. 最终北极星声明

> FRAME//ZERO
> 将从一个高完成度的私人摄影主页，演进为一个以站点为租户边界、以版本化内容为发布核心、以对象存储和独立图片处理为素材基础、以纯模板契约为视觉扩展机制的开源摄影建站平台。

在这个目标下：

-   当前模板和图片处理能力是资产；
-   单条全局 JSON、隐式认证和本地 public 素材目录是过渡实现；
-   Phase 0 的任务是建立边界与安全；
-   Phase 1 的任务是实现可信的多用户 MVP；
-   Phase 2 的任务是让第三方能够真正自托管；
-   后续商业化和模板生态必须建立在这些基础上。

任何不能提升安全、可恢复性、发布可靠性、素材体验或自托管能力的工作，在当前阶段都应让位于上述目标。
