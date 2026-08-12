# Human-Directed Product Polish

> - Human-directed polish status: `ACTIVE`
> - Current phase: `SELF_HOSTED_V1`
> - Current stage: `STAGE_A2_DEPLOYMENT_BOOTSTRAP`
> - Stage status: `IN_PROGRESS`
> - Online status: `NOT_ONLINE_PREVIEW`
> - Engineering launch: `FROZEN`
> - Engineering launch line: `FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY`
> - Branch: `product/prelaunch-manual-polish-01`
> - Current Draft PR: `#24 — fix: refine local workflow and template presentation`
> - External operations: `NOT_AUTHORIZED`
> - Base: `main@ced247e5baf19510329c4c3a084a69e6b1ab0c2c`

This document is the long-lived ledger for explicit, item-by-item human product
polish. The `NEXT` hand-off recorded when the product-experience foundation was
accepted is now active by human authorization. The human revised the local
material-entry requirement after `HR-001`; `HR-002` records the replacement and
remains ready for human recheck. `HR-003` records the subsequent preview and
confirmation requirement and is also ready for human recheck. `HR-004` closes
the complete follow-up set covering paged review, local library management,
ratio policy, and the `character-select` presentation fix.
`HR-005` makes a still-running older local importer diagnosable instead of
presenting its missing management endpoint as an empty library. `HR-006`
clarifies Admin template/layout ownership, the single persistence action, true
draft preview, and the full-template direction-adaptation recheck boundary.
`HR-007` is the active implementation slice: it simplifies the template detail,
uses public-safe neutral structure diagrams, and hands homepage selection
directly to the unchanged material-layout workspace.

This is not an automated backlog. Codex handles exactly one concrete human
request, validates it in proportion to risk, creates one focused commit, pushes
it to the same Draft PR, reports the result, and stops at
`WAITING_FOR_HUMAN_INPUT`. Observations outside the request may be recorded but
must not be implemented without a new human instruction.

The formal project state remains:

```text
SELF_HOSTED_V1
STAGE_A2_DEPLOYMENT_BOOTSTRAP
IN_PROGRESS
NOT_ONLINE_PREVIEW
```

The product-experience foundation and automated visual-QA baseline are
accepted. `PRE_LAUNCH_PRODUCT_POLISH` remains in progress, and eleven-template
human visual approval remains pending.

## Request protocol

Each human request follows this bounded sequence:

1. `HUMAN_REQUEST_CAPTURE`
2. `REPRODUCE / INSPECT`
3. `SCOPE`
4. `IMPLEMENT`
5. `FOCUSED_TEST`
6. `BROWSER_VALIDATE` when UI, visual, template, or import interaction changes
7. `SELF_REVIEW`
8. `COMMIT`
9. `PUSH`
10. `UPDATE_LEDGER`
11. `REPORT`
12. `WAITING_FOR_HUMAN_INPUT`

Requests receive sequential IDs beginning with `HR-001`. The request wording
must preserve the human intent without expanding it into a broader redesign.
Each request should map to one focused commit whenever practical. No force push,
stacked PR, per-issue PR, or opportunistic dependency/architecture cleanup is
allowed in this lane.

## Human Request Ledger

| ID | Date | Area | Human request | Status | Commit | Validation | Human decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `HR-001` | 2026-08-11 | 素材导入 | 本地素材导入只保留文件夹选择作为普通产品入口，取消产品侧高级／命令行导入入口。 | `SUPERSEDED_BY_HR-002` | `fix: make folder import the sole product entry` | `git diff --check`; focused Admin and photo tests; desktop/mobile browser entry validation | 后续需求改为统一添加素材入口；继续保留产品侧不展示命令行入口 |
| `HR-002` | 2026-08-11 | 素材导入 | 本机素材导入使用一个“添加素材”主入口，展开后可选择一张或多张照片，或选择文件夹作为一次性批次来源；不提前实现 hosted upload、素材删除或持久化管理。 | `READY_FOR_HUMAN_RECHECK` | `fix: unify local material selection` | `git diff --check`; focused Admin, rendered HTML and photo tests; desktop/mobile browser chooser validation | 待人工复检 |
| `HR-003` | 2026-08-12 | 素材导入 | 选择照片或文件夹后先预览待处理批次并明确确认；两种选择共用 Web `FileList` 链路，文件夹仅作 capability enhancement，不按浏览器分支；结果明确区分本次新增、重复跳过和可用素材总计。 | `READY_FOR_HUMAN_RECHECK` | `fix: verify local material batches before import` | `git diff --check`; focused Admin, rendered HTML and photo tests; desktop/mobile browser preview-and-cancel validation without changing the real library | 待人工复检 |
| `HR-004` | 2026-08-12 | 素材管理／排版 | 将本轮提出的问题作为一个完整批次处理：待处理缩略图分页且确认仍覆盖完整批次；记录隐私安全的首次导入顺序与批次；显示 draft／已保存引用；提供可恢复回收站；分配目标收敛为横图 3:2、竖图 2:3并保留 16:9 展示裁切；修复 `character-select`，让任意九张横／竖图以三行 justified roster 展示且不使用 1:1。 | `READY_FOR_HUMAN_RECHECK` | `fix: complete local material management and character layout` | full repository gates; importer/service/client/management tests; 512 orientation combinations; desktop/mobile browser validation | 待人工复检；不推导 `HUMAN_APPROVED` |
| `HR-005` | 2026-08-12 | 素材管理 | 新前端连接仍在运行的旧版本地 importer 时，不得把管理接口缺失误报为素材库为空；明确提示重新启动完整开发服务，并保留现有素材与排版引用。 | `READY_FOR_HUMAN_RECHECK` | `fix: diagnose stale local material service` | stale-service behavior regression; safe dev restart; manifest/catalog count verification | 待人工复检 |
| `HR-006` | 2026-08-12 | Admin 信息架构／模板适配 | 页面模板只负责查看效果与选择 `activeTemplate`，素材排版独占推荐、预览、采用和 `templateWorks` 编辑；顶栏保留唯一“保存全部修改”并准确预览当前内存草稿。按每个正式模板自身方向需求完成全套适配，不把横图偏好定义为全局素材标准；全部 11 个模板仍须真实素材人工复检。 | `READY_FOR_HUMAN_RECHECK` | `fix: separate template choice from material layout` | full repository gates; ownership/save/draft-preview contract tests; eleven-template direction and deterministic layout tests; Standard Next and legacy bundle gates; Chrome visual workflow pending because the selected Chrome profile is not connected | 未经人工复检不得标记 `HUMAN_APPROVED` |
| `HR-007` | 2026-08-12 | Admin 页面模板／流程衔接 | 精简模板详情：移除重复的顶部三栏、负向状态 badge 与独立“查看模板效果”；保留 11 项选择列表，以不含用户素材的中性结构图表达模板差异；“设为主页模板”只更新 draft `activeTemplate` 并进入素材排版，当前 draft 则直接进入素材排版。模块 4 `/admin/layout` 继续独占素材库、推荐生成、预览、采用与 `templateWorks` 编辑。 | `READY_FOR_HUMAN_RECHECK` | `fix: simplify template choice and continue to layout` | `git diff --check`; `npm run lint`; full `npm test`; Standard Next build/bundle; legacy runtime/bundle; Public Safety; deterministic 11-preview regeneration; Chrome 1440px/390px template selection → unsaved layout transition → reload-without-save | 待人工复检；不得推导 `HUMAN_APPROVED` |

The bootstrap did not consume `HR-001`; the first explicit request above does.
A completed implementation may be reported as `READY_FOR_HUMAN_RECHECK`; only
the human reviewer can accept it.

## Eleven-template human review matrix

### `ELEVEN_TEMPLATE_HUMAN_REVIEW_MATRIX`

Allowed states are `PENDING_HUMAN_REVIEW`, `HUMAN_REVIEW_IN_PROGRESS`,
`NEEDS_POLISH`, `READY_FOR_HUMAN_RECHECK`, and `HUMAN_APPROVED`.

| Template | Human status | Human decision |
| --- | --- | --- |
| `cinematic-light` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留结构性／hero 固定方向，普通 gallery 槽按来源方向使用 3:2／2:3；需用真实横竖组合复检 desktop/mobile 裁切与层级。 |
| `neon-hud` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留结构性／hero 固定方向与 HUD 二次展示，普通 gallery 槽按来源方向使用 3:2／2:3；需真实素材复检。 |
| `film-rail` | `READY_FOR_HUMAN_RECHECK` | HR-006 保持全横向正式槽位；需用真实横竖素材确认拒绝强跨方向与 desktop/mobile 轨道表现。 |
| `manga-panels` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留竖向封面等结构槽，普通 gallery 槽按来源方向使用 3:2／2:3；需真实素材复检。 |
| `prism-liquid` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留主视觉／全景等结构槽，普通 gallery 槽按来源方向使用 3:2／2:3；需真实素材复检。 |
| `orbital-portal` | `READY_FOR_HUMAN_RECHECK` | HR-006 保持全竖向正式槽位与横向门户二次展示；需真实素材复检 desktop/mobile 裁切与层级。 |
| `archive-os` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留结构性槽，普通 gallery 槽按来源方向使用 3:2／2:3；需真实素材复检高密度 desktop/mobile 表现。 |
| `editorial-duet` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留竖向封面等结构槽，普通 gallery 槽按来源方向使用 3:2／2:3；需真实素材复检。 |
| `polaroid-field` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留中央竖向 hero 等结构槽，普通外围槽按来源方向使用 3:2／2:3；需真实素材复检 FIT、裁切与层级。 |
| `character-select` | `READY_FOR_HUMAN_RECHECK` | 人工拒绝固定 1:1 roster；HR-004/HR-006 保持全槽来源方向自适应的 3:2／2:3 三行 justified 候选，需真实横竖组合复检。 |
| `museum-depth` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留展厅 hero／结构槽方向，普通 gallery 槽按来源方向使用 3:2／2:3；需真实素材复检 desktop/mobile 裁切与层级。 |

CI, screenshots, browser checks, automated QA, absence of overflow, and a clean
console never imply `HUMAN_APPROVED`. `READY_FOR_HUMAN_RECHECK` means only that
an implemented candidate is ready to be judged again. When a human starts reviewing a template,
its state may become `HUMAN_REVIEW_IN_PROGRESS`; a reported defect makes it
`NEEDS_POLISH`. After a fix, Codex reports `READY_FOR_HUMAN_RECHECK` but does not
set `HUMAN_APPROVED`. Only an explicit human acceptance such as “通过”, “可以了”,
or “我满意” authorizes that final state.

## Known follow-ups / NOT AUTO-AUTHORIZED

The following are known observations, not approved implementation tasks:

- `LOCAL_SOURCE_BINDING_FOLLOWUP`
- `ONE_LEVEL_LAYOUT_UNDO_FOLLOWUP`
- `MATERIAL_PROFILE_INFORMATION_HIERARCHY_REVIEW_PENDING`
- `ORBITAL_VARIANT_CANDIDATE`
- `CHARACTER_SELECT_VARIANT_CANDIDATE`
- `REAL_SQUARE_HEAVY_VALIDATION_PENDING`
- `DEPLOYMENT_TOPOLOGY_FOLLOWUP`

```text
DO NOT IMPLEMENT without a new, explicit human request.
```

`CHARACTER_SELECT_VARIANT_CANDIDATE` still means a future formal Variant decision.
HR-004 fixes the current presentation with a deterministic 3:2 / 2:3 source-
orientation layout, but does not create a production Variant registry, persist a
variant identity, or change `SiteDocumentV1`. Human visual approval remains
pending against real material.

## Scope and architecture guardrails

Every micro-slice preserves:

- `SiteDocumentV1` and the eleven template IDs;
- stable Site/Asset identity and the legacy adapter;
- Site ownership and authentication/authorization boundaries;
- `Save != Publish` and `Public != Draft`;
- the Composition persistence boundary;
- one-time folder import unless a separately approved trustworthy local-source
  binding contract exists;
- local paths, real photos, manifests, screenshots, personal contact details,
  and real SiteContent as uncommitted validation inputs only.

If a request requires a frozen contract change, formal Variant persistence,
Stage B, hosted upload, production data, or external infrastructure work, stop
and request the corresponding architecture or Stage decision.

## Validation and stop rule

Each request receives `git diff --check`, focused tests, lint for changed source,
and browser validation when applicable. Broader test/build/bundle/public-safety
gates run when the change risk or final review requires them. GitHub Quality,
Public repository safety, Container, and Deployment Bootstrap gates remain
enabled for every PR update.

After the bootstrap and after every future micro-slice, the required state is:

```text
WAITING_FOR_HUMAN_INPUT
```

The Draft PR is never marked Ready or merged without separate human approval.
No next product issue is selected automatically.
