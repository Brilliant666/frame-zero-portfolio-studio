# M2：Site 独立内容编辑与草稿保存

> 历史阶段记录：保留当时范围、失败与验收事实；当前能力、合并、运行及授权
> 以 [CURRENT_STATUS](CURRENT_STATUS.md) 和 [SESSION_HANDOFF](SESSION_HANDOFF.md) 为准。
> 下文当时的 Draft、环境缺口或“未完成”不自动构成当前阻塞。

日期：2026-09-27。状态：PR30_BUDGET_POLICY_IMPLEMENTED / HUMAN_ACCEPTANCE_PENDING。

分支：`codex/site-content-editor-integration`；[Draft PR #30](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/30)。最终 head 的 CI 结果在 PR 验收评论记录，避免把早期 head 结果替代最终验证。

## 合并收口

PR28_PR29 = MERGED_AND_MAIN_VERIFIED

- PR28 final head: `3263d4d917b3d59c623b420cb1537cb5a8ff99ff`；已转 Ready。
- PR28 Squash: `d9599fd1d7913d2a84895c5908c54ee9c95bd8df`。
- PR29 协调前 head: `71c90ed7a0e0b6c79ccd015de8be839a15f2e96e`。
- PR29 普通 merge 后 head: `8ae255f1b9f6dcaca857671f673636f05c73a09f`。
- 两者 tree 均为 `71ef21f61126ae1326f9933f22a7969d8050d056`；main 是协调后祖先。
- base 从 `feat/local-account-site-foundation` 改为 `main`。原依赖与 main Squash tree 相同，7 个冲突仅为历史机械协调，未改变代码树。
- PR29 新 base PR 验证测试 merge SHA：`dbc7257dec54f4ce54dede02b9a1dfbee69efea5`，并非最终 Squash。
- PR29 已转 Ready，Squash: `9bdd45daf326d65def222b20033ff2774decbfc1`。
- 仓库实际无 main 分支保护/rulesets、无外部 review 或未解决线程；未自行 Approve、未使用 auto/admin merge。

| 检查 | PR28 后 main push run | PR29 新 base PR run | 最终 main push run |
| --- | --- | --- | --- |
| Quality | 36240808286 | 36241199954 | 36241369096 |
| Public repository safety | 36240808352 | 36241199940 | 36241369121 |
| Container | 36240808272 | 36241199945 | 36241369085 |
| Deployment Bootstrap | 36240808258 | 36241199934 | 36241369071 |
| Local Account PostgreSQL Integration | 36240808306 | 36241199960 | 36241369103 |

以上 15 项均 success。两列 main 的 event 均为 push，实际 SHA 分别为上述 `d9599fd...` 和 `9bdd45d...`。本机 main 已快进到最终 main；主工作目录仍保持原分支以保留运行服务。没有删除任何分支。

保留已接受例外：本机 PostgreSQL 未验收；真实 star 未开户；PR28 Windows legacy 超 6 bytes、PR29 超 438 bytes，Linux 原阈值通过；无历史修改前 SQLite 快照。未迁移真实数据、未部署、未诊断或重启 Docker。这些不是 M2 新预算差异的豁免。

## 本轮能力

- `/:slug/admin` 真实授权入口链接至基础六分区后台和已授权高级拍立得后台。
- 基础沿用 AdminProvider/AdminShell 与六个现有编辑器；高级沿用 PreviewPortfolioAdmin。
- `GET/PUT /api/sites/:slug/drafts/:space`，space 仅 basic / premium-polaroid。
- 两套资料、文案、套餐、联系与配置独立。无默认复制、账号资料填充或全局 JSON 代理。
- 每次服务端校验真实 session + slug owner + premium grant，数据库操作再次包含 site、space、owner/grant 条件。
- 显式迁移增加 `site_content_drafts`；主键 `(site_id,space)`，独立 revision。PUT 必须提供 expectedRevision，单条 SQL CAS，冲突 409 保留编辑。
- 基础 Provider 位于持久 layout，跨分区保留草稿；保存期间的新编辑不被旧响应覆盖。
- 基础空站点可以新增/删除空白套餐与信任信息，不填示例资料。两套 schema 与空默认独立，未来高级字段扩展不强制基础同步。
- 私人 `/:slug/admin/preview/:space` 授权后读取草稿。公开 `/:slug` 仍显示未发布，不读取草稿。

## 明确未接线

M3 Site 选片、上传、资源解析、平台卡尚未接入。Site 模式不请求全局 manifest，不复制旧站资料/照片，不导入旧原型；全部资产引用由服务端拒绝。空图集可编辑，高级受保护预览复用现有渲染器的空素材路径；原 `/preview` 本机完整体验及生产门禁不变。

不执行真实迁移，不写 SQLite 1/2601，不动照片、manifest/catalog、平台卡、环境文件或 localStorage。迁移只在隔离 CI 数据库测试。

## 验证层级

- IMPLEMENTED：真实编辑器、独立内容 API、显式迁移、CAS 和受保护预览。
- VERIFIED_LOCALLY：Next 正式构建、原预算、TypeScript、ESLint、编辑器及 schema 行为测试。无本机 PG 或完整真实登录保存验收。
- VERIFIED_IN_CI：历史真实 PostgreSQL HTTP 链路在 `c04ea3f`、`33824f9`、`792b7ed` 均 21/21 通过（runs 36242808037 / 36243017371 / 36244336660）。本轮在 `fd6601c` 增加实际 Chromium 操作，12/12 浏览器阶段通过，保留原 HTTP 检查；五项 CI 成功。详见下方验收记录，最终 head 的结果以 PR 验收评论为准，不复用旧 head 绿灯。Quality 历史接线问题已修复，未提高预算。
- VERIFIED_WITH_REAL_STAR：NO。

### Windows legacy 同环境对照

使用已验证 main 的独立 worktree、同一个 Node 24 与同一套依赖执行一次对照：
main `9bdd45d` 为 563638 bytes（超原阈值 438 bytes）；`792b7ed` 为
563734 bytes（超原阈值 534 bytes），新增 96 bytes。两次本机 legacy 检查均为
FAIL，不写成 PASS；此新增量不自动继承 PR28/29 的例外。

### PR30 有限收口：Windows 同条件复核（2026-09-27）

固定 base `9bdd45d` 与起始 head `df253cf`，Windows、Node 24.19.0、npm
9.8.1、相同 lockfile 和 vinext/Vite 版本；标准构建清理各自生成目录，未清理
真实运行目录或 `.wrangler`。公共 JS 分别为 563638 / 563734 bytes，增量仍为
96 bytes。模块数量相同，没有新增公开模块或重复引入 composer。

增量按入口归属：preview-workspace/admin +61、polaroid-field/template +31、
虚拟浏览器入口 +4 bytes；来自禁用 Site adapter 后的参数、Hook 常量依赖和绑定
残留。一次恢复模块 endpoint / 去除组件别名的小尝试得到 563738 bytes，反而
增加 4 bytes，已完整撤回。没有进行无依据的第二轮尝试，没有修改阈值或统计口径。

本项结果 C：**新增回归仍待决**；Windows 绝对预算 **FAIL**（原阈值 563200）。
此结论不阻止独立的真实编辑器验收，也不表示接受新增例外。

保存可编辑修复后同条件复测 `e5b6f2a`：563772 bytes，相对 base **+134**，
绝对超限 **572**。额外 38 bytes 属于必要编辑器修复，不隐藏、不豁免。
后续仅测试、Node 专用预览提示与文档改动；最终构建结果在 PR 验收评论列明。

### 实际编辑器验收与有限修复

新增精确版本 `playwright@1.63.0` 开发测试依赖，仅用于既有 PostgreSQL CI；
浏览器用隔离匿名 A/B，正式 Next 构建，同源 `http://127.0.0.1:3004`，
Chromium 153.0.8010.12。不是本机 PostgreSQL或真实 star 验收。

首轮暴露基础版保存时 fieldset 禁用，已仅对 Site 模式修复；保存按钮仍锁定，
旧响应继续由原协调逻辑保护新编辑。测试自身手写等待无界/冲突交互等待问题已
改为有界等待、明确处理确认框、逐阶段落盘及实际 UI 状态等待；未放宽业务断言。
人工看图另发现受保护预览提示被固定顶栏覆盖，已只修 Site 预览提示与返回链接，
追加每个验收尺寸的可点击检查，不改原模板。

| 实操项目 | fd6601c 浏览器结果 |
| --- | --- |
| 真实登录，经后台入口进入，六分区未保存草稿与焦点 | 通过 |
| 基础/高级不同资料、套餐、联系保存与刷新，两边独立版本 | 通过 |
| 空图集创建、改名、排序、保存 | 通过 |
| 两空间延迟真实 PUT 响应，继续编辑不被覆盖 | 通过 |
| 双标签页 200/409、保留草稿、导出、丢弃提醒 | 通过 |
| 未保存内存预览与受保护已保存预览 | 通过（内存预览沿用高级后台现有能力） |
| Ctrl/Cmd+S 每次仅写活动空间一次 | 通过 |
| B/匿名/过期会话拒绝 A，基础身份拒绝高级 | 通过 |
| 退出/换号拒绝旧页写入，延迟 A 响应不进入 B | 通过 |
| 公开仍未发布，重启后两份草稿不变 | 通过 |
| 1440x900、390x844、320x844 表单和预览 | 通过；预览提示遮挡在截图复核后另修 |
| 不请求旧内容、manifest、平台卡和导入路径 | 通过 |

代码验收 head `fd6601cb35688295ec64ceef9d9cc0f958d861a5`，event=pull_request，
attempt=1，实际测试 merge SHA `619db93bb38e2507aedb657165a710fc209b993f`：

| 检查 | Run（success） |
| --- | --- |
| Quality | 36290312097 |
| Public repository safety | 36290312081 |
| Container | 36290312091 |
| Deployment Bootstrap | 36290312079 |
| Local Account PostgreSQL Integration / postgres-integration | 36290312121 |

浏览器证据为该 run 的 `site-editor-browser-36290312121-1` artifact：
`acceptance.json`、28 张匿名截图、请求路径和状态（不含凭据、header、trace）。
文档与预览提示提交后的最终 head 另跑五项检查，精确映射写在 PR30 最终评论。

本机完整 npm test 执行至 legacy 预算失败，不能写为本机全通过；随后单独执行
legacy 渲染/API 38/38、Next 正式构建/预算和运行时 3/3、编辑器 focused 26/26，
以及 lint/type/public safety。Linux Quality 的完整 npm test 通过，不替代 Windows。

数据保护：本轮开始与收口只读比较记录1、2601及素材清单逻辑哈希一致；记录1
更新时间仍为 2026-09-27 01:24:01（旧 API 不提供 revision），记录2601 revision=7，
updatedAt=2026-09-24T09:58:05.181Z。快照留本机仓库外，不提交私人数据。

PR 保持 Open + Draft；以上是旧政策的历史结果，后续明确批准的政策见下节。下一阶段 M3 的
产品目标是本人 Site 的选片、上传和资源归属校验；本轮不开始实现，不导入真实资料。

HUMAN_ACCEPTANCE = PENDING

### PR30 预算政策对齐（2026-09-27）

用户通过 `PR30_BUDGET_POLICY_ALIGNMENT_AND_FINAL_REVIEW` 明确批准：legacy
纯体积阈值以及 Next 跨路由 application/bootstrap/CSS 总量改为可见告警，
保留原参考值。Next 单模板局部硬限制不变；manifest/资源缺失、不可读、
路径越界、无效结构、十一模板懒加载映射损坏仍为错误，非零退出。
只有告警时命令成功不代表全部指标达标；未知或失败计量标记 NOT_MEASURED。

历史 563772 > 563200 的 FAIL 不被改写。相同 Windows 基线的 +134 bytes
不再是单独压缩阻塞，不删除产品文案、校验或保存保护。本轮只改检查器、
匿名 fixture 行为测试、命令接线和交付记录；不改 M2 业务或安全门禁。

指标为未压缩原始产物字节。Next 的 `/` 与 `/test` 静态入口估计分别包含
可追踪入口和共享 bootstrap，每路由内部去重；联合总量跨路由再次去重。
模板懒加载集合不是首页首次下载。它们都不是 gzip/br、实际网络请求或执行耗时。
`/login`、Site 编辑器与完整 Published 摄影页本轮 NOT_MEASURED；未发布空页
不能作为未来摄影主页基线，也不因这些缺口新增 M3 门禁。

基线只沿用上述明确 commit、Windows/Node24.19.0/npm9.8.1/构建方式的历史记录，
不自动覆盖、不跨操作系统相减。无可比数据时 BASELINE_NOT_COMPARABLE。
体积告警仍需人工审查，不表示任意增长获批，也不授予 PR 合并权限。

本轮起始 head `f4171dc64e908abd8641e4c3faae9c8b470d04a5`，base/main
`9bdd45daf326d65def222b20033ff2774decbfc1`，没有后续未知产品差异。
Windows / Node 24.19.0 / npm 9.8.1，未改变依赖或构建方式，重新执行完整
`npm test`（含两种构建/检查及后续运行时测试）退出 0；legacy 告警后继续完成
38 项 legacy 渲染/API 和 33 项 Next runtime/预算行为测试。独立 focused 检查
34/34（legacy 10 + Next 21 + 历史兼容 3），lint、tsc --noEmit、diff --check、
public safety 通过。未操作 Docker 或本机真实数据库。

| 新构建 Windows 原始产物指标 | bytes | 参考值 bytes | 新政策结果 |
| --- | ---: | ---: | --- |
| Legacy public/client 跨路由 JS | 563772 | 563200 | WARNING，超 572 |
| Legacy Admin JS | 114639 | 163840 | WITHIN_REFERENCE |
| Legacy 全路由 JS | 678411 | 无独立历史参考值 | METRICS，不新增任意门槛 |
| Legacy 总 CSS | 277095 | 307200 | WITHIN_REFERENCE |
| Next 跨路由 application JS（入口 + 11 懒模板） | 278709 | 563200 | WITHIN_REFERENCE |
| Next 跨路由 bootstrap JS | 604582 | 716800 | WITHIN_REFERENCE |
| Next 跨路由 public CSS | 307190 | 307200 | WITHIN_REFERENCE |
| Next 最大单模板 JS | 44143 | 65536（硬约束） | PASS |

Legacy public JS 与起始 f4171dc 相同，相对同环境 main 历史基线 563638
仍为 +134；本次没有产品体积优化，也没有把旧 FAIL 改写成旧规则 PASS。
Next 没有本轮 main 同口径对照，增量 BASELINE_NOT_COMPARABLE，不以 Linux 相减。

| 路由静态入口估计（每路由共享文件去重，不含懒模板） | JS bytes | CSS bytes |
| --- | ---: | ---: |
| `/` | 575957 | 59072 |
| `/test` | 595714 | 178553 |

实现与本机验证成立；最终提交五项 CI 的 event/run/attempt/head/实际测试 merge
SHA 写入 PR30 最终评论，不复用 f4171dc 结果。现有 22 项 PostgreSQL 与十二阶段
浏览器断言保持原样，随最终 CI 执行；不额外手工重跑编辑器验收。

BUDGET_POLICY = IMPLEMENTED；ARTIFACT_INTEGRITY = PASS（本机产物）；
AGGREGATE_SIZE = WARNING（legacy）；WINDOWS_VERIFICATION = FULL_NPM_TEST_PASS_WITH_SIZE_WARNING；
M2_FUNCTIONAL_BASELINE = PRESERVED。最终阶段送审状态以最终 head CI 核对后的 PR 评论为准。
真实 star 仍未创建；本机 PG 未验收；M3_ASSETS = NOT_STARTED_IN_THIS_TASK。

M3_ASSETS = NOT_IMPLEMENTED_IN_THIS_PR

REAL_STAR_PROVISIONING = NOT_CREATED

REMOTE_DEPLOYMENT = NOT_AUTHORIZED

V1_LAUNCHED = NO
