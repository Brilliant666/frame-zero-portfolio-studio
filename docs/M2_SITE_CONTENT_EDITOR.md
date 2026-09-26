# M2：Site 独立内容编辑与草稿保存

日期：2026-09-26。状态：IMPLEMENTED / FINAL_CI_PENDING。

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
- VERIFIED_IN_CI：真实 PostgreSQL HTTP 链路在 `c04ea3f`、`33824f9`、`792b7ed` 均 21/21 通过（runs 36242808037 / 36243017371 / 36244336660）；包括双空间保存、跨 Site 拒绝、并发 200/409、重启读取。`792b7ed` 实际测试 merge SHA 为 `6de3031d79f9b52c655a320ed5240f55d066a1fd`。Quality 曾发现旧导航源码断言、高级预览错误进入 legacy 打包图谱及编译开关白名单断言；已隔离 Node 专用预览，只允许显式常量 0 的禁用开关，禁止环境值泄露的断言仍保留。最终 head 五项结果记录在 PR 评论；未提高任何预算。
- VERIFIED_WITH_REAL_STAR：NO。

### Windows legacy 同环境对照

使用已验证 main 的独立 worktree、同一个 Node 24 与同一套依赖执行一次对照：
main `9bdd45d` 为 563638 bytes（超原阈值 438 bytes）；`792b7ed` 为
563734 bytes（超原阈值 534 bytes），新增 96 bytes。两次本机 legacy 检查均为
FAIL，不写成 PASS；此新增量正在收口，不自动继承 PR28/29 的例外。

REAL_STAR_PROVISIONING = NOT_CREATED

REMOTE_DEPLOYMENT = NOT_AUTHORIZED

V1_LAUNCHED = NO
