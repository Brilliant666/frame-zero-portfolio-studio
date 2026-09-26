/** Pass to Playwright page.evaluate(scanPreviewTheme). Read-only, no app data access.
 * Detect large CSS surfaces (>=20,000px², >=120x80px, alpha>=.5). Images/canvas/svg
 * pixels and low-alpha decoration are excluded. Gradients are inspected too.
 * Main action pills may be intentionally dark/bright; report, never silently ignore.
 */
export function scanPreviewTheme() {
  const theme = document.documentElement.dataset.previewTheme;
  const channel = n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
  const luminance = rgb => .2126 * channel(rgb[0] / 255) + .7152 * channel(rgb[1] / 255) + .0722 * channel(rgb[2] / 255);
  const parse = value => [...value.matchAll(/rgba?\(([^)]+)\)/g)].map(match => {
    const parts = match[1].replaceAll('/', ' ').split(/[ ,]+/).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 };
  });
  const surfaces = [];
  for (const element of document.querySelectorAll('body *')) {
    if (element.matches('img,canvas,svg,svg *')) continue;
    const css = getComputedStyle(element), box = element.getBoundingClientRect();
    if (css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) === 0 || box.width < 120 || box.height < 80 || box.width * box.height < 20000) continue;
    const colors = [...parse(css.backgroundColor), ...parse(css.backgroundImage)].filter(color => color.alpha >= .5);
    const backdrop = theme === 'night' ? [9, 13, 25] : [245, 248, 251];
    const suspicious = colors.map(color => ({ ...color, rgb: color.rgb.map((n, i) => n * color.alpha + backdrop[i] * (1 - color.alpha)) }))
      .filter(color => theme === 'night' ? luminance(color.rgb) > .5 : luminance(color.rgb) < .06);
    if (!suspicious.length) continue;
    surfaces.push({ selector: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`, width: box.width, height: box.height,
      background: css.backgroundColor, gradient: css.backgroundImage, luminances: suspicious.map(color => luminance(color.rgb)), text: element.textContent?.trim().slice(0, 60) });
  }
  return { theme, threshold: { area: 20000, minimumWidth: 120, minimumHeight: 80, minimumAlpha: .5, nightLuminance: .5, paperLuminance: .06 }, surfaces };
}
