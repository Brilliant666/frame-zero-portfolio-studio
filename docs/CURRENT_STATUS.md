# Portfolio Platform Current Status

Updated: 2026-09-28. This is the single current execution checkpoint; older PR
reports record historical acceptance, not today's authorization gate.

## Current execution checkpoint

```text
Mission: PRODUCT_DELIVERY_MISSION_02
Product priority: invited photographer -> own Site Admin -> independent template content -> Publish
Current slice: Site admin workspace layout / first usability slice
Slice status: IMPLEMENTED / VERIFIED_LOCALLY / AWAITING_HUMAN_REVIEW
Main baseline: 20d87433eb140f3d48ecec5fa175f0d72895ee53
Account foundation: PR #28 accepted and Squash merged
Account head: 3263d4d917b3d59c623b420cb1537cb5a8ff99ff
Active branch: codex/admin-workspace-layout (based on accepted main)
M1 implementation head: 8318e06
M1 PR: #29 accepted and Squash merged into main
M2 PR: #30 accepted and Squash merged as 4abf530
M3/M4 PR: #31 accepted and Squash merged as 20d8743
New admin layout PR: #32 Draft; includes platform/login/workspace entry UI; merge not authorized
Remote deployment: FROZEN / NOT_AUTHORIZED
External deployment gate: EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED
V1 status: NOT_LAUNCHED
Online status: NOT_ONLINE_PREVIEW
```

The user accepted the release closure and then explicitly authorized implementing
the admin review recommendations. This slice changes Site editor presentation,
navigation and operation hierarchy only; it does not change schemas, ownership,
save/publish semantics or public portfolio design. See
[admin workspace acceptance](ADMIN_WORKSPACE_LAYOUT.md).

PR30 and PR31 were Squash merged sequentially; the final main push runs passed:
Quality 36368039399, Public repository safety 36368039412, Container 36368039402,
Deployment Bootstrap 36368039430, Local Account PostgreSQL Integration
36368039417. Daily 3001 runs accepted main 20d8743. The new admin UI is evaluated
separately on local 3003, with no automatic daily cutover or deployment.

The following M2/M3/M4 paragraphs are historical context. The checkpoint above
supersedes their earlier Draft and merge-gate descriptions.

On 2026-09-28 the user explicitly authorized extending existing PR31 with
publication instead of adding a third review layer. This is a bounded exception
for this slice, not merge/deployment authority. The keyboard skip link remains;
its hidden state is clipped to protect theme-transition snapshots.

The local simulated `star` saved premium draft revision 1 is now explicitly
published. Anonymous `/star` reuses the accepted polaroid experience and reads
only the immutable Published snapshot; Save still does not Publish. Publishing
and rollback require owner + premium grant + expected draft/pointer versions.
Only currently published referenced display variants are public; private APIs,
unreferenced assets and originals remain protected. Basic-template publication
is not connected in this slice. See [publication acceptance](M4_PREMIUM_PUBLICATION.md).

PR28_PR29 = MERGED_AND_MAIN_VERIFIED. Explicit user authorization accepted both
stage baselines and their disclosed local exceptions. Both were made Ready and
Squash merged with expected-head checks; all five push checks passed after each
merge. See [merge evidence and M2 scope](M2_SITE_CONTENT_EDITOR.md) for exact SHAs,
run IDs and exceptions. No branches deleted, real data migrated or deployment.
M2 proceeds now; its new Draft PR does NOT inherit merge authorization.

The user subsequently authorized M3 in `M3_SITE_ASSETS_STAR_PRESERVATION_AND_LOCAL_3001_CUTOVER`.
This supersedes the previous M2-only stopping point, not its merge gate. M3 is a
separate dependent branch; PR30 and M3 together fill the two-layer review limit.
See [M3 implementation and local cutover checkpoint](M3_SITE_ASSETS.md) and the
[controlled import procedure](M3_LOCAL_IMPORT.md). No Docker recovery is authorized.

## Latest local acceptance authority (supersedes historical local gaps below)

`LOCAL_M3_HANDS_ON_ACCEPTANCE_01` authorizes a dedicated PostgreSQL user process
and PR31 on port 3003, while preserving old 3001. The user then explicitly
confirmed all local accounts are simulations and authorized operator-created
`star` with a reserved QA email and random locally protected password. This is
not real-customer provisioning or a verified customer email.

PostgreSQL 17.11 now runs on loopback in a user-owned directory, without Docker,
system services or global configuration changes. Daily/test databases and roles
are separate. `phototest` has completed actual headed-Chrome upload, independent
editor save, shared asset reuse, preview, mobile and ownership-denial checks.

The existing source snapshot matched records 1/2601 and 141 file fingerprints.
After detecting 9 top-level basic references whose 18 old files no longer exist,
the user explicitly approved omitting only those exact references in the new
target draft. Raw source and backups are unchanged; full approved work objects,
indexes and digests are retained in the local plan and database receipt.
Display-only import has preserved 71 template-specific works, 3 collections,
25 collection members, 2 platform cards, 41 private assets and 123 byte-identical
variants. Both drafts are revision 1; repeat apply is idempotent.

Database and application restart, star's three collection previews and two
editors, phototest persistence, 11 actual template selections and cross-account
denials have passed in headed Chrome at 1440/390/320. No automatic star draft
writes were made during browser verification. The dedicated runtime is left
running for human acceptance; credentials and runbook remain local-only.

Original archival remains INCOMPLETE. At that M3 checkpoint, publishing, remote deployment, PR merges
and old 3001 cutover were not performed; the newer publication slice above supersedes
only the local publishing status. Final running Head, browser readback,
restart verification and final-head CI are recorded in
[local acceptance](LOCAL_M3_HANDS_ON_ACCEPTANCE.md) and PR31's acceptance comment.

## Capability and verification levels

| Capability | IMPLEMENTED | VERIFIED_IN_CI | VERIFIED_LOCALLY | VERIFIED_WITH_REAL_STAR |
| --- | --- | --- | --- | --- |
| PR #28 migration, Better Auth, operator provisioning, independent AuthUser/PortfolioUser/Site IDs and template grants | Yes | Five CI checks; 12 real PostgreSQL integration tests at account head above | Partial: build, login HTTP and anonymous denial; no local PostgreSQL readback | No |
| Eleven templates, Admin V2, legacy content/local photos and accepted polaroid preview | Yes | Existing baseline | Existing local experience retained | Not target migration evidence |
| M1 target routes and authorized Site Admin shell | Yes | Five checks pass; real PostgreSQL HTTP suite 16/16 at implementation head | Next build/budget, lint/types; legacy HTTP 38/38; route status checks below; no local PG | No |
| M2 independent content/editor integration | Implemented in PR30 | Real PostgreSQL plus actual Chromium editor acceptance: 12/12 stages at f4171dc; five checks successful. New policy final-head run mapping in PR30 acceptance comment | Windows full npm test, both builds/checks, lint/types and budget behavior tests pass under the new policy; legacy size WARNING; no local PG | No |
| M3 Site assets and controlled import | Implemented; real import additionally blocks unresolved originals | Five checks pass at d40b2b6; isolated PostgreSQL and 12 existing + 6 asset browser stages; final documentation-head run mapping in PR31 | Unit/type/lint and legacy checks; actual local PG refused connection; no local account/import/cutover acceptance | No |
| M4 publication and M5 second real photographer | Not delivered | Pending | Pending | No |

Reuse the account foundation, not a new Auth POC. Commands and evidence:
[LOCAL_ACCOUNT_FOUNDATION.md](LOCAL_ACCOUNT_FOUNDATION.md).

## Historical local gaps (before LOCAL_M3_HANDS_ON_ACCEPTANCE_01)

- Docker remains unavailable after the previous ordinary restart. No repeat
  restart/inspection without new evidence; no reset, volume deletion, WSL/service
  change or native PostgreSQL installation. This blocks local database readback
  and full acceptance, not routes, authorization, content, migration dry-run,
  publication or real PostgreSQL CI work.
- Real `star` is **not created**. Real email and non-echoed password must be
  entered locally using the existing provisioning flow when PostgreSQL is
  available. CI fixtures are not real users or customer onboarding evidence.
- Historical Windows legacy bundle baseline was 6 bytes over budget; M1 is
  563638 bytes, 438 bytes over the unchanged 550 KiB reference. The user now
  explicitly authorizes aggregate-size warnings rather than blocking failures;
  retain the reference and historical FAIL, not byte-reduction experiments.
  The recorded 337.4ms long frame remains a known accepted performance boundary
  unless a new reproducible regression is demonstrated.
- PR30 bounded Windows comparison: base 563638, initial head 563734 (+96).
  The Site save-editability correction gives 563772 (+134 versus base), 572 bytes
  above the unchanged 563200 reference. This was FAIL under the old policy.
  PR30_BUDGET_POLICY_ALIGNMENT_AND_FINAL_REVIEW supersedes that size-only gate:
  the +134 bytes no longer independently blocks progress. Integrity, safety and
  exact structural checks still fail closed. No product code is changed to save bytes.

## PR30 limited closure and human review

Budget policy is IMPLEMENTED under explicit user authority. Legacy size-only
references and Next cross-route aggregate references warn; missing/unreadable
artifacts, invalid paths/mapping and lazy-template structure still fail. The
Next single-template 64 KiB hard constraint remains. Windows fresh builds retain
legacy public JS 563772 bytes (reference 563200; +134 versus main 9bdd45d).
Full npm test exits 0 and continues beyond that warning through legacy runtime
and Standard Next tests. See M2 record for raw metrics, route estimates and
NOT_MEASURED scope. Final-head CI evidence belongs to the PR30 review comment;
the earlier head's green checks do not validate the new policy changes.

The actual browser exercised both existing editors against isolated PostgreSQL
at the same Standard Next production origin (3004), including independent saves,
in-flight edits, CAS conflicts, previews, identity changes, restart persistence,
and 1440/390/320 viewports. Basic Site fields no longer lock during save; the
legacy local editor's behavior is unchanged. The private preview notice/return
link is kept above template layers. Final exact head, CI and anonymous artifacts
are recorded in the PR30 acceptance comment; earlier runs are not substituted.

PR30 remains OPEN + DRAFT. Human acceptance is pending. M3 assets remain
NOT_IMPLEMENTED_IN_PR30; they are implemented on the separate M3 branch. Real star is NOT_CREATED by this task;
remote deployment NOT_AUTHORIZED; V1_LAUNCHED = NO. No real-source migration,
Docker recovery or account installation occurred. The local records 1/2601 and
manifest were read-only and their logical hashes matched the start baseline.

## Observable M1 delivery and next step

- `/` is a minimal platform introduction. Old templates are at `/test`; the
  six-section real legacy editor is reused at `/test/admin`. Both internal test
  entries fail closed outside development or the explicit local runner.
- `/login` links to the authenticated account's own `/:siteSlug/admin` on the
  same origin. The shell uses session subject AND slug in the ownership SQL.
  It shows granted products, but has no unconnected Save/Publish buttons.
- Existing completed Sites show an explicit unpublished public page. Unknown
  Sites are 404; anonymous Admin is 401; wrong owner is 403; unavailable database
  is 503. No global 1/2601, default star or Draft content fallback exists.
- Local Node runner remains `npm run accounts:start`, port 3003; no new service
  or port was introduced. Verified `/`, `/login`, `/test`, `/test/admin/template`
  = 200, anonymous `/example/admin` = 401, unavailable `/example` = 503.
- Legacy dev remains `npm run dev`, port 3001. Verified `/`, `/test`,
  `/test/admin/template`, `/preview`, `/preview/admin` = 200. `/admin` remains a
  temporary compatibility entry; old global APIs are not claimed Site-secured.
- No real content, SQLite, photo, manifest or platform-card writes or migration
  were performed. No new design, composition, theme or motion changes.
- Current product slice is M2: two real editors connected to independent
  Site/content-space drafts and version checks. Verify the first complete slice
  in isolated real PostgreSQL CI; do not expose drafts publicly or touch real sources.

## Product development authority

M1–M5 authorize non-destructive code, isolated database fixtures, explicit
migrations/dry-runs, Site-scoped content/assets, independent editors,
Save/Publish, controlled uploads, tests, commits, push and Draft PRs. Continue
safe independent work after CI or a Draft PR; local environment failure or an
unmerged Mission document does not revoke branch development authority.

PR #28 stays account-foundation scoped. Subsequent work uses topic branches;
stacked Draft PRs name exact dependency/base. At most **two pending review
layers**; at the limit, report the review list once and stop dependent work.
Merge, approve, auto-merge, protected-branch changes, deleting branches/other
PRs, remote deployment and new external spending are not authorized.

Real data import/cutover, overwrite/deletion or replacing a usable entry with
unverified login requires approval. Before migration, back up record 1, record
2601 and asset sources; never invent a historical snapshot, dual-write, or guess
ownership. `public/photos` remains private and must never be committed.

## Remote deployment and eventual V1 acceptance

`STANDARD_NEXT_NODE_PARITY` and `REPO_SIDE_BOOTSTRAP_READY` remain accepted.
Real Linux/DNS/TLS/deploy/update/rollback evidence still needs authorization.
`DEPLOYMENT_BOOTSTRAP_READY`, `ONLINE_PREVIEW`, `CLOSED_BETA_READY` and
`V1_LAUNCHED` are not claimed. These deployment/launch gates do not prohibit
local M1–M5 branch development.

Product rules: [North Star](PORTFOLIO_PLATFORM_NORTH_STAR.md). Milestones and
old Stage mapping: [Roadmap](SELF_HOSTED_V1_ROADMAP.md). Accepted invariants:
[ADR-0002](adr/0002-site-tenant-boundary.md) and
[ADR-0003](adr/0003-adaptive-composition-variant-boundary.md). None is superseded.

## Historical acceptance (not current workspaces or resume gates)

- PR #24: accepted limited human-directed polish baseline.
- PR #25: HR25-001–013 accepted stage baseline; HR25-014 frozen. This was not
  full eleven-template visual approval. See [review](pr25-stage-review.md).
- Accepted polaroid design, three compositions, themes, motion and viewer remain
  the visual baseline; no redesign without a new human request.
- PR #16: historical Draft Auth research, not the implementation base; no
  authority to close it or replace PostgreSQL with its D1-only implementation.
- Stage A2 packaging and polish ledgers remain historical evidence; their old
  local Auth/database/Stage freezes no longer govern Mission development.
