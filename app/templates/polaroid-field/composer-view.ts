import type { ComposerLayout } from "./composer-layout";

export const COMPOSER_MODES = ["constellation", "scatter", "editorial"] as const;
export type ComposerMode = typeof COMPOSER_MODES[number];
export type ComposerPreference = { mode: ComposerMode; seed: number; heroId?: string };
export const DEFAULT_COMPOSER_PREFERENCE: ComposerPreference = { mode: "constellation", seed: 0 };
export function parseComposerPreference(value: unknown): ComposerPreference {
  if (!value || typeof value !== "object") return { ...DEFAULT_COMPOSER_PREFERENCE };
  const input = value as Partial<ComposerPreference>;
  return { mode: COMPOSER_MODES.includes(input.mode as ComposerMode) ? input.mode! : "constellation",
    seed: Number.isInteger(input.seed) && input.seed! >= 0 && input.seed! <= 0xffffffff ? input.seed! : 0,
    ...(typeof input.heroId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(input.heroId) ? { heroId: input.heroId } : {}) };
}
export function composerSeed(id: string, preference: ComposerPreference) {
  let hash = 2166136261;
  for (const ch of `${id}|${preference.mode}`) hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619);
  return (hash + preference.seed * 7919) >>> 0;
}
export type ComposerView = { x: number; y: number; scale: number };
export type ComposerBounds = { left: number; top: number; right: number; bottom: number };
export function composerBounds(layout: ComposerLayout, indices?: readonly number[]): ComposerBounds {
  const cards = indices ? indices.map(index => layout.cards[index]).filter(Boolean) : layout.cards;
  const boxes = cards.map(card => {
    const angle = card.rot * Math.PI / 180, w = card.w + 72, h = card.h + 72;
    const rw = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle));
    const rh = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle));
    return { left: card.x - rw / 2, right: card.x + rw / 2, top: card.y - rh / 2, bottom: card.y + rh / 2 };
  });
  if (!indices && layout.note) {
    const note = layout.note, a = note.rot * Math.PI / 180;
    const w = Math.abs(286 * Math.cos(a)) + Math.abs(196 * Math.sin(a));
    const h = Math.abs(286 * Math.sin(a)) + Math.abs(196 * Math.cos(a));
    boxes.push({ left: note.cx - w / 2, right: note.cx + w / 2, top: note.cy - h / 2, bottom: note.cy + h / 2 });
  }
  return boxes.length ? { left: Math.min(...boxes.map(b => b.left)), top: Math.min(...boxes.map(b => b.top)),
    right: Math.max(...boxes.map(b => b.right)), bottom: Math.max(...boxes.map(b => b.bottom)) } : { left: 0, top: 0, right: 1, bottom: 1 };
}
/** Prototype fitBox/showHero, with measured overlays and no fixed minimum scale. */
export function composerView(layout: ComposerLayout, width: number, height: number, top: number, mode: "hero" | "fit"): ComposerView {
  const fit = (box: ComposerBounds, maximum: number): ComposerView => {
    const scale = Math.min(maximum, Math.max(1, width - 80) / Math.max(1, box.right - box.left), Math.max(1, height - top - 72) / Math.max(1, box.bottom - box.top));
    return { x: width / 2 - (box.left + box.right) * scale / 2, y: (top + height - 72) / 2 - (box.top + box.bottom) * scale / 2, scale };
  };
  const all = fit(composerBounds(layout), 1);
  if (mode === "fit" || !layout.cards.length) return all;
  const box = composerBounds(layout, width < 700 ? layout.heroOnly : layout.heroIdx);
  if (layout.heroPad) { const extra = (box.right - box.left) * layout.heroPad; box.left -= extra; box.right += extra; }
  const hero = fit(box, 1.05);
  return all.scale > hero.scale * .82 ? all : hero;
}
