# Local legacy import operator procedure

This is an operator-only, non-publishing command. It is not an HTTP import API.
Do not execute against real content until the user-authorized identity, backup,
empty-target and ownership conditions are met. A missing local PostgreSQL or
real `star` account blocks apply, not fixture/CI development.

Use the project's supported Node 22.13 or later and the existing account environment. Keep the following JSON outside
the repository, with real paths filled in locally (never paste it into a PR):

```json
{
  "siteSlug": "star",
  "siteId": "<the existing verified star Site UUID>",
  "confirmSourceOwner": "star",
  "sqlitePath": "<absolute source SQLite file>",
  "photosRoot": "<absolute directory containing library-manifest.json>",
  "qrRoot": "<absolute existing platform-qr-assets directory>",
  "snapshotRoot": "<new absolute private backup directory outside repository>"
}
```

Set `FRAME_ZERO_SITE_ASSET_ROOT` to the persistent private asset root, separately
from this backup. Neither directory belongs in public, dist or a build output.
On Windows, restrict the backup/config directory ACL to the current local user;
POSIX mode bits alone are not a Windows ACL guarantee.

```text
node --env-file=.env.accounts.local scripts/site-legacy-import.mjs export <config.json>
node --env-file=.env.accounts.local scripts/site-legacy-import.mjs dry-run <config.json>
node --env-file=.env.accounts.local scripts/site-legacy-import.mjs apply <config.json>
```

`export` uses SQLite's `VACUUM INTO` with a bound target path, including committed
WAL state. It does not depend on the newer `node:sqlite.backup` API. It verifies
the backup's `integrity_check` and compares source records before/after export
with the snapshot; concurrent changes abort the export. The
backup's records 1 and 2601 remain independent and retain their original raw
envelopes, revision and timestamp evidence. It copies the manifest's three
existing variants and referenced platform cards without recompression. Missing
originals are explicitly `legacy-derived-only`; a full variant is never claimed
as an original. Any original files/catalog outside the manifest remain in the
old source and require separately confirmed original mappings before claiming
full-original migration. No old file is deleted.

The default `complete` mode retains its hard original-source gate: if a resource remains
`legacy-derived-only` or lacks an original mapping, `dry-run` reports
`PARTIAL_SOURCE` with `UNRESOLVED_ORIGINALS_NOT_IN_MANIFEST` in `unresolved`.
It does not claim `DRY_RUN_VERIFIED`. Real `apply` stops before any target file
or draft writes. The current manifest-only
export therefore cannot authorize full real-star import. Confirming and adding
the external original mappings requires follow-up work; existing sources stay
untouched in the meantime.

## Local display acceptance (explicit operator mode)

`LOCAL_M3_HANDS_ON_ACCEPTANCE_01` separately authorizes verified existing display
resources to enter the confirmed real star's private drafts without waiting for
original archival. Use the same exported snapshot and persisted plan (do not
generate new IDs or discard an earlier plan):

```text
node --env-file=.env.accounts.local scripts/site-legacy-import.mjs dry-run <config.json> --mode=display-acceptance
node --env-file=.env.accounts.local scripts/site-legacy-import.mjs apply <config.json> --mode=display-acceptance
```

This is not a force/ignore-errors mode. All three display variants must be
present and pass the same actual-file hash, path and metadata checks. The real
star owner, premium grant, empty target, strict lossless document validation,
source freshness and per-Site reference checks are unchanged. Missing variants,
tampered bytes, foreign resources and occupied target content still block.

Reports distinguish `DISPLAY_DRY_RUN_VERIFIED` from complete-source verification;
`originalArchive=INCOMPLETE` and original-source unresolved evidence remain when
originals are absent. The database import receipt records
`operatorMode=display-acceptance`, per-resource `provenance=legacy-derived-only`
and `originalStatus=unavailable/not-mapped`. No original variant is generated,
no upload behavior changes, and an original request returns 404 instead of
falling back to full. Both independent drafts remain unpublished.

Omitting the mode or using `--mode=complete` keeps the original blocking rule.
Display acceptance is only a local operator command, not a browser flag or
public migration endpoint. Post-import repeats remain idempotent and preserve
later edits. Original archival is a separate incomplete milestone.

An independently user-approved omission of broken legacy top-level basic works
can be expressed in the private operator config as `approvedBasicOmissions`:
`{ "sourceFingerprint": "<snapshot fingerprint>", "workDigests": ["<SHA-256 of JSON.stringify(exact source work)>"] }`.
Every approved digest must identify exactly one source work without an asset ID,
whose old `photo-N-full.webp` / `photo-N-card.webp` references are still absent.
Unknown/duplicate approvals, changed source fingerprints and recovered source
files block. This is only available in display acceptance, never an automatic
missing-file filter. Only approved top-level `basic.works` entries are omitted
in the target; templateWorks and premium collections cannot be omitted this way.
The immutable raw backup retains all source fields, and plan, local report and
database receipt retain each exact original work, index, digest and reason.

`snapshot.json` is written last: an export without it is incomplete. The bundle
contains the standalone readable SQLite backup, raw source content/manifest,
resource evidence and byte-verified files. An export directory is never reused
or overwritten. Do not restore a whole old snapshot over newer edits.

`dry-run` checks the real completed `star` identity and Site, strict content
schemas and target conflicts. It persists random stable resource IDs once in
`import-plan.json`, plus a local report. Reports include source fingerprints,
source revisions, per-space scope, mappings, new resource counts and conflicts.
Keep the same plan for retries. A target with any existing draft or colliding
asset, without the matching completed import receipt, is rejected; do not clear
the target to make it pass.

`apply` checks current source records, manifest and file hashes against the
snapshot again. Pause human source editing during this operation and repeat the
source comparison before local port cutover. All target files are verified and
atomically made available before one PostgreSQL transaction commits assets,
both independent drafts and the import receipt. No Published pointer changes.
An interrupted database transaction leaves no dangling draft references. Fully
prepared files remain available for the exact-plan retry, not broad cleanup.
Temporary copies belonging to the current attempt alone are removed.

Repeating a completed plan reports `ALREADY_IMPORTED` and preserves subsequent
manual edits. A new plan cannot overwrite populated content. Collection IDs,
order, member order, cover/focus identities, display settings and business fields
are retained; only asset IDs and resolved legacy image URLs are adapted. Image
URLs are resolved by the authorized Site asset DTO, not stored in documents.

Anonymous coverage: `tests/legacy-site-import.test.mjs` and
`tests/site-legacy-import-integration.mjs`. Real PostgreSQL coverage includes a
failure after draft insertion, rollback, byte-identical retry, idempotence and
preservation of later edits. These are not real-star migration evidence.
Those library-level fixtures deliberately verify derivative-copy semantics;
they do not bypass the separate real-operator original-source gate, covered by
`tests/legacy-import-source-gate.test.mjs`.
