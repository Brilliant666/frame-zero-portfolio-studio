# Star motion preview — local design branch

Branch: `codex/star-motion-preview`, based on `896920d`.

This iteration adapts the user-supplied `star-motion-demo.html` into the local preview workspace. The reference remains outside the repository. Its sample photographs, inline private data, upload controls and simulated counters are not imported.

## Scope

- Real saved collection covers on the preview homepage, floating paper cards, entrance and pointer tilt effects.
- Paper/night appearance, stored only as a browser preference; no portfolio document schema or save API changes.
- Existing constellation, scatter and spread compositions retained, including natural photo ratios, scatter FIT and drag/click separation.
- Eased camera moves, pointer-anchored wheel zoom and bounded-duration release inertia. Animation work stops when idle, hidden or unmounted; reduced-motion disables it.
- Optional lightbox entrance animation for the new workspace. Legacy template defaults remain unchanged.
- Mobile retains all three composition choices and natural page scrolling.

The homepage now follows the supplied floating-cover reference rather than its predecessor's draggable home constellation. Collection interiors remain interactive canvases. This is a local visual proposal, not a production launch or human design approval.

## Verification

Lint, TypeScript, 94 polish tests, public safety, production build and bundle budget passed. Isolated-browser checks covered desktop and mobile, theme persistence, all three modes, drag/click separation, wheel anchoring, inertia settling, reduced motion and unchanged saved documents. Screenshots and real-photo evidence remain outside the repository. No save requests were made during verification.
