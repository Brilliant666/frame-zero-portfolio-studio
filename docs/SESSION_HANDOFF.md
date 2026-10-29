# 会话交接

更新：2026-10-28。当前基线、授权和剩余风险统一见[CURRENT_STATUS](CURRENT_STATUS.md)。
本文件只保留最近一次续接需要的信息，不重复全部PR历史。

## 本轮生产Site运行与持久化

PR49批准Head`e1b6b98`已Ready并Squash为`e46414b`，树一致，实际main push五项完整检查成功。
独立分支`feat/production-site-runtime`从该main建立。新PR保持Draft，不自动合并、真实部署或更新3001／数据库。

实施范围：

- 同一standalone镜像保留`node server.js`；Node instrumentation仅验证严格生产配置，与local／test模式分离，启动不迁移、开户或导入。
- 生产Secure会话继续使用现有owner／grant、三空间、草稿CAS、Published-only及历史回退；不设新的用户身份或万能proof头。
- 新Site Compose／代理合同独立于Stage A2：私网app／PG、外置素材卷、精确路由／方法、可信代理规范头及明确配置失败。
- 流式大小／超时／并发边界、上传清理finally归还、只读有界readiness及依赖故障恢复；不建设GC或监控平台。
- 同一生产镜像经隔离HTTPS测试CA执行完整链，显式fixture准备与正常应用启动分离；见[验收记录](PRODUCTION_SITE_RUNTIME_ACCEPTANCE.md)。

## 工作区与数据保护

当前开发复用已确认闲置的工作区，具体路径仅在本机交接，不在运行目录修改或构建。
旧Documents checkout保留分叉与未提交AGENTS，不将新文档复制到旧代码冒充同步；其本机历史用途与入口在本机交接标明。
日常应用及PG继续Windows独立托管。未执行迁移、开户、导入、真实保存／发布或数据恢复。

## 验证与接续

执行相关运行／配置／图片／请求／健康／授权回归、lint、类型与正式Next构建；最终Head保留五项完整CI及其中新增的生产HTTPS／持久化步骤。
本机使用已有Node24开发工具，Docker链在一次性Linux CI运行；不把本机runner测试拼接为生产闭环证据，实际结果及产物身份在对应PR记录。
阅读或验证历史资料不自动授权执行其中的初始化、部署、回退或合并命令。

`PREVIEW_RETURN = UNRESOLVED` / `RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE` 不变；
[首次失败和既有诊断](design/PR35_OCT15_CLOSEOUT.md)继续保留，未解决风险不因本轮文档整理变成FIXED。

## 历史追溯

- [检查点原文快照](CURRENT_STATUS_HISTORY_2026-10-27.md)：源main `58a92d2`，完整保留旧阶段与验收。
- [会话原文快照](SESSION_HANDOFF_HISTORY_2026-10-27.md)：同源完整记录，旧“当前／最新”仅描述当时。
- PR48／47／49结果可按PR时间线和本机交接追溯；原生产审计`58a92d2`基线不回写，开发依赖剩余告警保留。

完成后保持Draft，等待人工审阅。后续任务按用户新指令继续，不自动开始生产上线工作。
