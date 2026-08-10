# Portfolio Platform

A multi-template photography portfolio platform with a shared content admin.

`FRAME//ZERO` is a historical codename and technical namespace, not the formal
product brand. The current priority is to deliver a usable self-hosted V1 on a
user-owned Linux server before expanding the product surface.

Current governance:

- [Portfolio Platform North Star](docs/PORTFOLIO_PLATFORM_NORTH_STAR.md)
- [Self-Hosted V1 Launch Roadmap](docs/SELF_HOSTED_V1_ROADMAP.md)
- [Current Status](docs/CURRENT_STATUS.md)

The existing D1, Cloudflare, and local-photo sections below describe the current
legacy implementation and migration source. They are not the accepted target
production architecture.

## Included templates

1. Bright Cinematic
2. Neon HUD
3. Infinite Film Rail
4. Manga Panels
5. Prism Liquid
6. Orbital Portal
7. Photography Archive OS
8. Editorial Duet
9. Polaroid Field
10. Character Select
11. Museum Depth

Every template is a separate lazy-loaded React entry. They share one D1-backed
content document for profile, package, and contact data. Each template keeps a
small independent selection of 7–12 local-library assets, so changing one
layout does not disturb the composition of another.

## Versioned document contract

Phase 0 defines the future portable `SiteDocumentV1` contract in
`app/site-document.ts`. Its strict parser accepts `schemaVersion: 1`, known
content fields, and template compositions that reference opaque `assetId`
values. It rejects tenant identity, storage paths, resolved image URLs, legacy
`works` fields, unknown schema versions, and invalid or duplicate slot
references.

Schema version 1 freezes its eleven template identities in
`SITE_DOCUMENT_V1_TEMPLATE_IDS`; the document contract does not import or derive
them from the mutable runtime template catalog. Adding, removing, renaming, or
editing runtime catalog entries therefore cannot silently expand or invalidate
historical V1 documents. A new document template identity requires an explicit
versioned contract decision.

Slot indices are unique and structurally bounded from 0 through 255. Exact slot
and renderer compatibility for the current installation must later be checked
against both `templateId` and `templateVersion`; structural parsing does not
claim that a frozen identity is currently renderable.
An `assetId` remains an uninterpreted opaque reference at the document parser
boundary, so structural parsing does not reject historical references. The
Phase 0 migration contract in `app/stable-id-migration.ts` fixes newly migrated
internal Site and Asset identities as server-generated UUID v4 values. Public
Asset identifiers, URL encoding, and object-storage keys remain an ADR-0008
decision. Even when a reference resembles a path or URL, consumers must only
use it as an ID in a future site-scoped resolver; the document contract never
resolves or fetches it.
Manual compositions may intentionally reuse one asset in multiple slots;
automatic layout keeps its stricter no-reuse rule.

This contract and the pure PR-01C compatibility adapter are intentionally not
connected to the current D1 API yet. The homepage and admin still use legacy
`SiteContent`. A document is not a self-contained photo export, and asset
existence and target-Site ownership must later be validated by a site-scoped
resolver or repository.

## Stable ID migration planning

`app/stable-id-migration.ts` defines an unconnected migration planning contract
for the current `site_settings(id = 1)` source. The source is located by
`migrationKey = legacy:site_settings:1`; that key is never a `siteId`. Dry-runs
allocate nothing. A first apply produces only a UUID v4 pending checkpoint that
must be persisted and read back before asset planning. Pending retries reuse the
same Site ID, completed retries are no-ops, and conflicting checkpoints fail
closed.

Before allocating any Asset UUID, asset planning validates every legacy slot's
`templateId` at runtime against the frozen V1 template identities. An empty
`unresolved` report produces `completion.status = "ready-to-complete"` and a
`nextCheckpoint` whose status is `completed`. If any slot remains unresolved,
completion is `blocked-by-unresolved`, `nextCheckpoint` is `null`, and the
current checkpoint remains pending. Conflicts do not produce a completion
checkpoint.

Confirmed legacy SHA-256 values are private source fingerprints. Within one
Site they may reuse a persisted fingerprint-to-Asset mapping; another Site must
receive another random Asset ID. A legacy slot without a confirmed fingerprint
is reported as unresolved instead of deriving identity from a path, filename,
display code, or hash. This module does not create tables, write D1, modify the
local importer, or connect the migration to the page/API runtime.

A later persistence executor must commit `newMappings` and the completed
checkpoint in the same atomic transaction. PR-01B defines that planning
requirement only; it does not implement the database transaction. Completed
retries remain stable no-ops.

## Legacy SiteContent compatibility adapter

`app/legacy-site-content-adapter.ts` is the unconnected PR-01C compatibility
boundary from raw legacy `SiteContent` JSON to `SiteDocumentV1`. It accepts the
original `unknown` value and never runs `normalizeSiteContent()`, so an unknown
template, malformed required field, unsupported theme, or value that the legacy
runtime would replace with demo content remains diagnosable. Root content is
strictly validated and deeply copied, and every successful document or blocked
preview is returned from `parseSiteDocumentV1()`.

The adapter materializes compositions for all eleven frozen V1 templates with
`templateVersion: 1`. An own `templateWorks` key selects the explicit layout,
including an explicit empty array; a missing key selects the caller's
precomputed global-works fallback. The caller supplies one deeply read-only,
single-Site, slot-aware resolution snapshot covering all eleven templates. Each
snapshot entry records the template, version, explicit/fallback mode, legacy
source position and slot index, plus either a resolved UUID v4 Asset ID or an
unresolved reason. The adapter does not call the layout algorithm or derive a
slot assignment itself.

For each snapshot-provided slot, a resolved enabled work contributes its
`title`, `subtitle`, strict `0..100%` focus point, and `locked` state (defaulting
to `false`) together with the snapshot UUID. A disabled work is omitted without
creating an unresolved item. An unresolved work is also omitted from the
composition but remains in the unresolved report. Legacy image/preview values,
dimensions, display code, and old asset reference never enter the V1 slot;
invalid focus is an error rather than a clamp or demo fallback.

Results are a deterministic three-state union. `ready` contains the only
document that a future persistence executor may save. `blocked-by-unresolved`
contains only `documentPreview`; unresolved slots are omitted from that preview,
and it must never be treated as a completed migration document. `invalid`
contains `document: null`. Stable, sorted errors and unresolved diagnostics
identify blocking input or asset-resolution problems; aggregated warnings make
unsupported `theme`, dropped `work.code`, and dropped `fullWidth` visible rather
than silently discarding them. Resolved snapshot IDs receive an additional UUID
v4 check because the V1 parser intentionally treats Asset IDs as opaque.

This adapter performs no I/O and allocates no identity. It does not read D1, the
filesystem, the photo manifest, private importer state, or the network; it does
not import a UUID generator or infer an Asset ID from a path, URL, filename,
display code, SHA-256 value, or legacy `assetId`. PR-01C does not connect the
adapter to the current API, homepage, admin, importer, or database. The legacy
API and page behavior therefore remain unchanged, while repository, double-read,
checkpoint persistence, atomic migration writes, and runtime wiring stay in
later PRs.

Theme overrides are outside the executable V1 contract until a closed,
sanitized schema and explicit version-compatibility policy are accepted.

## Adaptive composition planning foundation

COMPOSITION-02 establishes a pure Composition Variant contract, strict registry
validation, deterministic assignment, and recommendation planning. A stable
`variantId` identifies an immutable, design-approved composition within one
`templateId` and `templateVersion`; it is not inferred from the current photo
count, ratios, legacy `templateWorks`, or renderer output.

`templateVersion` continues to identify the logical slot schema. Immutable
Variants under the same version may assign different target ratios to the same
stable logical slots, but changing slot count, order, key, role, capacity, or
composition meaning requires a new template version. An existing Variant is
never changed in place; a new design under the same logical schema receives a
new `variantId`.

This is a contract/planner foundation only. It does not change
`SiteDocumentV1`, approve any production Variant or concrete research ratios,
or connect the planner to Admin, renderer, API, D1, or the eleven formal
templates. Future persisted composition must explicitly record its Variant in
a separately approved Vnext contract. Until then, the current production
layout and rendering paths remain unchanged.

In short: the pure contract/planner foundation is implemented; no production
runtime integration exists, and no formal visual Variant is approved.

## Local development

Requires Node.js `>=22.13.0`.

If the terminal is still using an older installed version, switch it first:

```bash
fnm use 22.13.1
```

```bash
npm install
npm run dev
```

The local preview runs at `http://127.0.0.1:3001/`; the content admin is at
`http://127.0.0.1:3001/admin`. The same `npm run dev` command also starts the
loopback-only photo import service on an automatically assigned free port. The
supervisor passes that private origin to the Admin server process; users do not
need to find or manage the companion port. It is a local editing companion only
and is never started by the production build.

The [ADMIN-V2 / DESIGN-01 workbench](docs/admin-v2.md) divides the editor into
six focused routes for templates, profile, packages, layout, contact, and
advanced compatibility controls. All routes share one client-side draft and
the existing save endpoint; the single top-bar action saves all changes across
the six sections. The template route uses a compact eleven-item
selector and expands only one candidate detail at a time. Desktop editing uses a
persistent sidebar; mobile keeps every section accessible through a compact
switcher, while complex photo layout remains desktop-first. The Admin structure
does not change `SiteContent`, the write payload, D1 schema, or template catalog.

The Polaroid Field keeps its fixed nine-slot contract. On desktop its initial
view and FIT control calculate a rotation-aware fit with a safe viewport margin;
zooming and panning remain available after that fitted overview.

## Public-safe demo data

The repository contains fictional profile, pricing, and contact placeholders.
Replace them locally through `/admin`; never commit real contact details.

After the browser loads saved `SiteContent`, it updates the visible tab title
from `profile.brand`, then `profile.photographer`, with a neutral portfolio
fallback. This is client-visible polish only: the server-rendered title,
Open Graph, Twitter, and other SEO metadata still use the legacy demo path.
The future `PUBLIC-IDENTITY / SSR-BRIDGE` scope must use editable
`profile.role` instead of a hard-coded photographer role, combine empty
city/role values safely, and must not use `profile.mark` as the SEO title
subject.

Photography assets are intentionally excluded from Git and GitHub:

- `public/photos/`
- `public/og.png`

For local testing, place the generated WebP variants in `public/photos/`. The
repository contains layout code and image metadata only, never the photographs.
When photos are absent, every template keeps its intended composition with
designed text placeholders.

### Import a local photo library

For normal local editing, open **Admin → 素材排版** and use **添加照片** or
**添加文件夹**. Multiple files and nested folders are processed one photograph at
a time, progress remains visible, duplicate content is reported as already
present, and the material grid refreshes automatically when the batch finishes.
Adding material updates the local Photo Library immediately; it does not save or
change the shared SiteContent draft and it never runs automatic layout.

The local service streams each selected file through a temporary directory into
the same importer used by the command line. The importer deduplicates identical
files by SHA-256, applies EXIF orientation, strips image metadata, and creates
three colour-managed WebP variants per unique photograph. Original files and
browser folder paths are not copied into the project or manifest. Each request is
limited to 200 MiB; requests and manifest updates are serialized, including
against a concurrent CLI import for the same project.

The CLI remains available for advanced automation, recovery, and intentionally
adopting linked output directories:

```bash
npm run photos:import -- --source "<photo-folder>"
```

Generated files stay local in `public/photos/library/`. The browser-safe index is
`public/photos/library-manifest.json`; it contains stable asset IDs, aspect ratios,
orientations, and responsive image dimensions, but no source file names or local
paths. Incremental import state is stored in `.frame-zero/`. Both locations are
ignored by Git. JPEG, PNG, WebP, AVIF, TIFF, HEIC, and HEIF inputs are considered;
actual format support depends on the installed Sharp build. Camera RAW formats
such as ARW, CR3, and NEF are not supported. Damaged or unsupported files are
reported without stopping the rest of an Admin batch.

Imports are additive: choosing the wrong folder, temporarily losing a source file,
or hitting one damaged photograph will not delete assets already used by a saved
homepage. The current compatibility manifest still keys its legacy entries by
SHA-256 so re-imports reuse them; those hashes are migration fingerprints, not
the future random internal Asset IDs.

Normal projects keep `public/photos/` as a regular ignored directory. If an
advanced local setup intentionally makes it a junction or symlink, the first run
must explicitly adopt and pin that target with:

```bash
npm run photos:import -- "<photo-folder>" adopt-linked-output
```

Later imports use the normal command. A random owner token plus a hashed target
prevents an accidental or retargeted link from receiving generated files.

The executable import controls are available only from the loopback Admin. A
hosted Admin can still browse an existing manifest, but it does not call a
visitor's `127.0.0.1`; remote object storage is a separate future scope. Manual
**重新读取** and `npm run photos:serve` remain available for diagnostics. The
standalone service defaults to port 3002 and can use another diagnostic port,
for example `npm run photos:serve -- --port 3003`; normal `npm run dev` always
uses automatic loopback port discovery.

After the material grid refreshes, for the active template you can:

- create an initial ratio-aware layout with **一键智能排版**;
- pick or replace a specific fixed slot manually;
- swap adjacent slots, remove a photograph, or lock it before recomposing;
- click the subject in a crop preview, or use the two sliders, to set its focal point;
- save the result without copying the rest of the material library into D1.

If a template has no saved V2 composition it continues to use the original `works`
list. If there are not enough compatible landscape or portrait photographs, the
unfilled slots remain intentional text placeholders instead of forcing a bad crop.

`npm run check:public` fails if photographs, local Windows paths, WeChat storage
identifiers, non-placeholder email addresses, Chinese mobile numbers, or common
credential formats appear in the worktree, index, or reachable Git history.

## Useful commands

```bash
npm run lint
npm test
npm run test:contracts
npm run test:adapters
npm run test:photos
npm run test:composition
npm run photos:import -- --source "<photo-folder>"
npm run photos:serve
npm run photos:serve -- --port 3003
npm run build
npm run build:node
npm run start:node
npm run test:node-runtime
npm run check:bundle
npm run check:public
npm run db:generate
```

Stage A currently keeps a parallel Standard Next.js Node standalone parity
lane. It is intentionally not the default local editing runtime yet: the target
PostgreSQL repository belongs to Stage B, so the Node lane proves build/start
and read-only route behavior while legacy writes fail closed. See
[`docs/stage-a-runtime.md`](docs/stage-a-runtime.md) for the evidence matrix,
private-photo packaging boundary, remaining cutover gaps, and rollback path.

Content settings are stored in D1. Local development uses the project-local
Miniflare database; hosted deployments use the logical `DB` binding declared in
`.openai/hosting.json`.

## Admin security assumptions

The homepage content API is public by design, so anything entered in `/admin`
must be suitable for public display. The hosted admin trusts the
`oai-authenticated-user-*` headers injected by ChatGPT Sites. If you deploy this
repository behind another proxy, protect `/admin` and `PUT /api/site-content`
with your own authentication and strip any client-supplied headers using that
prefix. Local write access is intended only for a loopback-only development
server bound to `127.0.0.1`.

## Public repository publishing

The Windows publishing script creates the public GitHub repository, verifies
that every required template branch exists, runs the public-safety gate, pushes
the V1 and all template branches individually, and makes
`codex/template-gallery` the default branch:

```powershell
.\scripts\publish-public-repo.ps1
```

It requires an authenticated GitHub CLI session for the `Brilliant666`
account. Never add photographs or real personal information to make the remote
preview self-contained.
