# Project execution entry

先用五分钟读取 [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) 和
[docs/SESSION_HANDOFF.md](docs/SESSION_HANDOFF.md)。之后仅按当前任务读取相关
North Star、路线图、Accepted ADR 与模块记录，不重新审计整个历史。

按当前用户明确授权和 CURRENT_STATUS 的检查点继续；交接候选本身不构成实施授权。
`PRODUCT_DELIVERY_MISSION_02` 不自动授权合并、日常切换或远程部署。

不需要每个小改动都要求全项目审计。验证应与变更影响相称；改按钮文字不重测整个发布系统。
完成必要检查后，仅在新增修改、失败或未解决的疑点需要时扩大验证。

保护未提交编辑和私人 `public/photos`（永不暂存），只 `git add` 具体路径。
合并、破坏性操作、真实迁移和远程部署需要对应授权。
保留真实 Site 授权、资源归属、独立业务内容和 Published-only 公开读取。
先查现场进程与 Git 状态，不在运行目录切分支或覆盖构建。
Windows 服务按只读核对 → 停止 → 确认退出 → 启动 → 独立健康检查执行。
