# Stage A2 Deployment Bootstrap

> - Phase: `SELF_HOSTED_V1`
> - Stage: `STAGE_A2_DEPLOYMENT_BOOTSTRAP`
> - Status: `IN_PROGRESS`
> - Base: `main@8a9f6604f294381f34abe2cc130686fc2dec49b0`
> - Online maturity: `NOT_ONLINE_PREVIEW`

Stage A2 establishes the smallest repeatable production shell around the
Standard Next.js standalone artifact accepted in Stage A. It does not deploy a
server, introduce product persistence, or expose unfinished product routes.

## Gap analysis

| Definition of Done | Current evidence | Status after slice 1 |
| --- | --- | --- |
| Package the Stage A Node artifact | Standalone build exists, but its public-file preparation still relies on Git metadata that must not be copied into a container context | Open |
| Minimal Docker image and Compose shell | No reviewed Docker or Compose files | Open |
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

No Docker, Compose, Caddy, TLS, server secret, database, persistent volume, or
real deployment is introduced in this slice. The local Docker CLI is present
but its daemon is not running, so no container claim is made without a future
reviewed image and Linux/CI execution evidence.

## Security and rollback

- The endpoints are deliberately unauthenticated so an external supervisor can
  observe process health; their exact response contains no sensitive state.
- The endpoints do not act as a production bypass and do not grant access to
  Admin, upload, Draft, or unpublished content.
- Revert this slice to remove the probes and their tests. It has no schema,
  persistence, data, secret, port, DNS, TLS, or external-infrastructure effect.

## Next reviewed gap

After this slice is merged and separately approved, the next Stage A2 task
should package the standalone artifact into a non-root Linux image without
copying `.git`, local photographs, `.frame-zero`, environment files, or build
secrets into the build context or runtime layers. That work remains a separate
Draft PR.
