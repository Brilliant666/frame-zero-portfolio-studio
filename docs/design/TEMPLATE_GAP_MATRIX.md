# FRAME//ZERO formal template gap matrix

Audit date: 2026-07-18

Scope: DESIGN-00 / TEMPLATE-LAB-00
Formal template count: 11 (frozen)

## Boundary and evidence

This document audits the current formal templates; it does not propose a registry change. The
eleven IDs in `app/templates/catalog.ts` and `app/site-document.ts` remain immutable
`SiteDocumentV1` identities. Every direction named in this document is research-only: it is not
a `TemplateId`, must not enter the formal catalog or legacy adapter, and must not be persisted.

The matrix is based on the following repository evidence:

- slot counts and aspect ratios: `app/templates/catalog.ts`;
- structure, navigation, and interaction: each formal template's `template.tsx`;
- palette, type, grid, motion, and responsive behavior: each template's CSS Module, plus
  `app/globals.css` for `cinematic-light`;
- shared image-opening behavior and placeholders: `app/templates/shared/**`.

Colors below describe the current implementation, not a future design-token contract. Mobile
notes describe the implemented breakpoints and interaction fallbacks, not a visual QA result.
Candidate overlap is judged primarily by page structure, browsing model, information density,
and motion logic. A shared color alone is not treated as meaningful overlap.

## Matrix A — visual system and space

| Formal ID | Visual theme | Light / dark | Primary color roles | Type personality | Grid and composition | Spatial character |
| --- | --- | --- | --- | --- | --- | --- |
| `cinematic-light` | Commercial film set, viewfinder, signal graphics | Dark photographic hero followed by warm-white editorial sections; strong light/dark cuts | Black and warm white; safety orange `#ff6b00` as action and signal | Oversized assertive sans, with mono labels and camera telemetry | Full-bleed hero; heterogeneous long-page archive; alternating full-width, landscape, and portrait beats | Expansive and sectional; full-bleed frames alternate with dense information bands |
| `neon-hud` | Camera control room / sci-fi targeting HUD | Consistently deep navy and near-black | Electric blue for structure, violet for spectral detail, amber for live state | Technical mono dominates metadata; condensed, forceful sans display copy | One main viewport plus right telemetry panel and thumbnail dock; later archive remains information-rich | Enclosed, instrument-like, layered by borders, readouts, and luminous depth |
| `film-rail` | Analogue contact strip and 35 mm timeline | Warm paper surrounding a black film strip | Cream paper, brown-black film, restrained dark red marks | Humanist sans with mono frame data; physical editorial tone | Lead frame followed by one continuous horizontal rail; all images use one landscape ratio | Wide and tactile; lateral travel is the primary sense of distance |
| `manga-panels` | Printed manga chapter / irregular action page | Cream paper, ink-black blocks, vermilion interruptions | Black and off-white carry hierarchy; vermilion marks chapter and action | Heavy CJK sans, compressed labels, large onomatopoeic/editorial display | Deliberately irregular panel sheet with mixed spans, diagonals, and chapter interruptions | Compressed and energetic; gutters, cuts, and ink blocks create page tension |
| `prism-liquid` | High-key chromatic fashion stage | Predominantly luminous white, with one dark services section | Violet, blue, and coral gradients against near-white | Clean sans mixed with elegant Georgia display italics and mono microcopy | Active hero image, side selector, then feature pair, triptych, and panorama | Airy but optically layered; glow, translucent labels, and clipped frames imply refraction |
| `orbital-portal` | Aperture, portal, and orbital targeting system | Near-black throughout | Ice blue describes structure; orange marks active/action state | Geometric sans with mono mission labels | One active portrait at the center of an orbital selector; supporting content is secondary | Radial, centered, and deep; rings and aperture layers build a contained virtual volume |
| `archive-os` | Desktop digital-asset manager / archive operating system | Light gray workspace with dark utility accents | Neutral grays and black; orange for selection and commands | Utilitarian sans and compact mono metadata | Three-pane desktop window: folders, 12-slot library, inspector; grid/list modes | Dense and bounded; hierarchy comes from panes, chrome, dividers, and selection state |
| `editorial-duet` | Fashion magazine cover and facing-page feature | Warm paper and ink-black passages, with coral accents | Paper, charcoal, and coral; photography supplies most chroma | High-contrast serif display with restrained sans/mono folio detail | Cover followed by sticky text page paired with a scrolling image column | Long, composed, and print-like; generous margins offset the sticky split-spread tension |
| `polaroid-field` | Tabletop field notes and a constellation of instant prints | Soft cream, bright paper cards, muted colored markers | Cream and ink with coral, dusty blue, and sun yellow notes | Friendly CJK sans with handwritten/field-label cues | A draggable, zoomable freeform canvas of rotated cards; later content returns to sections | Open and non-linear; overlap, rotation, and empty canvas create a personal workspace |
| `character-select` | Fighting-game roster and mission loadout | Predominantly dark, interrupted by bright light sections | Red, yellow, and cyan communicate player, active, and stat states | Extra-bold skewed sans with mono game telemetry | Three-part hero (roster, active fighter, stats), tabbed loadout, then mixed archive grid | Loud, frontal, and layered; speed lines, clipped silhouettes, and offset shadows compress depth |
| `museum-depth` | Gallery entrance and virtual exhibition corridor | Ivory entrance, charcoal exhibition, then dark visit section | Ivory and charcoal with deliberately minimal accent color | Quiet Arial/CJK text with large Georgia exhibition titles | Four-column entrance followed by one near-viewport exhibit at a time | Slow, monumental, and theatrical; perspective, frames, light cones, and long gaps imply rooms |

## Matrix B — photography load and fit

Aspect-ratio counts are exact catalog values. “Density” describes what is perceptually available
at once, not only the number of configured slots.

| Formal ID | Slots | Catalog ratios | Perceived image density | Image treatment | Best current photography fit |
| --- | ---: | --- | --- | --- | --- |
| `cinematic-light` | 9 | `16:9 × 3`, `3:2 × 5`, `2:3 × 1` | Medium-high; several scales across one long page | Full-bleed hero, irregular archive cards, scan/zoom affordance | Cinematic Cosplay series, environmental portraits, campaign-like mixed stories |
| `neon-hud` | 9 | `16:9 × 3`, `3:2 × 5`, `2:3 × 1` | High; active frame, telemetry, dock, and archive compete deliberately | Cropped main viewport, reticle overlay, technical thumbnails | Night, neon, mecha, sci-fi, stage light, and highly art-directed character work |
| `film-rail` | 9 | `3:2 × 9` | Medium; one lateral sequence with adjacent frames visible | Uniform landscape frames in a perforated film strip | Documentary sequences, convention reportage, travel, backstage, and cinematic stills |
| `manga-panels` | 9 | `16:9 × 2`, `3:2 × 6`, `2:3 × 1` | High; many panels can read as one composed page | Hard crops, irregular spans, ink borders, and chapter framing | Action, ensemble, transformation, narrative Cosplay, and graphic costume detail |
| `prism-liquid` | 9 | `16:9 × 1`, `3:2 × 7`, `2:3 × 1` | Medium-high; active stage plus curated multi-image rows | Clipped hero, bright cards, triptych, and panorama | Beauty, fashion, high-key studio, color gels, crystal/water, and polished portraits |
| `orbital-portal` | 8 | `2:3 × 8` (active visual is presented as a larger portal frame) | Low at the focal plane; the selector exposes the set around one active image | Portrait-first aperture crop with orbiting previews | Single-character Cosplay, costume silhouette, hero portraits, and sci-fi concepts |
| `archive-os` | 12 | `16:9 × 3`, `3:2 × 8`, `2:3 × 1` | Highest; 12 assets plus metadata and inspector | File thumbnails, selectable grid/list rows, Quick Look | Large mixed portfolios, proofing, event coverage, taxonomy-heavy or metadata-led archives |
| `editorial-duet` | 9 | `16:9 × 3`, `3:2 × 5`, `2:3 × 1` | Medium; images unfold sequentially beside a persistent chapter page | Cover crop, alternating magazine-scale frames, exterior captions | Fashion stories, costume editorials, location narratives, and portrait series with written context |
| `polaroid-field` | 9 | `16:9 × 2`, `3:2 × 6`, `2:3 × 1` | Medium; all cards occupy one field but overlap and scale vary | White instant-print frames with rotation and spatial clustering | Personal diaries, behind-the-scenes, travel, casual character moments, and mixed memories |
| `character-select` | 9 | `16:9 × 2`, `3:2 × 6`, `2:3 × 1` | High; roster, active portrait, stats, and archive repeat the cast | Active fighter crop, square roster portraits, aggressive archive crops | Multi-character sets, game/anime franchises, teams, costume variants, and action poses |
| `museum-depth` | 7 | `16:9 × 2`, `3:2 × 4`, `2:3 × 1` | Lowest; one exhibit dominates each viewport-scale passage | Framed, lit, mostly isolated works with wall labels | Fine-art portraiture, restrained costume studies, environmental tableaux, and exhibition narratives |

## Matrix C — navigation, interaction, motion, and mobile

| Formal ID | Navigation | Primary interaction | Motion principle | Implemented mobile adaptation |
| --- | --- | --- | --- | --- |
| `cinematic-light` | Fixed/top anchor navigation through archive, services, and booking; persistent mobile booking bar | Vertical reading, open image, copy contact/request | Boot/title reveal, ticker and scan lines, restrained image zoom | Hides desktop nav, makes archive single-column, simplifies hero overlays, keeps a two-action bottom bar |
| `neon-hud` | Top anchors plus thumbnail dock and active-frame progress | Dock selection, previous/next buttons, arrow keys, open image | Short boot load, image-lock reveal, pulse/readout state, progress interpolation | Collapses viewport and telemetry, permits horizontal dock access, reduces decorative HUD density, keeps quick booking |
| `film-rail` | Top anchors, rail arrows, and numbered frame timeline | Native horizontal scroll/snap, arrow controls, frame anchors, open image | Smooth lateral movement and modest film/hover cues; content stays physically grounded | Keeps horizontal rail with touch-friendly proximity snapping; surrounding layouts collapse to one column |
| `manga-panels` | Chapter/contents anchors through a vertical page | Scroll chapters and open individual panels | Panel-entry and print/action accents; movement supports cuts rather than continuous ambience | Irregular desktop sheet becomes a legible single-column chapter flow; oversized decoration is reduced |
| `prism-liquid` | Fixed top anchors, active selector rail, previous/next controls | Select active frame, arrow keys, open hero/gallery image | Slow liquid morph and prism sweep; active image refracts in; hover saturation is secondary | Hero becomes vertical, selector becomes a compact row, gallery pairs/triptych become one column at phone width |
| `orbital-portal` | Fixed top anchors and radial work selector | Orbit-node selection, previous/next, arrow keys, open active portrait | Ring/orbit movement and active-image transition establish the portal | Scales down or simplifies the radial stage and stacks supporting sections while preserving one active focal image |
| `archive-os` | Window chrome, folder sidebar, search, filters, grid/list switch, inspector; bottom tabs on mobile | Query/filter, select, keyboard listbox movement, double-click/Quick Look | Only short selection, pane, and preview transitions; state change is more important than spectacle | Replaces simultaneous three panes with folders/library/inspector tabs; keeps search and selection available |
| `editorial-duet` | Top anchors plus sticky chapter index | Vertical scroll updates active chapter; chapter jump and open image | Opening curtain and restrained editorial reveals; sticky state tracks the scroll | Removes the facing-page dependency, stacks reading order, and adds a persistent booking action |
| `polaroid-field` | Top anchors plus in-canvas zoom/reset controls | Pointer drag, wheel/control zoom, keyboard pan/zoom, open card | Canvas transform is the main motion; card hover and transitions remain subordinate | Retains bounded canvas controls at smaller scale, then stacks downstream sections; touch/keyboard alternatives remain explicit |
| `character-select` | Fixed top anchors, roster, previous/next controls, and package tabs | Select fighter, arrow keys, switch loadout, open image | Fast fighter entrance, roster emphasis, speed-line/static game energy | Converts hero to a vertical flow, roster to a compact grid, archive to one column, and removes nonessential stage ornaments |
| `museum-depth` | Fixed top anchors and a linear exhibition route | Deliberate vertical scroll and open framed image | Scroll-timeline approach from depth; no ambient interface motion | Removes perspective-dependent entrance and scroll animation, stacks labels above frames, and shortens room-scale gaps |

## Candidate overlap matrix

The candidate IDs below are neutral research labels only. Ratings mean:

- **H** — the current formal template already owns most of the candidate's browsing model or
  composition; a prototype needs a different structural premise to be worthwhile.
- **M** — meaningful partial overlap; the candidate must state and demonstrate its differentiator.
- **L** — only a minor visual or component-level resemblance.
- **—** — no material overlap found.

Abbreviations: QF `quiet-focus`; SR `split-register`; PC `poster-chapters`; AA `axis-atlas`;
SS `stacked-scenes`; PG `proof-grid`; CS `caption-spine`; DO `darkroom-object`; RT
`ribbon-timeline`; SB `signal-broadsheet`; FD `foldout-dossier`.

| Formal ID | QF | SR | PC | AA | SS | PG | CS | DO | RT | SB | FD |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `cinematic-light` | L | L | M | — | L | M | M | L | L | H | M |
| `neon-hud` | — | M | L | L | — | M | M | H | L | H | L |
| `film-rail` | L | L | M | M | L | M | H | M | H | L | L |
| `manga-panels` | — | M | H | L | M | H | M | L | L | H | M |
| `prism-liquid` | L | M | L | L | M | M | L | L | — | L | L |
| `orbital-portal` | M | M | L | M | L | L | M | H | L | M | L |
| `archive-os` | — | H | L | M | L | H | M | L | L | M | H |
| `editorial-duet` | M | H | H | L | M | M | H | L | L | M | H |
| `polaroid-field` | L | L | L | H | H | M | L | L | L | L | M |
| `character-select` | — | M | H | L | M | M | M | M | L | H | M |
| `museum-depth` | H | M | L | — | H | L | M | H | — | L | L |

The ratings are screening evidence, not a mandate to implement every low-overlap direction. A
candidate still needs photography value, responsive viability, accessibility, performance, and
clear separation from the other experimental prototypes.

## Real gaps in the formal set

### 1. Quiet focus without a genre metaphor

`museum-depth` is slow and image-led, but its gallery architecture, frames, corridor, and
perspective are intentionally theatrical. `orbital-portal` also isolates one portrait, but wraps
it in sci-fi machinery. There is room for a neutral, almost silent focus viewer in which one
photograph, one caption, and one deliberate next action are sufficient. `quiet-focus` is only a
real gap if it removes simulated rooms, instruments, cards, and control chrome; recoloring the
museum is not enough.

### 2. A synchronized split register that is neither magazine nor software

`editorial-duet` owns the sticky fashion spread, while `archive-os` owns persistent utility
panes. Neither provides two semantically equal tracks whose image sequence and annotation/index
sequence advance together. `split-register` can occupy this gap through synchronized reading,
clear focus transfer, and a mobile ordering rule. It must not resemble a desktop inspector or a
warm-paper fashion spread.

### 3. Poster-led chapters with typography as navigation

`manga-panels`, `character-select`, and `cinematic-light` already use loud type and signal
graphics, but they use those devices inside a comic, game, or film interface. A poster chapter
system can still be distinct if each viewport is a typographic orientation surface that hands
off to a small number of photographs, and chapter typography itself exposes progress. A collage
of irregular panels or another game HUD would close this gap rather than fill it.

### 4. A semantic two-axis atlas

`polaroid-field` offers free pan/zoom over a personal card constellation; `film-rail` is one-axis;
`archive-os` is a conventional grid. None uses both axes to encode meaningful coordinates with
an overview, current position, and deterministic keyboard route. `axis-atlas` is distinct only
when x/y placement has readable semantics and bounded navigation. Random card placement would
duplicate `polaroid-field`.

### 5. A bounded stack whose order changes visibly

`polaroid-field` overlaps cards in a free canvas, and `museum-depth` advances through separated
rooms. The formal set lacks a compact deck in which advancing a scene visibly changes z-order,
preserves the previous/next relationship, and keeps captions outside the focal face area.
`stacked-scenes` must be a deterministic sequence with keyboard and reduced-motion fallbacks,
not a decorative pile or a scroll-driven copy of the museum.

### Cross-cutting gaps

- Most formal templates begin with a fixed top bar and continue through gallery, services, and
  booking sections. A prototype should prove a different orientation model, not merely redesign
  those same sections.
- Genre metaphors are strong across the set: film, HUD, manga, portal, operating system, game,
  instant prints, and museum. A calm system without skeuomorphic framing is underrepresented.
- Desktop interactions are diverse, but several mobile versions necessarily collapse spectacle
  into a vertical list. A candidate with a mobile-native browsing rule would add more value than
  another desktop effect with a stacked fallback.
- Existing type systems cluster around bold sans + mono telemetry or Georgia-like editorial
  display. New work should derive hierarchy from a distinct scale/rhythm system, not from a new
  font dependency.
- The frozen ratio vocabulary is `3:2`, `2:3`, and `16:9`. A lab prototype may arrange these
  differently, but aspect-ratio novelty alone is not a design gap.

## High-overlap clusters to avoid

| Direction at risk | Existing owner(s) | Why it is not a clean gap | Minimum evidence needed to reconsider |
| --- | --- | --- | --- |
| `proof-grid` | `archive-os`, with `manga-panels` and `character-select` as secondary overlap | Dense thumbnails, selection, metadata, and irregular proof surfaces are already well represented | A non-software browsing rule and a composition that is not simply another tiled index |
| `caption-spine` | `editorial-duet`, `film-rail`, `museum-depth` | Sticky chapter copy, frame timelines, and wall-label sequences already bind text to images | A spine that changes navigation and reading order on both desktop and mobile, not just a vertical label rail |
| `darkroom-object` | `neon-hud`, `orbital-portal`, `museum-depth` | Dark single-focus staging and luminous framing already form a crowded cluster | A tactile photographic process with no HUD, portal, or virtual-room cues and no reliance on black styling alone |
| `ribbon-timeline` | `film-rail` | A horizontal, numbered, snap-based photographic timeline is the core of the existing template | A fundamentally different spatial axis or temporal interaction; decorative ribbon styling is insufficient |
| `signal-broadsheet` | `cinematic-light`, `manga-panels`, `character-select`, `neon-hud` | Oversized headlines, dense labels, warning colors, and signal graphics are already pervasive | A rigorous newspaper reading system whose hierarchy and mobile order—not its noise—create the distinction |
| `foldout-dossier` | `editorial-duet`, `archive-os`, `manga-panels` | Facing pages, inspectors, chapter sheets, and document-like panels cover most of the premise | An explicit fold/unfold information model that stays accessible and useful without simulating paper or desktop chrome |

## Do not create these false gaps

- A light and dark version of the same DOM structure.
- A new “cinematic” template that repeats a full-screen hero, mixed archive, and orange signal
  layer.
- Another black technical interface with blue/cyan readouts, rings, reticles, or stat panels.
- Another warm-paper serif editorial with a sticky left page and scrolling right images.
- Another horizontal snap strip, free-drag card canvas, desktop file manager, or irregular comic
  grid.
- A template differentiated only by font, gradient, border radius, card shadow, or animation
  duration.
- A desktop-only spatial trick whose mobile behavior is merely “turn every block into one
  column.”

## Audit conclusion

The formal set already has broad aesthetic variety, but much of that variety is carried by
strong genre metaphors. The clearest structural opportunities are `quiet-focus`,
`split-register`, `poster-chapters`, `axis-atlas`, and `stacked-scenes`, provided their prototypes
honor the distinctions above. The six high-overlap directions are useful controls for detecting
duplication; they should not proceed on palette or typography changes alone.

This conclusion does not change the formal count, approve any candidate for product use, or
define a future template registry. Productization and registration remain separate human
decisions after the isolated lab is evaluated.
