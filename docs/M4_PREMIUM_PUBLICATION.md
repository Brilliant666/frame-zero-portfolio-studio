# M4 first slice: premium publication

## PR33 后续连接（2026-09-28）

本 PR 已扩展基础 11 模板发布，以及两空间“保存并发布”，完整证据见
[PR33 功能收口](PR33_FUNCTIONAL_CLOSURE.md)。以下 first slice 保留为历史事实。

- `0004_basic_publications` 仅放宽空间约束，保留不可变历史和一个 Site Published 指针。
  基础仅要求真实所有者与合法基础模板；高级及其历史回退继续要求高级授权。
- 基础发布投影仅冻结当前实际槽位、启用套餐和有效联系项，不公开其他模板的作品配置。
- 普通保存仍只保存草稿。组合操作先捕获原指针与编辑快照，再按原保存回执的精确 revision 发布。
  保存中新增编辑保留；版本漂移拒绝；不确定结果只读核对，不自动重写。
- 同一 `/:siteSlug` 根据 Published.space 渲染真实基础或高级 Renderer；metadata 与页面共用快照。
  当前公开摘要区分空间、模板、版本与记录 ID，不能以相同 revision 数字判定跨空间同步。
- 隔离库升级、空库、旧高级历史读取与回退已验证；**日常业务库未迁移**。
  后续迁移需另行授权和业务备份，显式执行现有 account migration 工具，不能由候选启动暗中迁移。
  迁移本身不改变草稿或 Published 指针；切公开模板仍需用户发布操作。

发布只能使用当前白名单的展示变体。回退不保存草稿，移除资源引用不删除文件，
旧页面引用已被新公开版本移除的图片仍可能返回 404。

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
