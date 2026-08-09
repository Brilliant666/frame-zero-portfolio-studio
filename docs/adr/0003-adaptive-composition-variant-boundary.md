# ADR-0003：Adaptive Composition Variant 身份与规划边界

- 状态：Accepted
- 日期：2026-08-10
- 决策人：Brilliant666
- 关联 Phase / Epic：COMPOSITION-02 / Template kernel foundation
- 关联 PR / Issue：COMPOSITION-02 Draft PR

## 背景

当前 11 套模板各自声明一组固定照片槽位，Admin 使用全局匹配算法把本地素材分配到这些
槽位，renderer 则在 legacy 内容缺少显式槽位时执行兼容回退。未来 Adaptive Composition
需要在同一模板版本下提供多套经过设计审核的构图候选，并在用户明确请求时推荐其中一套。

如果 Variant 身份、模板版本和推荐时机没有先被固定，算法升级可能在没有用户操作的情况下
改变已发布页面，renderer 也可能根据当前素材重新猜测构图。另一方面，直接把 `variantId`
加入 `SiteDocumentV1` 会破坏已经冻结的 V1 契约。

COMPOSITION-02 因此只建立不依赖 React、DOM、D1、文件系统或网络的纯 contract、validator、
assignment engine 和 planner 基础。它不批准正式视觉 Variant，也不接入当前 Admin、renderer、
API、数据库或持久化文档。

## 决策

### 1. Variant 是稳定、不可变的设计身份

每个 Composition Variant 都有稳定 `variantId`，由设计审核后作为某个
`(templateId, templateVersion)` 下的正式设计资产存在。`variantId` 不是根据素材数量、
临时 ratios、`templateWorks` 或 renderer 输出推导的匿名布局。

已经批准并可能被持久化引用的 Variant 不得在原 `variantId` 下改变含义。相同 logical slot
schema 下的新构图设计使用新的 `variantId`；不允许就地改写旧 Variant。

### 2. `variantId` 与 `templateVersion` 是不同概念

`templateVersion` 标识 logical slot schema；`variantId` 标识该 schema 下的一套获批构图。
同一模板版本可以拥有多个不可变 Variant，只要它们保持相同的槽位数量、顺序、稳定 slot
key、logical role、critical 语义和容量。

同一 `templateVersion` 的不同 Variant 可以为同一个 logical slot 声明不同的
`assignmentRatio`，也可以声明不同的 secondary presentation target。这不是对 logical slot
schema 的修改。若槽位数量、顺序、稳定 key、logical role、critical 语义、容量或 composition
数据含义发生变化，则必须提升 `templateVersion`。

### 3. `SiteDocumentV1` 保持完全冻结

本决策不修改 `SiteDocumentV1` parser、V1 schema、冻结的 11 个模板身份或当前
`templateVersion: 1` 迁移语义，也不创建 SiteDocumentV2/Vnext。COMPOSITION-02 的 planner
结果只是未持久化的纯值，不能被写入 V1 来伪装正式 Variant 支持。

### 4. 未来持久化必须显式记录 Variant

未来 versioned composition Vnext 在获得独立契约批准后，必须显式保存 `variantId` 与
composition。不得仅保存槽位结果后由 ratios、素材分布或 renderer 反推 Variant。

### 5. Renderer 不选择或推导 Variant

未来 renderer 只渲染持久化且已经通过兼容性检查的
`(templateId, templateVersion, variantId, composition)`。素材库变化、planner 算法升级或
renderer 部署都不得让 renderer 自动重选 Variant。

### 6. 只有明确的推荐操作可以跨 Variant

Planner 只在用户明确执行以下操作时评估多个 Variant：

- 首次自动构图；
- 重新推荐构图。

这类操作对应 `RECOMMEND_VARIANT` 语义。推荐结果仍需由用户确认后，才能由未来持久化层保存。

### 7. 普通重新排版保留当前 Variant

未来普通“重新排版”对应 `KEEP_CURRENT_VARIANT`：只在当前 Variant 内重新分配素材，不因素材库
变化或微小裁切优势跨 Variant。若当前 Variant 缺失或无效，planner 必须明确失败或阻断，不能
静默选择另一套设计。

### 8. Locked conflict 必须阻断，不得静默解锁

缺失的 locked asset、重复 locked asset、非法 locked slot、locked asset 与 Variant 槽位方向
不兼容，以及两个 lock 占用同一 logical slot，都必须产生确定性的 `lockedConflict`。发生冲突
的 Variant 为 invalid / blocked；planner 可以在 `RECOMMEND_VARIANT` 中继续评估其他兼容
Variant，但不能为了得到结果而静默解除 lock。若所有候选都冲突，则返回 blocked result。

### 9. 第一版 Variant 固定 slot count 与 logical identity

第一版 Adaptive Composition 只允许同一 template/version 下、slot count 相同且 logical slot
identity 稳定的 Variant。不同 Variant 可以改变经过设计批准的横竖 assignment ratio，但不能
改变槽位的身份、顺序、角色或容量。

### 10. Logical slot schema 变化必须提升模板版本

任何 Variant 若需要改变 logical slot role、ordering、capacity、slot count 或 composition
含义，必须进入新的 `templateVersion`，并接受模板迁移与兼容性审查，不能伪装成同版本
Variant。

### 11. 整个合法 Photo Library 是候选集

当前合法 photo manifest 中的全部素材都是 planner 候选。用户通过添加照片或文件夹决定哪些
素材进入项目；本决策不增加 Approved Pool、二次批准层、收藏池或自动排版许可 checkbox。
同一素材在一次自动 composition 中最多使用一次是 planner policy，不是未来文档 parser 的
合法性约束。

### 12. Dynamic slot count 不属于第一版

第一版不提供 `minSlots`、`maxSlots`、flowing slot count 或根据素材数量临时改变 slot count。
动态数量需要后续独立版本与迁移决策。

## Planner 与验证边界

纯 registry validator 必须 fail closed，并确定性报告无效 Variant identity、重复 fallback
priority、非连续或重复 slot index、漂移的 logical slot identity、非法 ratio、`NaN`、
`Infinity` 和其他不可信结构。派生的 slot/ratio 统计从 ordered slots 计算，不重复保存易漂移
汇总。

纯 assignment engine 保留当前经过验证的 hard orientation compatibility，并使用确定性的
ratio cost、明确的 square penalty 和 secondary presentation cost。Planner 输出可序列化的
assignment、warnings、locked conflicts 与 lexicographic score，供未来解释推荐原因；它不输出
用户文件路径。

### 确定性评分与稳定策略

Assignment 只接受 `3:2`、`2:3`、`16:9` 三种目标比例。landscape 素材只进入 landscape
slot，portrait 素材只进入 portrait slot，精确 square 可以进入两者；near-square 仍遵守当前
manifest 的 `> 1` / `< 1` 方向语义。基础裁切成本为
`round(abs(log(actualRatio / targetRatio)) * 1_000_000)`。精确 square 每次使用另加固定
`80_000` units penalty；它仍是合法候选，但不再是无成本的万能素材。critical secondary
presentation cost 的优先级高于普通 assignment crop。

Variant 使用以下显式字典序 score，不使用巨大 magic weighted sum：

1. locked conflict count；
2. critical slot missing；
3. placeholder count；
4. orientation shortage；
5. critical secondary projection cost；
6. total crop pressure；
7. square-use penalty；
8. existing intent churn；
9. design deviation；
10. fallback priority；
11. `variantId` 的 ASCII 顺序。

`orientation shortage` 表示在扣除仅由素材总数不足造成的必然空槽后，仍因方向兼容性或有效
lock 分配而无法填充的额外槽位；landscape / portrait shortage 继续按最终空槽方向分别报告。

`design deviation` 是相对于当前 Variant 的派生值；没有当前 Variant 时，以最低
`fallbackPriority` 的 classic/fallback Variant 为稳定参考，不把它保存进 registry。所有数字
必须是 finite、non-negative 且可序列化。

`RECOMMEND_VARIANT` 先使用上述全序得到 raw best，再只对单一稳定参考执行 hysteresis gate。
当 locked/critical/placeholder/orientation/critical-secondary/square 结果相同，而且 raw best 的
平均 crop 改善满足 `0 < improvement < 20_000` units / filled slot 时，保留当前或 classic
参考；改善为零时继续使用后续 score 分量，改善达到或超过阈值时切换。该规则不参与候选间
pairwise sort，避免 epsilon comparator 的非传递性。

Planner 的目标复杂度是 `O(variants × slots² × (assets + slots))`，每次 Variant 评估的工作内存
是 `O(assets + slots)`。公开入口还限制组合工作量为 `8_000_000` work units；KEEP 模式只按
一个当前 Variant 计数，RECOMMEND 模式按全部候选计数。12 slots、10,000 assets、5 variants
的规定门禁位于预算内；分别合法但组合后超出预算的输入会确定性 fail closed。

COMPOSITION-02 可以用 synthetic Variant 和 test-only `classic` adapter 验证现有固定布局
语义，但不得向 production catalog 写入 `variantId`，不得把研究中的 Manga、Museum 或其他
ratio 假设登记为正式 Variant。

## 方案对比

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 稳定 Variant + 显式 future persistence | 设计身份可审计，算法升级不会改写已确认构图 | 需要未来 Vnext 与迁移决策 | 采用 |
| renderer 根据素材临时推导 Variant | 无需新增持久化身份 | 输出随素材和算法变化，无法可靠回放 | 拒绝 |
| 把 `variantId` 加入 V1 | 可立即保存 | 破坏冻结 V1 和既有迁移契约 | 拒绝 |
| 每次普通重排都重新推荐 Variant | 自动化程度高 | 用户设计选择不稳定，微小评分差异会改变页面 | 拒绝 |
| 第一版支持动态 slot count | 素材容量灵活 | 扩大 schema、迁移和 renderer 风险 | 延后 |

## 数据与兼容性

- COMPOSITION-02 不修改 `SiteContent`、`SiteDocumentV1`、API payload、D1 schema 或数据库。
- 不写入 `variantId`，不创建 published revision，也不迁移当前 `templateWorks`。
- 当前 Admin Hungarian assignment 与 renderer legacy fallback 保持原状。
- 当前 11 套模板、template IDs、slot counts、CSS 和视觉输出保持不变。
- Future Vnext、正式 Variant registry、持久化和 runtime rollout 必须使用独立 PR 与迁移审查。

## 安全与租户边界

- Planner 不执行 I/O，不读取登录会话、D1、repository、对象存储、文件系统或网络。
- Planner 不生成 Site/Asset UUID，不接收或输出文件路径、存储 key、凭证或联系方式。
- 候选素材由调用方作为只读、已验证的 Asset-like 快照传入；未来租户范围仍由调用方和
  repository 在进入 planner 前保证。
- 本决策不改变认证、授权、owner 或 Site 边界。

## 运维影响

- 不新增环境变量、服务、数据库迁移或部署步骤。
- 未被 client/runtime import 的纯 planner 不应增加公开 bundle。
- 10,000-assets synthetic gate 必须证明算法不随素材数量指数增长；本决策不规定脆弱的
  亚毫秒性能承诺。

## 验证

- Contract 与 registry invariant 单元测试；
- hard orientation、ratio、square、secondary presentation 和 placeholder assignment 测试；
- locked conflict、planner mode、deterministic tie 和 hysteresis 测试；
- 全 synthetic 场景，不使用用户真实照片或 SiteContent；
- test-only classic adapter 验证当前 11 套固定 slot ratio 的基础兼容语义；
- 12 slots、10,000 assets、5 variants 的宽松 CI 性能门禁；
- 完整 lint、test、build、bundle budget 与 public repository safety 门禁。

## 后果

COMPOSITION-02 提供的是 Adaptive Composition 的纯 contract/planner foundation，不是已上线
功能。它让后续视觉试点可以在稳定 identity、确定性推荐和严格 lock 语义上工作，同时接受
未来还需要正式 Variant 设计审核、Vnext、持久化、Admin UX、renderer integration 和迁移策略。

## 状态变更记录

| 日期 | 状态 | 原因 |
| --- | --- | --- |
| 2026-08-10 | Accepted | 冻结 COMPOSITION-02 的 Variant identity 与纯规划边界 |
