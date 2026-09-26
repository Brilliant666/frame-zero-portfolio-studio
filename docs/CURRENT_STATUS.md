# Portfolio Platform Current Status

Updated: 2026-09-26. This is the single current execution checkpoint; older PR
reports record historical acceptance, not today's authorization gate.

## Current execution checkpoint

```text
Mission: PRODUCT_DELIVERY_MISSION_02
Product priority: invited photographer -> own Site Admin -> independent template content -> Publish
Current slice: M2 / real editors and independent Site content-space drafts
Slice status: IN_PROGRESS / IMPLEMENTED / CI_PENDING
Main baseline: 9bdd45daf326d65def222b20033ff2774decbfc1
Account foundation: PR #28 accepted and Squash merged
Account head: 3263d4d917b3d59c623b420cb1537cb5a8ff99ff
Active branch: codex/site-content-editor-integration (based on verified main)
M1 implementation head: 8318e06
M1 PR: #29 accepted and Squash merged into main
Remote deployment: FROZEN / NOT_AUTHORIZED
External deployment gate: EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED
V1 status: NOT_LAUNCHED
Online status: NOT_ONLINE_PREVIEW
```

PR28_PR29 = MERGED_AND_MAIN_VERIFIED. Explicit user authorization accepted both
stage baselines and their disclosed local exceptions. Both were made Ready and
Squash merged with expected-head checks; all five push checks passed after each
merge. See [merge evidence and M2 scope](M2_SITE_CONTENT_EDITOR.md) for exact SHAs,
run IDs and exceptions. No branches deleted, real data migrated or deployment.
M2 proceeds now; its new Draft PR does NOT inherit merge authorization.

## Capability and verification levels

| Capability | IMPLEMENTED | VERIFIED_IN_CI | VERIFIED_LOCALLY | VERIFIED_WITH_REAL_STAR |
| --- | --- | --- | --- | --- |
| PR #28 migration, Better Auth, operator provisioning, independent AuthUser/PortfolioUser/Site IDs and template grants | Yes | Five CI checks; 12 real PostgreSQL integration tests at account head above | Partial: build, login HTTP and anonymous denial; no local PostgreSQL readback | No |
| Eleven templates, Admin V2, legacy content/local photos and accepted polaroid preview | Yes | Existing baseline | Existing local experience retained | Not target migration evidence |
| M1 target routes and authorized Site Admin shell | Yes | Five checks pass; real PostgreSQL HTTP suite 16/16 at implementation head | Next build/budget, lint/types; legacy HTTP 38/38; route status checks below; no local PG | No |
| M2 independent content/editor integration | Implemented in current branch | Pending final five checks / real PostgreSQL HTTP chain | Build, original Next budget, lint/types and unit tests; no local PG | No |
| M3 Site assets, M4 publication, M5 second photographer | Not delivered | Pending | Pending | No |

Reuse the account foundation, not a new Auth POC. Commands and evidence:
[LOCAL_ACCOUNT_FOUNDATION.md](LOCAL_ACCOUNT_FOUNDATION.md).

## Local gaps, not global development blockers

- Docker remains unavailable after the previous ordinary restart. No repeat
  restart/inspection without new evidence; no reset, volume deletion, WSL/service
  change or native PostgreSQL installation. This blocks local database readback
  and full acceptance, not routes, authorization, content, migration dry-run,
  publication or real PostgreSQL CI work.
- Real `star` is **not created**. Real email and non-echoed password must be
  entered locally using the existing provisioning flow when PostgreSQL is
  available. CI fixtures are not real users or customer onboarding evidence.
- Windows legacy bundle baseline was 6 bytes over budget; M1 is 563638 bytes,
  438 bytes over the unchanged 550 KiB threshold. CI passes the same threshold.
  Preserve the threshold; allow one bounded reproducible investigation, not a global blocker.
  The recorded 337.4ms long frame remains a known accepted performance boundary
  unless a new reproducible regression is demonstrated.

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
