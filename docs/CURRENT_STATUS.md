# 当前检查点

更新：2026-09-28。五分钟入口：[AGENTS](../AGENTS.md) → 本页 →
[SESSION_HANDOFF](SESSION_HANDOFF.md)。旧阶段报告只记录当时事实，不构成今天的门禁。

## 已接受的功能基线

PR28–31 已合并：真实账号与 Site 授权、两个独立内容空间、本站资源、
高级拍立得草稿/发布/历史/回退。PR32 两轮 UI 已获用户接受：基础六分区、
高级四分区，以及平台首页、登录和站点工作台的第一轮整理。
这不是“所有后台体验问题已解决”，也不是 V1 上线。

| 能力 | 实现与证据层级 | 仍有的边界 |
| --- | --- | --- |
| 账号、Site、模板授权 | IMPLEMENTED / VERIFIED_IN_CI / VERIFIED_LOCALLY | 本机 star、phototest 是模拟账号；不是实际客户认证 |
| 基础/高级独立编辑、保存、CAS、私人预览 | 同上；复用真实编辑器，隔离 PG 验证跨 Site 拒绝和重启持久化 | 保存不发布，两套业务资料不自动同步 |
| Site 资源及既有展示图接入 | 同上；归属校验、隔离上传回归、本机展示图可读 | 未完成完整原图归档、回收及大库体验 |
| 高级拍立得发布、历史、回退 | 同上；公开页只读 Published | 基础模板发布未接线 |
| 后台与入口 UI 第一轮 | IMPLEMENTED / VERIFIED_LOCALLY；37 项定向测试、27 项隔离 PG 集成、1440/390/320 有界面检查 | 搜索批选、分享卡新增替换、预览呈现统一另行确定 |
| 公网服务、真实客户交付 | 未验证、未授权 | REMOTE_DEPLOYMENT = NOT_AUTHORIZED；V1_LAUNCHED = NO |

## 版本和运行事实的定位

- PR30 Squash：`4abf530b35d3a063180fbadd689b609d97288ead`。
- PR31 Squash：`20d87433eb140f3d48ecec5fa175f0d72895ee53`；五项 main push 检查成功。
- [PR32](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/32) 是本次接受/收口记录。
  **其最终评论记录实际最终 Head、Squash、五项 main push 运行和 3001 切换结果**；
  这些结果只能在操作完成后记录，不用 PR 测试 merge SHA 冒充 Squash。
- 日常入口为 `http://127.0.0.1:3001/`；3003 只作候选验收，不能同时称为日常权威。
  两者使用同一本机业务库，不是两个沙盒，也不是 Cookie 隔离边界。
- 实际运行版本、3003 是否停止、目录、备份和恢复命令在仓库外
  `%LOCALAPPDATA%/PortfolioPlatform/local-m3/SESSION_HANDOFF.local.md`。
  PID 和运行状态需现场复核；仅连接 GitHub 时不得声称已验证本机。
- 主 checkout、历史工作分支、实际服务目录可能不同。先查 Git/进程，不擅自切分支或覆盖运行构建。

## 当前未完成与下一步

本轮新增授权：在 `codex/premium-photo-picker` 隔离分支实现
[高级图集批量选片](PREMIUM_PHOTO_PICKER.md)，只提交供继续修改，**不合并**。
此分支提供筛选、跨页多选、批量追加和顺序确认；基础图库、账号、上传底层、
真实迁移和公开主页不在范围内。已接受的 main / 日常 3001 基线仍是上文版本，
本分支不授权替换日常构建。此前交接的“等待新目标”已由本次具体请求解除，
其余合并、真实数据与远程部署边界保持。

详见 [交接问题表](SESSION_HANDOFF.md#已知问题与最多三个候选)。最多三个候选是：
图集选片/本站图库、分享卡与预览接线、基础模板发布。它们只是建议，不是执行授权。
本轮不再为微小字节告警压缩产品；预算政策见 [README](../README.md)。

## 当前权限终点

`PRODUCT_DELIVERY_MISSION_02` 保留为产品研发原则。PR32 交接已结束；
当前用户已批准上述高级选片切片及提交，后续小项继续逐项确认。
**本 PR 保持待修改，不合并；不继承 PR32 的 main 合并或日常切换权限。**

```text
NEXT_PRODUCT_IMPLEMENTATION = PREMIUM_PHOTO_PICKER_BRANCH_ONLY
REAL_STAR_PROVISIONING = LOCAL_SIMULATED_ACCOUNT_ONLY
REMOTE_DEPLOYMENT = NOT_AUTHORIZED
V1_LAUNCHED = NO
Remote deployment: FROZEN / NOT_AUTHORIZED
External deployment gate: EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED
Online status: NOT_ONLINE_PREVIEW
Repository deployment packaging: REPO_SIDE_BOOTSTRAP_READY
```

不重复 Auth POC、Docker 排障、开户、图库导入或旧预算清零；不修改真实资料、
不自动发布或迁移。私人 photos、SQLite、环境和凭据不入库；只按具体路径暂存。

## 细节记录

[账号](LOCAL_ACCOUNT_FOUNDATION.md) · [M2](M2_SITE_CONTENT_EDITOR.md) ·
[M3](M3_SITE_ASSETS.md) · [本机验收](LOCAL_M3_HANDS_ON_ACCEPTANCE.md) ·
[高级发布](M4_PREMIUM_PUBLICATION.md) · [UI 验证](ADMIN_WORKSPACE_LAYOUT.md) ·
[North Star](PORTFOLIO_PLATFORM_NORTH_STAR.md) · [路线图](SELF_HOSTED_V1_ROADMAP.md)。
本机完整审查报告和截图位于上述私有运维目录，不复制到公共仓库。
