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
confirmation requirement and is also ready for human recheck.

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
| `HR-003` | 2026-08-12 | 素材导入 | 选择照片或文件夹后先预览待处理批次并明确确认；两种选择共用 Web `FileList` 链路，文件夹仅作 capability enhancement，不按浏览器分支；结果明确区分本次新增、重复跳过和素材库总计。 | `READY_FOR_HUMAN_RECHECK` | `fix: verify local material batches before import` | `git diff --check`; focused Admin, rendered HTML and photo tests; desktop/mobile browser preview-and-cancel validation without changing the real library | 待人工复检 |

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
| `character-select` | `NEEDS_POLISH` | 人工拒绝当前固定 1:1 roster 裁切；后续需基于真实素材形成有依据的 3:2 / 2:3 adaptive 方案，并遵守 ADR-0003 的 Variant 与持久化边界。本切片不实现。 |
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

`CHARACTER_SELECT_VARIANT_CANDIDATE` now carries an explicit human direction:
the current 1:1 roster crop is not accepted. A later, separately authorized
design study must justify a 3:2 / 2:3 adaptive treatment against real material;
this decision does not authorize a formal Variant, persistence change, renderer
integration, or template implementation in HR-003.

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
