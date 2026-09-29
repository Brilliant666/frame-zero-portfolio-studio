# 当前检查点

更新：2026-09-29。[AGENTS](../AGENTS.md) → 本页 → [SESSION_HANDOFF](SESSION_HANDOFF.md)。
当前新增：[图库到图集的创建流程](PR33_ALBUM_CREATION_FLOW.md)，按“图库 → 图集”导航和命名后直接选片实施。运行与最终 CI 以本机交接和最新 Head 为准。
本次切片：[本站图库、图集库与精确排序](PR33_LIBRARY_WORKSPACE.md)。布局与长图集排序按实际体验重做；运行切换状态以本机交接现场记录为准。
最新切片：[高级图集直接排序与即时效果](PR33_COLLECTION_ORDER.md)。3003 已经用户确认后更新；草稿和 Published 未变，3001/3004 未动。远端检查须核对本次提交 Head。
当前任务：**PR33_ADMIN_UX_A_B_C**，实施与未完成验收见 [后台体验记录](PR33_ADMIN_UX.md)。前次任务：**PR33_UNATTENDED_FUNCTIONAL_CLOSURE**，范围和切片证据统一记在
[PR33 功能收口记录](PR33_FUNCTIONAL_CLOSURE.md)。旧交接的“只做选片／逐项等待”已由用户本轮授权替代。

## 当前研发状态

[PR #33](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/33)，
`codex/premium-photo-picker`，保持 **OPEN + DRAFT**，不合并。
基础发布、保存并发布、同地址展示切换、可选联系卡和基础图库真实时间排序已实现。
本机完整门禁 596 项、lint、真实 PostgreSQL 与浏览器 31/31 通过；11 模板矩阵完成。
实现与本机自动化测试 SHA：`6785bdfcbd39c834e3a660808b9f0796fb2975ec`；后续收口提交仅整理文档。
最终远端五项 CI 必须查看 PR 对应 Head，不能引用起始提交的旧检查；人工视觉接受仍待确认。
隔离验收已在 `http://127.0.0.1:3004/login` 运行，账号和私有凭据位置见收口记录。

| 能力 | 当前事实 |
| --- | --- |
| 账号、Site、模板授权、本站资源 | 原已接受基线；本机模拟验证，不是实际客户验证 |
| 基础／高级内容 | 11 套基础模板共用基础内容；高级独立资料、套餐、联系、图集与版本；仅同 Site 共享资源 |
| 保存与发布 | 普通保存及 Ctrl/Cmd+S 只保存草稿；保存并发布明确更新唯一 Published 指针 |
| 唯一公开地址 | `/:siteSlug` 按 Published 空间和模板渲染；切后台、选模板和保存均不切换公开页 |
| 联系卡 | 文字／网址独立可用，图片可选；替换／移除只改本空间引用，不删除底层资源 |
| 预览 | 当前内存编辑、本人已保存草稿、访客 Published 保持三种来源 |
| 高级选片 | 保留 48 张分页、跨页多选、按选择顺序追加、去重、500 上限和冲突保护 |

## 日常与授权边界

日常 3001 已经前次明确授权更新到 PR33 `ea76e48`，备份后应用 0004；本次保持不变。
本次 3003 使用独立构建副本、独立 PG 55435 和匿名测试素材。原 3004 与日常业务库均受保护。
后台体验 A/B/C 已实现；75 项相关测试和独立 API 回归通过，同数据截图已完成。真实手机软键盘、基础跨空间确认框后的浏览器路径仍待人工验收，不能算全部通过。

用户已授权本 PR 内连续实现、测试、提交、推送和更新描述；
**未授权 Ready、Approve、Merge、auto-merge、main 修改、日常切换、真实迁移或远程部署。**
历史 site-content-integration 未提交编辑、私人照片、数据库、草稿和 Published 指针受保护。

`HUMAN_VISUAL_APPROVAL = PENDING` · `DAILY_3001 = UNCHANGED` ·
`DAILY_DATA_AND_PUBLISHED = UNCHANGED` · `REMOTE_DEPLOYMENT = NOT_AUTHORIZED` · `V1_LAUNCHED = NO`。
远程交付门禁继续为 `EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED`；本地研发授权不替代该审批。
已有仓库侧部署准备仍为 `REPO_SIDE_BOOTSTRAP_READY`、`NOT_ONLINE_PREVIEW`；
`Remote deployment: FROZEN / NOT_AUTHORIZED`。

## 暂缓

资源回收／永久删除、完整原图补档、公网部署与真实客户交付未实施。
不重做 Auth POC、Docker 排障、开户、历史图库迁移或微小预算压缩。
小改动采用相称验证，不要求每个按钮改字都重审整个发布系统。

[North Star](PORTFOLIO_PLATFORM_NORTH_STAR.md) · [路线图](SELF_HOSTED_V1_ROADMAP.md) ·
[发布](M4_PREMIUM_PUBLICATION.md) · [选片](PREMIUM_PHOTO_PICKER.md) · [后台](ADMIN_WORKSPACE_LAYOUT.md)。
运行目录、私有备份、凭据位置和恢复命令见仓库外
`%LOCALAPPDATA%/PortfolioPlatform/local-m3/SESSION_HANDOFF.local.md`，PID 必须现场复核。
