# Portfolio Platform North Star

> - Status: `CURRENT_SOURCE_OF_TRUTH`
> - Effective date: 2026-08-10
> - Baseline: `main@3342589c48ba6bdd437fb763eff51fae385f48b5`
> - Current phase: `SELF_HOSTED_V1`
> - Current stage: `STAGE_A_RUNTIME`

This document is the highest project-level constraint for the current product
goal, V1 scope, and launch priority. It does not silently override an Accepted
ADR. If a feature requires changing an Accepted technical invariant, that
change requires a new ADR that explicitly supersedes the earlier decision.

`FRAME//ZERO` is a historical codename and technical namespace, not the formal
product brand. Until a separate naming decision is made, project governance
uses the neutral name **Portfolio Platform** or **Photography Portfolio
Platform**. Repository, package, `.frame-zero`, and environment namespaces are
not renamed as part of this governance decision.

## 1. Product North Star

Deploy a personal photography homepage platform on a user-owned Linux cloud
server that can be handed to real photographer clients.

Each invited client has a public photography homepage and can sign in to a
site-scoped Admin, manage content and the existing template experience, upload
photographs, save a draft, publish an immutable revision, and share the
published portfolio through a stable URL.

The V1 client journey is:

```text
operator
→ creates client account
→ username + real email + initial password

client
→ /login
→ /<siteSlug>/admin
→ uploads photographs
→ edits the portfolio
→ saves Draft
→ publishes
→ /<siteSlug>

visitor
→ sees only the Published Portfolio
```

The first real Site is:

```text
username = star
siteSlug = star
```

## 2. V1 success definition

V1 succeeds when one operator can provision a real client, that client can
complete the full authenticated editing and publishing loop, and visitors can
reliably view the published portfolio on the self-hosted production server.

V1 is not a complete SaaS product. It is a usable, recoverable closed beta with
one User owning one Site, while preserving identity boundaries that allow later
growth.

V1 is successful only when all of these are true:

- the operator provisions `star` with a real email and an initial password;
- `star` signs in through `/login`;
- `star` can access `/star/admin`, while another user cannot;
- the existing Admin V2 and all eleven formal templates remain functional;
- the client can upload hosted photographs and edit the portfolio;
- Save changes Draft state only;
- Publish moves a validated immutable Revision into public use;
- `/star` server-renders only Published content and metadata;
- the deployment, database, assets, backups, restore, and rollback paths have
  been exercised on the target Linux topology.

## 3. Target users

V1 has two operational roles:

- **Operator:** provisions invited clients, performs bootstrap and recovery,
  and operates the single production server.
- **Photographer client:** owns one Site, edits its portfolio, uploads assets,
  saves Drafts, publishes, and rolls back a prior published Revision.

Visitors are anonymous readers of Published portfolios. Public registration,
teams, organizations, billing, and general platform administration are not V1
roles.

## 4. URL model

Local:

```text
http://127.0.0.1:3001/
http://127.0.0.1:3001/login
http://127.0.0.1:3001/star
http://127.0.0.1:3001/star/admin
```

Production:

```text
https://photo.cosflow.icu/
https://photo.cosflow.icu/login
https://photo.cosflow.icu/star
https://photo.cosflow.icu/star/admin
```

Semantics:

| Route | Meaning |
| --- | --- |
| `/` | Portfolio Platform landing page |
| `/login` | Authentication |
| `/:siteSlug` | Public Published portfolio |
| `/:siteSlug/admin` | Site-scoped Admin |

The platform landing page must not later be redefined as the `star` portfolio.

## 5. Identity model

V1 may expose one User → one Site, but internal identities remain separate:

```text
AuthUserId != PortfolioUserId
PortfolioUserId != Username
SiteId != SiteSlug
```

- Internal User, Site, Asset, and Revision identities are opaque, stable IDs.
- New Site and Asset identities use server-generated random UUIDs.
- `siteSlug` may initially default to username, but is not Site identity.
- Username and slug are display/routing fields and may evolve independently.
- The browser cannot choose internal User, Site, Asset, or Revision IDs.

## 6. Site ownership

`Site` remains the minimum data ownership boundary defined by
[ADR-0002](adr/0002-site-tenant-boundary.md).

Authentication is not authorization. An authenticated principal must first be
mapped to a Portfolio User, then to an authorized Site context. Every private
repository operation must include that Site scope in the database query.

V1 requires:

```text
star → star = ALLOW
alice → star = DENY
anonymous → star/admin = DENY
```

Better Auth plugins never own Site, SiteSlug, Draft, Revision, Asset, or Publish
semantics.

## 7. Runtime target

The production runtime decision is:

```text
MIGRATE_TO_NEXTJS
standard Next.js
+ Node standalone
```

vinext is a migration source and parity reference, not the long-term production
runtime. Stage A must migrate runtime and test infrastructure without rewriting
templates, Admin V2, SiteDocumentV1, stable-ID contracts, the legacy adapter, or
Composition planning.

Cloudflare Worker, workerd, D1, R2, and Cloudflare Images are not required
production runtime dependencies. Cloudflare may remain an optional DNS or
future storage/backup provider.

## 8. Database target

The production data direction is:

```text
PostgreSQL
+ Drizzle ORM
```

Requirements:

- explicit, reviewable migrations;
- no request-time DDL;
- PostgreSQL transactions for multi-step state changes;
- native UUIDs, foreign keys, unique constraints, and ownership constraints;
- empty-database, replay, upgrade, backup, and restore tests;
- D1 and `site_settings(id = 1)` retained only as legacy migration sources
  until migration has been verified and the retention decision is approved.

## 9. Authentication target

Better Auth is the `PRIMARY_ADOPT_CANDIDATE`, not yet the approved production
integration. It must first pass:

```text
REUSE-01B
Better Auth + Standard Next.js Node + PostgreSQL
```

Responsibility boundary:

```text
Better Auth
→ authentication, credentials, sessions, revoke

Portfolio Platform
→ business identity, Site ownership, authorization, Draft, Publish
```

Identity mapping:

```text
Better Auth User
→ auth_user_id UNIQUE
→ Portfolio User
→ Site
```

V1 is operator-provisioned and closed. Public `/register` is not required.

## 10. Publication model

```text
Save != Publish
Public != Draft
```

The lifecycle is:

```text
Admin edit
→ Draft
→ Save
→ immutable Draft Revision

Publish
→ validate document, template, and assets
→ move Published Revision pointer
→ invalidate public cache
→ public SSR
```

Rules:

- Admin edits never directly change the public page.
- Public rendering never reads Draft state.
- Revisions are immutable.
- Rollback selects or republishes a prior valid Revision without rewriting
  history.
- `SiteDocumentV1` remains frozen.
- SiteDocument contains no User/Site identity, URL, storage path, or storage
  credentials.

## 11. Asset model

V1 asset direction:

```text
Persistent Filesystem
+ AssetStorage abstraction
+ Sharp
```

Default production asset root:

```text
/var/lib/portfolio/assets
```

Concepts remain separate:

```text
Source != Asset != Storage != AssetVariant
```

SiteDocument stores only `assetId`. It never stores an absolute path, original
filename, storage key, or resolved public URL.

V1 preserves:

```text
private original
thumbnail
card
full
```

The local loopback importer remains a development companion. Hosted upload is
an authenticated streaming route with staging, server-side validation,
bounded Sharp processing, AssetStorage, PostgreSQL lifecycle state, and an
AssetResolver.

## 12. Deployment target

The first production topology is deliberately small:

```text
One Linux Server
+ Docker Compose

Browser
→ Caddy
→ Standard Next.js Node application
→ PostgreSQL

Application
→ persistent asset filesystem
```

V1 deployment includes HTTPS, health checks, server-only secrets, database and
asset backup, restore drills, and application rollback rehearsal. It does not
require Kubernetes, a service mesh, multiple app instances, object storage, or
blue/green deployment.

## 13. V1 required

Everything in this section is `V1_REQUIRED`.

### Platform

- `/` landing page
- `/login`
- `/:siteSlug`
- `/:siteSlug/admin`

### Identity

- operator-provisioned account
- username, real email, password
- session and logout
- Auth User → Portfolio User mapping
- User → Site ownership and cross-user denial

### Portfolio

- all eleven formal templates
- existing Admin V2 sections: Template, Profile, Packages, Layout, Contact,
  Advanced
- current package, contact, focus, composition, and responsive behavior unless
  a verified launch blocker requires a targeted fix

### Content lifecycle

- Draft and explicit Save
- immutable Revision
- Publish
- rollback to a previous Published Revision
- public page reads only Published content

### Assets

- hosted photo upload
- private original
- thumbnail, card, and full variants
- AssetId, AssetStorage, AssetResolver
- approved and patched Sharp pipeline
- basic upload, pixel, storage, and processing limits

### Production

- standard Next.js Node
- PostgreSQL and Drizzle
- production authentication after REUSE-01B
- persistent filesystem
- Docker Compose and Caddy
- HTTPS and health checks
- PostgreSQL and asset backup
- successful restore drill
- application rollback rehearsal

## 14. V1 non-goals

Everything in this section is `NOT_REQUIRED_FOR_V1_LAUNCH` and cannot block
launch without a newly demonstrated V1 blocker.

- public `/register`
- OAuth, social login, MFA
- full password-recovery UX
- billing, payments, plans, subscriptions
- organizations, teams, invitations, or general RBAC
- one User managing multiple Sites
- custom domains or Site transfer UI
- template marketplace, community, or analytics platform
- Redis, Kubernetes, Kafka, RabbitMQ, microservices, or service mesh
- MinIO
- R2/S3 as required production storage
- CDN architecture, multi-region, or blue/green deployment
- guaranteed HEIC/HEIF support
- AI color grading or AI layout generation
- formal COMPOSITION-03 registry, persistence, Admin, or renderer integration
- full technical-namespace rename
- new templates added only to expand the catalog

## 15. Launch-first governance

Every proposed task must first answer:

```text
Does this block V1 launch?
```

If the answer is no, the default destination is `POST_V1_BACKLOG`.

Additional rules:

1. A PR must focus on one verifiable stage goal. It must not combine Runtime,
   PostgreSQL, Auth, routes, and assets into one implementation.
2. UI and visual improvements may continue only when they resolve a verified
   current-stage or V1 blocker. They do not pre-empt the launch critical path.
3. Infrastructure requires evidence. Do not introduce systems because they may
   be useful later.
4. Preserve the eleven templates, Admin V2, SiteDocumentV1, stable IDs, legacy
   adapter, current photo workflow, and Composition planner unless a concrete
   blocker is demonstrated.
5. A task must not silently cross into a later stage.

Before a Codex development task begins, it must check:

```text
1. Which Stage owns this task?
2. Does it directly advance that Stage Definition of Done?
3. Does it introduce a V1 non-goal?
4. Does it cross into a later Stage?
5. Does it modify an Architecture Invariant?
6. Does it affect existing templates, Admin, or SiteDocument?
```

If the task does not advance the current Stage, stop and report:

```text
OUT_OF_CURRENT_NORTH_STAR
```

## 16. Architecture invariants

Ordinary feature PRs cannot change these invariants:

```text
SiteDocumentV1 remains frozen

Stable internal IDs are opaque UUIDs

User identity != username

Site identity != slug

Save != Publish

Public != Draft

SiteDocument stores AssetId, not storage location

Authentication != Site authorization

Storage provider != Asset identity

Local source path != Hosted asset identity
```

Also retained from Accepted ADRs:

- Site is the minimum ownership boundary.
- Cross-Site migration remaps assets into target-Site identities.
- Composition Variant identity is stable and separate from templateVersion.
- SiteDocumentV1 does not gain `variantId` by implication.
- Renderer does not infer a Variant from current assets.

Changing an invariant requires an ADR that explicitly describes compatibility,
migration, security, rollback, and which earlier ADR it supersedes.

## 17. V1 launch gate

Only mark `V1_LAUNCHED` when every item below is proven:

- standard Next.js Node production runtime
- PostgreSQL migrations tested on empty and upgrade paths
- production Better Auth integration after REUSE-01B
- operator can create `star`
- `/login` and `/star/admin`
- ownership allow/deny, including a cross-user negative test
- Draft/Publish separation and immutable Revision
- Published SSR and dynamic metadata
- all eleven templates functional
- hosted image upload
- approved V1 image formats and patched Sharp
- private originals and generated variants
- basic quota and upload limits
- `star` migration complete with unresolved count zero
- Caddy HTTPS and Docker Compose
- PostgreSQL backup and asset backup
- successful clean restore drill
- application rollback rehearsal
- health endpoints and minimum logs
- Quality success
- Public repository safety success

## 18. Post-V1 operating model

After launch, work enters `POST_V1_HARDENING` and is prioritized by production
evidence:

- real client feedback
- production errors and security findings
- measured performance
- storage growth
- support requests
- backup and recovery evidence

Backlog classes:

| Class | Meaning | Examples |
| --- | --- | --- |
| `P0_PRODUCTION_FIX` | Security, data, availability, or recovery incident | auth bug, data loss, broken publish, failed backup |
| `P1_PRODUCT_FEEDBACK` | Real client friction | Admin UX, template issue, mobile workflow |
| `P2_PRODUCT_EXPANSION` | Product growth | registration, analytics, more templates, custom domains |
| `P3_INFRASTRUCTURE_SCALE` | Proven scaling need | S3/R2, CDN, Redis, replicas, external queue |

The project must not implement a future SaaS stack in advance of evidence.

## 19. Documentation authority and conflicts

| Document | Classification | Meaning |
| --- | --- | --- |
| This document | `CURRENT_SOURCE_OF_TRUTH` | Current product target, V1 scope, and launch priority |
| [SELF_HOSTED_V1_ROADMAP.md](SELF_HOSTED_V1_ROADMAP.md) | `CURRENT_SOURCE_OF_TRUTH` | Current execution order and Stage gates |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | `CURRENT_SOURCE_OF_TRUTH` | Current phase, Stage, milestone, and research PR status |
| [NORTH_STAR.md](NORTH_STAR.md) | `SUPERSEDED` for current priority | Historical long-term platform plan; useful context only |
| [phase-0/README.md](phase-0/README.md) | `HISTORICAL` | Completed/legacy Phase 0 planning and evidence |
| [admin-v2.md](admin-v2.md) | `CURRENT_SOURCE_OF_TRUTH` for Admin V2 | Existing subsystem behavior until its stage changes it |
| Accepted ADRs | `CURRENT_SOURCE_OF_TRUTH` for their invariants | Must be explicitly superseded, never silently overwritten |

Known conflicts resolved by this document:

- the formal product name is neutral, not FRAME//ZERO;
- self-hosted V1 launch takes priority over broad SaaS expansion;
- standard Next.js Node replaces vinext as the production target;
- persistent filesystem replaces MinIO/S3/R2 as the required V1 asset store;
- one-server V1 does not require a separate image-worker service;
- public registration, teams, custom domains, and multi-Site UI are post-V1;
- COMPOSITION-03 visual research may resume after Stage A, but its formal
  integration waits for Publication and AssetResolver.
- the ADR-number proposal list embedded in the historical North Star is not an
  ADR index; actual files and Accepted statuses in `docs/adr/` are authoritative.

## 20. Current execution pointer

```text
Current phase: SELF_HOSTED_V1
Current stage: STAGE_A_RUNTIME
V1 status: NOT_LAUNCHED
Next milestone: STANDARD_NEXT_NODE_PARITY
PR #16: KEEP_DRAFT
```

The exact recommended next development task is:

```text
STAGE A / RUNTIME-01
Standard Next.js Node Parity
```
