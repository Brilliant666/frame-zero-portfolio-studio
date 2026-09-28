# Project execution entry

先用五分钟读取 [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) 和
[docs/SESSION_HANDOFF.md](docs/SESSION_HANDOFF.md)。之后仅按当前任务读取相关
North Star、路线图、Accepted ADR 与模块记录，不重新审计整个历史。

本次 PR32 交接之后，恢复上下文并等待用户选择下一项；
`PRODUCT_DELIVERY_MISSION_02` 不授权自动实施交接候选或合并未来 PR。

保护未提交编辑和私人 `public/photos`（永不暂存），只 `git add` 具体路径。
合并、破坏性操作、真实迁移和远程部署需要对应授权。
保留真实 Site 授权、资源归属、独立业务内容和 Published-only 公开读取。
先查现场进程与 Git 状态，不在运行目录切分支或覆盖构建。
Windows 服务按只读核对 → 停止 → 确认退出 → 启动 → 独立健康检查执行。
