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
content document, so switching the layout never duplicates profile, package,
contact, or work metadata.

## Local development

Requires Node.js `>=22.13.0`.

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

`npm run check:public` fails if photographs, local Windows paths, WeChat storage
identifiers, non-placeholder email addresses, Chinese mobile numbers, or common
credential formats appear in the worktree, index, or reachable Git history.

## Useful commands

```bash
npm run lint
npm test
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
