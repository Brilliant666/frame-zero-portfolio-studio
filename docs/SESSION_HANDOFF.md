# 会话交接

更新：2026-11-03。基线、授权与风险统一见[CURRENT_STATUS](CURRENT_STATUS.md)。实施前核对 GitHub，不按历史 Draft 状态继续旧任务。

## 当前续接：第4、5批模块2

- [PR67](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/67)已由用户人工合并，实际main为`fad6e020897247aa9c87491e8946d27df6a75f06`；最终PR与main五项完整CI均成功。模块1首次失败与限制保留在[模块1验收](BASIC_HOST_PUBLIC_LOADING_2026-11-02.md)。用户授权的日常3001更新也已完成，具体现场信息见仓库外交接。
- 用户批准模块2方案后，在核对闲置的既有工作区保留原分支和独有产物，从实时main建立`refactor/shared-validation-reads`。四个产品文件仅收敛通用UUID与完成开户站点存在性查询；账号Site v4规则、owner/grant、写入锁/CAS与Published读取不变。
- 本机行为、后台回归、真实隔离PG/HTTP和标准Node/legacy运行检查已完成，首次隔离端口失败及最终证据见[模块2验收](SHARED_VALIDATION_READS_2026-11-03.md)。测试只使用合成账号与素材，未操作日常服务或真实数据。
- 下一步同一模块PR收口，并按最终Head验收五项完整CI，不用旧Head或本机通过代替。Auto-fix保持关闭；模块2合并、日常切换、真实迁移、远程部署和既有目录清理均需对应授权。
- 模块3草稿、模块4弹层、模块5媒体、模块6动效/字体仍未实施；`PREVIEW_RETURN = UNRESOLVED / ACCEPTED_FOR_LOCAL_STAGE`保留。

## 第1批收口时的历史检查点（2026-11-01）

- 前置基线为 `ff8f55d6c564c466982b57bc56be29540866ad5e`（PR54 的合并提交），[PR53](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/53)／[PR54](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/54) 已由用户人工合并，解决公开署名扫描误报及 GitHub 字段大小写兼容。该 SHA 的 main push 五项完整 CI 均已成功，链接见当前检查点。
- 2026-10-31 只读审查已交付，用户授权第 1 批。决策 A（外站导航放行）与 C（pwsh 测试改静态守卫）已有结论。按用户要求每个功能一个分支、一个模块一个 PR：[PR64](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/64) 安全边界、[PR65](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/65) 内容与数据、[PR66](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/66) 文档与测试。原单一用途 PR #55–#63 已关闭、未合并。
- 每个模块 PR 记录改动、理由、验证与风险，五项完整 CI 成功后交人工合并；纯文档改动若走 DOCS_ONLY，不能替代完整运行，需使用既有 workflow_dispatch。
- 用户已授权继续收口，PR64、PR65 已于 2026-11-01 人工 Squash 合并，实际 main 为 `bb17b260a29f6e0d35275fafd789cfdc6aec237a`。两个模块最终 Head 及 PR64 合并后的 main `a204b79` 五项完整 CI 均已通过。PR65 此前同步安全基线时只冲突 `test:admin` 清单，已保留两侧测试；PR66 同步当前 main 无冲突，共享扫描器修复不再出现在剩余差异中。继续按 PR66 最终 Head 和实际合并后的 main 分别验收，不以旧检查替代。
- PR66 原 Container run 41269583545 在就绪等待处 exit 13；修复为单次2秒、总45秒有界探测并保持事件循环，失败保留日志与 cleanup。修复前后证据留在 PR66，不认定原应用故障。Git SHA 手机号误报和扫描器单文件契约也已修复。
- 不直接推 main；后续模块合并须先满足最终检查且不绕过工具拒绝。不部署，日常应用／PG／真实素材和数据不操作。历史 PR16、PR26 不推进；本机私有交接不提交。
- 下方保留诊断准备期和 PR51 准备期的观察，只证明当时。PR52 最终合并状态以上方和实时 GitHub 为准，旧分支名及“Draft／本轮”不构成当前停止点。

## PR52 准备阶段：退役发布脚本子进程诊断（历史快照，2026-10-30）

- PR51已合并，最新核对main为 `6c6eecc6e551172ec7675084b6eb54851d3309f8`；应用更新策略保留。其[首次main Quality失败](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40999242678)及[收口记录](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/51#issuecomment-6514619490)保留，不以新PR通过改写旧结果。
- 当前分支 `fix/retired-script-process-check` 只增强退休保护的子进程诊断、隔离执行及无副作用失败夹具，完成后Draft PR；不自动合并或部署。
- 同文件树的[成功PR Quality](https://github.com/Brilliant666/frame-zero-portfolio-studio/actions/runs/40927763789)与首次失败均为Node22.23.4、runner2.338.0、Ubuntu26.04.1／image20261025.179.1；原日志没有PowerShell实际路径版本或signal／killed。测试耗时分别约2.870秒与10.119秒。原始失败原因未确认，不能认定误报或根因已修复。
- 首次失败停在退休测试退出码断言，后续legacy／node runtime构建与预算未执行。新检查结果仅适用于其实际Head；CI不改分类器、不默认重跑原job、不放宽断言或超时。
- 先确认源码前置throw，再在无仓库、无发布凭据的临时目录运行完整脚本副本。保留 `pwsh -NoProfile -File`、10秒、退出1、退休标记与禁止历史正文输出；收集code／signal／killed／耗时／限长输出与版本，实际拒绝先于版本探针，避免预热首个启动。
- 本机Windows x64／Node24.19.0／PowerShell7.6.5的正常启退、普通抛错、原拒绝及原测试上下文均正常；不代替原Ubuntu现场。超时／信号／退出0／缺失标记等受控夹具必须失败，长输出仅截诊断、不截判定。
- 日常3001／PostgreSQL及真实数据、Published不操作，无完整环境副本。共享登录额度、真实部署恢复缺口及 `PREVIEW_RETURN=UNRESOLVED / ACCEPTED_FOR_LOCAL_STAGE` 不变。具体最终Head、本机检查与CI状态集中见本轮Draft PR，不为状态文字反复提交。

下方是PR51准备阶段的历史交接，不再构成当前分支或执行授权。

## PR51准备阶段基线（历史快照）

最新main为 `68dfd53386f4afb05e6d5c5478e6c58d40b0c139`；PR50已Ready并Squash，树与原Head `ef4b77b` 一致。
[收口评论](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/50#issuecomment-6499205606)记录实际main push五项完整CI成功、Linux/amd64同镜像HTTPS／重启持久化与限制。
PR49／48／47均已合并。以上不是3001已升级或真实服务器已部署的证明；运行角色按本机交接确认。

## 本轮应用更新策略

分支 `docs/application-update-policy` 从上述main建立，只改AGENTS、README及开发流程／生产部署／当前状态／本交接六个文档。
规则主体在[DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md#应用更新与数据操作)，Compose实际行为与人工命令边界在[生产合同](PRODUCTION_SITE_DEPLOYMENT.md)。

- 普通兼容更新只替换app产物，沿用PG／照片／外置配置；常规备份独立维护，不每次更新重做全量备份或恢复演练。
- 兼容性schema、批量JSON／素材／权限／卷／密钥变化、搬迁与恢复按实际影响另行分类；不以没有SQL文件判断无数据风险。
- 首次生产可空站开始或迁入本地业务；仅迁入路径搬本地数据，两条路径都保留基本身份、安全与恢复保护。
- 应用回退须兼容当前数据；不回灌旧数据库覆盖新内容。产物准备与现场切换分开，授权范围内常规步骤连续完成，不逐步增加审批。
- 当前生产Site是人工app-only Compose操作，需人工核对原project及实际卷、镜像和secret；A2封闭壳工具不是Site更新器。
- 后台更新按钮、自动镜像渠道、Site专用更新脚本／自动回退未实现；本轮未实现一键更新或自动备份。

## 验证与停止点

仅做diff、相对链接、已有文档契约和公开安全检查；远端按现有分类，AGENTS改动走FULL，不改分类器求DOCS_ONLY。
不在本机重建产品、跑完整PG或浏览器；未执行文档中的示例命令、备份恢复或服务切换。实际检查／Head／CI进度在本轮Draft PR记录，不用状态文字反复提交。
运行、依赖、产品、schema、Compose与CI策略未修改；日常3001／PG、草稿、Published、素材、授权和历史资料保持原样。

`PREVIEW_RETURN = UNRESOLVED`／`RISK_DISPOSITION = ACCEPTED_FOR_LOCAL_STAGE`不变；首次失败与原断言保留。
PR50共享登录额度及真实服务器／ACME／架构／数据恢复覆盖限制继续保留，不在本轮重新实施。

完成后保持Draft，不合并、不部署、不自动继续旧计划。
最多一个后续建议是封装已有实例的普通app更新入口；须新授权，不附带迁移、全量备份或新管理平台。
历史只按需读[检查点归档](CURRENT_STATUS_HISTORY_2026-10-27.md)与[会话归档](SESSION_HANDOFF_HISTORY_2026-10-27.md)，不重复通读或执行旧初始化。
