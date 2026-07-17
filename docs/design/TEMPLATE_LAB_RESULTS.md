# Template Lab Results

Date: 2026-07-18

Status:

- `EXPERIMENTAL`
- `NOT REGISTERED`
- `NOT SITE_DOCUMENT_V1 COMPATIBLE`
- `DO NOT PERSIST`

This report records the five runnable studies that passed the staged
DESIGN-00 / TEMPLATE-LAB-00 gates. It evaluates experiments, not product
templates. None of these IDs is a stable template identity, none is selectable
by the production site, and no recommendation below authorizes registration or
persistence.

The result set follows the research in [REFERO_RESEARCH.md](./REFERO_RESEARCH.md),
the formal-template comparison in
[TEMPLATE_GAP_MATRIX.md](./TEMPLATE_GAP_MATRIX.md), the shared quality floor in
[FRAME_ZERO_DESIGN.md](./FRAME_ZERO_DESIGN.md), and the scored selection in
[TEMPLATE_LAB_DECISION.md](./TEMPLATE_LAB_DECISION.md).

## Final result set

| Stage | ID | Name | Primary browsing model | Slots and ratios | Route |
| --- | --- | --- | --- | --- | --- |
| A | `quiet-focus` | Quiet Focus | Full-screen sequential focus | 5: `16:9`, `2:3`, `3:2`, `2:3`, `16:9` | `/template-lab/quiet-focus` |
| A | `split-register` | Split Register | Split-column indexed directory | 8: `2:3`, `3:2`, `3:2`, `16:9`, `2:3`, `3:2`, `16:9`, `2:3` | `/template-lab/split-register` |
| B | `poster-chapters` | Poster Chapters | Poster-led vertical chapter scroll | 6: `2:3`, `16:9`, `3:2`, `2:3`, `16:9`, `3:2` | `/template-lab/poster-chapters` |
| B | `axis-atlas` | Axis Atlas | Semantic two-axis photography atlas | 9: `2:3`, `3:2`, `16:9` repeated three times | `/template-lab/axis-atlas` |
| C | `stacked-scenes` | Stacked Scenes | Ordered sticky card stack | 5: `16:9`, `2:3`, `3:2`, `2:3`, `16:9` | `/template-lab/stacked-scenes` |

The five primary models are intentionally different. They also differ in page
structure, navigation, information density, spatial model, typography, and
mobile adaptation; they are not color variants of one shared layout.

## `quiet-focus` / Quiet Focus

- **Design goal:** make one photograph and one caption the complete decision
  surface for each viewport, with an explicit next step and no competing grid.
- **Source-principle summary:** transfer restraint, strong negative space,
  editorial pacing, and image-first hierarchy without copying any source's
  brand, copy, typography tokens, or page structure.
- **Slots:** five; `16:9`, `2:3`, `3:2`, `2:3`, `16:9`.
- **Desktop behavior:** a contained viewport-height vertical sequence keeps one
  frame dominant while a frame index and caption rail remain separate from the
  image plane.
- **Tablet behavior:** the caption rail narrows while the same deterministic
  frame order remains available.
- **Mobile behavior:** the layout becomes a direct vertical reading sequence;
  captions remain below the media plane and the 320px viewport has no document
  overflow.
- **Motion:** a restrained entrance and native scrolling; transform/opacity
  effects are disabled or neutralized by reduced-motion rules.
- **Accessibility:** native anchors, focusable sequence and frames, visible
  focus, one `h1`, ordered headings, semantic articles, labelled placeholders,
  and boundary scroll chaining that lets users leave the full-screen sequence
  for the design brief.
- **Known limitations:** viewport-scale pacing is deliberately slow and may be
  too sparse for clients who need immediate comparison across many works.
- **Future productization recommendation:** advance to human comparison, but
  first test real portrait focal points and long localized captions.
- **Formal-template overlap risk:** low-to-medium. It shares cinematic restraint
  with `cinematic-light` and sequential viewing with `film-rail`, but replaces
  their composition with one contained vertical focus sequence and an external
  caption rail.

## `split-register` / Split Register

- **Design goal:** let visitors scan an exact numbered directory and inspect a
  ruled image ledger without turning the portfolio into an operating-system
  simulation.
- **Source-principle summary:** transfer Swiss-like ordering, publication
  indexes, visible rules, and compact metadata while keeping the photographic
  field larger than the navigation apparatus.
- **Slots:** eight; `2:3`, `3:2`, `3:2`, `16:9`, `2:3`, `3:2`, `16:9`, `2:3`.
- **Desktop behavior:** a sticky directory sits beside an image ledger and a
  dedicated annotation track.
- **Tablet behavior:** the directory remains available beside a simplified
  image-and-note track.
- **Mobile behavior:** the jump index wraps above a complete document-order
  ledger; all eight entries remain reachable at 320px without horizontal
  overflow.
- **Motion:** only short hover/focus translations and opacity changes; reduced
  motion removes nonessential transitions.
- **Accessibility:** native jump links, focusable ledger articles, visible
  focus, semantic `nav`/`ol`/`article`/`figure`, ordered headings, and captions
  that do not depend on the placeholder image.
- **Known limitations:** the directory and metadata deliberately raise
  information density; small portfolios may not justify that apparatus.
- **Future productization recommendation:** advance to human comparison for
  archive-heavy photographers; validate touch target density with real titles.
- **Formal-template overlap risk:** medium with `archive-os`. The overlap is
  controlled by using a publication register and ordinary document flow rather
  than windows, desktop metaphors, or simulated applications.

## `poster-chapters` / Poster Chapters

- **Design goal:** turn each work into a vertical poster chapter whose type
  supplies orientation while leaving the central image focal plane clear.
- **Source-principle summary:** transfer oversized hierarchy, poster rhythm,
  high-contrast color roles, and chapter pacing without copying a campaign,
  logo, proprietary font, or source composition.
- **Slots:** six; `2:3`, `16:9`, `3:2`, `2:3`, `16:9`, `3:2`.
- **Desktop behavior:** six viewport-scale chapters alternate left-edge,
  right-edge, and horizon-led structures rather than repeating one grid.
- **Tablet behavior:** chapter geometry simplifies while type, image, notes, and
  the chapter index stay distinct.
- **Mobile behavior:** text and notes move into dedicated bands around the media
  field. A browser review found and corrected a 320px title clipping issue; the
  final heading and all six placeholders fit without document overflow.
- **Motion:** one restrained reveal plus transform/opacity feedback; reduced
  motion removes the reveal, smooth scrolling, and transitions.
- **Accessibility:** six native chapter links, six focusable semantic articles,
  visible target/focus outlines, one `h1`, ordered chapter headings, and
  separately readable captions. Small red labels use a dedicated AA-contrast
  text token rather than the brighter decorative red.
- **Known limitations:** the largest display words need editorial length limits
  and localization tests even though arbitrary wrapping is safe at 320px.
- **Future productization recommendation:** advance conditionally; test with
  real faces, costume silhouettes, CJK copy, and longer project names.
- **Formal-template overlap risk:** medium with `manga-panels` and
  `editorial-duet`, but the six full-height poster chapters and alternating
  edge systems are materially different from panels or paired editorial pages.

## `axis-atlas` / Axis Atlas

- **Design goal:** express two meaningful dimensions without random placement:
  the document's vertical axis selects a series, and each bounded horizontal
  strip selects one of three ordered frames.
- **Source-principle summary:** transfer coordinate systems, rigorous grids,
  visible boundaries, and native spatial navigation while rejecting free-drag
  canvases, arbitrary scatter, and decorative map metaphors.
- **Slots:** nine; three semantic series of `2:3`, `3:2`, `16:9`.
- **Desktop behavior:** three vertical series each contain one independently
  focusable, horizontally scrollable three-frame strip with visible start and
  end coordinates.
- **Tablet behavior:** the contained strips narrow but retain native scrolling,
  `x mandatory` snapping, and coordinate cues.
- **Mobile behavior:** ordinary document scroll chooses the series; each strip
  remains horizontally contained. At 320px every strip is wider than its own
  viewport but the document itself has no horizontal overflow.
- **Motion:** native scroll snapping and restrained focus feedback; reduced
  motion removes snapping, smooth behavior, and transitions.
- **Accessibility:** three labelled and focusable lists, native series anchors,
  visible double focus outlines, semantic figures/articles, explicit X/Y text
  cues, and captions outside the image plane.
- **Known limitations:** nested horizontal scrolling is less immediately
  discoverable than a single-axis page and needs usability testing with touch,
  trackpad, keyboard, and assistive technology.
- **Future productization recommendation:** keep as a strong research candidate,
  conditional on interaction testing with real users.
- **Formal-template overlap risk:** low-to-medium. It shares spatial ambition
  with `orbital-portal` and `museum-depth`, but uses bounded native lists,
  deterministic coordinates, and ordinary vertical document order.

## `stacked-scenes` / Stacked Scenes

- **Design goal:** let five scenes accumulate as a readable memory stack while
  preserving deterministic order, separate captions, and native navigation.
- **Source-principle summary:** transfer physical layering, progressive reveal,
  and restrained depth cues without imitating a card product, a free canvas,
  or a three-dimensional gallery.
- **Slots:** five; `16:9`, `2:3`, `3:2`, `2:3`, `16:9`.
- **Desktop behavior:** five viewport-scale cards use increasing sticky offsets
  of 16, 28, 40, 52, and 64 pixels. Each incoming card covers the prior scene
  in document order while leaving a measured layer cue.
- **Tablet behavior:** the same ordered sticky model remains at reduced internal
  spacing; all five cards fit the viewport width without page overflow.
- **Mobile behavior:** at 720px and below every card switches to
  `position: relative`, automatic height, visible overflow, and a single-column
  media/caption flow. Browser checks at 320px confirmed five complete
  placeholders and no document overflow.
- **Motion:** one short introduction plus focus/hover transform and opacity;
  reduced motion disables animation, smooth scrolling, and transitions, and
  releases sticky layering into ordinary document flow.
- **Accessibility:** a five-link scene index, five focusable named articles,
  separate high-contrast focus tokens for the dark shell and light cards,
  previous/next anchors, one `h1`, ordered headings, semantic facts, and
  captions outside the image plane.
- **Known limitations:** tall sticky cards need testing on short landscape
  viewports and with real text; the explicit mobile release is required and
  must not be removed for visual consistency.
- **Future productization recommendation:** advance conditionally as the most
  spatial Stage C direction; retain the non-sticky mobile contract.
- **Formal-template overlap risk:** medium with `museum-depth`, controlled by
  remaining a two-dimensional ordered document rather than a free-positioned
  depth scene.

## Gate and browser evidence

All final local gates ran with Node.js 22.13.1.

| Gate | Final result |
| --- | --- |
| Refero source structure | 42 continuous records, 42 unique URLs, all required fields present |
| Refero URL availability | 42/42 returned HTTP 200 with no redirects or access-control bypass |
| Formal-template freeze | 11 runtime IDs, 11 V1 IDs, 11 adapter mappings, unchanged legacy `TemplateId` source |
| Lab isolation tests | 15/15 passed |
| SiteDocument contract | 8/8 passed |
| Stable ID migration contract | 15/15 passed |
| Legacy adapter contract | 33/33 passed |
| Photo import | 5/5 passed |
| Layout | 3/3 passed |
| Rendered HTML, legacy API, and Lab SSR | 16/16 passed |
| Build | passed; five explicit Lab routes emitted separately and Lab CSS excluded from the homepage CSS asset |
| Bundle budget | passed; 11 lazy formal templates, 456.3 KiB JS, 190.5 KiB CSS, largest formal template 45.0 KiB |
| Public repository safety | passed |

Browser review covered the Lab index and every prototype at desktop, tablet,
and 320px widths. Across the three viewports, all 99 rendered placeholders kept
their declared aspect ratio within 0.31% rounding error. Every route had one
`h1`, the declared placeholder count, all four boundary labels, only its own
route style marker, no document-level horizontal overflow, and no browser
warning or error. Native scrolling reached the design brief after Quiet Focus's
inner sequence. Axis Atlas retained contained horizontal strips; Stacked Scenes
retained sticky desktop/tablet layers and released them on mobile.

## Isolation proof

- The production `templateCatalog`, `SITE_DOCUMENT_V1_TEMPLATE_IDS`, PR-01C
  adapter map, and legacy `TemplateId` remain the original eleven identities.
- A recursive production-source test rejects Lab references and Lab ID literals
  outside `app/template-lab`.
- Each Lab ID has one explicit route, one independent component, and one
  independent CSS Module loaded through a route-local inline style entry;
  bare extracted Lab CSS imports, orphan imports, and cross-prototype imports
  are rejected.
- Lab sources reject API/D1/database/manifest access, I/O and Node runtime
  imports, network constructors, UUID allocation, browser storage, cookies,
  runtime media, remote URLs, and downloaded/binary assets.
- The production homepage client graph contains no Template Lab module. The
  build-manifest test also reads the root layout's emitted CSS assets and
  rejects every Lab token, preventing CSS-only bundle regressions.
- Package dependency and development-dependency sets remain exactly at the
  approved baseline; no optional, peer, or bundled dependency set was added.
- Every route states that it is experimental, unregistered, incompatible with
  SiteDocumentV1, and forbidden to persist.

## Decision boundary

Five prototypes are sufficient for this research round. The six rejected
candidates remain unimplemented for the overlap, duplication, or complexity
reasons recorded in [TEMPLATE_LAB_DECISION.md](./TEMPLATE_LAB_DECISION.md).
No sixth or seventh prototype was added merely to reach the maximum.

Human review must still decide:

1. which, if any, experiment deserves a separate product proposal;
2. what a future formal template registry and versioning boundary would be;
3. whether real-photo, localization, and usability studies justify promotion;
4. whether any promoted direction belongs in a future document schema.

Those decisions are intentionally outside DESIGN-00 / TEMPLATE-LAB-00. This
round does not create `SiteDocumentV2`, alter the formal template count, or
authorize runtime or persistence work.
