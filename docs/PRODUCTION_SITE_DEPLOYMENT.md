# Site生产运行与持久化接口

PR50已合并到main `68dfd53`；[收口记录](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/50#issuecomment-6499205606)包含实际main push及同镜像HTTPS证据。
本文件区分首次环境准备、普通app更新、数据迁移／恢复和应用回退；不是已经部署真实服务器的记录。
通用分类、备份与授权规则见[开发与交付流程](DEVELOPMENT_WORKFLOW.md#应用更新与数据操作)。
旧[Stage A2部署壳](stage-a2-deployment-bootstrap.md)及其[工具runbook](deployment-bootstrap-runbook.md)保留原用途，不作为生产Site更新器。

## 同一正式产物

正式Dockerfile的standalone产物默认以 `node server.js` 运行，生产业务不依赖本机账号runner。
显式配置 `FRAME_ZERO_PRODUCTION_SITE=1`，校验HTTPS origin、独立PG、外置私有素材及秘密来源；本机loopback／proof／测试边界继续保留。
正常app启动不迁移、开户、导图、创建素材根或发布，不回退旧全局数据。配置缺失时退出，关键依赖未ready时不报告可用。
现有owner／grant、三类独立草稿、AssetId／相对键、Published-only及回退语义不改变。

## 拓扑、镜像与持久化身份

实际配置为[site.compose.yaml](../deploy/site.compose.yaml)，与Stage A2的 `deploy/compose.yaml` 分开。

| 对象 | 当前实现与更新含义 |
| --- | --- |
| app镜像 | `portfolio-platform-app:${PORTFOLIO_RELEASE}`；同时声明本仓库Dockerfile的build与 `pull_policy: never`。目标镜像需预先在目标Docker daemon存在，普通切换使用no-build／pull never，不能假定自动拉取或现场构建 |
| release参数 | 生产格式为 `sha-<12至64位十六进制>`；只是标签约定，校验器不证明镜像内容／源码身份，需另核对image ID／digest、来源与目标架构 |
| app | UID/GID1000、只读根、无宿主端口，仅backend网络；挂原 `site_assets`，继续读取原外置secret文件 |
| postgres | 固定PostgreSQL17.11 Bookworm镜像、UID999、无宿主端口；`site_postgres`挂到 `/var/lib/postgresql/data`，PGDATA为其pgdata子目录；普通app更新不重启或重建PG |
| 素材 | `site_assets`挂到 `/var/lib/portfolio/assets`，位于应用产物之外；保留原图／变体、AssetId和相对键 |
| caddy | 固定镜像、data/config持久卷、独立入口；普通app更新不改代理／证书／端口或重启caddy |
| assets-init | 显式tools步骤，只准备素材卷根UID1000与0700；不是app依赖，不对已有实例每次更新重复执行 |

Compose顶层默认项目名为 `portfolio-site`，但 `--project-name`／`COMPOSE_PROJECT_NAME` 等可改变实际身份。
当前卷没有external或固定name，通常生成 `<实际项目>_site_postgres`、`<实际项目>_site_assets`、`<实际项目>_caddy_data` 与 `<实际项目>_caddy_config`。
必须读取现有容器的Compose项目标签、实际Mounts、数据库身份与素材根，不能只根据目录名、默认name或示例推断。

**已有实例更新时，复用原项目名、原配置文件组合、原数据库和实际数据卷。身份不符、卷不存在或兼容性不明即停止，不执行up、assets-init或初始化来“补齐”。**
项目身份不在site.env参数白名单中；沿用既有明确的Compose项目参数，不向env示例添加未支持的键。
若发布目录移动，额外核对Compose相对路径解析出的代理bind文件及外置配置来源，不因目录变化悄悄更换持久化或关键秘密。
这些是人工更新前置检查，当前没有Site更新脚本替操作者自动保证它们。

应用URL使用独立非superuser DML角色（例如 `portfolio_app`），不具有CREATEDB／CREATEROLE／REPLICATION能力，readiness也会拒绝管理级角色。
管理用户 `portfolio` 的密码只挂PG，不挂app。三个外置文件保持原位置与权限：

| 宿主配置参数 | 容器内用途 |
| --- | --- |
| PORTFOLIO_DATABASE_URL_FILE | app的 /run/secrets/site_database_url |
| PORTFOLIO_ACCOUNT_SECRET_FILE | app的 /run/secrets/site_account_secret |
| PORTFOLIO_POSTGRES_PASSWORD_FILE | 仅PG的 /run/secrets/site_postgres_password |

Compose文件型secrets可能以bind实现，不能假设uid/gid/mode会自动修复宿主权限；app UID1000、PG UID999须可读取对应文件，父目录保持私有。
不把真实数据库、照片、凭据或本机环境文件放入镜像。改变数据库目标、角色、卷或关键密钥策略时，转相应数据／基础设施流程，不冒充普通app更新。

## 首次环境准备

先选择空站开始，或迁入已有本地账号／照片／草稿／Published；只有后者需要搬迁现有业务数据。
空站仍需受控准备正常schema、应用角色与账号；PG官方镜像在新空卷建立数据库不等于已经完成产品schema和开户。
无论哪条路径，生产成为真实权威写入环境前都须落实必要安全、持久化与基础备份恢复保障，不把空站当成免除保护的理由。

1. 针对目标服务器确认域名、TLS终止、已有反代／网络／可用端口、架构、卷／磁盘位置、UID权限和运维责任。
2. 准备匹配的正式镜像、私有配置和独立数据卷；schema／角色／受控开户或已有数据恢复都是显式操作，不放进app启动。
3. 仅新素材卷可按授权显式执行assets-init；已有素材不重复初始化或递归改权限。
4. 经真实HTTPS验证登录、授权后台、上传保存／发布、匿名读取、持久化与恢复保障，再决定正式写入切换。

基础Compose不发布宿主端口；已有Docker代理可按目标现场接入ingress网络，需主机映射时才叠加[site.ports.yaml](../deploy/site.ports.yaml)。
不假定80／443空闲，不停止其他项目。前置代理如注入Forwarded／X-Forwarded头，应履行本入口的清除与重建合同，不能扩大公网客户端信任。
[site.env.example](../deploy/site.env.example)只有拓扑与秘密文件位置，默认release故意无效；没有替目标现场选择部署参数。

## 普通应用版本更新

前提：新旧应用与现有DB／JSON内容、素材和运行配置兼容，无数据批改、搬迁、卷身份或关键秘密变化。
只改页面样式也要核对目标产物，但不默认重新备份整套照片。已有有效常规备份独立沿用，不把每次切换变成迁移或全套恢复演练。

### 发布准备

在闲置构建目录提前完成相关验证与产物准备，或复用输入／目标平台匹配的已有产物；不在运行目录pull、覆盖构建或改共享依赖。
本仓库已有Dockerfile及Compose build声明，可以显式准备镜像；尚无面向操作者的自动镜像发布渠道。
`pull_policy: never` 不是镜像分发机制；`restart app` 也不会应用新的镜像或配置。

把原版本／镜像ID、现有项目与卷身份、目标image ID／架构及回退兼容条件简记在既有交付记录。
仅将PORTFOLIO_RELEASE指向已核实的目标标签，沿用原origin、数据／secret来源及其他配置；相关输入改变时先重新分类。

### 现场切换

以下是按现有配置与CLI用法核对的**人工操作示例，本轮未在目标服务器执行，不是仓库已有的一键脚本**。
变量必须由已存在实例的记录取得：site_project是实际项目名，site_env是原外置拓扑文件，site_deploy_dir是经核对的deploy目录。
示例包含site.ports.yaml；原实例未使用它时省去该覆盖，使用其他受审覆盖时保留原组合，不能照抄成另一个新项目。
readonly precheck不能代替上方实际卷／数据库身份与兼容性核对。

```sh
node scripts/validate-site-deployment.mjs --env "$site_env"
docker compose --project-name "$site_project" --env-file "$site_env" \
  -f "$site_deploy_dir/site.compose.yaml" -f "$site_deploy_dir/site.ports.yaml" config --quiet
docker compose --project-name "$site_project" --env-file "$site_env" \
  -f "$site_deploy_dir/site.compose.yaml" -f "$site_deploy_dir/site.ports.yaml" ps --all
```

确认目标镜像已存在、原卷与PG就绪、未保存编辑及在途上传／保存／发布已处理后，正常停止app：

```sh
docker compose --project-name "$site_project" --env-file "$site_env" \
  -f "$site_deploy_dir/site.compose.yaml" -f "$site_deploy_dir/site.ports.yaml" stop --timeout 30 app
```

独立确认旧app已退出，再启动目标版本：

```sh
docker compose --project-name "$site_project" --env-file "$site_env" \
  -f "$site_deploy_dir/site.compose.yaml" -f "$site_deploy_dir/site.ports.yaml" \
  up --detach --no-deps --no-build --pull never --wait app
```

只选择app且使用no-deps，不带起或更新PG／caddy。wait只证明该容器healthcheck通过，还需核对实际镜像／BUILD、入口HTTPS readiness和必要授权业务读取。
健康或读取失败不能提前报告成功；正常停机与检查时间不是固定秒数承诺。
已有实例不使用全栈down／up、down --volumes、每次assets-init或新建空库作为普通更新手段。

## 数据迁移与故障恢复

首次部署只有选择保留本地业务时，才需搬入这份本地数据；后续跨机器／存储搬迁仍按专项流程。同一安装／Site搬到新机器时，保留原账号、Site／Asset ID、相对键、草稿和Published关系；跨Site内容导入仍遵守[ADR-0002](adr/0002-site-tenant-boundary.md)的新资产映射规则，不与整实例搬家混用。
JSON批改、素材格式／键／删除语义变化也属于数据影响，不能以没有SQL文件当作普通更新。
兼容性schema升级须显式版本化迁移并验证新旧应用范围；存储搬迁、PG大版本升级走专项操作。

常规备份独立于应用版本维护。高风险操作前核对已有备份是否足够新、范围与恢复方法是否适用，不足时补对应范围及必要演练。
持久卷与旧应用镜像均不代替业务备份。真实迁入、一致备份、异机保留与干净恢复保障仍需对应实现／授权，本轮没有实现自动备份或执行真实恢复。
故障恢复需明确恢复点及可能丢失的新数据，不能作为每次更新失败的默认动作。

## 应用版本回退

先确认旧应用兼容当前schema、内容格式、素材键与配置，再沿用原项目／卷／秘密，将app切回已保留且验证的旧镜像。
可复用上述人工切换步骤，仍仅选择app；没有自动回退承诺，不回灌旧数据库覆盖更新后产生的新业务。
若不兼容，停止回切并按影响选择恢复或向前修复方案。PR50的同镜像容器重建证据不证明任意跨版本无损回退。

## 请求与TLS边界

正式site.production.caddy使用公开ACME；CI的site.ci.caddy只使用portfolio.test内部CA，两者共享精确业务路由。
保留生产Secure／HttpOnly／SameSite／host-only会话、匿名私有拒绝、跨Site与grant检查、Published-only。
legacy／test／未知API继续拒绝；客户端转发／身份头不作为登录身份，代理先清除再设置canonical Host／XFH／HTTPS，应用仍校验Host／Origin。
strict_sni_host在路由前拒绝SNI／Host不符421，同域错误端口403。日志不记录Cookie／凭据／请求URI查询。

JSON登录／发布2048bytes、草稿512000bytes，应用逐块限量／10秒／8个JSON读取名额；上传25MiB／30秒／2并发及原图片校验保留。
代理read_header10s／read_body30s／upstream header90s，正式与CI共同enable_full_duplex，不额外完整缓存上传。
参考Caddy官方[代理头](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、[请求体限制](https://caddyserver.com/docs/caddyfile/directives/request_body)、[超时](https://caddyserver.com/docs/caddyfile/options)。

## 已有操作与待实现入口

已实现：严格配置校验、Dockerfile／Compose显式构建、人工app启停／替换、持久卷、readiness和同产物隔离HTTPS验收。
尚未实现：后台更新按钮、专用生产Site更新脚本、自动镜像发布／拉取渠道、自动兼容判断及自动回退；文档不把它们宣布完成。
旧deployment-bootstrap的update／rollback使用Stage A2封闭壳和拒绝断言，不能套用到生产Site；Windows日常控制入口也不因此被替换成Docker。

最多一个后续切片：封装“指定既有Site项目＋已准备目标镜像”的普通app更新入口，核对原数据身份、正常切app并验收；不附带迁移、全量备份或新管理平台。本轮不实施。

已有main隔离验收为Linux/amd64、内部测试CA，不代替真实ACME／公网、目标架构／权限、异机与跨版本恢复。
当前共享登录限流及PREVIEW_RETURN本机阶段风险仍见[当前状态](CURRENT_STATUS.md)，不在本轮扩改。
本轮仅固化规则与文档，不授权启停、部署或迁移，不自动接续历史计划。
