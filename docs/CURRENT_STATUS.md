# Portfolio Platform Current Status

> - Updated: 2026-08-11
> - Baseline: `main@e40c7514efeb50a66a7836eb41272f682b395a4c`

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
Human-directed product polish: NEXT
Eleven-template human visual approval: PENDING
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

Human review has accepted the product-experience foundation and its automated
visual-QA baseline. That acceptance does not close
`PRE_LAUNCH_PRODUCT_POLISH`: human-directed import, profile, preview, apply,
spacing, crop, hierarchy, typography, and mobile polish remains the next work.
No formal template has `HUMAN_APPROVED` status, and eleven-template human visual
approval remains pending.

See [stage-a2-deployment-bootstrap.md](stage-a2-deployment-bootstrap.md) for
the current Definition of Done matrix and explicit external-operation boundary.
See [pre-launch-product-polish.md](pre-launch-product-polish.md) for the active
product-experience batch and its architecture boundaries.
