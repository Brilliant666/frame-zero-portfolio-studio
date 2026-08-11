# Pre-launch Product Polish

> - Active priority: `PRE_LAUNCH_PRODUCT_POLISH`
> - Product priority: `LOCAL_PRODUCT_EXPERIENCE`
> - Engineering launch line: `FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY`
> - External operations: `NOT_AUTHORIZED`
> - Base: `main@e40c7514efeb50a66a7836eb41272f682b395a4c`

This temporary product-experience lane improves the local photographer journey
before real deployment resumes. It does not replace the Portfolio Platform
North Star, create a new architecture Stage, or mark Stage A2 complete.

The formal project state remains:

```text
SELF_HOSTED_V1
STAGE_A2_DEPLOYMENT_BOOTSTRAP
IN_PROGRESS
NOT_ONLINE_PREVIEW
```

## Frozen engineering launch line

The following accepted repository-side evidence remains intact:

- Standard Next.js Node standalone;
- production health contracts;
- non-root, read-only Linux container packaging;
- server-only deployment configuration;
- Compose and Caddy repository bootstrap;
- application/proxy logging;
- deploy, update, rollback, and Linux lifecycle CI;
- Public repository safety.

No target-server preflight or deployment is authorized. This lane does not
start PostgreSQL, Better Auth production integration, hosted AssetStorage,
hosted upload, DNS, TLS, production data, or `photo.cosflow.icu` work.

## Active product journey

The batch optimizes this explicit local workflow:

```text
open Admin
-> add photos or a folder
-> understand import progress and outcomes
-> see the updated Photo Library
-> browse all eleven templates
-> understand each template's material needs
-> preview a deterministic arrangement using the current library
-> see material shortages
-> explicitly apply a preferred arrangement to the local draft
-> continue manual editing
-> explicitly save all changes
```

Preview remains separate from selection, draft mutation, and persistence:

```text
preview != selection
selection != save
```

## Execution order

1. `PHASE_A_FILE_FOLDER_IMPORT_EXPERIENCE`
2. `PHASE_B_TEMPLATE_MATERIAL_REQUIREMENTS`
3. `PHASE_C_REAL_TEMPLATE_PREVIEW_COMPOSITION`
4. `PHASE_D_ELEVEN_TEMPLATE_VISUAL_QA`

The batch first makes photo ingest understandable, then derives material
profiles from each template's actual implementation, then reuses the accepted
pure Composition planner for read-only preview and explicit application, and
finally performs differentiated real-photo visual QA across all templates.

## Architecture invariants

This lane preserves:

- all eleven template IDs;
- `SiteDocumentV1` without a `variantId` addition;
- stable Site and Asset identity contracts;
- Site ownership and legacy-adapter boundaries;
- `Save != Publish` and `Public != Draft`;
- local importer privacy and additive Photo Library behavior;
- the accepted pure Composition contract and planner;
- explicit user confirmation before draft mutation;
- no automatic persistence from preview or layout application.

Template material profiles and preview recommendations are presentation-only,
non-persistent metadata. If a useful preview would require changing
`SiteDocumentV1` or formal Composition persistence, work stops at the relevant
architecture decision gate.

## Real-library composition preview

Phase C connects the accepted pure Composition assignment engine to a local-only,
ephemeral `classic-preview` registry derived from each material profile. It is
not a production Variant registry and its ID is never written to SiteContent or
`SiteDocumentV1`. The preview:

- reads the validated local photo manifest without uploading it;
- evaluates all formal slots deterministically, including compatible existing
  intent, explicit locks, critical slots, and supported secondary crop targets;
- uses the same Composition assignment algorithm as the planner foundation; the
  preview does not introduce a second matcher or run Variant recommendation;
- preserves placeholders instead of forcing the wrong orientation;
- reports the exact number of used photos and recommended landscape, portrait,
  square, or primary-visual shortages;
- renders both a compact slot map and the real formal template in a modal using
  the user's current content and local derivatives;
- preserves the formal template's photo lightbox and copy interactions inside
  the read-only preview;
- leaves template selection, `activeTemplate`, `templateWorks`, dirty state,
  and persistence untouched while browsing.

Only the explicit **Apply layout to draft** action copies the reviewed mapping
into `templateWorks[templateId]`. It does not select that template and does not
save; the existing global **Save all changes** boundary remains authoritative.

## Local source-folder boundary

Browser folder selection is a one-time import. It does not provide a reliable
host absolute path and must not be presented as a permanently bound folder.
Any future `BIND_LOCAL_SOURCE_FOLDER` capability would require a trusted local
companion contract that stores the absolute path only in local-only state,
never in Git, SiteContent, the public manifest, client bundles, production
artifacts, or a hosted service. Until that contract is proven, it remains
`LOCAL_SOURCE_BINDING_FOLLOWUP`.

Phase A browser evidence covered single-file, duplicate, multiple-file, nested
folder, invalid-image, ignored-file, refresh, and re-entry paths. It also found
and fixed a Windows-specific lifecycle defect where libvips could retain a
temporary WebP file after the manifest commit, causing the committed asset to be
misreported as failed. The importer now avoids caching source file descriptors,
and a transient cleanup lock is retried without changing the committed import
result.

## Template material profiles

Phase B derives a presentation-only `TemplateMaterialProfile` for every formal
template from its renderer, fixed slot plan, CSS crop surfaces, and responsive
behavior. The eleven profiles deliberately do not share a generic “first nine
photos” requirement. They record:

- minimum, recommended, and maximum useful photo counts;
- landscape, portrait, and square source demand;
- hero/cover and other high-priority slots;
- the formal ordered slot aspect targets;
- secondary display crops that differ from assignment slots;
- crop pressure and the actual mobile layout strategy.

Examples of the intentional differences include the all-landscape Film Rail,
the all-portrait Orbital Portal whose active image is also shown in a 3:2
viewport, the twelve-item Archive OS, the central portrait in Polaroid Field,
and Character Select's square roster crops. Admin template browsing shows the
profile for the currently inspected candidate without selecting a template or
changing the shared draft. The profile is not imported by `SiteDocumentV1`, the
legacy adapter, a renderer, or persistence code.

## Deployment topology follow-up

`DEPLOYMENT_TOPOLOGY_FOLLOWUP` is recorded for the future resumption of the
engineering launch line. The repository-side Caddy topology currently binds
80/443, but a real shared server should first be preflighted for this preferred
shape:

```text
existing host reverse proxy
-> 127.0.0.1:<FREE_HIGH_PORT>
-> Portfolio Platform
```

No port is selected now. Existing deployment code is retained, and this note
does not authorize server, firewall, DNS, TLS, or proxy changes.

## Stop gates

- `SITE_DOCUMENT_DECISION_REQUIRED` if `SiteDocumentV1` must change.
- `COMPOSITION_PERSISTENCE_DECISION_REQUIRED` if preview requires formal
  Variant persistence.
- `OUT_OF_LOCAL_PRODUCT_POLISH_SCOPE` if hosted upload is required.
- `OUT_OF_CURRENT_PRODUCT_LANE` if a production database is required.
- `P0_BLOCKER_FOUND` for data loss, secret exposure, or destructive behavior.

Real photos, manifests, absolute paths, screenshots, personal contact details,
and real SiteContent may be used only as local validation inputs and are never
committed.
