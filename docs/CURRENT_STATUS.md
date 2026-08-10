# Portfolio Platform Current Status

> - Updated: 2026-08-10
> - Baseline: `main@7efd16be43419d81299e166a99464e9c2e1b12f4`

```text
Current phase: SELF_HOSTED_V1
Current stage: STAGE_A_RUNTIME
Stage status: GATE_READY
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
- early Linux Deployment Bootstrap and `ONLINE_PREVIEW`;
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

Stage A has complete Definition of Done evidence, but the current Stage does
not change until a human approves the Stage gate. No Stage A2 implementation is
authorized by this status update.

The exact recommended next action is:

```text
HUMAN STAGE GATE REVIEW

After approval only:
STAGE A2 / DEPLOYMENT_BOOTSTRAP
```
