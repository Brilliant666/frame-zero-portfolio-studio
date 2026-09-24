# Star motion D — targeted acceptance corrections

Branch: `codex/star-motion-preview`. Scope follows the user's seven-item correction request, not all phases in task D. D0, D3, content-model changes and deployment are excluded.

## Baseline and isolation

The preceding work was first saved as three commits: `6c1316d` (camera), `356dd7e` (visual shell/covers), and `7aa1783` (scope notes). The requested branch was retained instead of the older branch named in the generic constraints.

The baseline source reproduced the fixed-width header specificity conflict, system-serif title fallback, old palette, multiline cover title, fixed tiny zoom floor, missing soft bounds, wheel-only zoom, single-pointer handling, per-frame React camera state and CSS-only composition transitions. Browser before-screenshots were not obtained: the local service was stopped. Baseline claims are source-based, not reconstructed visual evidence.

Browser verification uses an isolated Chrome context and intercepted synthetic API/manifests/images. It does not read or write the live preview record or copy the private photo library. Fixture scripts, screenshots, traces and video are outside the repository in the local `star-motion-D` evidence directory. `public/photos` was absent from status and the index; it was not staged.

## Implemented checks

| Request | Result and evidence |
| --- | --- |
| Unified zoom and bounds | FIT-relative minimum 0.8, maximum 2.4; wheel/buttons/keyboard/two-pointer inputs use the same limiter. `composer-motion.test.mjs` covers limits, anchor invariance, damping and spring. Browser `touch-range.json` verifies floor, ceiling, Ctrl pinch and tablet pinch. |
| Full-width header | Higher-specificity preview-only selector resets width/left/transform; background spans the viewport, content is at most 1680px and centered. `after-preview-1440.png`, `after-preview-1920.png`, `after-preview-2560.png` and `final.json` show x=0 and exact viewport width. No new `!important`. |
| Clear-sky paper colors | Paper variables/background copied by value from the updated reference, using one blue family. Photo controls and pins use those tokens; base night colors remain unchanged. Original templates are not rethemed. |
| Self-hosted heavy serif | 101 official Noto Serif SC 900 unicode-range slices and OFL license; no current-title-only text subset or runtime Google request. `preview-title-font.test.mjs` checks local files, hashes, ranges, weight and allowlist. CDP reports custom Noto Serif SC Black for the actual Chinese title glyphs, not SimSun (`final.json`). Unsupported rare glyphs may still fall back. |
| Brand mark | Preview-only star plus `profile.photographer`; legacy brand rendering is unchanged. Header screenshots show the synthetic profile name. |
| Cover titles | One line plus ellipsis; existing full title in `aria-label` retained. Desktop screenshots include a long synthetic title. |
| D1 requested interaction items | Direct DOM camera transform/output updates, true WAAPI FLIP with theme curves and bounded stagger, trackpad pan/Ctrl pinch/tablet pinch. `flip.json` and video cover six rapid switches, stable membership, no remaining transparent cards and return/re-entry; `interactions.json` covers wheel anchor, inertia settling, Tab scroll=0 and phone flow. |

For oversized or tiny scenes, the visibility guard is 30% of the smaller of viewport and projected content extent on each axis. This avoids an impossible interval for very small content; it does not claim that 30% of an arbitrarily large entire collection fits on screen.

The first extreme-drag browser check exposed a real discrepancy: shadow padding left only 28–29% of paper visible. The final correction uses the rotated paper union for soft limits while preserving FIT padding. The repeated browser check (`bounds.json`) reports 30.0003% horizontally and 30.0004% vertically after release. Reduced-motion returns immediately with zero running animations; paper tape is now consistently blue (`scene-paper.png`) without changing night tape.

## Regression checks

- 101 polish tests, including font and camera tests.
- 23 Admin/storage tests, including isolated atomic CAS and revision validation; nine frozen-document contract tests.
- Lint and TypeScript.
- Standard Next and legacy builds and unchanged budget gates; production preview access remains denied. Development visual modules/fonts are not eagerly bundled into the legacy production renderer.
- 36 legacy rendering/API tests and three Standard Next/runtime-budget tests.
- Public-safety scanning and explicit-path staging only. Four CI workflows and their budgets are unchanged.

## Remaining failed acceptance item

The five-second performance threshold is **not passed**. The final idle-machine Chrome trace contains 1412 DrawFrame and 195 DroppedFrame events, or 12.13% by `DroppedFrame / (DrawFrame + DroppedFrame)`, above 5%. This is a headless Chrome measurement, not a promise about a physical user's refresh rate. The earlier hot-update-overlap trace is retained as a failed diagnostic, not substituted with an earlier better run. `performance-5s.trace.json` is the importable final trace; `performance-end.png` shows the tested canvas, not the DevTools Performance panel. A literal Performance-panel screenshot has not been supplied.

The browser evidence is technical validation with anonymous fixtures, not human aesthetic approval. No deployment, push, merge, D0 change or live preview-document access occurred.

## Commits

- `6c1316d`: save previous camera work.
- `356dd7e`: save previous visual shell and covers.
- `7aa1783`: save previous scope and verification notes.
- `dd0d39c`: unified zoom/soft bounds, gestures, DOM camera and FLIP.
- `3753766`: clear-sky tokens, full-width brand header, cover ellipsis and self-hosted heavy serif.
- `5c0677e`: true paper-edge boundary correction and token-based paper-theme tape.
- This document is a separate final audit commit.
