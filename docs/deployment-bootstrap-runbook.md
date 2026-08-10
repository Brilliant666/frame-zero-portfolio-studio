# Stage A2 Deployment Bootstrap Runbook

> - Scope: repository-reviewed Linux deployment shell only
> - Current gate: `EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED`
> - Stage state: `IN_PROGRESS`
> - Online state: `NOT_ONLINE_PREVIEW`

This runbook is executable only after a human authorizes work on the target
server. Its presence is not SSH, deployment, DNS, TLS, or traffic-switch
authorization. `CI_TLS_EVIDENCE` uses Caddy's isolated internal CA and is not
`REAL_PRODUCTION_HTTPS_EVIDENCE`.

## External preconditions

The approved target Linux server will need:

- Git, Node.js 22 (at least the repository engine floor), Docker Engine, and
  the Docker Compose v2 plugin;
- outbound HTTPS for base images, the official Caddy image, package download,
  and ACME;
- exclusive availability of public TCP ports 80 and 443;
- a reviewed checkout directory, recommended as `/srv/portfolio-platform`;
- a root-readable/operator-readable configuration file outside Git,
  recommended as `/etc/portfolio-platform/production.env`;
- Docker named volumes `portfolio-platform_caddy_data` and
  `portfolio-platform_caddy_config`, created by Compose and never deleted by
  normal update or rollback;
- DNS A and, only when IPv6 is actually routed, AAAA records for the approved
  domain pointing to the target server.

The Stage A2 environment contract contains no secret. It accepts only these
server-side non-secret keys:

```text
REQUIRED: PORTFOLIO_DEPLOYMENT_MODE, PORTFOLIO_DOMAIN, PORTFOLIO_RELEASE,
          PORTFOLIO_BIND_ADDRESS, PORTFOLIO_HTTP_PORT,
          PORTFOLIO_HTTPS_PORT, PORTFOLIO_CADDY_CONFIG
OPTIONAL: PORTFOLIO_LOG_LEVEL (default INFO)
SECRET:   none
```

Use [`deploy/production.env.example`](../deploy/production.env.example) as a
shape reference. It is deliberately invalid until
`PORTFOLIO_RELEASE=sha-<reviewed Git SHA>` is supplied. The parser rejects
unknown, duplicate, interpolated, quoted, `NEXT_PUBLIC_*`, or secret-looking
keys. Future PostgreSQL/Auth/Asset secrets require a later approved contract;
do not append them here.

The production topology is exactly:

```text
Internet :80/:443 -> Caddy -> internal-only App:3000
```

It may conflict with an existing service already owning 80/443. It creates only
the `portfolio-platform` Compose project, its two containers, two networks, two
Caddy volumes, and locally built immutable App image tags. It must not reuse,
stop, rename, or remove another project.

## PRECHECK

Command:

```bash
cd /srv/portfolio-platform
git status --short --branch
git rev-parse HEAD
docker version
docker compose version
sudo ss -ltnp '( sport = :80 or sport = :443 )'
npm run deployment:validate -- /etc/portfolio-platform/production.env
npm run deployment:bootstrap -- precheck /etc/portfolio-platform/production.env
```

Expected result: checkout is the human-approved clean commit; Docker and
Compose answer; the strict configuration validates; 80/443 are either unused
or explicitly approved for this Caddy; no container is changed.

Failure behavior: stop. Do not kill the listener, edit firewall/DNS, weaken the
contract, or use another project's ports without a new human decision.

## BUILD / PREPARE

Command:

```bash
git checkout --detach <reviewed-commit-sha>
# Set PORTFOLIO_RELEASE=sha-<same-reviewed-commit-sha> in the external env file.
npm run deployment:bootstrap -- prepare /etc/portfolio-platform/production.env
```

Expected result: production Compose and Caddy configurations validate, the
official pinned Caddy image is available, and
`portfolio-platform-app:sha-<reviewed-commit-sha>` builds successfully. No
service is started by this step.

Failure behavior: keep any running known-good release untouched. Inspect the
build/configuration error, fix it in a reviewed repository change, and rerun;
do not retag a different image as the approved release.

## DEPLOY

Command:

```bash
npm run deployment:bootstrap -- deploy /etc/portfolio-platform/production.env
```

Expected result: Caddy and App become healthy; App has no host-published port;
Caddy alone owns 80/443; the existing Caddy volumes remain mounted.

Failure behavior: run LOG INSPECTION. If a previous known-good image exists,
use ROLLBACK. On a first deployment with no prior image, use STOP and leave
DNS/traffic unchanged until the defect is reviewed.

## VERIFY

Command:

```bash
npm run deployment:bootstrap -- verify /etc/portfolio-platform/production.env
```

Expected result: trusted public HTTPS validates normally; live/ready, `/`,
favicon, and read-only legacy SiteContent return successfully; SiteContent
mutation is 405; Admin, future tenant Admin, login, Auth, upload, and unreviewed
APIs are 404 at Caddy.

Failure behavior: do not announce `DEPLOYMENT_BOOTSTRAP_READY` or switch
traffic. Inspect logs and either correct the reviewed configuration or roll
back.

## UPDATE

Before updating, keep a copy of the previous validated env file and confirm its
image exists:

```bash
docker image inspect portfolio-platform-app:<previous-release>
git checkout --detach <new-reviewed-commit-sha>
# Update only PORTFOLIO_RELEASE to sha-<new-reviewed-commit-sha>.
npm run deployment:bootstrap -- update /etc/portfolio-platform/production.env
```

Expected result: the new immutable image is built, Compose recreates only what
changed, both services become healthy, and the public/private smoke passes.
Caddy volumes survive.

Failure behavior: preserve the failing logs and use the previous env file with
ROLLBACK. Never use `docker compose down -v`, volume deletion, image prune, or
database reset as an update mechanism.

## ROLLBACK

Command:

```bash
npm run deployment:bootstrap -- rollback /etc/portfolio-platform/previous.env
```

Expected result: the previous image must already exist locally; Compose switches
App back without building or deleting volumes; the same public/private smoke
passes.

Failure behavior: STOP if the service is unsafe, retain containers/volumes/logs
for diagnosis, and request human intervention. Never fabricate the old tag or
delete persistent state.

## STOP

Command:

```bash
npm run deployment:bootstrap -- stop /etc/portfolio-platform/production.env
```

Expected result: Caddy and App receive the configured graceful stop timeout.
Containers, networks, images, and Caddy volumes remain available for recovery.

Failure behavior: inspect container state before any force operation. A force
kill or resource deletion requires a separate incident decision.

## LOG INSPECTION

Command:

```bash
npm run deployment:bootstrap -- logs /etc/portfolio-platform/production.env
```

Expected result: the last 200 timestamped App stdout/stderr and Caddy JSON
runtime/access entries are readable. Caddy uses its default sensitive-header
redaction and the proxy strips Authorization, Cookie, and legacy ChatGPT auth
headers before forwarding.

Failure behavior: treat any credential, cookie, private path, or user-private
data in output as a security incident; preserve evidence and stop the rollout.
Do not paste production logs into GitHub.

## HEALTH INSPECTION

Command:

```bash
npm run deployment:bootstrap -- health /etc/portfolio-platform/production.env
```

Expected result: both public HTTPS probes return their exact minimal no-store
payloads. Current readiness proves only the Stage A2 application contract; it
does not claim future PostgreSQL, Auth, or Asset dependencies are healthy.

Failure behavior: do not route traffic or continue an update. Use LOG
INSPECTION and then ROLLBACK or STOP.

## CI evidence and production boundary

The `Deployment Bootstrap` Linux workflow uses the same Compose topology with
loopback-only ephemeral ports and a separate `Caddyfile.ci`. It performs real
Docker build/run, Caddy validation, HTTPS proxy smoke, private-route denial,
log-sentinel redaction, idempotent `up`, App restart, release A to B update,
B to A rollback, graceful stop, non-destructive `down`, and exact isolated
resource cleanup.

Production [`Caddyfile`](../deploy/caddy/Caddyfile) has no `tls internal`; it
uses Caddy's normal public ACME path. The official proxy is pinned to
`caddy:2.11.4-alpine` and its verified multi-platform Docker Hub index digest.
See the [official image](https://hub.docker.com/_/caddy) and Caddy's
[global logging options](https://caddyserver.com/docs/caddyfile/options).

Real target evidence still requires a separately authorized operator to:

1. preflight the actual Linux host and existing workloads;
2. approve exclusive 80/443 ownership and firewall behavior;
3. create the external configuration file;
4. point approved DNS records;
5. run the first deploy and observe public ACME issuance;
6. run real deploy/update/rollback smoke without affecting other services.

Until all six are complete, the precise status is
`EXTERNAL_DEPLOYMENT_APPROVAL_REQUIRED`, Stage A2 is `IN_PROGRESS`, and the
project is `NOT_ONLINE_PREVIEW`.
