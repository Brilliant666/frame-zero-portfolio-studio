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

The bootstrap did not consume `HR-001`; the first explicit request above does.
A completed implementation may be reported as `READY_FOR_HUMAN_RECHECK`, while
the matrix remains `NEEDS_POLISH`; only the human reviewer can accept it.

## Eleven-template human review matrix

### `ELEVEN_TEMPLATE_HUMAN_REVIEW_MATRIX`

Allowed states are `PENDING_HUMAN_REVIEW`, `HUMAN_REVIEW_IN_PROGRESS`,
`NEEDS_POLISH`, and `HUMAN_APPROVED`.

| Template | Human status | Human decision |
| --- | --- | --- |
| `cinematic-light` | `PENDING_HUMAN_REVIEW` | — |
| `neon-hud` | `PENDING_HUMAN_REVIEW` | — |
| `film-rail` | `PENDING_HUMAN_REVIEW` | — |
| `manga-panels` | `PENDING_HUMAN_REVIEW` | — |
| `prism-liquid` | `PENDING_HUMAN_REVIEW` | — |
| `orbital-portal` | `PENDING_HUMAN_REVIEW` | — |
| `archive-os` | `PENDING_HUMAN_REVIEW` | — |
| `editorial-duet` | `PENDING_HUMAN_REVIEW` | — |
| `polaroid-field` | `PENDING_HUMAN_REVIEW` | — |
| `character-select` | `NEEDS_POLISH` | 人工拒绝固定 1:1 roster；HR-004 已提供不修改持久化 identity 的 3:2 / 2:3 三行 adaptive justified 候选，等待真实素材人工复检。自动测试不构成 `HUMAN_APPROVED`。 |
| `museum-depth` | `PENDING_HUMAN_REVIEW` | — |

CI, screenshots, browser checks, automated QA, absence of overflow, and a clean
console never imply `HUMAN_APPROVED`. When a human starts reviewing a template,
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
