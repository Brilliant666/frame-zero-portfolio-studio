# 当前检查点

更新：2026-10-31。这里记录核对时的基线、明确授权与停止点；历史验收不构成新授权。实施前仍须核对 GitHub 实时状态。

## 已合并基线

| 项目 | 核对结果 |
| --- | --- |
| main | `14098a2355cfe813a8f47452a52935559029f9e0`；[PR53](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/53) 已于 2026-10-31 人工合并，修复提交署名扫描误报 |
| PR52 基线的历史 main push | [Quality](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/41017126576)、[Public repository safety](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/41017126595)、[Container](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/41017126641)、[Deployment Bootstrap](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/41017126559)、[PostgreSQL Integration](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/41017126574) 均成功；只证明 `667092b` 的 CI，不代表 PR53 合并后的 main push 状态 |
| 既有实现 | PR50 生产入口与隔离 HTTPS／持久化验收、PR51 应用更新策略、PR52 退役脚本诊断已合并；不等于真实服务器已部署或日常应用已升级 |
| 历史 Draft | [PR16](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/16)、[PR26](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/26) 保持历史用途，不推进 |

账号／Site／owner 和 grant、三类独立内容空间、AssetId／素材、草稿 CAS、Published-only 与历史回退继续保留。
日常实际目录、BUILD、Windows 任务和配置只按仓库外本机交接及现场核对，不由 main SHA 推断已升级。

## 2026-10-31 授权与第 1 批

只读审查已交付，用户已授权开始第 1 批。每个 PR 从实时最新 main 建立新分支、只有一个目的；五项完整 CI 成功后交人工合并，不直接推 main，不自动合并或部署。

1. 文档对齐核对结果。
2. 补齐 Drizzle 快照并增加生成一致性检查；不执行真实迁移。
3. 统一 slug 规则，兼容已有 Site 与素材引用。
4. 拆分 JSON 读取名额。
5. 公开页外站导航：仍待行为决定，未作决定前不改。
6. 安全响应头、关闭 poweredByHeader 和图像优化、生产应用拒绝旧路由、root 元数据使用配置 origin。
7. 停用账号即时失效与 position 字段规范化。
8. 退役 pwsh 测试：删除真实执行或放宽超时的选择仍待决定，未作决定前保留现状。

具体分支、最终 Head、检查及合并状态以对应 PR 为准，不为 CI 状态反复提交检查点。

## 执行边界

- 不启停、构建覆盖或切换日常应用目录，不操作日常 PostgreSQL、真实数据、草稿、Published、素材与授权；不提交本机交接、凭据或私人照片。
- 不覆盖旧 checkout 的未提交编辑，不清理既有目录、历史分支、工作区或回退；必要测试只用隔离夹具。
- 保持路由、已存数据、已发布 Site 与素材兼容。真实迁移、合并、远程部署与破坏性操作需对应授权。
- 目标服务器、域名／TLS／上游反代、持久化路径与权限、空站或数据迁入、备份与异机恢复、正式 HTTPS 验收仍未决定或实施；后续部署方案先确认。

## 更新策略与剩余风险

普通兼容更新只替换应用产物，沿用现有 PG、素材和外置配置；备份独立维护。涉及 schema、JSON 批改、素材键／删除、数据库身份／角色、卷、关键密钥或基础设施变化，按实际影响分类。应用回退须兼容当前数据，不用旧库覆盖新内容，详见[开发流程](DEVELOPMENT_WORKFLOW.md#应用更新与数据操作)。

现有 Windows 控制入口和生产 Site 人工 Compose app-only 操作可供获授权的更新使用；后台一键更新、专用 Site 更新脚本、自动镜像发布／回退及自动备份尚未实现。

`PREVIEW_RETURN = UNRESOLVED`／`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE` 保留，原失败、±2px／焦点／后台滚动断言与超时不是生产接受。
登录仍共享每应用实例 10 次／60 秒额度；上游转发头、外站导航、生成快照与其他审查项按独立 PR 处理，不能把计划写成已修复。
[PR51 首次 main Quality 失败](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40999242678) 的原始原因未确认；PR52 增加诊断，不证明 10 秒超时失败模式已消除。

操作入口：[AGENTS](../AGENTS.md) → [SESSION_HANDOFF](SESSION_HANDOFF.md) → [DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md)／[生产合同](PRODUCTION_SITE_DEPLOYMENT.md)。
历史：[检查点归档](CURRENT_STATUS_HISTORY_2026-10-27.md)、[会话归档](SESSION_HANDOFF_HISTORY_2026-10-27.md)及对应 PR；历史文字不授予执行权限。
