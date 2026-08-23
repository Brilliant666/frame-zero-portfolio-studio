# PR #25 Limited Closure and Thirteen-Request Stage Review

> - Review date: 2026-08-24
> - Repository: `Brilliant666/frame-zero-portfolio-studio`
> - Pull request: `#25 — fix: continue human-directed product polish`
> - Baseline: `main@dc471795139dc47649368bb37c0178fb77188fea`
> - Branch: `product/prelaunch-manual-polish-02`
> - Pre-closure head: `8f05aa5a1e5fcdde6980396e133f1b1c41a2e4f4`
> - State: `WAITING_FOR_HUMAN_REVIEW`
> - Feature freeze: `TRUE`

This is an additive closure audit. It does not rewrite any human request or
convert automated evidence into human approval. PR #25 remains Open + Draft;
all eleven templates remain `READY_FOR_HUMAN_RECHECK`, with
`HUMAN_APPROVED = 0 / 11`.

## `THIRTEEN_REQUEST_AUDIT_MATRIX`

| HR ID | Human request | Final adopted behavior | Commits | Changed modules | Current implementation status | Superseded behavior | Validation | Remaining human decision | Completely mapped |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HR25-001 | Split Polaroid content behind its three top tabs and enlarge/localize navigation. | One-route Works/Packages/Contact views with Chinese navigation, hash history, focus transfer, responsive sticky behavior, and preview isolation. | `1217584` | Polaroid navigation, TSX, CSS | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Single long page | `polaroid-field-fit`; recorded desktop/mobile browser evidence | Accept navigation and three-view presentation | Yes |
| HR25-002 | Remove hard-coded field-note decoration and unexplained empty marker. | No `FIELD NOTE / 001—009`; availability appears only for non-empty saved content or preview context. | `24c47ad` | Polaroid TSX/CSS | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Hard-coded decorative metadata | `polaroid-field-fit`; recorded public/preview browser evidence | Accept cleaned header | Yes |
| HR25-003 | Reduce Polaroid first-screen whitespace, foreground works, and move booking facts to Packages. | Compact first view; title and intro occupy top corners; a central Works gateway leads into the field; booking facts live on Packages. | `619b25e`, `433303b`, `d32511f` | Polaroid TSX/CSS | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Two earlier first-screen arrangements were iterated by explicit continuations | `polaroid-field-fit`; recorded multi-viewport browser evidence | Accept first-screen hierarchy | Yes |
| HR25-004 | Improve platform/contact editing and safe links without a new formal schema. | Safe credential-free HTTPS recognition; extraction of exactly one safe link from share text; up to eight editable rows; aligned desktop/mobile Admin rows; safe profile links open directly; shared email remains. | `0b74d20`, `42af536`, `5980a03` | `social-links`, Admin contact editor/styles, Polaroid contact | `PARTIALLY_SUPERSEDED` | QQ special case was withdrawn within HR25-004; `LINK_GENERATED_QR` was replaced by HR25-008 | `polaroid-field-fit`; shared renderer and Admin row regressions | Confirm final contact semantics | Yes |
| HR25-005 | Paginate every applicable top-bar template. | Eight templates plus Polaroid regression expose same-route Chinese Works/Packages/Contact views with history, focus, mobile navigation, and preview URL isolation. | `1ac82ad` | Shared navigation hook, eight templates, preview dialog, page/globals | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Anchor-based long-page navigation | `template-section-navigation`; recorded desktop/mobile browser sweep | Accept eight-template navigation | Yes |
| HR25-006 | Preserve portrait orientation in the Neon main viewport. | Selected landscape uses 3:2 and portrait uses 2:3 while the outer HUD and interactions stay intact. | `41e0fd3` | Neon TSX/CSS | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | All selections forced into a horizontal crop | `neon-manga-adaptive-gallery`; recorded orientation/lightbox browser evidence | Accept main-stage framing | Yes |
| HR25-007 | Add visible Film Rail left/right controls. | Accessible edge controls scroll the same rail, expose boundary state, preserve dragging/snap/timeline, and retain focus. | `53246dd` | Film Rail TSX/CSS | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Slider/drag-only access | `photo-layout`; recorded rail-boundary browser evidence | Accept control feel | Yes |
| HR25-008 | Replace generated QR output with uploaded platform sharing cards across all templates. | Optional opaque Legacy/local `social[].qrAssetId`; private normalized PNG; Admin upload/replace/remove reference flow; one shared natural-ratio renderer in all eleven templates; explicit adapter refusal into V1. | `0267ce5`, `aae151f` | Platform asset/service/route/client/attachment, SiteContent, adapter, Admin contact, shared renderer, 11 templates | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Fully replaces HR25-004 `LINK_GENERATED_QR` | Platform QR tests, adapter/SiteDocument tests, shared-renderer checks | Accept local card presentation; hosted resolution remains P1 | Yes |
| HR25-009 | Keep Manga photographs colored before interaction. | Cover and storyboard are colored by default with restrained hover/focus feedback. | `01ca734` | Manga CSS/TSX | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Default grayscale | `neon-manga-adaptive-gallery` | Accept color treatment | Yes |
| HR25-010 | Reorder Manga contact, request, and platform-card content and make email copyable. | Contact then request occupy the left; platform cards stack on the right; email copies like WeChat; mobile becomes one ordered column. | `01ca734`, `be49993` | Manga TSX/CSS, shared platform renderer | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Hidden/open-style email and horizontal/misowned cards | `platform-qr-rendering`; recorded responsive layout evidence | Accept contact-page hierarchy | Yes |
| HR25-011 | Keep the whole Admin top bar present and reduce save/preview confusion. | Fixed complete top bar with one global `保存修改` action; existing PUT, keyboard save, dirty protection, and failure recovery stay intact. | `187f648` | Admin provider/shell/state/CSS, preview ownership | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Redundant global draft-preview action | Admin state/V2/rendered/runtime tests; recorded browser evidence | Accept save interaction | Yes |
| HR25-012 | Preserve portrait orientation in Orbital's active portal. | Eight formal portrait slots remain frozen; the active presentation follows the selected source as 3:2 or 2:3; material guidance matches. | `26c3f2a` | Orbital TSX/CSS/focus, catalog/material profile | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Active image forced horizontal | `orbital-portal-focus`, material profile tests; recorded browser evidence | Accept active-portal framing | Yes |
| HR25-013 | Remove page-level light/dark discontinuity in five paged templates. | Polaroid, Film, Prism, Editorial, and Orbital retain one page canvas tone across all views; inverse tone stays inside local cards/forms/panels. | `7aeb892` | Five template CSS systems | `IMPLEMENTED_READY_FOR_HUMAN_RECHECK` | Page-level black/white view switching | `template-page-style-consistency`; recorded desktop/mobile browser evidence | Accept five canvas systems | Yes |

## `COMMIT_TO_HR_MATRIX`

| Commit | Classification |
| --- | --- |
| `bf6fe31 docs: open next human-directed polish workspace` | Bootstrap |
| `1217584 fix: split polaroid content into views` | HR25-001 |
| `24c47ad fix: clean up polaroid header metadata` | HR25-002 |
| `619b25e fix: bring polaroid work into the first view` | HR25-003 |
| `0b74d20 fix: add QQ and QR contact options` | HR25-004 initial behavior, subsequently narrowed/replaced as recorded |
| `433303b fix: frame polaroid work from the top corners` | HR25-003 continuation |
| `d32511f fix: turn polaroid whitespace into a field gateway` | HR25-003 continuation |
| `42af536 fix: parse polaroid platform share links safely` | HR25-004 final contact/link semantics |
| `5980a03 fix: align platform account fields` | HR25-004 Admin layout continuation |
| `1ac82ad fix: paginate top navigation across templates` | HR25-005 |
| `41e0fd3 fix: respect neon stage orientation` | HR25-006 |
| `53246dd fix: add film rail edge controls` | HR25-007 |
| `0267ce5 fix: add uploaded platform cards across templates` | HR25-008 and removal of link-generated QR |
| `aae151f fix: show platform cards inline` | HR25-008 continuation |
| `01ca734 fix: polish manga contact chapter` | HR25-009 and HR25-010 |
| `be49993 fix: stack manga platform cards` | HR25-010 continuation |
| `187f648 fix: pin admin save controls (HR25-011)` | HR25-011 |
| `26c3f2a fix: respect orbital portal orientation (HR25-012)` | HR25-012 |
| `7aeb892 fix: unify paged template canvas tones (HR25-013)` | HR25-013 |
| `8f05aa5 docs: sync PR25 polish status through HR25-013` | HR25-009 through HR25-013 governance synchronization |
| `d1d4859 fix: fail safe when local platform cards are unavailable` | Closure support: `PLATFORM_CARD_PUBLIC_RENDER_FAILSAFE` |
| `c948887 test: lock platform card environment boundaries` | Closure support: focused environment and deployment-boundary tests |
| `docs: prepare PR25 stage review` | Closure support: PR body/ledger/governance reconciliation (this commit) |

```text
UNMAPPED_PRODUCT_CODE = NONE
UNMAPPED_TEST_CHANGE = NONE
UNKNOWN_COMMIT = NONE
UNAUTHORIZED_SCHEMA_CHANGE = NONE
```

## Platform card architecture and environment matrix

`SiteDocumentV1` is unchanged and still accepts only its frozen social fields.
Legacy/local `SiteContent` alone is extended with optional `social[].qrAssetId`.
The normalized PNG lives in ignored local private state; it is not part of the
Photo Library, Hosted AssetStorage, a formal AssetResolver, `public/`, or the
production image. The legacy adapter continues to return
`unsupported_social_qr_asset`, and the V1 parser continues to report the field
as `unknown_field`.

| Case | Locked behavior |
| --- | --- |
| No `qrAssetId` | Account text and safe link render; no card or card probe. |
| Companion configured and asset available | One HEAD succeeds; natural-ratio PNG and original-image action render. |
| Companion not configured | Route fails closed; no image element or broken icon; account/link remain. |
| Asset 404 | Card is omitted; account/link remain; draft and reference stay unchanged. |
| Route/upstream unavailable | Card is omitted; account/link remain; no retry loop or save. |
| Image GET fails after a successful probe | `onError` removes the card and original-image action. |
| Admin Preview with companion available | It uses the same TemplateRenderer and shared platform renderer. |
| Standard Next without local origin | Homepage remains usable and valid platform-card GET/HEAD requests return 404. |
| Production Caddy | `/api/platform-qr/*` remains under the unreviewed `/api/*` deny rule. |
| Legacy adapter / V1 | Conversion is explicitly blocked; the frozen V1 contract is not widened. |

```text
PLATFORM_CARD_LOCAL_ONLY = ACCEPTED_FOR_LOCAL_PRODUCT_EXPERIENCE
PLATFORM_CARD_PUBLIC_RENDER_FAILSAFE = CLOSED
PLATFORM_CARD_HOSTED_RESOLUTION_PENDING = P1_PRE_DEPLOYMENT
```

## Closure verification evidence

- The complete local gate runs on the repository-required Node.js line
  (`v24.19.0` in the closure environment). `npm test`, ESLint, Standard Next.js
  build/budget, legacy build/budget, public-safety inspection, and
  `git diff --check` pass. The host's unrelated default Node.js `v18.17.0` is
  below `engines.node` and is not accepted as project validation.
- Admin browser smoke confirms one fixed full-width save bar, exactly one
  `保存修改` action, explicit remove-without-auto-save behavior, and the same
  shared card renderer inside the recommendation preview dialog.
- A synthetic repository-neutral platform card was uploaded, deduplicated,
  replaced, previewed, removed from the draft, and restored out of saved
  content after testing. No real user card or private SiteContent was committed.
- Public browser smoke covers all eleven template IDs with the shared platform
  account/card renderer. Polaroid's three views and history, the eight common
  top bars, Neon and Orbital mixed orientation, Film Rail boundaries, Manga
  color/contact ordering, and the five page-canvas systems were rechecked.
- Missing companion, asset `404`, upstream `503`, wrong MIME/network failure,
  and image GET failure all retain account text and a safe profile link without
  a broken image. The isolated unavailable-companion server was stopped after
  the test and the original local SiteContent was restored byte-for-byte.
- Previously recorded 390 px evidence remains the mobile acceptance evidence;
  the current browser-control surface did not expose viewport resizing. CSS and
  focused responsive regressions were rerun in the closure gate.

## Frozen architecture and remaining buckets

- `SiteDocumentV1`, the eleven template IDs, and every template slot count are
  unchanged.
- No PostgreSQL, production Auth, Hosted Assets, hosted upload, production
  AssetResolver, route migration, server, DNS, TLS, or production-data work was
  entered.
- Production Caddy was not widened. The engineering launch line remains
  `FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY`.
- No real account, real QR/share card, photograph, private path, or personal
  SiteContent is committed.

`NEXT_PRODUCT_POLISH_PR` inventory only:

- `ONE_LEVEL_LAYOUT_UNDO`
- `CLEAR_TEMPLATE_CONFIRMATION_AND_UNDO`
- `IMPORT_FAILURE_IDENTIFICATION`
- `DELETE_SEMANTICS_HUMAN_DECISION`
- `CONTINUED_TEMPLATE_BY_TEMPLATE_VISUAL_POLISH`

`PRE_DEPLOYMENT_P1`:

- `PUBLIC_IDENTITY_SSR_MISMATCH`
- `PLATFORM_CARD_HOSTED_RESOLUTION_PENDING`
- `/` and `/star` route identity
- production `AssetResolver`

`P2`:

- drag/drop, bulk management, Asset detail, tags/albums, true reroll, and a
  preview device switcher

`LOCAL_ONLY_FUTURE`:

- source-folder binding, rescan, watcher, and automatic sync

None of these inventories is authorized by this closure.

## Human gate

```text
P0 = 0
ELEVEN_TEMPLATE_HUMAN_VISUAL_APPROVAL = PENDING
HUMAN_APPROVED = 0 / 11
PR25_FEATURE_FREEZE = TRUE
HR25-014 = NOT_STARTED
CURRENT_HAND_OFF = WAITING_FOR_HUMAN_REVIEW
```

Automated tests, CI, screenshots, browser smoke, a clean console, or a PR merge
do not mean `HUMAN_APPROVED`. The next action is a human decision to accept the
PR #25 batch or request one final bounded fix.
