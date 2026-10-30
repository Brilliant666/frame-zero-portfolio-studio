# 会话交接

更新：2026-10-30。当前事实与授权统一见[CURRENT_STATUS](CURRENT_STATUS.md)，这里只保留最近续接信息。

## 基线与已完成状态

最新main为 `68dfd53386f4afb05e6d5c5478e6c58d40b0c139`；PR50已Ready并Squash，树与原Head `ef4b77b` 一致。
[收口评论](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/50#issuecomment-6499205606)记录实际main push五项完整CI成功、Linux/amd64同镜像HTTPS／重启持久化与限制。
PR49／48／47均已合并。以上不是3001已升级或真实服务器已部署的证明；运行角色按本机交接确认。

## 本轮应用更新策略

分支 `docs/application-update-policy` 从上述main建立，只改AGENTS、README及开发流程／生产部署／当前状态／本交接六个文档。
规则主体在[DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md#应用更新与数据操作)，Compose实际行为与人工命令边界在[生产合同](PRODUCTION_SITE_DEPLOYMENT.md)。

- 普通兼容更新只替换app产物，沿用PG／照片／外置配置；常规备份独立维护，不每次更新重做全量备份或恢复演练。
- 兼容性schema、批量JSON／素材／权限／卷／密钥变化、搬迁与恢复按实际影响另行分类；不以没有SQL文件判断无数据风险。
- 首次生产可空站开始或迁入本地业务；仅迁入路径搬本地数据，两条路径都保留基本身份、安全与恢复保护。
- 应用回退须兼容当前数据；不回灌旧数据库覆盖新内容。产物准备与现场切换分开，授权范围内常规步骤连续完成，不逐步增加审批。
- 当前生产Site是人工app-only Compose操作，需人工核对原project及实际卷、镜像和secret；A2封闭壳工具不是Site更新器。
- 后台更新按钮、自动镜像渠道、Site专用更新脚本／自动回退未实现；本轮未实现一键更新或自动备份。

## 验证与停止点

仅做diff、相对链接、已有文档契约和公开安全检查；远端按现有分类，AGENTS改动走FULL，不改分类器求DOCS_ONLY。
不在本机重建产品、跑完整PG或浏览器；未执行文档中的示例命令、备份恢复或服务切换。实际检查／Head／CI进度在本轮Draft PR记录，不用状态文字反复提交。
运行、依赖、产品、schema、Compose与CI策略未修改；日常3001／PG、草稿、Published、素材、授权和历史资料保持原样。

`PREVIEW_RETURN = UNRESOLVED`／`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE`不变；首次失败与原断言保留。
PR50共享登录额度及真实服务器／ACME／架构／数据恢复覆盖限制继续保留，不在本轮重新实施。

完成后保持Draft，不合并、不部署、不自动继续旧计划。
最多一个后续建议是封装已有实例的普通app更新入口；须新授权，不附带迁移、全量备份或新管理平台。
历史只按需读[检查点归档](CURRENT_STATUS_HISTORY_2026-10-27.md)与[会话归档](SESSION_HANDOFF_HISTORY_2026-10-27.md)，不重复通读或执行旧初始化。
