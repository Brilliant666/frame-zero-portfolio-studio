# Portfolio Platform Current Status

> - Updated: 2026-08-10
> - Baseline: `main@8a9f6604f294381f34abe2cc130686fc2dec49b0`

```text
Current phase: SELF_HOSTED_V1
Current stage: STAGE_A2_DEPLOYMENT_BOOTSTRAP
Stage status: IN_PROGRESS
V1 status: NOT_LAUNCHED
Online status: NOT_ONLINE_PREVIEW
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
- Docker/Compose packaging, Caddy, basic deployment logs, deploy/update smoke,
  and the rest of the early Linux Deployment Bootstrap;
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

The current slice is:

```text
STAGE A2 / DEPLOYMENT-01
Production health contract
```

After this slice is merged and separately approved, the next candidate is:

```text
STAGE A2 / CONTAINER-01
Non-root Standard Next standalone image packaging
```

See [stage-a2-deployment-bootstrap.md](stage-a2-deployment-bootstrap.md) for
the current Definition of Done matrix and explicit external-operation boundary.
