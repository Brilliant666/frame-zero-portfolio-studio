# M3 本机人工验收交付

日期：2026-09-28。分支 `feat/site-assets-and-local-3001-cutover`，PR31 保持 Open + Draft，依赖 PR30；无合并、发布或远程部署。

## 用户追加确认

- 本机数据均用于模拟测试：允许 agent 创建 `star` 的本机 QA 账号。使用保留测试域邮箱、随机密码、未验证邮箱、普通摄影师身份；不将其计为真实客户开户。
- 旧记录 1 顶层 9 项作品缺 assetId，所指向的 18 个历史文件也不存在。用户明确批准仅从新导入基础草稿移除这 9 项；不修改旧源、不丢弃 71 项有效模板专属作品或高级图集。

## 可用入口

本机 origin 为 `http://127.0.0.1:3003`。

| 入口 | 行为 |
| --- | --- |
| `/login` | 真实 Better Auth 登录/退出 |
| `/star` | 本人登录且高级授权、未发布时，进入受保护的高级私人预览 |
| `/star/admin` | 本人 Site 入口，提供基础版与高级拍立得编辑器 |
| `/test` | 非摄影师 Site 的 11 模板实验室，仅非私人示例/空作品库 |
| `/test/admin` | 本人基础编辑器快捷入口；匿名转登录，不默认 star |
| `/phototest/admin/basic/profile` | 基础版六分区后台 |
| `/phototest/admin/premium-polaroid` | 独立高级拍立得后台 |
| `/phototest/admin/preview/basic` | 受保护的基础预览 |
| `/phototest/admin/preview/premium-polaroid` | 受保护的高级预览 |

验收跳转由默认关闭的 server-only `FRAME_ZERO_LOCAL_ACCEPTANCE=1` 控制，同时要求本机账号 runner、真实 loopback socket、精确 origin 和进程 proof。本人及高级权限仍在目标预览再次校验。匿名、其他账号、关闭开关或普通生产环境不读草稿；Published 不被私人草稿替换。跳转 `no-store, private`，`Vary` 包含 Cookie。

## 专用 PostgreSQL 与凭据

PostgreSQL 17.11 Windows x64 来自 PostgreSQL 官网指向的 EDB 二进制渠道。仅 `127.0.0.1:55434`，普通用户进程；未注册 Windows 服务，未改 PATH、防火墙、WSL 或 Docker。

日常库 `frame_zero_accounts` / 非超级用户角色 `portfolio_app`；自动化库 `frame_zero_accounts_test` / 独立角色 `portfolio_test`。密码使用 SCRAM；凭据、程序、数据、资源、日志、截图均位于仓库和构建目录之外，并以实际 Windows ACL 限定当前用户。私密值不进 Git、命令参数、日志、报告或截图。

下载本机 SHA256：`B9424EE7BC60B52450FF910A3630225DF32E633F3CB29C1D126D9299D59AEA28`。发行列表未提供可用校验值，二进制 Authenticode 为 NotSigned；此摘要仅用于本机下载记录，不声称发行方签名认证。真实来源：<https://www.postgresql.org/download/windows/> → <https://www.enterprisedb.com/download-postgresql-binaries>。

准确本机启动/停止命令、受限密码文件位置、PID 和工作目录保存在仓库外 `local-m3/本机验收操作说明.md`。启动不重复 initdb、迁移、开户或导入。旧 3001 未停、未切目录、未重建。

## 展示接入证据

- 旧基线：记录 1/2601 未变，141 文件逐项校验未变。
- 新快照含一致 SQLite 备份、原文档、manifest、原字节副本；未使用历史 HTML、截图或重建演示数组。
- 原样接入：41 私有资源、123 个变体、16,159,220 bytes；目标与快照逐文件 hash 相同。
- 基础版：8 组专属模板作品共 71 项；仅移除已批准的 9 项失效顶层引用。
- 高级版：3 图集、25 成员；身份、名称、顺序、封面、重点、配置按稳定映射保留；2 平台卡保留。
- 两空间资料/套餐/联系配置仍独立。首次 `IMPORTED`，复跑 `ALREADY_IMPORTED`；两草稿 revision 1。
- receipt `6dcc7a3f-38ce-4473-81be-e624ea5c468d`；plan SHA256 `954e1ba91107eec3ece508e6de8b333e64ac2f7b8f22d7786ce1525d191714d3`。
- 所有接入资源明确 `legacy-derived-only` / original `unavailable/not-mapped`；原图归档 INCOMPLETE。原图请求无 full 回退；普通上传仍保留原始字节。

省略批准绑定源指纹和完整作品 JSON 摘要，保留原对象及索引，且再次确认旧路径缺失。未批准、源变化、名单错误、资源文件再次出现、目标非空、字节/hash 错误仍拒绝，不是 force/ignore-errors 模式。

## 本机测试记录

- Windows Node 24.19.0：锁文件不变，`npm ci`、Next 16.3.3 正式构建通过；不是搬用 Linux 产物。
- 针对性管理端/导入单测 49/49、真实 PostgreSQL HTTP 集成 24/24、ESLint 通过。
- 真实 PostgreSQL 过期测试最初发现 UTC 假设：PG 为 Asia/Shanghai，测试 `now()-1 minute` 写入无时区 timestamp 被 Drizzle 当 UTC 解读。仅将测试故障注入改为 `timezone('UTC',now())-interval '1 minute'`；正常 Better Auth Date 写入、认证模型和迁移均不改，原 401 断言保留并通过。
- 有界面 Chrome 154，独立上下文，1440×900、390×844、320×844。phototest 实际 UI 上传 3 张匿名横/竖/方图，基础选片保存，高级复用同 3 资源、图集/封面/重点保存。两套资料不同，版本互不覆盖。API 仅作为读回断言，不代替 UI 写入。
- 三构图、双主题、大图与返回、刷新、退出重登、本人快捷入口、匿名及另一账号拒绝均已实测。含摄影照片的证据仅留仓库外，未上传到 PR/CI。
- 最终数据库与应用均已重启：phototest 两空间/资源与重启前快照完全一致；star 两空间与导入 plan 完整 deepEqual。star 三图集逐一打开照片与大图，两后台和预览在 1440/390/320 检查；phototest/qatest/匿名无法读 star 私人资源或草稿。star 浏览期间没有非认证 API 写入，两草稿前后未变。
- `/test` 可见选择控件的 11 项均逐一选择并点击“查看”，没有读取私人图片；旧 3001 `/test`、`/preview` 仍为 200。Node 实验室没有进入 legacy 构建依赖图。
- 最终本机只读浏览报告 6/6 通过。初次脚本读取表单值早于加载完成，改为等待真实读回值后通过；没有用修改产品或伪造数据解决脚本时序问题。

体积遵循已批准告警政策；本次 Next 跨路由 application JS 290562、bootstrap JS 611570、CSS 307265 bytes；CSS 对照 307200，+65 bytes 为 WARNING。Legacy public JS 567887 bytes，延续已披露的聚合告警。结构安全检查及单模板 64KiB 硬约束仍通过；未为减字节修改产品。这些是原始构建文件口径，不是压缩传输量或首屏执行时间。

## 交付边界

真实客户 star 开户：NOT_PERFORMED（本机模拟 star，不是客户证据）。原图归档 INCOMPLETE；PUBLISH UNCHANGED；REMOTE_DEPLOYMENT NOT_AUTHORIZED；V1_LAUNCHED NO；LOCAL_3001_CUTOVER NOT_PERFORMED_THIS_TASK。

本轮结束后保持 PostgreSQL、新 3003 和旧 3001 可用，等待人工体验。最终完整 Head、CI 五项 run ID/event/test SHA 在 PR31 收口评论记录，避免把旧结果当作最终 Head 验证。

```text
LOCAL_POSTGRES = VERIFIED
M3_ON_3003 = RUNNING_AND_VERIFIED
PHOTOTEST = LOGIN_VERIFIED
STAR = LOGIN_VERIFIED (LOCAL_SIMULATION, NOT_REAL_CUSTOMER)
STAR_DISPLAY_LIBRARY = IMPORTED_AND_VERIFIED
STAR_ORIGINAL_ARCHIVE = INCOMPLETE
FOUR_ENTRY_ACCEPTANCE = READY
PUBLISH = UNCHANGED
LOCAL_3001_CUTOVER = NOT_PERFORMED_THIS_TASK
```
