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

## Private image workflow

Photography assets are intentionally excluded from Git and GitHub:

- `public/photos/`
- `public/og.png`

For local testing, place the generated WebP variants in `public/photos/`. The
repository contains layout code and image metadata only, never the photographs.
`npm run check:assets` also fails if these paths ever enter a reachable Git commit.

## Useful commands

```bash
npm run lint
npm test
npm run build
npm run db:generate
```

Content settings are stored in D1. Local development uses the project-local
Miniflare database; hosted deployments use the logical `DB` binding declared in
`.openai/hosting.json`.

## Private repository publishing

The Windows publishing script creates the private GitHub repository, verifies
that every required template branch exists, runs the private-asset gate, pushes
the V1 and all template branches individually, and makes
`codex/template-gallery` the default branch:

```powershell
.\scripts\publish-private-repo.ps1
```

It requires an authenticated GitHub CLI session for the `Brilliant666`
account. Never add photographs to Git to make the remote preview self-contained.
