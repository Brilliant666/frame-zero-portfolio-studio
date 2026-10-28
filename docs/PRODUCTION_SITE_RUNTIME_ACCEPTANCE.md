# 生产Site接入：隔离验收与边界

基线：main `e46414b94951c0a71e3f671c800a158fb76a1586`（PR49 Squash）。
分支：`feat/production-site-runtime`。本轮落实[原审计](PRODUCTION_READINESS_AUDIT.md)C1／C3及C5的必要接入；
不是PR-C的数据搬迁、备份恢复或真实公网验收。部署参数见[运行合同](PRODUCTION_SITE_DEPLOYMENT.md)。

## 实现

- `FRAME_ZERO_PRODUCTION_SITE=1`显式生产模式；启动instrumentation校验HTTPS origin、独立PG、秘密来源和外置私有素材根。
  缺失或冲突配置失败，不开启local proof／测试模式，不自动连接准备数据库、迁移、开户、导入或创建素材目录。
- 默认生产镜像仍`node server.js`、UID1000，业务复用已有会话、owner／grant、三个独立草稿、AssetId／相对键、发布历史和单Site公开指针。
  Cookie采用独立生产前缀、Secure／HttpOnly／SameSite=Lax／host-only。没有引入身份头或公开运行proof。
- 应用与PG仅在私有backend，PG／素材使用独立持久卷。应用使用独立非superuser的DML角色，PG管理秘密不挂载到应用。
  readiness只读拒绝管理级角色；角色／schema准备是显式运维步骤，不在应用启动执行。基础Site Compose不发布宿主端口；可选ports覆盖仅作用于入口代理。
  原Stage A2安全壳与拒绝规则保留，新业务代理逐路由／方法开放，legacy／测试入口继续拒绝。
- 可信边界依赖私网拓扑和唯一入口：代理拒绝／删除客户端转发及身份头，生成固定canonical Host／XFH／HTTPS；应用仍严格检查Host／Origin与会话授权。
  不把任意客户端XFF当身份，不把应用监听端口直接公开。目标既有反代必须履行同一合同，不能仅改白名单。
- auth／publication JSON 2048字节，draft512000字节，逐块读取／10秒deadline／8个并发JSON读取名额；上传25MiB／30秒／独立2并发与原格式、像素、原图规则保留。
  清理失败也归还处理名额，只记录固定错误；不自动回收孤儿文件。生产readiness只读检查关键schema与素材RWX，整体约1500ms有界，live保持轻量。
- PG空闲连接错误采用固定码监听，不因依赖中断使进程未捕获退出；请求继续返回明确不可用，恢复不执行迁移。

## 同一产物的验收方法

现有PostgreSQL CI增加 `npm run verify:production-site`；脚本在非显式Linux CI环境直接拒绝执行。
每次生成唯一Compose project／临时目录／数据库／素材卷、随机秘密和两个虚构账号；不接受本机数据库URL或素材路径。
PG默认无宿主端口，仅CI临时覆盖随机loopback端口用于显式fixture迁移／开户；所有业务请求经过正式应用镜像的HTTPS代理。
fixture准备不是正常应用启动步骤，也不是业务链的替代runner。

脚本构建一次正式Dockerfile镜像，记录image ID／Linux CPU架构／源码revision与tree。启动、restart和force-recreate始终核对相同image ID。
测试域名为`portfolio.test`，宿主映射端口与canonical origin一致；读取当次Caddy内部CA，用Node HTTPS显式CA、正确servername和证书验证。
没有`rejectUnauthorized:false`，没有公网域名、真实ACME或目标服务器接触。

以下是实际脚本的验收项；**执行结果、最终Head及产物身份以新PR的真实CI和匿名result.json为准**，不以源码存在或本机局部测试替代：

| 路径 | 断言 |
| --- | --- |
| 缺配置启动 | 独立无网络容器明确非零退出，不创建替代数据库 |
| 登录与后台 | Secure会话、本人工作台、三个已授权编辑空间；匿名／跨Site／无grant仍拒绝 |
| 上传与归属 | 生成PNG、原图hash与三档变体，明确图集／分类成员顺序，资源只属于对应Site |
| 草稿与预览 | 三空间分别保存／刷新；私人预览可读，匿名不能读取未发布内容 |
| 发布与回退 | 显式发布后公开页面／变体可读，CAS及公开指针冲突409、历史、回退保持 |
| 信任与入口 | 错Host／Origin、缺Origin写入、伪造代理／proof／身份及legacy／test拒绝 |
| 请求边界 | 真实HTTPS JSON与上传超大拒绝；慢JSON先于代理deadline返回；两个未完成上传占满名额、第三429、中断后恢复 |
| 清理故障 | 一次性DB触发器延迟拒绝新增资产，并撤去本次素材父目录写权限；两次真实清理失败后仍能正常上传，错误不泄漏路径 |
| 持久化 | 应用重启及容器重建后，账号会话、草稿、版本历史、公开指针、原图／变体和文件键对应不变 |
| 依赖故障 | 独立PG停止、素材权限000时ready503／live200及安全业务错误；恢复后内容快照不变 |

证据仅保存固定状态、计数、image ID和生成素材的关系验证，`outputs/production-site-runtime/result.json`；不保存Cookie、密码、秘密、真实素材或原始HTML。
清理只针对本次生成的唯一project／临时目录；失败孤儿只留在该次临时卷，最终销毁测试卷，不操作任何真实孤儿资源。

## 限制与后续

- 首次生产验收[40669135322／attempt1](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40669135322)在缺配置启动项失败。Next捕获hook异常后保留listener；仅抛错不足以保证启动退出。已改为显式生产配置失败时输出固定码并自行exit1，保留原20秒／code1／非killed断言，新增真实hook子进程回归；后续容器结果以新Head记录为准，首次失败不重跑覆盖。
- 本机相关测试使用已有Node24工具；镜像及CI为Node22.23.4。本机不启动Docker、PG或替换3001，完整HTTPS链只按实际Linux CI结果报告。
- 本机构建曾发现`path.resolve(process.cwd())`触发整仓tracing，已改用本身绝对的cwd后重新构建，无该警告；仍保留原私有上下文／runtime排除断言。
- 容器重建用同一镜像，不能据此宣称不同应用版本的schema兼容回退、异机备份或恢复演练已经完成。
- Windows／实体手机、真实弱网、真实HTTPS入口、CPU架构／磁盘容量与权限、域名证书、既有代理共存和运维责任仍须目标验收。
- 真实数据的一致迁入、异机保留、备份与干净恢复、正式切换依赖后续PR-C及独立授权。此前候选不能作为真实业务权威写入环境。
- 保留PR49记录的4项moderate开发工具链告警及Miniflare旧Sharp；最终镜像排除证据不代表整个开发环境安全。
- `PREVIEW_RETURN = UNRESOLVED`／`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE`不变，原失败断言与超时保留，不是生产接受。

新PR保持Draft，不自动Ready、合并、部署或继续PR-C。
