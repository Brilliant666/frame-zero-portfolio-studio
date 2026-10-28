# Site生产运行与持久化接口

本轮代码候选基于PR49合并后的main，接通已有账号／Site／资产／草稿／发布业务，不替换这些实现。
本文件描述可配置的生产拓扑，不是已部署记录。真实服务器、DNS、TLS与数据迁入均未执行。
旧[Stage A2部署壳](stage-a2-deployment-bootstrap.md)及其封闭入口保持独立，不把旧验收冒充本轮Site业务链。

## 同一正式产物

`Dockerfile`的同一正式standalone产物使用默认`node server.js`启动；本机账号runner不参与生产链。
生产模式显式配置`FRAME_ZERO_PRODUCTION_SITE=1`，使用严格HTTPS origin；本机模式及原loopback校验继续保留。
应用启动只校验配置与依赖，不执行迁移、开户、导图或发布，不回退旧全局Site数据。
生产入口缺配置或依赖未ready时失败，不通过公开local proof或客户端身份头建立身份。

## 拓扑与私有文件

基础配置为`deploy/site.compose.yaml`：

| 服务／资源 | 合同 |
| --- | --- |
| app | 与CI相同Dockerfile正式镜像，UID/GID1000、只读根、无宿主端口，仅backend网络 |
| postgres | 固定PostgreSQL17.11 Bookworm多架构镜像，仅backend网络，无宿主端口；独立`site_postgres`卷 |
| 私有素材 | `site_assets`卷挂`/var/lib/portfolio/assets`，不在镜像／public／发布目录，保留相对文件键和AssetId |
| assets-init | 显式tools profile一次性步骤，只准备卷根UID1000与0700，不递归改现存文件、不迁移或开户 |
| caddy | 既有固定Caddy镜像及3×10MiB日志限额；独立data/config卷；仅入口网络和backend |

PostgreSQL镜像：`postgres:17.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5`。
该OCI index由官方Registry响应实值与原始字节SHA256交叉核对；不是浮动tag。未升级本机PG。
新空卷的PG官方入口会准备空数据库`frame_zero_site`／初始化管理用户`portfolio`；这不包含产品schema或账号。
现有数据库必须按后续明确的数据迁入／兼容流程准备，不能用新空库替代真实库。

`deploy/site.env.example`只记录非秘密拓扑和三个秘密文件位置；默认release故意不可执行。
实际文件放在仓库外，不通过Compose environment写入URL密码或会话密钥：

- `PORTFOLIO_DATABASE_URL_FILE` → app `/run/secrets/site_database_url`，对应`FRAME_ZERO_ACCOUNT_DATABASE_URL_FILE`。
- `PORTFOLIO_ACCOUNT_SECRET_FILE` → app `/run/secrets/site_account_secret`，对应`FRAME_ZERO_ACCOUNT_SECRET_FILE`。
- `PORTFOLIO_POSTGRES_PASSWORD_FILE` → PG `/run/secrets/site_postgres_password`，对应官方`POSTGRES_PASSWORD_FILE`。

应用数据库URL指向`postgres`上的`frame_zero_site`，使用独立的非superuser应用角色（例如`portfolio_app`）及独立密码，
仅授予现有schema所需DML权限；不能有CREATEDB、CREATEROLE或REPLICATION能力。
初始化管理用户`portfolio`的密码仅供PG容器和显式授权的管理步骤使用，不挂到app，不能把管理URL用作应用URL。
隔离CI以管理角色显式迁移／开户后再建立独立DML角色；正式环境的角色准备、真实恢复与迁入属于PR-C的独立授权，
不得在app启动时自动CREATE ROLE、迁移或提权。readiness会拒绝具有上述管理能力的应用角色。
Compose的file-based secrets可能作为bind实现，不能假设`uid/gid/mode`自动改宿主权限。
正式文件应分别让app UID1000、PG UID999可读，私有父目录限制访问；运行前核对实际权限。
隔离CI仅使用当次私有临时目录内生成的文件与账号，测试结束按明确项目标识清理。
不要把真实秘密文件、数据库或照片复制进构建上下文。

## 入口共存与参数

基础Compose不发布任何宿主端口。已有同Docker网络代理可由操作者显式接入ingress网络；
需要主机映射时再叠加`deploy/site.ports.yaml`，支持例如loopback8080/8443，不假定80/443空闲。
`PORTFOLIO_SITE_ORIGIN`是访客真正看到的HTTPS origin，与内部监听／映射端口可以不同。
`PORTFOLIO_SITE_DOMAIN`必须是该origin hostname，`PORTFOLIO_SITE_HOST`必须是其canonical host（含必要端口）。
参数校验拒绝凭据／查询／路径、Host漂移、未知键、重复键、浮动release及不安全秘密文件路径。

```sh
node scripts/validate-site-deployment.mjs --env /private/site.env
docker compose --env-file /private/site.env -f deploy/site.compose.yaml -f deploy/site.ports.yaml config --quiet
```

上述只验证配置，不代表允许在目标服务器启动。获得部署／数据授权后，操作者按范围准备镜像、PG和素材卷；
首次素材卷可显式执行`run --rm --no-deps assets-init`，正常app启动不调用该工具。
后续替换app镜像、restart／force-recreate不删除PG／素材卷。正式停止不使用`down --volumes`。
已有代理的TLS终止方式、证书归属、Host传递和网络接入需针对目标现场确认；
如前置代理注入Forwarded／X-Forwarded头，本入口会拒绝，应在可信边界清除并由本入口重建，不能放宽公网客户端信任。
本候选不建设通用代理管理系统，也不停止服务器其他业务。

## 路由、请求与TLS边界

正式`site.production.caddy`使用公开ACME；隔离`site.ci.caddy`只使用`portfolio.test`内部测试CA。
二者共享`site-proxy.caddy`的精确业务路由，不允许全`/api/*`或全方法透传。

- 开放既有登录／退出／撤销端点、Site授权后台及草稿预览、已审阅的资产／草稿／发布API和公开Site变体。
- 匿名私有资源、跨Site、grant及Published-only继续由同一业务核逐次校验。
- `/test`、全局`/preview`、legacy`/admin`、`/api/site-content`、未知API继续拒绝。
- 原始Host先与canonical host比较。已知客户端代理头／local proof／身份头拒绝；转发时再次清除代理／身份前缀并重建Host、X-Forwarded-Host及https协议。
- Cookie保留供真实会话使用；Authorization、客户端身份头不向后端传递。访问日志不记录请求／响应头和URI查询。
- JSON登录／发布2048bytes，草稿512000bytes，上传26214400bytes；Caddy在流式读取时限制，应用再次执行原校验。
- 代理read_header10s／read_body30s，后端响应头90s；不额外完整缓存上传，不降低像素／格式／原图或变体校验。
- 正式与CI入口共同启用`enable_full_duplex`，允许HTTP/1在请求体未完整发送时及时返回应用的10秒JSON超时／早期拒绝；测试超时不放宽。

Caddy配置参考官方[代理头](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、
[请求体限制](https://caddyserver.com/docs/caddyfile/directives/request_body)、[超时](https://caddyserver.com/docs/caddyfile/options)。

## 验证与仍待完成事项

配置与路由合同有本机回归；完整验收必须使用本轮正式镜像，经过同一隔离HTTPS入口执行登录、上传、草稿、
预览、发布／冲突／回退、匿名读取、持久化及故障／权限拒绝，结果以最终Head的实际CI为准。
测试应显式信任当次测试CA并验证证书，不用`rejectUnauthorized:false`冒充可信链。
测试域名／内部CA不是真实域名、ACME、公网或实体设备验收；本机Docker未运行时不能据此宣称本机容器通过。

尚需目标现场确认：域名与TLS入口归属、已有反代／网络、CPU架构、可用端口、卷／磁盘位置、UID权限、容量与运维责任。
真实数据迁入、一致备份、异机保留、恢复演练及正式切换属于PR-C与部署阶段；未完成前不能成为真实权威写入环境。
日常3001／PG及真实内容保持不变；既有`PREVIEW_RETURN=UNRESOLVED`／`ACCEPTED_FOR_LOCAL_STAGE`不是生产接受。
本PR保持Draft，不自动Ready、合并、部署或接续PR-C。
