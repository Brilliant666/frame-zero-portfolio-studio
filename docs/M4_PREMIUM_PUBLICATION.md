# M4 first slice: premium publication

> 历史阶段记录：保留当时范围、失败与验收事实；当前能力、合并、运行及授权
> 以 [CURRENT_STATUS](CURRENT_STATUS.md) 和 [SESSION_HANDOFF](SESSION_HANDOFF.md) 为准。
> 下文当时的 Draft、环境缺口或“未完成”不自动构成当前阻塞。

Date: 2026-09-28. User explicitly allowed extending PR31; no merge or remote
deployment was authorized. This is not completion of all M4/basic publishing.

## Delivered

- Retained the keyboard skip link. Added clipping while unfocused so off-screen
  painted pixels cannot appear in theme-transition snapshots; focus restores it.
  Original intermittent flash was not reproduced in the initial automated pass;
  post-change frame checks and keyboard navigation are recorded separately.
- Existing premium editor has Publish saved draft, public-page link, publication
  history and rollback. Unsaved/conflicting edits cannot publish. Publishing does
  not save or overwrite edits; rollback does not mutate the current draft.
- Immutable PostgreSQL revisions and a Site-scoped pointer. Transactions check
  owner, grant, expected draft revision, expected pointer, asset ownership and
  readable display variants. Concurrent same-pointer requests cannot both win.
- Public SSR and metadata share one cached snapshot, not Draft or legacy data.
  The existing polaroid experience supplies themes, collections and viewer.
- Public asset route permits only currently published references and
  thumbnail/card/full. Hidden collections, unreferenced assets, original files
  and the private asset manifest are not opened. Public variant URLs bypass the
  old local-only resize helper.
- Existing local Node runner keeps unavailable/invalid request status and the
  owner-only unpublished acceptance shortcut; Published takes precedence.

## Local verification

- Standard Next 16.3.3 production build and TypeScript passed.
- Real isolated PostgreSQL HTTP suite: 25/25, including publication, restart,
  rollback, immutable rows, same-pointer concurrency, cross-Site real history ID,
  basic-only grants, cross-origin writes, logout and expired-session rejection.
- Admin regression: 49/49. Theme/navigation/local acceptance: 8/8. Entry-photo
  source regression: 3/3. ESLint passed (existing tooling diagnostic retained).
- Headed Chrome 154: actual editor Publish, anonymous public images, 1440/390
  paper/night, persisted night, keyboard skip, collection and viewer passed.
- Local simulated star premium revision 1 was published with 27 display assets
  (3 collections / 25 members and 2 platform cards). This is not a real customer
  provisioning claim and not remote deployment.
- Daily PostgreSQL was backed up outside the repo before additive migration.
  Hashes of all 4 drafts and all 44 resource records match before/after; original
  3001, private photo source, old SQLite and import receipts were not modified.
- Aggregate public CSS 307301 bytes vs reference 307200 is a reviewed WARNING,
  not a product failure. Individual template hard limits remain satisfied.

Private screenshots, browser reports, database backup and hashes stay under the
existing protected local-m3 directory, never in this public repository.

## Boundaries

Basic-template publishing remains unconnected. Original archive is still
incomplete; public display does not imply source-original completeness. An old
open page may receive 404 for an asset removed by a newer publication: authorization
uses the current Published whitelist, not all historic/private resources.
New work needs its own final-head CI; prior PR31 greens do not verify this diff.
