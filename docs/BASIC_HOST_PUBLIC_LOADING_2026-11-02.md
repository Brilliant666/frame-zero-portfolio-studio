# 模块1：基础模板宿主与首屏样式

适用：2026-11-02，分支 `refactor/basic-host-public-loading` 的本模块提交；比较基线 main `ec5b9b3daf18c913f38766c10f4f3546ad34f96d`。本记录不是其他版本、日常应用或生产部署的验收。用户批准第4、5批交错方案，本次只交付模块1。

## 改动与边界

- `BasicTemplateHost` 统一公开／保存预览、当前编辑预览、legacy和实验室的模板与灯箱编排。交互控制器、素材Context、主题清理、原生dialog/portal和boot仍归调用者所有。mapping key只重建内部renderer；legacy灯箱参数差异和实验室无交互状态保留。
- cinematic规则从globals移到模板CSS，11个显式lazy入口不变。共享基础、灯箱、全局reduced-motion保留；cinematic的boot遮罩reduced-motion覆盖与模板规则放在一起，保持延迟加载后的优先级。迁移前后1615条原声明（含选择器、媒体／keyframe条件）逐项核对一致。
- Basic服务端样式入口用于公开快照、保存私人预览和实验室。没有修改schema、内容JSON、素材键、Site授权、CAS、发布与Published-only读取。
- 预算新增公开Site静态入口估算，以及已识别模板动态加载组的CSS追踪；单资源loader可识别，未知CSS loader形式和缺失资源失败关闭。11个独立chunk和单模板65,536字节硬限制不放宽。

## 首次失败及修正

只将CSS放进客户端lazy模板时，hydration后外观正常，但冷HTML不含cinematic stylesheet。该状态未通过首屏验收。加入服务端样式边界后，公开页、已保存私人预览和实验室的冷HTML均在hero之前包含可读取的cinematic stylesheet。此检查已接入原Basic发布HTTP integration。

Next 16.4.1把该服务端CSS并入整个公开路由，其他模板也会收到它。因此没有采用中间构建曾出现的公开CSS减少22.6 KB结论，也没有宣称按所选模板精确裁剪公开路由CSS。

审查另发现reduced-motion覆盖可能被后到的cinematic基础规则覆盖，以及预算未识别单资源CSS loader；两项已修复并补回归。新增loader正则最初在超长标识符上回溯，定向测试超时后停止该测试进程，限定匹配起点后80项相关测试在约27秒内通过。

## 最终资源比较

同一锁文件、Windows x64、Node 24.22.2、Next 16.4.1正式生产构建。以下均为原始文件字节的去重静态估算，不是gzip传输量、实测网络总量或LCP。

| 指标 | 基线 | 最终 | 差值 |
| --- | ---: | ---: | ---: |
| `/` 静态入口CSS | 78,675 | 56,041 | -22,634 |
| `/test` 静态入口CSS | 186,549 | 186,616 | +67 |
| `/:siteSlug` 静态入口CSS | 212,416 | 212,483 | +67 |
| `/:siteSlug` 静态入口JS | 637,011 | 637,165 | +154 |
| `/ + /test + lazy templates` 聚合CSS | 410,593 | 410,660 | +67 |
| 同口径application JS | 290,445 | 290,601 | +156 |
| 同口径bootstrap JS | 622,495 | 622,651 | +156 |

所有模板JS大小与基线相同，最大48,219字节。聚合CSS仍超300 KiB参考值，保留告警；不修改阈值或将其描述为已经解决。

## 本机验证

- 四宿主行为保护先在原实现通过，再在抽取后通过；保留内容／资源scope、套餐、mapping key、dialog取消、legacy boot及实验室空状态。
- Host／预览／导航／样式／实验室／预算定向101项通过；审查修正后的预算／导航80项通过。lint、TypeScript通过；lint保留上游TSNonNullExpression解析提示，退出码为0。
- 最终Next与legacy构建及预算通过（体积告警保留）；standalone运行契约2项、legacy HTML／Admin／API 45项通过。最终CSS顺序修正后两种构建均重新生成。
- 专用隔离PG和合成素材运行既有Basic发布HTTP integration：11模板、投影过滤、公开素材、越权、保留与回退通过。新增冷HTML断言随后针对合成公开站点、保存私人预览、实验室三入口实跑通过。
- 浏览器11模板×桌面1440／手机390共22页检查模板、图片及横向溢出；cinematic重点验证灯箱滚动锁、关闭回焦、编辑dialog portal及嵌套关闭。该矩阵不是11模板所有交互的穷举。
- 两种premium合成公开站点均正常加载图片，无文档横向溢出；星轨主题标记存在，流影和Basic清除相应标记。最终手机375px的Basic画布颜色为背景rgb(248,245,240)、文字rgb(25,19,15)。浏览器调试临时激活reduced-motion媒体规则后，boot遮罩计算display为none，随后恢复调试现场。
- 浏览器失败请求只包含工具初始打开的`localhost`被既有origin校验拒绝；正式合成入口使用获准的loopback origin。未放宽origin校验。合成账号准备时曾触发429，等待正常窗口后续作，未放宽频率限制。

完整五项CI以本模块最终PR Head为准，未成功前不称可合并。日常服务、真实内容、账号／授权和已发布Site未操作；未合并、未切换日常版本、未远程部署。`PREVIEW_RETURN = UNRESOLVED` 保留。

## 临时资源

复用已有闲置开发工作区，没有复制日常数据库、照片或共享可变依赖。构建目录约177 MiB（Next）和9.8 MiB（legacy）；隔离合成PG／素材约48.5 MiB，临时脚本约12 KiB。保留至本模块PR验收结束，再按精确清单与对应授权决定清理，不自动删除已有目录。

临时预览应用已停止；两处本轮预览配置精确核对后移除。停止合成PG的请求被自动审批以可能干扰负载拒绝，未绕过，隔离PG仍保留运行，需用户后续明确允许停止。该情况不代表日常PG被操作。
