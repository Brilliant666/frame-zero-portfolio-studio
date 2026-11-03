# 模块2：共享校验与读取验收

适用日期：2026-11-03。基线main：`fad6e020897247aa9c87491e8946d27df6a75f06`（PR67），分支：`refactor/shared-validation-reads`。本文记录本模块相对该基线的实现和本机证据；最终提交、PR及五项完整CI状态以对应PR最终Head为准。

## 改动与保持的边界

- `app/site-editor/publication-server.ts`复用`db/accounts/assets.mjs`现有`UUID`，删除同义本地正则；版本1–8、variant、大小写、字符串检查、null预期指针和payload字段白名单不变。账号Site接口仍仅接受v4，浏览器解析不改。
- `db/accounts/http.mjs`新增`completedSiteExists(pool, slug)`，将原先两个等价连接查询收敛为一处；`public-server.ts`与`site-entry.mjs`仍在原请求/slug检查后读取。原投影仅被用于判断行数，现在返回严格布尔值；查询异常仍交调用者处理。
- 存在性只表示Site与owner provisioning已完成，不授予所有权、premium或公开读取权限。`readSiteForPrincipal`、`readPublished`、`readPublishedAssets`、草稿CAS、发布事务及锁、素材归属和公开响应投影均未修改。
- 不改schema、已存JSON、资源键、路由、缓存或授权撤销策略；无业务迁移。四个产品文件之外，只扩展三份现有测试并更新文档。

## 本机通过条件与结果

Windows x64，Node24.22.2；锁定Next16.4.1、React19.2.9、Better Auth1.7.7、sharp0.35.5。原闲置候选依赖不匹配，先按当前锁文件`npm ci`，未修改依赖清单或锁文件。

| 检查 | 结果及证明范围 |
| --- | --- |
| `production-response-boundary.test.mjs` | 14通过；发布处理器的UUID/null/字段白名单、授权先于解析；真实helper与调用者顺序、未发布/Published映射、异常传播 |
| `npm run test:admin` | 309通过、1项既有平台跳过、0失败；包含新增处理器测试 |
| `npm run lint`、TypeScript `--noEmit` | 通过；生产构建也完成类型检查 |
| 标准Node生产构建、`npm run check:bundle` | 通过，11个显式懒模板全部低于64KiB；已有聚合CSS告警保留 |
| Node standalone/两预算测试 | 66通过，0失败；真实HTTP启动与路由兼容 |
| `npm run test:legacy-runtime` | legacy构建、预算及45项运行检查通过，0失败 |
| `tests/local-accounts.test.mjs` | 新建独占PG测试实例及专用测试库中33通过，0跳过/失败；真实Next HTTP、账号、资源、草稿、发布及重启持久化 |

真实PG/HTTP新增断言：未知和未完成开户Site不存在，完成开户且未发布仍存在；恢复完成状态后重新可见。账号Site参数v1/v8仍403。发布回滚v1/v4/v8（含大写）合法但不存在时404，预期发布指针合法但不匹配时409；非法版本、variant、非字符串和畸形revision为400，拒绝请求不改变Published。既有跨Site/隐藏/原图资源拒绝、权限、CAS并发、Published不受草稿变化影响等检查继续执行。

本次无视觉或模板改动，以实际HTTP/API和数据库行为为验收，不再执行模块1的完整视觉矩阵。原公开读取缓存策略与请求级cache保持，不能据此宣称新增性能收益。

## 首次环境失败与收尾

首次隔离PG启动绑定端口失败，日志为`could not bind IPv4 address ... Permission denied`；只读核对发现所选端口落入Windows系统保留段。确认失败进程退出，改用经过保留段核对和loopback bind探针的空闲测试端口后启动成功。未修改系统端口保留、防火墙或日常服务。该失败是本机隔离环境准备问题，不记为产品故障，也未修改测试来绕过。

测试harness只迁移/清空本轮新建专用测试库，使用合成账号和临时素材；未套用日常env或复制真实数据。harness正常退出后确认测试app端口释放；本轮PG经精确数据目录核对正常停止，随后确认无server及端口释放。日常应用与PG listener PID均保持原值。无合并、日常切换或远程部署。

## 产物保留与限制

复用既有闲置开发工作区，没有复制整套应用环境。更新后的`.next`约152.1MiB，legacy `dist`约9.8MiB、`.vinext`约0.14MiB，保留至本模块验收/下一轮候选构建。新建隔离PG与私有配置合计约64.6MiB，停止后保留至PR验收及精确路径清理授权；既有模块1夹具和旧工作区产物未删。临时素材由既有harness自身清理；凭据与本机私有证据不进入仓库。

本机检查不代替最终Head五项完整CI。Auto-fix保持关闭；`PREVIEW_RETURN=UNRESOLVED / ACCEPTED_FOR_LOCAL_STAGE`及既有CSS聚合体积告警继续保留。
