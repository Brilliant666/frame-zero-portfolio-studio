# ADMIN-V2 / DESIGN-01

ADMIN-V2 把当前私人站后台从单页长表单拆成六个有明确任务边界的工作区，同时保持
legacy `SiteContent`、`/api/site-content` 和 `site_settings(id = 1)` 行为不变。

## 固定信息架构

| 路由 | 负责内容 |
| --- | --- |
| `/admin/template` | `activeTemplate`，模板查看、选择和独立预览 |
| `/admin/profile` | `profile`、`hero`、`trustItems`、`statement` |
| `/admin/packages` | `packages` |
| `/admin/layout` | `templateWorks`，只读当前 `activeTemplate` 与现有照片 manifest |
| `/admin/contact` | `contact`、`social`、`bookingFields` |
| `/admin/advanced` | legacy `works` 与恢复示例草稿 |

`/admin` 默认跳转到 `/admin/template`。服务端 Admin layout 继续执行现有本地/ChatGPT
认证门禁；客户端 Provider 在六个子路由之间保留同一份 draft 与最后成功保存的内容。

## 保存语义

- draft 与最后成功保存的 JSON 不同即为未保存；恢复原值会重新变为 clean。
- 无修改、读取失败、读取降级或正在保存时不会发送 PUT。
- 保存仍只发送 `PUT /api/site-content` 和 `{ content: SiteContent }`。
- 保存失败保留 draft；保存期间产生的新编辑不会被较早的服务器响应覆盖。
- `Ctrl+S` / `Cmd+S` 阻止浏览器保存网页并触发同一保存操作。
- 有未保存修改时使用浏览器 `beforeunload` 保护真实离开或刷新；Admin 内部分区切换不弹窗。
- D1 读取失败或返回 fallback warning 时暂停编辑，避免用示例内容覆盖未知的持久化数据。

## 交互边界

- Admin 顶栏、认证门禁和页面 metadata 使用通用的内容管理标题，不把当前示例站品牌写入后台系统身份。
- 桌面端使用 sticky sidebar；移动端使用紧凑的原生 section selector。
- 11 个正式模板在同一页响应式卡片网格中全部展开；只有“选择此模板”会修改 draft，独立预览不会修改 draft。
- 基本资料优先展示摄影师、Hero 与信任信息；`profile.brand`、`profile.mark` 和 `statement` 保留原契约，但收进默认关闭的可选品牌内容。
- 每个套餐的主页标题始终以可编辑输入显示，其他套餐字段继续使用有文字状态的 disclosure；旧版作品只在高级设置中按需展开。
- 素材排版只重组现有 manifest、固定槽位和既有算法，不新增素材 API 或 repository。
- 恢复示例数据必须通过原生 dialog 二次确认；确认只替换当前 draft，不立即写数据库。
- 手机端可以访问全部内容和基础操作；专业级三栏排版仍以桌面端效率为优先。

## 明确不做

本设计不引入实时主页 iframe、SiteDocument 运行时接线、新内容 schema、新 API、数据库
迁移、repository、Asset UUID 分配、模板目录变化或正式模板视觉修改。这些边界需要独立
范围审查。
