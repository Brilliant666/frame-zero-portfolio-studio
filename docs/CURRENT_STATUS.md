# Portfolio Platform Current Status

Updated: 2026-09-26. This is the single current execution checkpoint; older PR
reports record historical acceptance, not today's authorization gate.

## Current execution checkpoint

```text
Mission: PRODUCT_DELIVERY_MISSION_02
Product priority: invited photographer -> own Site Admin -> independent template content -> Publish
Current slice: M1 / target routes and real Site authorization entry
Slice status: IN_PROGRESS
Main baseline: 92a81ee274ab9d7df829c7437219f0f42c273390
Account foundation: Draft PR #28 / feat/local-account-site-foundation
Account head: 3263d4d917b3d59c623b420cb1537cb5a8ff99ff
Active branch: codex/site-route-entry (stacked on the verified PR #28 head)
Remote deployment: FROZEN / NOT_AUTHORIZED
External deployment gate: EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED
V1 status: NOT_LAUNCHED
Online status: NOT_ONLINE_PREVIEW
```

The active branch has no completed M1 head or PR evidence yet. Update this
checkpoint at the next delivery; do not describe dependency code as merged main.
Next: dynamic Site resolution, same-origin login/Admin entry, legacy `/test`
mappings, real PostgreSQL two-user allow/deny tests. Preserve `/preview` until
replacement content is genuinely available.

## Capability and verification levels

| Capability | IMPLEMENTED | VERIFIED_IN_CI | VERIFIED_LOCALLY | VERIFIED_WITH_REAL_STAR |
| --- | --- | --- | --- | --- |
| PR #28 migration, Better Auth, operator provisioning, independent AuthUser/PortfolioUser/Site IDs and template grants | Yes | Five CI checks; 12 real PostgreSQL integration tests at account head above | Partial: build, login HTTP and anonymous denial; no local PostgreSQL readback | No |
| Eleven templates, Admin V2, legacy content/local photos and accepted polaroid preview | Yes | Existing baseline | Existing local experience retained | Not target migration evidence |
| M1 target routes and authorized Site Admin shell | In progress | Pending | Pending | No |
| M2 independent content, M3 Site assets, M4 publication, M5 second photographer | Not delivered | Pending | Pending | No |

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
- Windows legacy bundle is 6 bytes over budget while CI passes. Preserve the
  threshold; allow one bounded reproducible investigation, not a global blocker.
  The recorded 337.4ms long frame remains a known accepted performance boundary
  unless a new reproducible regression is demonstrated.

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
