# Stage A2 Deployment Bootstrap

> - Phase: `SELF_HOSTED_V1`
> - Stage: `STAGE_A2_DEPLOYMENT_BOOTSTRAP`
> - Status: `IN_PROGRESS`
> - Base: `main@9c05c2b3c95788327ab5e95e4105294da89c4423`
> - Online maturity: `NOT_ONLINE_PREVIEW`

Stage A2 establishes the smallest repeatable production shell around the
Standard Next.js standalone artifact accepted in Stage A. It does not deploy a
server, introduce product persistence, or expose unfinished product routes.

## Gap analysis

| Definition of Done | Current evidence | Status after slice 2 |
| --- | --- | --- |
| Package the Stage A Node artifact | Multi-stage Debian/glibc image builds the accepted Standard Next standalone without Git metadata | Container packaging complete |
| Minimal Docker image and Compose shell | Non-root minimal image is exercised in Linux CI; Compose remains intentionally absent | Image complete; Compose open |
| Caddy HTTPS reverse proxy | No reviewed Caddy configuration | Open |
| Health endpoint and basic logs | Real standalone HTTP tests cover liveness and readiness; application/proxy logging remains unimplemented | Health contract complete; logs open |
| Repeatable deploy/update smoke | No target-server procedure has been exercised | Open |
| Server-only configuration isolation | Current client-artifact scans exist; the deployment environment contract is not defined | Open |
| Receive Stage D routes without exposing unfinished capabilities | Stage D routes do not exist yet; Auth, hosted Admin, and upload remain unexposed | Open |

`DEPLOYMENT_BOOTSTRAP_READY` is not reached by this slice. `ONLINE_PREVIEW`
also remains blocked on both the rest of Stage A2 and Stage D.

## Slice 1: production health contract

The Standard Next.js Node artifact exposes two public, read-only probes:

```text
GET or HEAD /api/health/live
GET or HEAD /api/health/ready
```

`live` proves that the Node process can answer HTTP. `ready` proves that the
current application artifact completed startup and can serve its current
fail-closed route contract. Later stages that introduce required dependencies
must extend readiness rather than weakening this contract.

Successful GET responses are intentionally minimal:

```json
{"status":"live"}
{"status":"ready"}
```

The probes use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
They do not reveal a hostname, commit, version, environment, dependency state,
path, secret, user, Site, or asset. Unsupported mutation methods return 405.
The probes remain server-only and are absent from the public client-reference
manifest.

## Validation boundary

The production integration test starts `.next/standalone/server.js` on an
ephemeral loopback port and verifies both probes over real HTTP, including GET,
HEAD, mutation denial, exact payloads, and response headers. The normal legacy
build remains a rollback oracle, but the health contract is defined by the
accepted Standard Next production artifact.

Slice 1 introduced no Docker, Compose, Caddy, TLS, server secret, database,
persistent volume, or real deployment. The local Docker CLI is present but its
daemon is not running; the authoritative runtime evidence for the reviewed
image added in slice 2 therefore comes from Linux CI.

## Slice 2: non-root Linux container packaging

CONTAINER-01 packages the accepted Standard Next standalone artifact; it does
not define a deployment topology. The production image uses a multi-stage
build and copies only `.next/standalone` into its runtime stage. The runtime
entry remains `node server.js`, listening internally on `0.0.0.0:3000`.

### Build and base-image strategy

- Builder and runtime both use the official Debian 12/glibc Node image for the
  already accepted Node 22 major.
- The exact `node:22.22.3-bookworm-slim` multi-architecture OCI index is pinned
  by digest. This takes the current Node 22 security patch without changing the
  governed runtime major, framework major, package manager, or dependencies.
- The builder installs the locked dependency graph and runs the repository's
  existing `npm run build`; the runtime receives neither the builder tree nor
  the full development `node_modules`.
- The runtime image records the base name/digest as OCI labels. CI reports size
  and layer count as a baseline; this slice does not invent a size budget.

### Non-root and filesystem strategy

The official image's reviewed `node` account is made explicit as numeric
UID/GID `1000:1000`. The standalone tree is copied with that ownership; no
`chmod 777` or broad writable application directory exists. Linux CI runs the
application with a read-only root filesystem and a bounded temporary `/tmp`,
then inspects the live process UID/GID. `STOPSIGNAL SIGTERM`, an empty inherited
entrypoint, and exec-form `CMD ["node", "server.js"]` keep Node as PID 1 and
allow the CI stop check to detect a forced kill.

### Build-context and public-asset boundary

`.dockerignore` is default deny. Dockerfile `COPY` statements then admit only
the application/build inputs needed by Standard Next. Final deny rules exclude
Git metadata, `.frame-zero`, `.openai`, `.env*`, credential/key patterns,
`public/photos`, the local photo manifest, and local-only `public/og.png`, even
if a future source include becomes broader.

Standalone public preparation no longer invokes `git ls-files`. The versioned
`config/production-public-files.json` is a sorted allowlist of the four reviewed
SVG assets. Its parser rejects unknown fields, duplicates, traversal,
non-canonical paths, symlinks/non-files, `photos/**`, and `og.png`. Tests build a
fixture with no `.git` directory and prove that private neighboring files are
not copied. Removing Git metadata therefore strengthens rather than weakens the
Stage A public-safety contract.

### Secret and runtime-content boundary

No secret is accepted through Docker `ARG` or baked `ENV`; future production
secrets must be injected at runtime by a separately reviewed deployment
contract. The final image contains only the standalone trace, generated Next
static files, and allowlisted public files. Automated inspection rejects source
trees, developer tools, vinext/wrangler startup packages, `.git`, local state,
environment files, local photos, and CI-only private sentinels.

### Linux CI acceptance evidence

The dedicated Ubuntu job is the authoritative container-runtime gate because
the current workstation has a Docker CLI but no running daemon
(`LOCAL_DOCKER_DAEMON_UNAVAILABLE`). It must perform a real Docker build and
then prove all of the following before CONTAINER-01 can be accepted:

- inspectable default UID/GID `1000:1000` and Standard Next exec-form command;
- startup with a read-only root filesystem plus bounded temporary `/tmp`;
- exact GET/HEAD/405 health behavior and security headers;
- public homepage, packaged Next static asset, favicon, and Admin redirect;
- absence of forbidden local/private/build files and production vinext or
  `cloudflare:workers` runtime dependencies;
- SIGTERM stop within the grace period without OOM or SIGKILL;
- image size, layer count, runtime-file count, and stop duration emitted to the
  CI log as the initial evidence baseline.

Repository `npm test` remains responsible for the complete eleven-template,
Admin V2, SiteDocumentV1, stable-ID, legacy adapter, Photo Library, Composition,
legacy rollback, and Standard Next HTTP regression suites.

The first green Linux container run for this slice recorded the following
baseline (Docker reports image size as unpacked bytes):

| Evidence | Result |
| --- | --- |
| Docker daemon | `28.0.4` on the GitHub-hosted Ubuntu runner |
| Runtime UID/GID | `1000:1000` |
| Read-only root | Passed with bounded temporary `/tmp` |
| Image size | `280,502,347` bytes (about `267.5 MiB`) |
| Image layers | `7` |
| Runtime files under `/app` | `1,294` |
| SIGTERM stop | `126 ms`, exit `143`, no OOM or SIGKILL (`137`) |
| HTTP/filesystem inspection | Passed |

The size is dominated by the pinned Debian/glibc Node base plus the traced
Next/Sharp runtime. No arbitrary hard budget is introduced; later slices can
compare against this baseline without trading away glibc compatibility,
runtime correctness, or debuggability.

## Security and rollback

- The endpoints are deliberately unauthenticated so an external supervisor can
  observe process health; their exact response contains no sensitive state.
- The endpoints do not act as a production bypass and do not grant access to
  Admin, upload, Draft, or unpublished content.
- Revert slice 1 to remove the probes and their tests. Revert CONTAINER-01 to
  remove the image, packaging manifest, and Linux verification workflow. No
  container is pushed or deployed by this slice, so rollback has no image
  registry, volume, schema, persistence, data, secret, port, DNS, TLS, or
  external-infrastructure recovery step.

## Remaining Stage A2 gaps

Stage A2 remains `IN_PROGRESS` and `NOT_ONLINE_PREVIEW`. At least the following
gaps remain open and require later, independently reviewed slices:

- minimal Compose shell;
- Caddy reverse proxy and HTTPS configuration;
- basic application/proxy logging;
- server-only deployment configuration contract;
- deploy/update smoke procedure and runbook.

This slice does not authorize any of those tasks, a real server operation,
Stage B persistence, Auth, product route changes, hosted assets, or deployment.
