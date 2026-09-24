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
export type ComposerFitOptions = { mode: ComposerMode; overlays: readonly ComposerBounds[] };
export function composerNoteBounds(layout: ComposerLayout): ComposerBounds | null {
  if (!layout.note) return null;
  const note = layout.note, a = note.rot * Math.PI / 180;
  // The paper is 250 x 160; include its shadow and rotation, just as FIT does.
  const w = Math.abs(286 * Math.cos(a)) + Math.abs(196 * Math.sin(a));
  const h = Math.abs(286 * Math.sin(a)) + Math.abs(196 * Math.cos(a));
  return { left: note.cx - w / 2, right: note.cx + w / 2, top: note.cy - h / 2, bottom: note.cy + h / 2 };
}
function unionBounds(a: ComposerBounds, b: ComposerBounds): ComposerBounds {
  return { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
}
export function composerBounds(layout: ComposerLayout, indices?: readonly number[]): ComposerBounds {
  const cards = indices ? indices.map(index => layout.cards[index]).filter(Boolean) : layout.cards;
  const boxes = cards.map(card => {
    const angle = card.rot * Math.PI / 180, w = card.w + 72, h = card.h + 72;
    const rw = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle));
    const rh = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle));
    return { left: card.x - rw / 2, right: card.x + rw / 2, top: card.y - rh / 2, bottom: card.y + rh / 2 };
  });
  const note = composerNoteBounds(layout);
  if (!indices && note) boxes.push(note);
  return boxes.length ? { left: Math.min(...boxes.map(b => b.left)), top: Math.min(...boxes.map(b => b.top)),
    right: Math.max(...boxes.map(b => b.right)), bottom: Math.max(...boxes.map(b => b.bottom)) } : { left: 0, top: 0, right: 1, bottom: 1 };
}
/** Prototype fitBox/showHero, with measured overlays and no fixed minimum scale. */
export function composerView(layout: ComposerLayout, width: number, height: number, top: number, mode: "hero" | "fit", options?: ComposerFitOptions): ComposerView {
  const fit = (box: ComposerBounds, maximum: number): ComposerView => {
    const scale = Math.min(maximum, Math.max(1, width - 80) / Math.max(1, box.right - box.left), Math.max(1, height - top - 72) / Math.max(1, box.bottom - box.top));
    return { x: width / 2 - (box.left + box.right) * scale / 2, y: (top + height - 72) / 2 - (box.top + box.bottom) * scale / 2, scale };
  };
  const all = fit(composerBounds(layout), 1);
  if (mode === "fit" && options?.mode === "scatter" && options.overlays.length && layout.cards.length) {
    const bounds = composerBounds(layout), boxes = layout.cards.map((_,i) => composerBounds(layout,[i]));
    const noteBounds = composerNoteBounds(layout); if (noteBounds) boxes.push(noteBounds);
    const obstacles = options.overlays.map(b => ({left:b.left-8,right:b.right+8,top:b.top-8,bottom:b.bottom+8}));
    const upper = Math.min(1, Math.max(1,width-80)/(bounds.right-bounds.left), Math.max(1,height-24-72)/(bounds.bottom-bounds.top));
    // Bounded search, with the original full-header fit as a guaranteed fallback.
    // Try larger safe views first; card geometry/order never changes here.
    for (let step=0;step<12;step++) {
      const scale = upper + (all.scale-upper)*step/12;
      if (scale<=all.scale) break;
      const minX=40-bounds.left*scale,maxX=width-40-bounds.right*scale;
      const minY=24-bounds.top*scale,maxY=height-72-bounds.bottom*scale;
      const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
      for (const x of [centerX,minX,maxX]) {
        const candidates=[centerY,minY,maxY];
        for(const box of boxes) for(const obstacle of obstacles) {
          if(box.right*scale+x<=obstacle.left || box.left*scale+x>=obstacle.right) continue;
          candidates.push(obstacle.top-box.bottom*scale,obstacle.bottom-box.top*scale);
        }
        const ys=[...new Set(candidates)].filter(y=>y>=minY-1e-7 && y<=maxY+1e-7)
          .sort((a,b)=>Math.abs(a-centerY)-Math.abs(b-centerY)).slice(0,20);
        for(const y of ys) {
          const clear=boxes.every(box=>obstacles.every(obstacle=>box.right*scale+x<=obstacle.left+1e-7 || box.left*scale+x>=obstacle.right-1e-7 || box.bottom*scale+y<=obstacle.top+1e-7 || box.top*scale+y>=obstacle.bottom-1e-7));
          if(clear) return {x,y,scale};
        }
      }
    }
  }
  if (mode === "fit" || !layout.cards.length) return all;
  const note = composerNoteBounds(layout);
  const opening = new Set(layout.openingCluster ?? []);
  const noteWithHero = layout.heroStartsOpeningCluster ?? layout.heroOnly.includes(0);
  let indices = width < 700 ? layout.heroOnly : layout.heroIdx;
  // In the constellation path, the next group in saved order may start a new
  // row. Framing both rows is then an overview, not an introduction to the hero.
  // Keep the complete hero group (including its auxiliary photographs) instead.
  // Same-row neighbours, scatter piles and editorial spreads retain their own
  // framing. This is a spatial relationship, not a universal zoom/size quota.
  if (width >= 700 && layout.lines.length > 0 && !note && layout.heroOnly.length > 1) {
    const neighbours = indices.filter(i => !layout.heroOnly.includes(i));
    if (neighbours.length) {
      const group = composerBounds(layout, layout.heroOnly);
      const adjacent = composerBounds(layout, neighbours);
      if (adjacent.top >= group.bottom || adjacent.bottom <= group.top) indices = layout.heroOnly;
    }
  }
  let box = composerBounds(layout, note && !noteWithHero ? indices.filter(i => !opening.has(i)) : indices);
  if (note && noteWithHero) box = unionBounds(box, note);
  const hero = fit(box, 1.05);
  if (!note || noteWithHero) return all.scale > hero.scale * .82 ? all : hero;

  // Automatic views must not cut a distant title paper into a stray fragment.
  // Pan only inside the range that still contains the local composition. Manual
  // drag/zoom never calls this correction.
  const excludeNote = (view: ComposerView, bounds: ComposerBounds): ComposerView | null => {
    const s = view.scale;
    if (note.right * s + view.x <= -8 || note.left * s + view.x >= width + 8 ||
        note.bottom * s + view.y <= -8 || note.top * s + view.y >= height + 8) return view;
    const minX = 40 - bounds.left * s, maxX = width - 40 - bounds.right * s;
    const minY = top - bounds.top * s, maxY = height - 72 - bounds.bottom * s;
    const candidates = [
      { ...view, x: Math.min(view.x, -8 - note.right * s) },
      { ...view, x: Math.max(view.x, width + 8 - note.left * s) },
      { ...view, y: Math.min(view.y, -8 - note.bottom * s) },
      { ...view, y: Math.max(view.y, height + 8 - note.top * s) },
    ].filter(v => v.x >= minX - 1e-7 && v.x <= maxX + 1e-7 && v.y >= minY - 1e-7 && v.y <= maxY + 1e-7);
    candidates.sort((a,b) => Math.hypot(a.x-view.x,a.y-view.y) - Math.hypot(b.x-view.x,b.y-view.y));
    return candidates[0] ?? null;
  };
  const local = excludeNote(hero, box);
  if (local) return local;
  const group = composerBounds(layout, layout.heroOnly);
  const groupView = fit(group, 1.05);
  const framedGroup = excludeNote(groupView, group);
  if (framedGroup) return framedGroup;
  const principal = composerBounds(layout, layout.cards.flatMap((card, i) => card.role === "hero" ? [i] : []));
  // A small extra zoom can clear a paper above the hero without clipping it;
  // the actual available rectangle, not the decorative 105% cap, is the limit.
  const principalView = fit(principal, Number.POSITIVE_INFINITY);
  return excludeNote(principalView, principal) ?? principalView;
}
