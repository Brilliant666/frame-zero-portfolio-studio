# Portfolio Platform Current Status

> - Updated: 2026-08-10
> - Baseline: `main@3342589c48ba6bdd437fb763eff51fae385f48b5`

```text
Current phase: SELF_HOSTED_V1
Current stage: STAGE_A_RUNTIME
V1 status: NOT_LAUNCHED
Next milestone: STANDARD_NEXT_NODE_PARITY
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

- eleven formal templates;
- Admin V2 six-section workbench;
- current legacy SiteContent save path;
- local Photo Library and loopback ingest;
- frozen SiteDocumentV1;
- stable Site/Asset ID migration planning;
- strict legacy adapter;
- pure Adaptive Composition contract and planner.

Not yet available:

- standard Next.js Node production parity;
- PostgreSQL production persistence;
- approved production Better Auth integration;
- platform/public/Admin route split;
- Site-scoped production ownership;
- Draft/Revision/Publish persistence;
- Published SSR from the target repository;
- hosted filesystem upload and AssetResolver;
- `star` target-model migration;
- Linux production canary.

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

Only work that directly advances `STAGE_A_RUNTIME` belongs on the current
critical path. Other work defaults to `POST_V1_BACKLOG` unless it demonstrates
a launch blocker.

The exact recommended next development task is:

```text
STAGE A / RUNTIME-01
Standard Next.js Node Parity
```
