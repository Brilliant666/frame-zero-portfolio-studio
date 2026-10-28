# 生产依赖安全基线

日期：2026-10-28。实施基线：main `d3b172c5658c738fba8d4d19c4b870a12d7f9656`。
本轮落实[审计](PRODUCTION_READINESS_AUDIT.md)的PR-A；审计原`58a92d2`观察及技术结论不回写。
这是依赖与对应打包／验收适配，不是接通生产Site、数据迁入或公网部署。

## 精确版本与依据

| 范围 | 原版本 → 本轮版本 | 依据与取舍 |
| --- | --- | --- |
| Next／eslint-config-next | 16.3.3 → 16.4.1 | [Next官方10月14日安全更新](https://nextjs.org/blog/nextjs-security-update-october-14-2026)。选最小修补线，保持16主版本，不启用新功能。 |
| React／React DOM／RSC webpack | 19.2.6 → 19.2.9 | [RSC公告](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3)、[Server Functions公告](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453)。三者按peer要求保持同版本。 |
| 直接Sharp及Next实际解析 | 0.34.5／0.35.4 → 0.35.5 | [Sharp公告](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)。核对实际原生库与图片转换，不只改根manifest。 |
| Better Auth／auth CLI | 1.7.6 → 1.7.7 | [数据库限流](https://github.com/better-auth/better-auth/security/advisories/GHSA-44jh-23m7-hpcf)、[OAuth Proxy](https://github.com/better-auth/better-auth/security/advisories/GHSA-r4xp-prcw-77qf)、[OAuth／Magic Link](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm)。最低修补版本，无schema迁移；不顺带升级到新的功能线。 |
| Node生产镜像／五项CI | 镜像22.22.3、CI22.13.1 → 22.23.4 | [Node官方安全更新](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)。保持Node22、Bookworm/glibc及既有进程契约。 |
| Zod／source-map-js／baseline-browser-mapping | 4.6.5／1.2.1／2.10.30 → 4.6.7／1.2.2／2.11.34 | 原父依赖允许范围内刷新：[Zod修复](https://github.com/colinhacks/zod/pull/6652)、[source-map-js发布](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)、[baseline发布](https://github.com/web-platform-dx/baseline-browser-mapping/releases/tag/v2.11.0)。不新增直接依赖或跨范围override。 |

pg保持8.23.0；Drizzle ORM保持已修补的0.45.2（[官方公告](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9)）。
当前官方公告／npm audit未给出必须顺带升级二者的依据，不等于已经证明不存在任何风险。
Next特定Cache Components／Server Actions、Better Auth OAuth／Magic Link／数据库限流的触发条件并非本项目均已启用；
本轮修补版本，不声称已经在项目复现攻击。精确npm版本均通过官方registry核实。

Node镜像使用官方Registry直接读取并按原始响应字节SHA256复核的多架构OCI index：

```text
node:22.23.4-bookworm-slim
sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
```

两个FROM、labels和原预期摘要同步；保留`ENTRYPOINT []`、`CMD ["node","server.js"]`、UID1000、health及SIGTERM。
基础Node镜像自身仍有docker-entrypoint.sh，因此不能撤销最终stage的空入口声明。

## 验证与残留边界

- 新增回归直接验证安装／锁文件一致性、Next与上传实际Sharp解析、原生SVG库、SVG→PNG→WebP尺寸和损坏图片拒绝。
  更新前实际安装树在框架／Sharp检查失败；更新后通过。保留Linux x64／arm64与Windows可选二进制锁。
- `npm audit --omit=dev --package-lock-only`从原11包（2 critical／3 high／5 moderate／1 low）降为4 moderate、0 high、0 critical。
  这不是audit全绿，更不是11个已复现生产漏洞；其计数包含可选开发依赖链。
- 四个moderate条目同源：Better Auth optional peer → drizzle-kit → @esbuild-kit → esbuild0.18.20。
  [公告](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)要求实际运行esbuild serve；项目仅在数据库生成工具中使用该链。
  未执行audit建议的drizzle-kit0.18.1降级，未启用开发服务器，也未据`devOptional`标记一律豁免。
- Miniflare开发链仍有Sharp0.34.5；开发模拟器处理不可信图片时风险仍存在，不能称“全部Sharp已安全”。
  本轮不强制override整个Worker开发工具链。生产安装树检查只排除明确`dev:true`的副本，并核对实际解析。
- 本机正式standalone递归检查未发现Miniflare／Wrangler／auth CLI／drizzle-kit／@esbuild-kit／esbuild，所有被追踪Sharp副本均0.35.5。
  Windows本机standalone曾观察到WASM图像后端回退，不能用它冒充Linux原生库证据。
  Container CI在最终镜像递归拒绝上述开发工具及旧Sharp，并实际记录上传／Next的Sharp、librsvg、libvips及Node版本。
- Linux Container CI继续验证默认启动、PID1、非root、health、SIGTERM、CMD override、私有上下文和公开文件白名单。
  本机Docker客户端未能及时返回，停止该次只读查询，未启动Docker或构建本机镜像；实际容器结果以最终Head CI为准。
- 本机使用既有Node24.19.0开发工具；目标镜像及五项CI使用Node22.23.4。没有升级Windows日常Node或3001。
  npm旧镜像证书过期后仅命令级切换官方registry，不改全局npm配置、不关闭TLS。
- 相关图片、异步预览、保存CAS、原动效及打包回归、lint、类型、Next构建／HTTP SSR分别验证；
  新Next构建格式的预算解析适配保留缺失／未知／不完整格式及单模板上限的硬失败，不放宽预算。
  最终五项CI及其真实执行范围以对应PR最终Head为准，不引用PR48／PR47的绿灯代替。

本机验证：75项相关回归、29项预算回归、2项standalone／HTTP运行契约均通过，lint和独立类型检查通过。
Next构建只执行一次。预算适配回归在旧解析器下有2项失败，修订后29项全过；
实测CSS410,473 bytes仍超过原307,200参考，保留warning，11模板均满足原65,536-byte硬上限。
这不是性能或体验达标证明。既有开发`.next`构建目录逻辑总量约151MiB（非净新增量），standalone约41MiB；
没有新增完整运行环境或永久备份。远端Linux与PG结果以最终Head实际CI记录补充在PR，避免状态文字重复提交。

## 未实施与停止点

未改产品UI、账号权限、资源归属、三空间、schema、草稿／发布／回退或上传限制。
未接通生产业务代理、PG／素材持久化、HTTPS会话、迁移备份恢复或真实服务器验收。
未改动日常3001／PostgreSQL及真实业务内容；没有完整依赖、构建、数据库或图库副本。
复用闲置开发目录、已有依赖及候选构建位置；新构建为临时开发产物，后续复用或按精确清单授权处置。

`PREVIEW_RETURN = UNRESOLVED`／`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE`保持，不是生产接受。
Draft PR交付后等待审阅，不自动Ready、合并、部署或开始PR-B。
