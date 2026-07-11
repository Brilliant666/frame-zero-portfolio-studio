# FRAME//ZERO Portfolio Studio

A multi-template Cosplay photography portfolio with a shared content admin.

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

Slot indices are unique and structurally bounded from 0 through 255. Exact slot
compatibility must later be checked against both `templateId` and
`templateVersion`; validating old revisions against only the mutable current
catalog would incorrectly invalidate historical compositions.
An `assetId` is an uninterpreted opaque reference here: its generator, public
encoding, uniqueness scope, and migration policy remain separate decisions.
Even when its text resembles a path or URL, consumers must only use it as an ID
in a future site-scoped resolver; the contract never resolves or fetches it.
Manual compositions may intentionally reuse one asset in multiple slots;
automatic layout keeps its stricter no-reuse rule.

This contract is intentionally not connected to the current D1 API yet. The
homepage and admin still use legacy `SiteContent` until a separate compatibility
adapter is reviewed. A document is not a self-contained photo export, and asset
existence and target-Site ownership must later be validated by a site-scoped
resolver or repository.

Theme overrides are outside the executable V1 contract until a closed,
sanitized schema and explicit version-compatibility policy are accepted.

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
`http://127.0.0.1:3001/admin`.

## Public-safe demo data

The repository contains fictional profile, pricing, and contact placeholders.
Replace them locally through `/admin`; never commit real contact details.

Photography assets are intentionally excluded from Git and GitHub:

- `public/photos/`
- `public/og.png`

For local testing, place the generated WebP variants in `public/photos/`. The
repository contains layout code and image metadata only, never the photographs.
When photos are absent, every template keeps its intended composition with
designed text placeholders.

### Import a local photo library

Point the importer at a folder containing photographs. It scans nested folders,
deduplicates identical files by SHA-256, applies EXIF orientation, strips image
metadata, and creates three colour-managed WebP variants per unique photograph:

```bash
npm run photos:import -- --source "<photo-folder>"
```

Generated files stay local in `public/photos/library/`. The browser-safe index is
`public/photos/library-manifest.json`; it contains stable asset IDs, aspect ratios,
orientations, and responsive image dimensions, but no source file names or local
paths. Incremental import state is stored in `.frame-zero/`. Both locations are
ignored by Git. JPEG, PNG, WebP, AVIF, TIFF, HEIC, and HEIF inputs are considered;
actual format support depends on the installed Sharp build. Damaged or unsupported
files are skipped and listed in the command summary.

Imports are additive: choosing the wrong folder, temporarily losing a source file,
or hitting one damaged photograph will not delete assets already used by a saved
homepage. Re-importing the same files reuses their stable SHA-256 assets.

Normal projects keep `public/photos/` as a regular ignored directory. If an
advanced local setup intentionally makes it a junction or symlink, the first run
must explicitly adopt and pin that target with:

```bash
npm run photos:import -- "<photo-folder>" adopt-linked-output
```

Later imports use the normal command. A random owner token plus a hashed target
prevents an accidental or retargeted link from receiving generated files.

After import, open `http://127.0.0.1:3001/admin#library` and click **重新读取素材库**.
For the active template you can then:

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
npm run test:photos
npm run photos:import -- --source "<photo-folder>"
npm run build
npm run check:bundle
npm run check:public
npm run db:generate
```

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
