# 模块3：编辑器草稿生命周期验收

日期：2026-11-03。基线main：`2ded21353ed2bdfb06b0092df257179d54c047fc`（[PR68](https://github.com/Brilliant666/frame-zero-portfolio-studio/pull/68)）。分支：`refactor/site-draft-lifecycle`。本文记录相对该基线的实现与本机证据；最终Head与五项完整CI以模块PR为准。

## 实现与边界

- 新增Site专用`useSiteDraft`，内部会话集中管理当前草稿与同步ref、确认基线、revision/updatedAt、加载与保存、冲突及待确认提交。React层只负责稳定会话、订阅与激活/释放，初次读取仍由调用者启动。
- 保存、检查结果共用同步排他锁；提交使用独立不可变快照，沿用`draft-save.ts`的15秒请求/解码期限、精确内容与revision确认，不新增PUT重试。未确认的保存只能通过GET核对，不能自动恢复发布。
- 读取generation、编辑版本和lifetime隔离旧结果；每个异步边界（包括基础版素材hydration）后检查是否仍有效。取消或卸载后返回ignored；旧finally只释放自己的锁，不能解锁新会话。
- 流影保留指纹基线、干净草稿显式PUT、保存时字段禁用与modal阻塞、undo和401/403私有素材清理。星轨保留nullable基线、保存期间新编辑reconciliation、已确认干净回执与发布提示接管。基础版保留clone、素材hydration、saveState及成功计时器。
- 星轨按Site/Preview组件选择会话，共用单份编辑界面。基础版按Site/Legacy Provider选择会话，共用原Context与children。独立preview保留带expectedRevision的raw PUT及manual-only；legacy保留原payload、不带expectedRevision、degraded读取和manual-only。
- 原自动保存偏好、1500ms、防同失败对象循环重试、SSR off和hidden触发继续由既有自动保存层管理。`PublicationControls`仍只使用本次save返回的准确回执。
- `loadSiteAssets`新增可选AbortSignal，既有调用不变；流影素材请求捕获发起时的会话signal，取消后不回写。

不修改服务端owner/banned/grant授权、CAS、发布事务、Published-only读取、路由、schema、已存JSON、素材键及缓存策略。不包含模块4–6，也不升级日常3001。

## 通过条件与证据

环境：Windows x64 / Node24.22.2，锁文件依赖；真实浏览器采用已安装Chrome155。复用候选源码与依赖，新建独占合成PG17测试实例和测试库，未使用日常账号、照片或数据库。

| 检查 | 结果与范围 |
| --- | --- |
| 共享会话受控异步测试 | 12通过；执行真实session engine，覆盖重复写锁、不可变提交、延迟回执/新编辑、409、pending只读恢复、读取期间编辑/hydration、取消、释放/再激活和旧finally |
| `npm run test:admin` | 321通过、1项既有平台跳过、0失败；包含新会话测试、原传输/后台状态/自动保存/发布与资源边界 |
| TypeScript、lint | 整项目类型检查通过；最终lint零错误、零警告（工具自身JSX解析提示仍输出） |
| `npm run test:node-runtime` | 标准Next生产构建、资源预算和66项运行/预算测试通过 |
| `npm run test:legacy-runtime` | legacy生产构建、预算与45项运行测试通过；覆盖独立preview与legacy入口 |
| 隔离PG／HTTP及真实浏览器 | 最终36通过、0跳过/失败；统一harness包含现有HTTP/数据库边界及本模块3项浏览器子测试 |

真实浏览器通过：

- 原basic/polaroid smoke的12个阶段：六分区保留草稿、真实保存/刷新、空图集、延迟真实CAS回执期间继续输入、双tab409及导出/丢弃警告、内存预览与已保存预览区别、Ctrl/Meta快捷键、过期/跨owner/切账号隔离、重启持久化、桌面/390px/320px及无全局资源请求。
- 既有自动保存、开关、live preview和冲突场景保持通过。
- 新Flow五阶段：手动保存与三空间独立；延迟真实CAS回执、重复快捷键只产生一次PUT及后续编辑单独保存；成功提交丢失确认且自动GET失败后，手动失败/成功检查均只GET并保留新编辑、不自动发布；准确保存回执到达前无发布POST，到达后发布revision精确对应；等待旧PUT响应时通过真实切换控件进入基础版，旧结果不覆盖新编辑，公开指针保持。
- 使用preview工具在同一隔离生产应用中实际登录并操作三类编辑器，确认合成输入保存后UI与服务端一致。服务器无运行错误；初次localhost被本机runner拒绝403及未登录账号查询401属于既有边界，改用授权的loopback origin后正常。该检查不涉及真实数据。

最终证据位于本机ignored `outputs/module3-site-draft/2026-11-03T10-33-32-896Z-0c6a0c57/`，包括basic-polaroid与flow-lifecycle的acceptance、关键截图及仅方法/路径/状态网络记录；统一日志为`pg-browser-final.log`。未记录cookie、header、凭据、响应正文或trace；既有输出目录未覆盖。新增显式`FRAME_ZERO_DRAFT_LIFECYCLE_BROWSER=1`用于本矩阵，原CI/其他浏览器flags与覆盖保留；该flag不启用500图压力或11模板浏览器视觉矩阵。

## 审查与首次失败

独立审查复现：待确认保存后手动重读失败会使检查结果按钮不再发送GET。已将ready限制仅用于新写入；pending在error/loading状态仍可只读核对，准确确认恢复ready并保留新输入，测试覆盖旧reload不能再覆盖该回执。另保留HTTP拒绝身份优先于编辑变化，使401/403仍能触发流影清理。取消结果统一ignored，不向调用者返回过期成功/错误。

首次浏览器环境运行因缺少对应Playwright浏览器版本而失败，使用核实可启动的既有Chrome完成，无安装或锁文件变化。首轮执行目录不对应候选工作区，不计为模块验收；确认无遗留测试进程后，显式从候选运行。

新Flow测试最初使用input定位实际textarea，继而精确label匹配在刷新后读不到已带文本的控件；改为通过所属label定位控件，保持内容断言和原超时。空间切换测试原先比较全部发布DTO，错误地要求动态matchedDraftRevision也不变；改为严格比较公开身份/版本并断言新草稿不再匹配。各首次失败证据保留；未为测试改变产品字段禁用、协议或超时。

提取共享交互后，lint先发现新增依赖告警；补齐后React Compiler指出流影ref读取与手动memo依赖不兼容，改为稳定getSignal并捕获请求自己的signal解决。此后最终构建、lint及浏览器均通过。

## 运行与产物保留

本轮隔离应用和PG已正常停止，确认进程退出与两测试端口释放；日常应用和PG监听PID保持原值。未合并、部署、切换日常或清理已有数据/目录。只移除本轮临时新建的两份本机预览配置，未改既有配置。

复用候选环境：最终`.next`约159.1MiB，legacy `dist`约9.9MiB，`.vinext`约0.14MiB，保留至模块PR验收/下一候选构建。本轮新建隔离PG/配置停止后约64.7MiB，证据约9.4MiB，停止后保留至模块验收及精确清理授权。既有模块1/2夹具、私人素材、回退和旧工作区均保留。

11个显式懒模板仍全部低于64KiB；聚合CSS仍为410660bytes，既有告警保留。`PREVIEW_RETURN=UNRESOLVED / ACCEPTED_FOR_LOCAL_STAGE`不变。本机通过不代替模块PR最终Head的五项完整CI，Auto-fix继续关闭。
