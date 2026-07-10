# FRAME//ZERO Portfolio Studio

A multi-template Cosplay photography portfolio with a shared content admin.

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
