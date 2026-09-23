import { getRotatedBounds, type Bounds } from "./viewport-fit";
import type { PolaroidFieldThread, PolaroidFieldTone } from "./field-layout";

export type CollectionLayoutCard = Readonly<{ id: string; aspectRatio: number }>;
export type CollectionPlacement = CollectionLayoutCard & Readonly<{
  index: number; left: number; top: number; width: number; height: number;
  photoWidth: number; photoHeight: number; rotation: number; zIndex: number;
  tone: PolaroidFieldTone;
}>;
export type CollectionLayout = Readonly<{
  canvasWidth: number; canvasHeight: number; focusId: string | null;
  placements: readonly CollectionPlacement[]; threads: readonly PolaroidFieldThread[];
}>;
export const COLLECTION_CARD_CHROME = Object.freeze({ horizontal: 24, vertical: 68 });
const INSET = 56;
const GAP = 42;
const ROTATIONS = [-5, 6, -7, 3, -3, 7, -6, 4, -2];
const TONES: readonly PolaroidFieldTone[] = ["coral", "blue", "ink", "sand"];

export function getCollectionPlacementBounds(placement: CollectionPlacement): Bounds {
  return getRotatedBounds(placement);
}

function intersects(a: Bounds, b: Bounds) {
  return a.left < b.right + GAP && a.right + GAP > b.left
    && a.top < b.bottom + GAP && a.bottom + GAP > b.top;
}

function moveCenter(card: CollectionPlacement, x: number, y: number): CollectionPlacement {
  return { ...card, left: x - card.width / 2, top: y - card.height / 2 };
}

function thread(from: CollectionPlacement, to: CollectionPlacement): PolaroidFieldThread {
  const left = from.left + from.width / 2;
  const top = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - left;
  const dy = to.top + to.height / 2 - top;
  return { left, top, width: Math.hypot(dx, dy), rotation: Math.atan2(dy, dx) * 180 / Math.PI };
}

/** Pixel geometry for a growing, pannable scene. Fitting the entire scene is a
 * separate user action: a large collection must not shrink its cards by default. */
export function buildCollectionLayout(
  cards: readonly CollectionLayoutCard[],
  options: Readonly<{ focusId?: string | null; kind?: "covers" | "photos"; viewportWidth?: number }> = {},
): CollectionLayout {
  if (!cards.length) return { canvasWidth: 960, canvasHeight: 640, focusId: null, placements: [], threads: [] };
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new RangeError("Collection card IDs must be unique.");
  const focusIndex = Math.max(0, cards.findIndex((card) => card.id === options.focusId));
  const compact = (options.viewportWidth ?? 1280) < 600;
  const kind = options.kind ?? "photos";
  const metrics = cards.map((card, index): CollectionPlacement => {
    const aspectRatio = Number.isFinite(card.aspectRatio) && card.aspectRatio > 0 ? card.aspectRatio : 1;
    const hero = index === focusIndex;
    // Limit the longest photo edge, not its ratio. Extreme panoramas remain whole.
    const edge = hero ? 350 : kind === "covers" ? 320 : 244;
    const photoWidth = compact ? (aspectRatio >= 1 ? 206 : 166) : aspectRatio >= 1 ? edge : edge * aspectRatio;
    const photoHeight = photoWidth / aspectRatio;
    return {
      id: card.id, aspectRatio, index, photoWidth, photoHeight,
      width: photoWidth + COLLECTION_CARD_CHROME.horizontal,
      height: photoHeight + COLLECTION_CARD_CHROME.vertical,
      left: 0, top: 0, rotation: ROTATIONS[index % ROTATIONS.length],
      zIndex: hero ? cards.length + 2 : index + 1, tone: TONES[index % TONES.length],
    };
  });
  const positioned: CollectionPlacement[] = [];
  const specialCovers = kind === "covers" && cards.length <= 3;
  const angles = [-155, -25, 155, 25, -170, -10, 170, 10];
  if (compact) {
    // The same rotated scene grows down the document on narrow screens. Native
    // scrolling keeps photos readable instead of fitting a large map to a stamp.
    let nextTop = 0;
    const ordered = kind === "covers"
      ? [metrics[focusIndex], ...metrics.filter((card) => card.index !== focusIndex)] : metrics;
    for (const [position, card] of ordered.entries()) {
      const centered = moveCenter(card, position % 2 ? 16 : -16, 0);
      const bounds = getRotatedBounds(centered);
      const placed = { ...centered, top: centered.top + nextTop - bounds.top };
      positioned.push(placed);
      nextTop = getRotatedBounds(placed).bottom + 42;
    }
  } else if (kind === "photos") {
    const hero = moveCenter(metrics[focusIndex], 0, 0);
    positioned.push(hero);
    const heroBounds = getRotatedBounds(hero);
    const remaining = metrics.filter((card) => card.index !== focusIndex);
    const columnWidth = Math.max(0, ...remaining.map((card) => {
      const bounds = getRotatedBounds(card);
      return bounds.right - bounds.left;
    }));
    for (const [position, card] of remaining.entries()) {
      const column = Math.floor(position / 4);
      const rightSide = position % 2 === 1;
      const upper = position % 4 < 2;
      const centered = moveCenter(card, 0, 0);
      const bounds = getRotatedBounds(centered);
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;
      const columnEdge = rightSide ? heroBounds.right + GAP + column * (columnWidth + GAP)
        : heroBounds.left - GAP - column * (columnWidth + GAP) - width;
      const stagger = [12, 0, 8, 20][position % 4];
      const rowTop = upper ? -GAP / 2 - height - stagger : GAP / 2 + stagger;
      positioned.push({ ...centered, left: centered.left + columnEdge - bounds.left, top: centered.top + rowTop - bounds.top });
    }
  } else {
  positioned.push(moveCenter(metrics[focusIndex], 0, 0));
  let satellite = 0;
  for (const card of metrics) {
    if (card.index === focusIndex) continue;
    // The lower-left satellite sits below the identity copy, balancing the
    // upper-right satellite across the larger, central-right focus card.
    const angle = (specialCovers ? [-30, 150][satellite] : angles[satellite % angles.length]) * Math.PI / 180;
    let radius = 300 + Math.floor(satellite / angles.length) * 235;
    let candidate: CollectionPlacement;
    do {
      candidate = moveCenter(card, Math.cos(angle) * radius, Math.sin(angle) * radius * 0.88);
      radius += 18;
    } while (positioned.some((placed) => intersects(getRotatedBounds(candidate), getRotatedBounds(placed))));
    positioned.push(candidate);
    satellite++;
  }
  }
  const bounds = positioned.map(getRotatedBounds);
  const left = Math.min(...bounds.map((item) => item.left));
  const top = Math.min(...bounds.map((item) => item.top));
  const right = Math.max(...bounds.map((item) => item.right));
  const bottom = Math.max(...bounds.map((item) => item.bottom));
  const identityReserve = specialCovers && !compact ? 80 : 0;
  const inset = compact ? 16 : INSET;
  const placements = positioned.map((card) => ({
    ...card, left: card.left - left + inset + identityReserve, top: card.top - top + inset,
  })).sort((a, b) => a.index - b.index);
  const focus = placements[focusIndex];
  // Each satellite connects to its nearest earlier card. This keeps threads
  // local as the field expands, instead of radiating every line from the hero.
  const connected = [focus];
  const threads: PolaroidFieldThread[] = [];
  for (const card of placements) {
    if (card.id === focus.id) continue;
    const nearest = connected.reduce((best, other) => {
      const distance = (item: CollectionPlacement) => Math.hypot(
        card.left + card.width / 2 - item.left - item.width / 2,
        card.top + card.height / 2 - item.top - item.height / 2,
      );
      return distance(other) < distance(best) ? other : best;
    });
    threads.push(thread(nearest, card));
    connected.push(card);
  }
  return {
    canvasWidth: Math.ceil(right - left + inset * 2 + identityReserve),
    canvasHeight: Math.ceil(bottom - top + inset * 2), focusId: focus.id, placements, threads,
  };
}
