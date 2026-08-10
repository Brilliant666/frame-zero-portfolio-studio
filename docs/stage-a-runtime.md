# Stage A Runtime Migration Evidence

> - Phase: `SELF_HOSTED_V1`
> - Stage: `STAGE_A_RUNTIME`
> - Milestone: `STANDARD_NEXT_NODE_PARITY`
> - Status: `IN_PROGRESS`

## RUNTIME-01 slice 1: parallel standalone parity lane

This slice adds a separately invoked Standard Next.js Node artifact without
cutting over the existing vinext/Cloudflare development and rollback lane.

```text
npm run build:node
npm run start:node
npm run test:node-runtime
```

`build:node` uses Next.js `output: "standalone"`, then copies generated
`_next/static` assets and only Git-tracked `public/` files into the standalone
artifact. Local photographs, the ignored photo manifest, ignored `og.png`, and
`.frame-zero` state are not packaged.

The HTTP parity test starts the generated `server.js` on an ephemeral loopback
port and checks:

- the current public homepage and metadata;
- all six Admin V2 sections and the `/admin` redirect;
- all eleven existing template query paths;
- packaged static CSS and the tracked favicon;
- the current `/api/site-content` no-database fallback;
- fail-closed writes while the target Stage B repository is not present;
- absence of the workerd-only `cloudflare:workers` import from the Node server
  artifact.

## RUNTIME-01 slice 2: production command and artifact-gate cutover

The reviewed Standard Next.js standalone artifact is now the default
production build and start target:

```text
npm run build
npm run check:bundle
npm run start
npm run test:node-runtime
```

The default build wrapper selects the standalone Next configuration and the
Stage A fail-closed adapter for the legacy Cloudflare binding import. Keeping
that selection scoped to the wrapper prevents the explicit vinext rollback
build from receiving the Node alias. The wrapper then copies Next static assets
and only Git-tracked public files into the standalone directory. The old
`build:node` and `start:node` names remain aliases so existing operator notes do
not break.

The default bundle gate now reads `.next` artifacts. It requires all eleven
templates to remain distinct lazy client chunks and enforces:

- the existing 550 KiB application-JavaScript ceiling;
- the existing 300 KiB public-CSS ceiling;
- the existing 64 KiB per-template JavaScript ceiling;
- a separate 700 KiB ceiling for Next.js framework/bootstrap JavaScript.

The framework/bootstrap figure is a new, separately reported runtime metric;
it does not replace or loosen the application budget. The legacy Vite budget
retains its original thresholds and runs through `check:bundle:legacy`.

CI exercises the explicit legacy oracle first, then builds, budgets, scans, and
starts the Standard Next.js artifact last. A successful full test therefore
leaves the reviewed `.next/standalone` production artifact as the final build.

## Explicit legacy and local-development boundary

The standard Node lane does not yet provide legacy SiteContent persistence.
Stage B owns the PostgreSQL repository and must not be pulled into this Stage A
slice. The Node route therefore preserves the existing GET fallback and rejects
writes instead of pretending persistence succeeded.

The following commands remain explicit rollback and compatibility tools:

- `npm run dev` and `dev:web` keep the current vinext local editor so D1 writes
  and the loopback photo companion continue to work during Stage A;
- `build:legacy`, `start:legacy`, `test:legacy-runtime`, and
  `check:bundle:legacy` preserve the Cloudflare/Worker rollback oracle;
- D1 and Worker HTTP tests remain compatibility evidence, but are no longer the
  default production artifact gate.

The transitional local/legacy runtime is not a target production dependency.
It remains a bounded development and rollback tool until a later reviewed
removal decision.

## Stage A Definition of Done assessment

| Requirement | Evidence | Result |
| --- | --- | --- |
| Standard Next.js is the target production runtime | default `build`, `preview`, and `start` commands | Satisfied |
| Production build/start work over HTTP | standalone process integration test | Satisfied |
| Standalone artifact is available | `output: "standalone"` selected by the default build wrapper | Satisfied |
| Routes, metadata, redirects, and route handlers have evidence | public/Admin/API HTTP matrix plus explicit fail-closed persistence boundary | Satisfied |
| Eleven templates retain smoke coverage | eleven query routes and eleven distinct lazy chunks | Satisfied |
| Local photo companion still works | unchanged `npm run dev` supervisor and `test:photos` | Satisfied |
| Worker bindings are not required by the Node artifact | Node adapter plus server-artifact scan | Satisfied |
| CI, budget, and rendered tests understand Next | default final CI build, Next budget, and standalone HTTP test | Satisfied |
| Public client excludes Admin/server-only wiring | public client-reference manifest and client artifact scans | Satisfied |
| Rollback is documented | explicit `*:legacy` commands below | Satisfied |

The Stage A gate is therefore ready for human review. This document does not
start Deployment Bootstrap, PostgreSQL, Auth, new routes, hosted assets, or any
other later Stage.

## Rollback

Use `npm run build:legacy`, `npm run check:bundle:legacy`, and
`npm run start:legacy` for the retained rollback lane. Reverting the slice
restores the previous default command mapping. No data migration is involved;
Cloudflare bindings, D1 data, templates, Admin V2, SiteDocumentV1, stable-ID
migration, the legacy adapter, local photos, and Composition remain untouched.

This evidence completes the reviewed `STANDARD_NEXT_NODE_PARITY` gate. Stage A2
remains blocked on explicit human Stage-transition approval.

## Runtime references

- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
