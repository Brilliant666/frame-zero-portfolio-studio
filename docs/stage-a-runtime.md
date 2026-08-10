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

## Deliberately not cut over yet

The standard Node lane does not yet provide legacy SiteContent persistence.
Stage B owns the PostgreSQL repository and must not be pulled into this Stage A
slice. The Node route therefore preserves the existing GET fallback and rejects
writes instead of pretending persistence succeeded.

The following remain unchanged until later Stage A slices have equivalent
evidence:

- `npm run dev`, `dev:web`, `build`, `preview`, and `start` still use vinext;
- the local photo companion continues to run with the existing development
  supervisor;
- D1 and Worker HTTP tests remain the legacy parity oracle;
- the Vite bundle budget remains enforced against the current production
  artifact.

## Rollback

No runtime cutover occurs in this slice. Removing the `.next/` artifact or
reverting this PR restores the exact pre-slice state. Existing vinext commands,
Cloudflare bindings, D1 data, templates, Admin V2, SiteDocumentV1, stable-ID
migration, the legacy adapter, local photos, and Composition remain untouched.

This evidence advances Stage A, but it does not complete
`STANDARD_NEXT_NODE_PARITY` and does not authorize Stage A2.

## Runtime references

- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
