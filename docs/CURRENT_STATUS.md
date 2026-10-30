# 当前检查点

更新：2026-10-30。本页记录当前事实、授权与停止点，历史验收不构成新授权。

## 已合并基线与本轮工作

| 项目 | 当前事实 |
| --- | --- |
| 最新main | `68dfd53386f4afb05e6d5c5478e6c58d40b0c139`；[PR50](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/50)已Squash合并，文件树与审查Head一致 |
| 生产运行与持久化 | 已有严格生产入口、HTTPS／PG／私有素材卷及同产物隔离业务链；[实际main push五项完整检查成功](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/50#issuecomment-6499205606)，不等于真实服务器已部署 |
| 依赖与历史资料 | PR49安全基线、PR48工程流程及PR47审计均已合并；保留原审计基线与4项moderate开发链／Miniflare旧Sharp边界 |
| 本轮 | `docs/application-update-policy`：仅固化应用更新、首次部署、数据迁移与备份恢复规则，完成后独立Draft PR，不自动合并 |

账号／Site／owner和grant、三类独立内容空间、AssetId／素材、草稿CAS、Published-only与历史回退继续保留。
真实服务器、DNS／TLS、数据迁入与公网验收未实施；日常实际目录、BUILD和Windows任务仅按仓库外本机交接及现场核对，不由main SHA推断已升级。

## 更新策略与已有实现

普通兼容更新默认只替换应用产物，沿用现有PG、照片／素材和外置配置；备份独立持续维护，不机械追加全库／全图库复制、迁移或恢复演练。
涉及schema、JSON批改、素材键／删除语义、数据库目标／角色、卷、关键密钥或基础设施变化，按实际影响分类，不只看有没有SQL文件。
空生产站与一次性迁入本地业务是两条首次部署路径；仅后者需要搬本地数据，两者均保留首次上线必要保护。
应用回退必须兼容当前数据与配置，不用旧快照覆盖较新内容。详细规则见[开发流程](DEVELOPMENT_WORKFLOW.md#应用更新与数据操作)。

当前可用Windows既有控制入口和生产Site人工Compose app-only操作；后台一键更新、专用Site更新脚本、自动镜像发布／自动回退尚未实现。
本轮不实现或执行这些功能，亦不宣称自动备份已完成。

## 本轮边界

- 仅修改规则／文档并做相关diff、链接、文档契约及公开安全检查，提交推送新Draft PR。
- 不改产品、依赖、schema、Compose行为或CI分类器；AGENTS触发FULL时由远端按原策略执行，本机不重复构建／全量PG／浏览器。
- 不启停或部署3001、PG或真实服务器，不导出／搬迁／恢复／删除真实数据；不清理历史分支、工作区、私人配置或回退。
- 合并不自动部署；本规则不是永久运行授权，也不自动启动备份恢复、登录限流改造或其他旧计划。

## 风险与接续

`PREVIEW_RETURN = UNRESOLVED`；`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE`，原首次失败、±2px／焦点／后台滚动断言与超时保留，不是生产接受。
当前登录共享每应用实例10次／60秒额度，真实开放前需针对目标入口明确处理或接受；本轮不改该策略，见PR50收口记录。

目标服务器、域名／TLS入口、架构、网络／端口、卷路径／权限、基础备份恢复及运维责任仍待确认。
本轮规则调整不等于部署或恢复演练完成；完成后保持Draft，等待人工确认，不自动接续任务。

操作入口：[AGENTS](../AGENTS.md) → [SESSION_HANDOFF](SESSION_HANDOFF.md) → [DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md)／[生产合同](PRODUCTION_SITE_DEPLOYMENT.md)。
历史：[检查点归档](CURRENT_STATUS_HISTORY_2026-10-27.md)、[会话归档](SESSION_HANDOFF_HISTORY_2026-10-27.md)及对应PR；不重写历史观察为当时已经完成。
