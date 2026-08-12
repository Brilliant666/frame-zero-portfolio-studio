# Pre-launch Product Polish

> - Active priority: `PRE_LAUNCH_PRODUCT_POLISH`
> - Product priority: `LOCAL_PRODUCT_EXPERIENCE`
> - Engineering launch line: `FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY`
> - External operations: `NOT_AUTHORIZED`
> - Product experience foundation: `ACCEPTED`
> - Automated visual QA baseline: `ACCEPTED`
> - Human-directed product polish: `NEXT`
> - Eleven-template human visual approval: `PENDING`
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

## Acceptance boundary

Human review accepts the file/folder import foundation, differentiated material
profiles, deterministic real-library composition preview, explicit draft apply
boundary, and automated/assisted visual-QA baseline. It does **not** mark
`PRE_LAUNCH_PRODUCT_POLISH` complete, approve the final visual treatment of any
formal template, or replace a template-by-template human aesthetic review.

```text
PRODUCT_EXPERIENCE_FOUNDATION = ACCEPTED
AUTOMATED_VISUAL_QA_BASELINE = ACCEPTED
PRE_LAUNCH_PRODUCT_POLISH = IN_PROGRESS
HUMAN_DIRECTED_PRODUCT_POLISH = NEXT
ELEVEN_TEMPLATE_HUMAN_VISUAL_APPROVAL = PENDING
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

These four phases establish the accepted foundation and automated baseline:
photo ingest semantics, implementation-derived material profiles, reuse of the
accepted pure Composition planner for read-only preview and explicit apply, and
differentiated real-photo QA across all templates. Human-directed polish remains
the next step.

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

## Eleven-template material requirement matrix

The requirements below come from the formal slot plans and real renderer crop
surfaces. Counts are recommendations, not an instruction to consume every
photo in the library.

| Template | Useful / recommended / max | Best source mix | Primary visual | Material-sensitive behavior |
| --- | --- | --- | --- | --- |
| `cinematic-light` | 4 / 9 / 9 | 8 landscape + 1 portrait | slot 1, full-width cinematic hero | Cover crops need lateral breathing room. |
| `neon-hud` | 4 / 9 / 9 | 8 landscape + 1 portrait | current HUD target | Any indexed image can reappear in a critical 16:9 viewport. |
| `film-rail` | 4 / 9 / 9 | 9 landscape | opening film frame | A coherent landscape series matters more than raw library size. |
| `manga-panels` | 4 / 9 / 9 | 8 landscape + 1 portrait | portrait cover, then wide chapters | The cover needs clean vertical title space. |
| `prism-liquid` | 4 / 9 / 9 | 8 landscape + 1 portrait | opening prism plus panorama | Clipped edges amplify unsafe subject placement. |
| `orbital-portal` | 4 / 8 / 8 | 8 portrait | active portrait in the portal | The same source also enters a critical 3:2 secondary crop. |
| `archive-os` | 6 / 12 / 12 | 11 landscape + 1 portrait | initial Quick Look selection | Density is part of the identity; the list also crops to 16:9. |
| `editorial-duet` | 4 / 9 / 9 | 8 landscape + 1 portrait | portrait cover plus three feature spreads | A consistent editorial series makes intentional whitespace work. |
| `polaroid-field` | 5 / 9 / 9 | 8 landscape + 1 portrait | central `FRAME 05` portrait | Rotation affects fit bounds even when the slot crop is correct. |
| `character-select` | 5 / 9 / 9 | 6 landscape + 1 portrait + ideally 2 square | selected fighter stage | Every source also enters a 1:1 roster crop. |
| `museum-depth` | 4 / 7 / 7 | 6 landscape + 1 portrait | entrance-hall artwork | Desktop frames favor contain; the entrance and mobile still cover. |

## Real-photo visual QA

Phase D used the local Photo Library only as an uncommitted validation input.
Five bounded material scenarios were exercised: landscape-heavy,
portrait-heavy, balanced, small library, and full library. Every scenario ran
all eleven templates at 1440x900, 1024x768, 390x844, and 320x720, for 220
template/viewport checks. The matrix checked visual hierarchy, image rhythm,
portrait safety, crop pressure, orientation fit, density, typography balance,
scroll behavior, horizontal overflow, broken images, and browser console
errors. No screenshots, manifest data, photo identifiers, paths, or real
SiteContent are committed.

This matrix is evidence for implementation stability, responsive stability,
material-fit behavior, obvious crop-defect discovery, and an automated/assisted
visual-inspection baseline. It is not final human aesthetic approval.

### `11_TEMPLATE_VISUAL_QA_MATRIX`

| Template | Photo demand / best mix | Hero behavior | Desktop | Mobile | Crop risk | Visual quality | Changes made | Remaining issue | Variant candidate? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cinematic-light` | 9; landscape-heavy with one portrait | Strong single opening frame | Clear cinematic hierarchy at 1440 and 1024 | Hero shortens cleanly before stacked archives | High, but real subjects remained legible with current focus | Strong when the first landscape has safe negative space | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Poorly focused edge subjects remain user-material sensitive | No |
| `neon-hud` | 9; landscape-heavy with one portrait | Selected asset becomes a 16:9 HUD target | Dense telemetry stays subordinate to the image | Stacked target, data, and index remain scannable | High because every asset may become the target | Strong and deliberately technical | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Portrait-heavy libraries produce placeholders and harder target crops | No; current shortage feedback is sufficient |
| `film-rail` | 9 landscapes | First frame establishes the sequence | Long editorial rail has confident rhythm | Horizontal rail remains intentional and reachable | Medium when source ratios match | Strong with a coherent landscape series | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Small libraries leave a sparse opening sequence by design | No |
| `manga-panels` | 9; one strong portrait plus landscapes | Portrait cover anchors subsequent chapters | Panels preserve a distinct comic reading order | Chapters collapse into an effective vertical story | Medium; cover needs headroom | Strong for balanced and portrait-led sets | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Landscape-only sets cannot replace the missing cover portrait gracefully without changing the design | No |
| `prism-liquid` | 9; landscape-heavy with one portrait | Prism hero and panorama share emphasis | Asymmetric clips stay visually controlled | Stacked cards retain the liquid identity | High at clipped corners | Good to strong when subjects avoid edges | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Edge-weighted portraits remain material-sensitive | No |
| `orbital-portal` | 8 portraits | Active portrait is projected into a wide 3:2 portal | The portal has clear dominance, but default centre crop originally removed the subject's head | The same crop defect was visible at 390 until corrected | High: formal 2:3 slots and critical 3:2 presentation compete | Good after targeted subject-safety correction; exceptional with suitable environmental portraits | Default-centred portrait gets a portal-only `50% 32%` focus; explicit Admin focus and orbit thumbnails remain untouched | A single focus cannot always optimize both portrait card and wide portal | **Yes — `VARIANT_CANDIDATE`**, no persistence change in this batch |
| `archive-os` | 12; dense landscape set plus one portrait | Initial Quick Look is a focal inspector, not a conventional hero | Three-pane density reads as an asset workstation | Pane switching preserves access without shrinking the desktop metaphor | Medium across grid/list secondary crops | Strong with a full library; deliberately utilitarian when small | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Small libraries visibly reduce the intended archive density | No |
| `editorial-duet` | 9; landscape series plus portrait cover | Cover opens into spacious feature spreads | Large whitespace reads as editorial pacing | Blank intervals are more noticeable but remain coherent | Medium and aligned with formal slots | Refined with consistent material; restrained rather than dense | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Mixed visual series weaken the intended duet more than other templates | No |
| `polaroid-field` | 9; landscape constellation around one portrait | `FRAME 05` remains the central scale and z-order anchor | FIT presents the complete constellation; the first viewport intentionally opens with typography | Mobile grid keeps all work reachable | Medium; rotation is included in FIT geometry | Distinctive and playful with a full set | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Users expecting an immediate photo hero may find the text-led first fold surprising | No |
| `character-select` | 9; mixed set, ideally including squares | Selected fighter owns the stage while roster drives choice | Stage and roster are readable with the full library | Horizontal roster keeps selection reachable | High because all roster entries are 1:1 | Strong with face-safe material; usable placeholders when small | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | `REAL_SQUARE_HEAVY_VALIDATION_PENDING`; 1:1 secondary crops remain a material gap | **Yes — `VARIANT_CANDIDATE`** for future design review only |
| `museum-depth` | 7; six landscapes plus one portrait | Entrance art establishes a gallery journey | Contained frames and depth produce calm rhythm | Sequential full-width exhibits remain legible | Medium; mobile and entrance use cover | Strong and differentiated at both densities | `NO_BLOCKING_DEFECT_FOUND_IN_BASELINE_QA` | Very small libraries make the gallery intentionally quiet rather than richly curated | No |

The automated matrix found no document-level horizontal overflow, broken
images, hydration errors, or page console errors/warnings. Visual inspection
found no blocking defect in the other ten templates at this baseline gate;
that result is not `HUMAN_APPROVED`. Orbital Portal was the one evidence-backed
defect: a default-centred portrait lost its head when reused in the wide portal.
The fix is deliberately limited to that secondary presentation and preserves
explicit user focus. Orbital remains `ORBITAL_VARIANT_CANDIDATE`, and final
human visual polish remains pending for all eleven templates.

## Human-directed product polish follow-up

The product-experience follow-ups currently have these states:

- `ONE_LEVEL_LAYOUT_UNDO_FOLLOWUP` is a `P1_PRODUCT_EXPERIENCE_FOLLOWUP` for
  explicitly applied recommended layouts;
- `MATERIAL_PROFILE_INFORMATION_HIERARCHY_REVIEW_PENDING` was addressed by
  HR-008: the candidate identity now precedes its structure diagram, and one
  slot-direction plan drives both the summary and material guidance. Human
  recheck of the resulting hierarchy remains pending;
- `LOCAL_SOURCE_BINDING_FOLLOWUP` remains separate from one-time folder import;
- `ORBITAL_VARIANT_CANDIDATE` remains a design study after the accepted
  portrait-safety fix;
- `CHARACTER_SELECT_VARIANT_CANDIDATE` and
  `REAL_SQUARE_HEAVY_VALIDATION_PENDING` require real material and human review;
- `P2_CI_MAINTENANCE` retains the non-blocking underlying Node 20 deprecation
  warning from `actions/checkout@v4` and `actions/setup-node@v4`; required CI is
  still green, so Actions major upgrades stay outside this closure;
- spacing, crop, hierarchy, typography, mobile, import wording, and preview/apply
  details remain subject to template-by-template human direction.

No template has final human visual approval, and this foundation does not mark
`PRE_LAUNCH_PRODUCT_POLISH` complete.

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
