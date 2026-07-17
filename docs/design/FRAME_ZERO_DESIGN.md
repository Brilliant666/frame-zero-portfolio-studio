# FRAME//ZERO Shared Design Standard

## Overview

FRAME//ZERO is a photography-first system. This document defines the shared
quality floor for its templates and experimental prototypes. It is not a visual
theme, a component skin, or a mandate to make every experience look alike.

Templates are expected to differ substantially in composition, navigation,
typography, density, image sequence, light or dark treatment, and motion. Those
differences are healthy. What cannot vary is the minimum quality of the
experience: photographs remain the primary subject; content stays legible and
operable; missing media has an intentional fallback; narrow screens work; and
experiments do not degrade the production application.

The rules use these terms:

- **Must** is a release requirement.
- **Should** is the default and needs a documented reason to be overridden.
- **May** is an option, not a shared visual prescription.

This standard is original to FRAME//ZERO. Research may inform abstract
principles, but implementations must not copy a third party's brand identity,
design tokens, logo, copy, page structure, or signature interaction.

## Colors

Color systems are defined by roles rather than by one global palette. A
template may be bright, dark, muted, saturated, monochrome, or editorial, while
still supplying the following roles:

- canvas and elevated canvas;
- primary and secondary text;
- subtle and strong boundaries;
- interactive, hover, focus, selected, warning, and error states;
- media placeholder foreground and background;
- readable scrim where text must coexist with imagery.

Each role must remain distinguishable in every supported color scheme. Body
text should meet WCAG AA contrast (4.5:1), and large text and meaningful UI
graphics should meet 3:1. Focus indicators must remain visible against both the
canvas and nearby media.

Color must not be the only carrier of state or meaning. Selection, errors,
progress, and navigation state also need text, shape, position, or an accessible
name. A template must not place a low-contrast tint over photography merely to
make its palette appear consistent.

Third-party token sets must not be copied into the project. A template owns a
small, named, internally coherent set of color roles; arbitrary near-duplicate
values should be consolidated within that template without flattening the
differences between templates.

## Typography

Typography establishes hierarchy and pacing without competing with the work.
Every page must have one clear `h1`, a logical heading order, readable body
copy, and labels whose meaning does not depend on decorative styling.

Templates may choose very different type personalities and scales, but must:

- use local system-font stacks already available to the project;
- never fetch remote fonts or commit proprietary font files;
- preserve legibility during font fallback and loading;
- use fluid sizes with bounded `clamp()` values where appropriate;
- keep body copy at a comfortable reading size and line height;
- constrain long prose to a readable measure;
- avoid all-caps for long passages;
- allow long titles and translated text to wrap without collision or clipping;
- avoid placing essential text inside images.

Extreme display typography is allowed when it is part of a distinct concept,
provided it does not obscure controls, cover a subject's face by default, or
become the only readable representation of important content.

## Layout

The photograph is the first visual subject. Layout should explain how to view a
body of work rather than surround it with ornamental UI. A template must define
a deliberate browsing model—for example a long editorial narrative, precise
index, full-screen sequence, split gallery, or modular archive—and make that
model understandable without instructions.

Layouts must:

- use semantic landmarks and preserve a logical DOM and reading order;
- keep keyboard order consistent with the visual order;
- prevent unintended horizontal overflow;
- reserve adequate room for controls, captions, and focus indicators;
- handle short, long, missing, portrait, landscape, and mixed-ratio content;
- avoid fixed heights that crop essential UI at small viewport heights;
- keep decoration out of the hit-testing and reading path;
- preserve a useful composition when no photograph is available.

Asymmetry, overlap, horizontal movement, sticky regions, and deliberate crops
may be used as authored choices. They must not hide navigation, trap focus,
break reading order, or make the page unusable without a precise image crop.

## Spacing

Spacing communicates hierarchy, rhythm, and relationships. Each template
should define a compact spacing scale and use it consistently, while remaining
free to choose a tight archival rhythm, a spacious gallery rhythm, or another
intentional cadence.

Spacing should be based on a small progression rather than isolated magic
numbers. Fluid gutters and section gaps may use `clamp()` so the composition
adapts without abrupt jumps. Adjacent controls need enough separation to avoid
mis-activation, and touch targets should provide an effective area of at least
44 by 44 CSS pixels when practical.

Safe-area insets must be considered for edge-mounted navigation. Spacing must
not rely on empty remote imagery, invisible text, or fixed desktop dimensions
to hold the composition together.

## Shapes

Shape language is template-owned. Square editorial frames, soft cards, sharp
rules, circles, or irregular masks can all be valid; no shared radius is
required. Within a template, shapes must have a clear purpose and consistent
relationship to content and interaction.

Boundaries must remain visible where users need to understand grouping or
affordance. Clickable areas must not be indicated by shape alone. Image masks
must not remove the only useful view of a subject, and decorative shapes must
be hidden from assistive technology and ignore pointer events.

Avoid stacked translucent panels, excessive blur, and large fields of generic
glassmorphism. These effects reduce image clarity, contrast, and performance
and are not substitutes for hierarchy.

## Motion

Motion may clarify navigation, sequence, spatial continuity, or a direct user
action. Motion that has no informational or interaction purpose should not be
added.

Motion must:

- primarily animate `transform` and `opacity`;
- avoid layout-thrashing properties in continuous animation;
- begin in response to load, view, or user intent only when the transition adds
  understanding;
- keep controls usable throughout the transition;
- avoid flashing, rapid parallax, scroll hijacking, and simultaneous movement
  of every element;
- stop when content is not visible and never run an endless decorative loop;
- provide a meaningful static first frame and server-rendered structure;
- not delay access to content behind a decorative loading sequence.

Every moving prototype must define a `prefers-reduced-motion: reduce` mode.
That mode removes non-essential animation and smooth scrolling, avoids large
spatial transitions, and presents the final state without waiting. Essential
state changes may remain instantaneous or use a minimal fade.

Particle fields, ambient cursor followers, and ornamental animation without a
content purpose are prohibited.

## Imagery

Photography has priority over chrome, effects, and display text. Image
treatment should preserve the character of the work and make intentional use
of aspect ratio, crop, sequence, and negative space.

Implementations must:

- use only repository-approved, public-safe local demo media or the supplied
  media abstraction;
- never depend on remote image URLs;
- provide accurate intrinsic dimensions or an aspect-ratio reservation to
  prevent layout shift;
- supply useful alternative text when an image conveys content, and an empty
  alternative when it is genuinely decorative;
- use lazy loading below the initial viewport where appropriate;
- ensure crops and `object-position` respect known focal information;
- avoid placing default text, navigation, or decoration over a person's face or
  another critical focal region;
- keep essential controls distinguishable on both bright and dark photographs.

When media is missing or fails, the layout must show an intentional placeholder
that preserves the expected ratio, hierarchy, and navigation. A placeholder is
part of the design, not an error-page afterthought. It must not expose a file
path, URL, hash, user identifier, or other private source detail.

No third-party screenshot, logo, icon asset, downloaded design image, or
unlicensed photograph may be added as a substitute for a placeholder.

## Accessibility

Accessibility is a shared release gate, not a template style. Every template and
prototype must:

- use semantic page landmarks and a logical heading hierarchy;
- expose meaningful names for links, buttons, galleries, and controls;
- use native interactive elements whenever possible;
- support complete keyboard operation without a trap;
- show a visible `:focus-visible` state that is not clipped or obscured;
- preserve a predictable focus order when layouts rearrange;
- meet the color-contrast requirements in this document;
- avoid using color, hover, or motion as the only source of information;
- provide text alternatives and announce status changes when necessary;
- respect `prefers-reduced-motion`;
- support browser zoom and text reflow without loss of content;
- keep decorative elements out of the accessibility tree.

Hover-only revelations need an equivalent focus and touch path. Custom
carousels or spatial galleries must expose previous, next, current position,
and a non-gesture control path. Escape must close a modal or expanded view and
restore focus to the invoking control.

## Components

Components should express the template's browsing model, not impose a shared
appearance. Reuse behavior and accessibility where it reduces risk; keep
template-specific composition and visual tokens isolated.

At minimum, applicable components must define:

- default, hover, focus-visible, active, selected, disabled, loading, empty,
  and error states;
- behavior for absent or unusually long labels;
- keyboard and touch behavior;
- reduced-motion behavior;
- a stable media placeholder;
- semantic ownership of captions and descriptions.

Navigation must identify the current destination without color alone. Buttons
must describe an action; links must describe a destination. A whole-card hit
area must not create invalid nested interactions. Icons may support a label but
must not replace an accessible name.

Lab-only primitives may be shared within the Template Lab. They must not be
moved into production template layers solely to reduce local duplication, and
production components must not acquire experimental styles or dependencies.

## Responsive behavior

Responsiveness is an authored adaptation, not uniform scaling. Each template
must define desktop, tablet, mobile, and narrow-mobile behavior. The content
hierarchy and browsing model should remain recognizable even when the layout
changes form.

At 320 CSS pixels wide, every template and prototype must:

- render without unintended horizontal scrolling;
- keep navigation, primary content, and recovery controls reachable;
- allow headings, metadata, and controls to wrap without overlap;
- retain visible focus indicators;
- maintain usable tap targets;
- avoid fixed-width media or decoration that expands the viewport;
- preserve a complete placeholder when images are absent;
- keep essential text away from destructive image crops.

Horizontal galleries may retain horizontal interaction only when it is the
declared browsing model. They must clearly contain that overflow, avoid making
the document itself wider than the viewport, support keyboard controls, and
offer a usable touch and reduced-motion path.

Breakpoints should follow content stress rather than device brands. Prefer
intrinsic sizing, grid, flex, `minmax()`, and bounded fluid values. Do not hide
core content on mobile merely because a desktop composition has insufficient
space.

## Performance

Visual ambition must not tax the production experience. Templates should use
CSS and existing project primitives before adding JavaScript. This work must
not add a new npm dependency, remote font, remote image, animation library,
icon library, canvas/WebGL package, or image bundle.

Template Lab code is an isolated experiment boundary:

- production pages must not statically import the Lab index or prototypes;
- prototypes must be split by route or dynamically loaded;
- production initial bundles must not materially grow because of Lab code;
- Lab-only primitives and tokens stay inside Lab-owned modules;
- a prototype must not fetch API, D1, manifest, or user-local media;
- a prototype must not write local storage, session storage, or cookies;
- no Lab ID or implementation enters the production template catalog,
  `SiteDocumentV1`, legacy content contracts, adapter, admin, or persistence;
- bundle-budget failures must be fixed by isolation or reduction, never by
  raising the established budget to accommodate an experiment.

Images should reserve space, defer below-the-fold work, and avoid decoding more
media than the current experience needs. Event handlers must be bounded and
cleaned up. Continuous measurement, unbounded observers, and decorative work
on every scroll frame are prohibited.

## Do

- Make the photographic work the first thing users understand.
- Give every template an intentional and distinct browsing model.
- Treat role-based colors, type scales, and spacing as local design systems.
- Preserve semantic order, keyboard access, visible focus, and readable
  contrast.
- Design the no-image placeholder alongside the image-present state.
- Verify desktop, tablet, mobile, 320px, zoom, long text, and mixed image ratios.
- Respect focal regions and keep default text away from faces.
- Use restrained, purposeful motion and provide a complete reduced-motion mode.
- Keep experiments route-isolated and outside every production contract.
- Use original, brand-neutral IDs, wording, components, and visual decisions.
- Run existing quality, regression, bundle, and public-safety gates before
  claiming a prototype is complete.

## Don't

- Don't turn this quality floor into one universal palette, grid, radius, type
  system, or visual theme.
- Don't copy a third party's design tokens, logo, copy, signature composition,
  template ID, or branded interaction.
- Don't add remote fonts, remote images, third-party screenshots, proprietary
  assets, or a new dependency.
- Don't place default text or controls over a face or critical focal region.
- Don't use color, hover, or motion as the only way to convey meaning.
- Don't hide content behind decorative loading, ambient particles, cursor
  followers, scroll hijacking, or movement without a purpose.
- Don't stack broad glassmorphism, blur, and translucent surfaces over the work.
- Don't sacrifice 320px usability, keyboard operation, focus visibility,
  contrast, or reduced-motion support for a desktop effect.
- Don't leave a broken-image icon, collapsed box, private path, or remote URL in
  place of a designed placeholder.
- Don't statically import Lab prototypes into production or register, persist,
  fetch, or expose them through production content and API contracts.
- Don't increase bundle budgets or weaken tests to make an experiment pass.
- Don't mistake a recolor, font swap, or decorative overlay for a genuinely
  different template.
