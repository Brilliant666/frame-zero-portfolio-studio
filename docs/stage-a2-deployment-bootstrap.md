# Stage A2 Deployment Bootstrap

> - Phase: `SELF_HOSTED_V1`
> - Stage: `STAGE_A2_DEPLOYMENT_BOOTSTRAP`
> - Status: `IN_PROGRESS`
> - Base: `main@b653c949f80ead050c7e36c2457bc39214ca7a14`
> - Online maturity: `NOT_ONLINE_PREVIEW`

Stage A2 establishes the smallest repeatable production shell around the
Standard Next.js standalone artifact accepted in Stage A. It does not deploy a
server, introduce product persistence, or expose unfinished product routes.

## Gap analysis

| Definition of Done | Current evidence | Status after BATCH-01 |
| --- | --- | --- |
| Package the Stage A Node artifact | Multi-stage Debian/glibc image builds the accepted Standard Next standalone without Git metadata | Container packaging complete |
| Minimal Docker image and Compose shell | Reviewed two-service `Caddy -> App` topology keeps App internal, non-root, read-only, and dependency-free | Repo contract and Linux CI complete; target server pending |
| Caddy HTTPS reverse proxy | Production public-ACME config is separate from CI-only internal TLS; official image is version/digest pinned | Repo config and CI TLS complete; real ACME pending |
| Health endpoint and basic logs | App stdout/stderr and Caddy JSON runtime/access logs are collected by Compose; sensitive-header sentinel is rejected from logs | Repo contract and Linux CI complete |
| Repeatable deploy/update smoke | Linux verifier exercises idempotent deploy, restart, immutable release update, rollback, graceful stop, and non-destructive cleanup | Repo tooling and Linux CI complete; target smoke pending |
| Server-only configuration isolation | Strict known-key parser, safe invalid example, explicit env file, and no accepted secrets or `NEXT_PUBLIC_*` values | Repo contract complete |
| Receive Stage D routes without exposing unfinished capabilities | Public pages pass through; legacy SiteContent is read-only; Admin/Auth/upload/Draft/unreviewed APIs fail closed | Repo proxy boundary complete; Stage D route remains later work |

Repository-side work records `REPO_SIDE_BOOTSTRAP_READY`, but
`DEPLOYMENT_BOOTSTRAP_READY` is not reached without target Linux and real ACME
evidence. `ONLINE_PREVIEW` also remains blocked on Stage D.

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

## BATCH-01: repository-side deployment bootstrap

The bounded Stage A2 batch adds no product service or route. Its Compose graph
contains only the accepted Standard Next App image and the official Caddy
proxy. App has no host port, joins only an internal backend network, runs as
`1000:1000`, keeps a read-only root and bounded `/tmp`, drops all capabilities,
and accepts traffic only from Caddy. Caddy is the sole ingress and persists
only its `/data` and `/config` volumes.

The official `caddy:2.11.4-alpine` multi-platform index is pinned to
`sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`.
The digest and tag were verified against Docker Hub's official-image metadata
on 2026-08-11. No third-party plugin is used.

### Public and private boundary

Caddy exposes only the current public contract:

- public pages and packaged static files;
- exact live/readiness endpoints;
- GET or HEAD for the legacy public `/api/site-content` read.

It returns 405 for SiteContent mutation and 404 for `/admin`, one-segment
tenant Admin paths such as `/star/admin`, login, Auth, Draft, upload, and all
other unreviewed APIs. Authorization, Cookie, and legacy ChatGPT auth headers
are stripped before an allowed request reaches App. This preserves the current
homepage without treating the current Admin/API implementation as production
authorization.

### Configuration and logging

The server-only parser requires an explicit environment file and rejects
missing, unknown, duplicate, quoted/interpolated, secret-looking, or
`NEXT_PUBLIC_*` entries. Production is fixed to public 80/443 and the public
ACME Caddyfile; CI is fixed to loopback ephemeral ports and the isolated
internal-TLS Caddyfile. The checked-in example deliberately fails validation
until an immutable reviewed release is supplied. Stage A2 accepts no secret.

Both processes write to stdout/stderr. Docker's bounded JSON log driver makes
them available through `docker compose logs`; Caddy access/runtime logs use
JSON. Linux CI submits a synthetic Authorization/Cookie sentinel, confirms it
does not appear in either service log, and rejects local Windows paths.

### Deployment lifecycle evidence

The dedicated `Deployment Bootstrap` Ubuntu gate performs real Compose and
Caddy execution. It validates both Caddyfiles, builds App, pulls the pinned
proxy, checks loopback-only CI port publication, exercises health/public/static
traffic and proxy negative cases, inspects read-only/non-root/no-privilege
runtime settings, repeats `up`, restarts App, changes release A to B, rolls B
back to A, and verifies a graceful non-SIGKILL stop.

Normal `down` omits `-v`; the verifier proves the two Caddy volumes remain.
Only after that assertion does it remove exact, uniquely named CI volumes and
images. It refuses unknown volume names and contains no registry push, SSH,
production domain request, or external write.

This evidence is deliberately classified as
`CI_TLS_EVIDENCE != REAL_PRODUCTION_HTTPS_EVIDENCE`. Only an approved target
server with its real DNS and public ACME certificate can close the latter.

The operator CLI and
[deployment runbook](deployment-bootstrap-runbook.md) expose PRECHECK,
BUILD/PREPARE, DEPLOY, VERIFY, UPDATE, ROLLBACK, STOP, LOG, and HEALTH steps.
Update builds an immutable release matching a clean checkout. Rollback refuses
to build and requires the previous known-good image. Neither path removes
volumes or data.

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

Stage A2 remains `IN_PROGRESS` and `NOT_ONLINE_PREVIEW`. Repository-side gaps
are complete; the remaining evidence is external:

- preflight the approved target Linux server and its existing services;
- approve and bind real ports 80/443 without disturbing another workload;
- provide the external non-secret runtime configuration;
- approve DNS changes;
- obtain and verify real public ACME HTTPS;
- execute target-server deploy/update/rollback smoke.

The stop status is `EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED`. This batch performs
none of those operations and does not authorize Stage B, Auth, product route
changes, hosted assets, deployment, `DEPLOYMENT_BOOTSTRAP_READY`, or
`ONLINE_PREVIEW`.
