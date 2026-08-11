# ADMIN-V2 / DESIGN-01

ADMIN-V2 把当前私人站后台从单页长表单拆成六个有明确任务边界的工作区，同时保持
legacy `SiteContent`、`/api/site-content` 和 `site_settings(id = 1)` 行为不变。

## 固定信息架构

| 路由 | 负责内容 |
| --- | --- |
| `/admin/template` | `activeTemplate`，模板查看、选择和独立预览 |
| `/admin/profile` | `profile`、`hero`、`trustItems`、`statement` |
| `/admin/packages` | `packages` |
| `/admin/layout` | `templateWorks`、现有照片 manifest 与本机素材导入入口 |
| `/admin/contact` | `contact`、`social`、`bookingFields` |
| `/admin/advanced` | legacy `works` 与恢复示例草稿 |

`/admin` 默认跳转到 `/admin/template`。服务端 Admin layout 继续执行现有本地/ChatGPT
认证门禁；客户端 Provider 在六个子路由之间保留同一份 draft 与最后成功保存的内容。

## 保存语义

- draft 与最后成功保存的 JSON 不同即为未保存；恢复原值会重新变为 clean。
- 无修改、读取失败、读取降级或正在保存时不会发送 PUT。
- 保存仍只发送 `PUT /api/site-content` 和 `{ content: SiteContent }`。
- 顶栏“保存全部修改”保存六个分区共享的完整 draft；窄屏可缩短可见文案，但无障碍名称仍保留完整语义。
- 保存失败保留 draft；保存期间产生的新编辑不会被较早的服务器响应覆盖。
- `Ctrl+S` / `Cmd+S` 阻止浏览器保存网页并触发同一保存操作。
- 有未保存修改时使用浏览器 `beforeunload` 保护真实离开或刷新；Admin 内部分区切换不弹窗。
- D1 读取失败或返回 fallback warning 时暂停编辑，避免用示例内容覆盖未知的持久化数据。

## 交互边界

- Admin 顶栏、认证门禁和页面 metadata 使用通用的内容管理标题，不把当前示例站品牌写入后台系统身份。
- 桌面端使用 sticky sidebar；移动端使用紧凑的原生 section selector。
- 11 个正式模板使用紧凑选择列表，同一时间只展开当前查看候选的完整详情；已保存、当前 draft 与正在查看三个状态分别显示。浏览候选不会修改 draft，只有“选择此模板”会修改 draft，独立预览也不会修改 draft。
- 基本资料优先展示摄影师、Hero 与信任信息；`profile.brand`、`profile.mark` 和 `statement` 保留原契约，但收进默认关闭的可选品牌内容。
- 每个套餐的主页标题始终以可编辑输入显示，其他套餐字段继续使用有文字状态的 disclosure；旧版作品只在高级设置中按需展开。
- `npm run dev` 先在 `127.0.0.1` 的系统分配空闲端口启动独立素材导入服务，等待可信 IPC ready 后再把实际 origin 仅注入 Admin server；浏览器选择的单张、多张或文件夹照片仍逐张流式交给现有 Sharp importer，用户无需管理 companion port，整个合法 manifest 仍是自动排版候选集，不增加 approved pool。
- 单文件上限为 200 MiB；服务请求和同一项目的 manifest 写入均串行，临时文件在成功、失败或中断后清理。
- “添加照片”是本次单张或多张选择；“添加文件夹”是包含嵌套目录的本次快照，后续文件变化不会自动同步。普通浏览器不会提供可安全持久化的绝对目录路径，记住并重扫来源仍是 `LOCAL_SOURCE_BINDING_FOLLOWUP`。
- 导入照片立即更新本地 Photo Library，但不修改 SiteContent draft、不触发自动排版，也不需要点击“保存全部修改”；导入结束自动刷新 manifest。“刷新素材库”也只重新读取 manifest，不会扫描电脑文件夹。
- 远程 Admin 不提供可执行的本机导入控件；本轮不增加云端素材 API、对象存储、删除能力或 repository。
- 恢复示例数据必须通过原生 dialog 二次确认；确认只替换当前 draft，不立即写数据库。
- 手机端可以访问全部内容和基础操作；专业级三栏排版仍以桌面端效率为优先。

## 明确不做

本设计不引入实时主页 iframe、SiteDocument 运行时接线、新内容 schema、D1 API、数据库
迁移、云端 repository、Asset UUID 分配、素材删除、模板目录变化或正式模板布局与视觉方向重做。
本机 loopback import service 只是开发期 companion，不属于 hosted runtime；hosted 请求即使存在环境变量也不能启用本机 picker。独立 `npm run photos:serve` 默认使用可预测的诊断端口，并允许显式指定其他端口；其他边界需要独立范围审查。
