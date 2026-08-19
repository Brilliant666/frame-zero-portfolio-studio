# Human-Directed Product Polish

> - Human-directed polish status: `IN_PROGRESS`
> - Current phase: `SELF_HOSTED_V1`
> - Current stage: `STAGE_A2_DEPLOYMENT_BOOTSTRAP`
> - Stage status: `IN_PROGRESS`
> - Online status: `NOT_ONLINE_PREVIEW`
> - Engineering launch: `FROZEN`
> - Engineering launch line: `FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY`
> - Branch: `product/prelaunch-manual-polish-02`
> - Accepted PR: `#24 — fix: refine local workflow and template presentation`
> - Current Draft PR workspace: `#25 — fix: continue human-directed product polish`
> - PR #24 closure mode: `FINAL_HUMAN_ACCEPTANCE + MERGE`
> - PR #24 feature freeze: `TRUE`
> - PR #24 limited baseline acceptance: `ACCEPTED`
> - PR #25 workspace: `HUMAN_DIRECTED_PRODUCT_POLISH_WORKSPACE`
> - PR #25 workspace status: `ACTIVE`
> - PR #25 mode: `LIGHTWEIGHT_HUMAN_REQUEST_ONLY`
> - PR #25 current request: `HR25-002 — READY_FOR_HUMAN_RECHECK`
> - PR #25 next request ID: `HR25-003`
> - Human-approved templates: `0 / 11`
> - Current hand-off: `HUMAN_INPUT_REQUIRED`
> - External operations: `NOT_AUTHORIZED`
> - Base: `main@dc471795139dc47649368bb37c0178fb77188fea`

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
`HR-007` is ready for human recheck after simplifying the template detail,
adding public-safe neutral structure diagrams, and handing homepage selection
directly to the unchanged material-layout workspace. `HR-008` is ready for
human recheck after moving the inspected template identity above the structure
diagram and using one slot-direction plan for both the summary and material
guidance. `HR-009` is ready for human recheck after compacting the material
layout recommendation into an optional slot index and restoring the actual
editing workspace as the page's primary working surface. `HR-010` is ready for
human recheck after correcting real-template repetition and mixed-orientation
geometry across the eleven-template review. The existing 39-photo local
library was used only as uncommitted validation input; the frozen V1 slot
counts, identities, `SiteDocumentV1`, and legacy adapter remain unchanged.

This is not an automated backlog. PR #24 is accepted and merged as the limited
baseline. PR #25 is a lightweight, human-request-only workspace: Codex handles
exactly one concrete request, validates it in proportion to risk, creates one
focused commit, pushes it to the same Draft PR, reports the result, and stops at
`HUMAN_INPUT_REQUIRED`. Observations outside the request may be recorded but
must not be implemented without a new human instruction. Neither PR establishes
final template visual approval or completes pre-launch product polish.

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

## PR #25 — Lightweight Human-Directed Polish

```text
Base: main@dc471795139dc47649368bb37c0178fb77188fea
Status: ACTIVE
Workspace: HUMAN_DIRECTED_PRODUCT_POLISH_WORKSPACE
Mode: LIGHTWEIGHT_HUMAN_REQUEST_ONLY
Current request: HR25-002 — READY_FOR_HUMAN_RECHECK
Next request ID: HR25-003
PR24_LIMITED_BASELINE: ACCEPTED
PRE_LAUNCH_PRODUCT_POLISH: IN_PROGRESS
ELEVEN_TEMPLATE_HUMAN_VISUAL_APPROVAL: PENDING
HUMAN_APPROVED: 0 / 11
ENGINEERING_LAUNCH_LINE: FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY
```

The workspace never selects or implements a known follow-up automatically.
Each future request uses `HR25-001`, `HR25-002`, and so on, and follows this
bounded sequence:

```text
human request
-> reproduce / inspect
-> minimum scope
-> implement
-> focused validation
-> browser check when applicable
-> atomic commit
-> push
-> concise report
-> stop for human input
```

### `KNOWN_FOLLOWUPS_NOT_AUTO_AUTHORIZED`

- `NEXT_PR_P1`: `ONE_LEVEL_LAYOUT_UNDO`,
  `CLEAR_TEMPLATE_CONFIRMATION_AND_UNDO`,
  `IMPORT_FAILURE_IDENTIFICATION`, `DELETE_SEMANTICS_HUMAN_DECISION`, and
  `CONTINUED_TEMPLATE_BY_TEMPLATE_VISUAL_POLISH`;
- `NEXT_PR_P2`: `DRAG_DROP_IMPORT`, `AUTO_DETECT_DROP_SOURCE`,
  `BULK_ASSET_MANAGEMENT`, `ASSET_DETAIL`, `TAGS_ALBUMS`, `TRUE_REROLL`, and
  `PREVIEW_DEVICE_SWITCHER`;
- `PRE_DEPLOYMENT_P1`: `PUBLIC_IDENTITY_SSR_MISMATCH`;
- `LOCAL_ONLY_FUTURE`: `SOURCE_FOLDER_BINDING`, `RESCAN`, `WATCHER`, and
  `AUTO_SYNC`;
- `FUTURE_HOSTED`: `POSTGRESQL`, `AUTH`, `HOSTED_ASSETS`, `HOSTED_UPLOAD`, and
  `ASSET_RESOLVER`.

These are inventory only. They are not selected work and must not be
implemented without a new, explicit human request.

| ID | Human request | Area | Status | Commit | Validation | Human decision |
| --- | --- | --- | --- | --- | --- | --- |
| HR25-001 | Split the single-page `polaroid-field` presentation behind the three existing top tabs; enlarge the navigation and replace its English labels with Chinese. Approved scope: keep one route, expose one section at a time through URL hashes with history support, preserve visible sticky/mobile navigation and accessible active state, route internal calls to the matching section, and recalibrate the field canvas without discarding its view state. | `polaroid-field` section navigation and responsive presentation | READY_FOR_HUMAN_RECHECK | `fix: split polaroid content into views` | Focused test 9/9; TypeScript and ESLint pass; browser verified same-route three-view navigation, 14.1–14.7 px Chinese labels, 44 px targets, sticky behavior, 390 px no-overflow layout, direct hash/refresh/back behavior, admin preview URL isolation and toolbar clearance, and preserved field zoom across section switches. | PENDING |
| HR25-002 | Remove the hard-coded `FIELD NOTE / 001—009` decoration from `polaroid-field` without adding an admin field. Preserve the shared `availability` field, but render its marker in this template only when the trimmed value is non-empty or the template is in preview mode. A local literal value of `空` is user data and must not be special-cased or filtered in code. | `polaroid-field` decorative metadata and availability rendering | READY_FOR_HUMAN_RECHECK | `fix: clean up polaroid header metadata` | Polaroid focused test 10/10; `test:polish` 18/18; TypeScript, ESLint, and diff check pass. Chrome verified `FIELD NOTE` absent on the public page, `TEMPLATE PREVIEW` visible in admin preview without changing the URL, and the saved literal `空` retained as user content that remains editable through the admin availability field, with no special sentinel handling. | PENDING |

## PR #24 request protocol

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
12. `WAITING_FOR_HUMAN_REVIEW`

PR #24 requests received sequential IDs beginning with `HR-001`. The request wording
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
| `HR-008` | 2026-08-12 | Admin 模板详情／素材指引 | 将模板名称作为详情首要标题，并把必要状态与简介一并置于结构图之前；模板详情中的槽位构成与素材准备建议共用同一逐槽方向计划，素材排版摘要沿用该计划，统一表达固定横图、固定竖图与任意方向槽位，并明确 16:9 只是展示裁切而非需要额外准备的素材格式。 | `READY_FOR_HUMAN_RECHECK` | `fix: align template details with material guidance` | `git diff --check`; focused material-profile/Admin/rendered tests; full `npm test`; lint; Standard Next and legacy build/bundle; Public Safety; Chrome desktop/responsive heading order, all-11 slot-count consistency, Prism 2/1/6, layout-summary parity, zero overflow and zero console errors | 待人工复检；不得推导 `HUMAN_APPROVED` |
| `HR-009` | 2026-08-13 | Admin 素材排版／推荐索引 | 修复“漂浮拍立得”在素材排版页中因竖向 hero 按真实 2:3 比例跨列撑高而形成的超长错位；推荐区默认折叠，展开后使用不再跨列撑高的紧凑槽位索引，继续显示真实方向、槽位身份与优先级，正式结构与裁切仍由“预览推荐排版”承担。 | `READY_FOR_HUMAN_RECHECK` | `fix: compact the material recommendation index` | Node 22.13.1 focused Admin/preview tests, ESLint, TypeScript and diff check; full repository gates; Chrome desktop/responsive collapsed/expanded height, zero-overflow, 24-item pagination and no-draft-mutation checks | 待人工复检；不得推导 `HUMAN_APPROVED` |
| `HR-010` | 2026-08-14 | 正式模板排版／真实素材复检 | 使用现有 39 张本地素材完整修复本轮人工指出并经全模板自查确认的问题：漂浮拍立得按真实横竖比例避免拥挤；霓虹取景器、明亮电影感与漫画分镜册不再用旧固定宽度承载自适应横竖素材；在冻结 V1 槽位内让 hero／cover／statement 与主体画廊互斥使用稳定身份，不再静默重复同一素材；其余模板同步完成真实素材桌面／窄屏复检。 | `READY_FOR_HUMAN_RECHECK` | `fix: stabilize real-material template layouts` | focused orientation, frozen-slot identity, collision and adapter-capacity tests; full repository gates; Chrome all-eleven desktop/responsive validation using the uncommitted 39-photo library | 待人工复检；不得推导 `HUMAN_APPROVED` |

The bootstrap did not consume `HR-001`; the first explicit request above does.
A completed implementation may be reported as `READY_FOR_HUMAN_RECHECK`; only
the human reviewer can accept it.

## PR #24 limited closure

The block below preserves the exact pre-acceptance closure snapshot for audit
continuity. The final human acceptance that follows supersedes its live PR gate
fields without rewriting the historical record.

```text
FEATURE_FREEZE = TRUE
PR24 = OPEN + DRAFT
PR24_READY = NO
PR24_MERGED = NO
NEXT_PR_CREATED = NO
HUMAN_DIRECTED_PRODUCT_POLISH = PR24_LIMITED_BASELINE_READY
PRE_LAUNCH_PRODUCT_POLISH = IN_PROGRESS
ELEVEN_TEMPLATE_HUMAN_VISUAL_APPROVAL = PENDING
HUMAN_APPROVED = 0 / 11
CURRENT_SAVED_TEMPLATE_FALLBACK_BROKEN = CLOSED
ENGINEERING_LAUNCH = FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY
SERVER_DNS_TLS_OPERATIONS = NONE
PR24_HAND_OFF = WAITING_FOR_HUMAN_REVIEW
```

### Final human acceptance

On 2026-08-18, the human reviewer accepted the exact limited-closure head and
authorized Ready for Review followed by squash merge. This accepts the PR #24
baseline only; it does not complete pre-launch or human-directed product
polish, approve any formal template, authorize a next branch or PR, or unfreeze
the engineering launch line.

```text
PR24_FINAL_HUMAN_ACCEPTANCE = ACCEPTED
PR24_LIMITED_BASELINE = ACCEPTED
PR24_READY_AND_SQUASH_MERGE = AUTHORIZED
HUMAN_DIRECTED_PRODUCT_POLISH = IN_PROGRESS
PRE_LAUNCH_PRODUCT_POLISH = IN_PROGRESS
ELEVEN_TEMPLATE_HUMAN_VISUAL_APPROVAL = PENDING
HUMAN_APPROVED = 0 / 11
CURRENT_SAVED_TEMPLATE_FALLBACK_BROKEN = CLOSED
ENGINEERING_LAUNCH = FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY
NEXT_BRANCH_CREATED = NO
NEXT_PR_CREATED = NO
PR24_HAND_OFF = WAITING_FOR_NEXT_HUMAN_DIRECTED_PRODUCT_POLISH_AUTHORIZATION
```

The closure fixes only the saved-template fallback safety defect. It preserves
the own-key semantics of `templateWorks`, including an explicit empty layout,
and distinguishes three cases without writing SiteContent:

| Saved layout state | Closure behavior |
| --- | --- |
| Explicit `templateWorks` key exists | Use that explicit layout without probing or replacing it. |
| No explicit key and every resolved legacy image is available | Preserve the compatible legacy fallback. |
| No explicit key and any resolved legacy image is stale or unavailable | Mark the layout required, retain only works whose preview and full image both probe successfully, and render placeholders for failed slots instead of broken images. |

This behavior applies equally to the four locally observed fallback gaps:
`orbital-portal`, `archive-os`, `editorial-duet`, and `museum-depth`. Choosing a
template still changes only draft `activeTemplate`; it does not Apply a
recommendation, create `templateWorks`, or persist the draft. Apply remains an
explicit Layout action, and save remains the single Admin persistence action.

### `AUDIT_RECONCILIATION`

The entries below are additive closure-time audit notes. They do not rewrite
the request wording, status, validation claim, or chronology of `HR-001` through
`HR-010`.

- `HR-001_COMPANION_EOL`: commit
  `6173c7564100350e9d2d32fee4b07236895b6b6e` (`chore: normalize HR-001
  transport line endings`) followed the HR-001 product commit. It is transport-
  only support, not a second product change or a new human request.
- `WINDOWS_LIBVIPS_IMPORT_LIFECYCLE`: the Windows/libvips file-lifecycle repair
  and synthetic cleanup-lock regression were completed inside
  `b743a4775ed25fcc17ce6cf4de61d552d2da2222` while validating HR-004. It did not
  receive a separate HR row; this note supplies the missing audit linkage.
- `HR-006_CHROME_EVIDENCE`: the HR-006 row accurately recorded Chrome as pending
  at that commit. Connected Chrome evidence was supplied later by HR-007 through
  HR-010 for template selection, unsaved transition, draft preview, Layout
  ownership, desktop/responsive behavior, and all-eleven real-material smoke.
  Later evidence does not retroactively change the HR-006 row and does not imply
  `HUMAN_APPROVED`.
- `WAITING_TOKEN`: this closure standardizes the hand-off token as
  `WAITING_FOR_HUMAN_REVIEW`; the earlier `WAITING_FOR_HUMAN_INPUT` wording
  represented the same stop-for-human boundary and is not a completion claim.
- `ROUTE_AND_PUBLIC_IDENTITY_DEFERRED`: the human explicitly deferred `/star`,
  the future platform introduction at `/`, and the client/SSR title split. PR
  #24 does not implement a route migration or SSR branding migration.
  `PUBLIC_IDENTITY_SSR_MISMATCH` remains `P1_PRE_DEPLOYMENT`; route and platform
  homepage ownership remain with the formal roadmap stages.

### Legacy bundle gate integrity

The scope-expanded legacy rollback gate is accepted as an internal supporting
change:

```text
LEGACY_BUNDLE_GATE = ACCEPTED_INTERNAL_SUPPORTING_CHANGE
PUBLIC_JS_CAP = 550 KiB (not widened)
ADMIN_DYNAMIC_JS_CAP = 160 KiB
ADMIN_PER_ENTRY_JS_CAP = 80 KiB
STANDARD_NEXT_GATE = STILL_EFFECTIVE
```

The split keeps the public legacy budget at its previous 550 KiB ceiling,
adds explicit aggregate and per-entry Admin limits, and leaves the Standard
Next public application/bootstrap/CSS/template gate in force. It therefore does
not hide a public regression by merely moving the threshold.

### Remaining work after PR #24

The feature freeze routes remaining work into explicit buckets. None of these
items is authorized for implementation in this closure.

#### `NEXT_PR_P1`

- `ONE_LEVEL_LAYOUT_UNDO`, including Apply undo and clear-template
  confirmation/undo;
- `IMPORT_FAILURE_IDENTIFICATION`, using privacy-safe session-only filename or
  thumbnail evidence without persisting absolute paths;
- `DELETE_SEMANTICS_HUMAN_DECISION`; the current safe, recoverable recycle-bin
  behavior remains unchanged;
- template-by-template human visual polish.

#### `NEXT_PR_P2`

- photo/folder drag-and-drop and automatic selection classification;
- RAW evaluation;
- Asset detail, bulk management, tags, and albums;
- true multi-option reroll;
- preview device switcher.

#### `PRE_DEPLOYMENT_P1`

- `PUBLIC_IDENTITY_SSR_MISMATCH`.

#### `FUTURE_HOSTED`

- PostgreSQL, production Auth, hosted Assets and Hosted Upload;
- hosted `AssetResolver` and Site-scoped publication storage.

#### `LOCAL_ONLY_FUTURE`

- trusted source-folder binding;
- manual rescan of a bound source;
- filesystem watch and automatic synchronization.

PR #24 merge would accept only this limited baseline. It would not complete
`PRE_LAUNCH_PRODUCT_POLISH`, approve any of the eleven templates, create the
next PR, or unfreeze engineering launch.

## Eleven-template human review matrix

### `ELEVEN_TEMPLATE_HUMAN_REVIEW_MATRIX`

Allowed states are `PENDING_HUMAN_REVIEW`, `HUMAN_REVIEW_IN_PROGRESS`,
`NEEDS_POLISH`, `READY_FOR_HUMAN_RECHECK`, and `HUMAN_APPROVED`.

| Template | Human status | Human decision |
| --- | --- | --- |
| `cinematic-light` | `READY_FOR_HUMAN_RECHECK` | HR-010 保持冻结九槽：01 为 hero、02–08 为七张独立画廊素材、09 为 statement；画廊按真实方向均衡为 3／2／2 张比例感知行，不再把结构图重复进画廊。 |
| `neon-hud` | `READY_FOR_HUMAN_RECHECK` | HR-010 保持冻结九槽：01–08 为八张交互素材、09 为独立 manifesto；索引画廊按真实方向均衡为 3／3／2 张比例感知行，HUD 内的 stage／dock 投射仍是明确交互。 |
| `film-rail` | `READY_FOR_HUMAN_RECHECK` | HR-010 保持冻结九槽：01 为独立开场 hero、02–09 为八帧轨道，开场图不再作为轨道首帧重复。 |
| `manga-panels` | `READY_FOR_HUMAN_RECHECK` | HR-010 保持冻结九槽：01 为封面、02–09 为八格独立 storyboard；普通分镜按真实方向均衡为 3／3／2 张比例感知行。 |
| `prism-liquid` | `READY_FOR_HUMAN_RECHECK` | HR-010 让两组三联画按真实横竖比例计算列宽，减少混合方向下的无效留白，并补齐所有可进入主视窗素材的 3:2 展示裁切说明。 |
| `orbital-portal` | `READY_FOR_HUMAN_RECHECK` | HR-006 保持全竖向正式槽位与横向门户二次展示；需真实素材复检 desktop/mobile 裁切与层级。 |
| `archive-os` | `READY_FOR_HUMAN_RECHECK` | HR-006 保留结构性槽，普通 gallery 槽按来源方向使用 3:2／2:3；需真实素材复检高密度 desktop/mobile 表现。 |
| `editorial-duet` | `READY_FOR_HUMAN_RECHECK` | HR-010 将桌面 2:3 章节限制为居中且不超过 30rem／64% 的画面，移动端仍恢复全宽阅读。 |
| `polaroid-field` | `READY_FOR_HUMAN_RECHECK` | HR-010 按九张素材的真实比例、旋转后边界、安全边距与最小间距重新计算星图；七个自适应槽的 128 种方向组合均无碰撞或越界。 |
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
HUMAN_INPUT_REQUIRED
```

The Draft PR is never marked Ready or merged without separate human approval.
No next product issue is selected automatically.
