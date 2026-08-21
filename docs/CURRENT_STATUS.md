# Portfolio Platform Current Status

> - Updated: 2026-08-21
> - Baseline: `main@dc471795139dc47649368bb37c0178fb77188fea`

```text
Current phase: SELF_HOSTED_V1
Current stage: STAGE_A2_DEPLOYMENT_BOOTSTRAP
Stage status: IN_PROGRESS
V1 status: NOT_LAUNCHED
Online status: NOT_ONLINE_PREVIEW
Engineering launch line: FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY
Repo-side bootstrap ready: ACCEPTED
Deployment bootstrap ready: NOT_REACHED
Current active priority: PRE_LAUNCH_PRODUCT_POLISH
Current product priority: LOCAL_PRODUCT_EXPERIENCE
Product experience foundation: ACCEPTED
Automated visual QA baseline: ACCEPTED
Pre-launch product polish: IN_PROGRESS
Human-directed product polish: IN_PROGRESS
PR #25 workspace: HUMAN_DIRECTED_PRODUCT_POLISH_WORKSPACE
Eleven-template human visual approval: PENDING
Human-approved templates: 0 / 11
PR #24 closure mode: FINAL_HUMAN_ACCEPTANCE + MERGE
PR #24 feature freeze: TRUE
PR #24 product baseline: ACCEPTED
PR #24 limited baseline acceptance: ACCEPTED
PR #25 workspace status: ACTIVE
PR #25 mode: LIGHTWEIGHT_HUMAN_REQUEST_ONLY
PR #25 current request: HR25-006 — READY_FOR_HUMAN_RECHECK
PR #25 next request ID: HR25-007
PR #25 hand-off: HUMAN_RECHECK_REQUIRED
External operations: NOT_AUTHORIZED
Completed milestone: STANDARD_NEXT_NODE_PARITY
Next milestone: DEPLOYMENT_BOOTSTRAP_READY
Next online milestone: DEPLOYMENT_BOOTSTRAP_READY
```

## Current source of truth

- Product scope and governance:
  [PORTFOLIO_PLATFORM_NORTH_STAR.md](PORTFOLIO_PLATFORM_NORTH_STAR.md)
- Execution order and Stage gates:
  [SELF_HOSTED_V1_ROADMAP.md](SELF_HOSTED_V1_ROADMAP.md)
- Accepted technical invariants:
  [ADR-0002](adr/0002-site-tenant-boundary.md) and
  [ADR-0003](adr/0003-adaptive-composition-variant-boundary.md)

## Current product state

Available today:

- Standard Next.js standalone as the default production build/start artifact,
  with real HTTP route/template smoke and a Next-aware bundle gate;
- minimal liveness and readiness HTTP contracts for future deployment
  supervision, without runtime or environment disclosure;
- reviewed non-root Linux container packaging for the Standard Next standalone
  artifact, with a default-deny build context and real Linux CI smoke;
- eleven formal templates;
- Admin V2 six-section workbench;
- current legacy SiteContent save path;
- local Photo Library and loopback ingest;
- frozen SiteDocumentV1;
- stable Site/Asset ID migration planning;
- strict legacy adapter;
- pure Adaptive Composition contract and planner.

Not yet available:

- PostgreSQL production persistence;
- approved production Better Auth integration;
- platform/public/Admin route split;
- Site-scoped production ownership;
- Draft/Revision/Publish persistence;
- Published SSR from the target repository;
- hosted filesystem upload and AssetResolver;
- `star` target-model migration;
- target Linux execution of the reviewed Compose/Caddy shell, real public ACME
  HTTPS, and target-server deploy/update/rollback evidence;
- `ONLINE_PREVIEW`;
- `CLOSED_BETA_READY` invited-client capability;
- final production hardening and `V1_LAUNCHED`.

## Current research PR

```text
PR #16: research: validate Better Auth on Cloudflare D1
Status: OPEN + DRAFT
Disposition: KEEP_DRAFT
Head: 709b23a6415296755e534ae1c65416d25a68ebd9
```

PR #16 is historical Auth research evidence. It is not the self-hosted
production baseline, and current implementation work must not start from its
branch.

## Current execution rule

Stage A and `STANDARD_NEXT_NODE_PARITY` are complete by human Gate approval.
Only work that directly advances `STAGE_A2_DEPLOYMENT_BOOTSTRAP` belongs in the
current production-development lane. This status does not authorize Stage B,
later product stages, or real infrastructure operations.

Human-accepted completed Stage A2 capabilities are:

```text
PRODUCTION_HEALTH_CONTRACT
NON_ROOT_LINUX_CONTAINER_PACKAGING
SERVER_ONLY_DEPLOYMENT_CONFIG
MINIMAL_COMPOSE_CADDY_TOPOLOGY
PUBLIC_PRIVATE_PROXY_BOUNDARY
BASIC_APPLICATION_PROXY_LOGGING
DEPLOY_UPDATE_ROLLBACK_SMOKE
REPO_SIDE_BOOTSTRAP_READY
```

The current stop gate is:

```text
EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED
```

`REPO_SIDE_BOOTSTRAP_READY` is accepted repository-side evidence; it is not
`DEPLOYMENT_BOOTSTRAP_READY`. The latter still requires approved target Linux,
real 80/443, DNS, public ACME HTTPS, and target-server deploy/update/rollback
smoke. `DEPLOYMENT_BOOTSTRAP_READY` is also not `ONLINE_PREVIEW`. Stage A2
therefore stays `IN_PROGRESS`, the online status stays `NOT_ONLINE_PREVIEW`,
and no external operation is authorized before the current stop gate is
explicitly cleared.

Human priority has temporarily frozen the engineering launch line at
`REPO_SIDE_BOOTSTRAP_READY` and activated `PRE_LAUNCH_PRODUCT_POLISH`. This is
a local product-experience lane, not a new architecture Stage. Work proceeds
through photo import, template material guidance, read-only real-library
composition previews, explicit layout application, and eleven-template visual
QA. It does not authorize target-server preflight, deployment, Stage B,
PostgreSQL, production Auth, hosted upload, DNS, TLS, or production data.

Human review has accepted the product-experience foundation, its automated
visual-QA baseline, and PR #24 as the limited product-polish baseline. Ready
and squash merge are authorized for that exact accepted head. This does not
close
`PRE_LAUNCH_PRODUCT_POLISH`, complete the eleven-template visual review, or
claim V1 product-experience completion. No formal template has
`HUMAN_APPROVED` status (`0 / 11`); all eleven remain ready for human recheck or
later template-by-template polish in a new human-directed product-polish PR.

See [stage-a2-deployment-bootstrap.md](stage-a2-deployment-bootstrap.md) for
the current Definition of Done matrix and explicit external-operation boundary.
See [pre-launch-product-polish.md](pre-launch-product-polish.md) for the active
product-experience batch and its architecture boundaries.
See [human-directed-product-polish.md](human-directed-product-polish.md) for
the limited-closure ledger, template review matrix, and human-review stop
protocol.
