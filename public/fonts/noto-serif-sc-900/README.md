# Noto Serif SC 900 — self-hosted title font

These are unmodified WOFF2 unicode-range subsets served by the official Google
Fonts CSS API, requested at weight 900 without a `text=` restriction. They are
not limited to current titles or demonstration content. Browser unicode-range
selection fetches only the subsets needed by the visible text.

- Family: `Noto Serif SC`; weight: `900`; style: `normal`.
- License: SIL Open Font License 1.1; the original copyright and complete terms
  are retained in `OFL.txt` and shipped in the public asset allowlist.
- Original URLs, byte sizes and SHA-256: `sources.json`.
- Refresh: `powershell -NoProfile -File scripts/vendor-preview-title-font.ps1`.
- CSS: `app/templates/polaroid-field/motion-fonts.css`; import in the new preview
  experience only and opt title selectors into the family explicitly.

The 101 slices contain 13,666 distinct mapped Unicode codepoints (12,258 in the
basic CJK block), including common Simplified Chinese, additional Traditional
Chinese and punctuation/Latin. This is the complete response of the Google
Fonts SC webfont API, not every Unicode ideograph. Unsupported glyphs still
require system serif fallback. All subset OS/2 weight classes are 900.

No private photos or external runtime font requests are involved. No eager
preload of all slices is needed. `sources.json` and this README are repository
documentation; only the WOFF2 files and original license enter standalone
public output.
