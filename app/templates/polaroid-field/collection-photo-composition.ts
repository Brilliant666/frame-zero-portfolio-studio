import { COLLECTION_CARD_CHROME, type CollectionLayout, type CollectionLayoutCard, type CollectionPlacement } from "./collection-layout";
import { getRotatedBounds, withDecorationMargin } from "./viewport-fit";

const MAX_CARDS = 500;
const GAP = 28;
const INSET = 16;
export const PHOTO_COMPOSITION_COMPACT_WIDTH = 768;
export const PHOTO_COMPOSITION_DECORATION = 24;

/** Tape and finite shadow allowance, shared with viewport FIT. */
export function getPhotoCompositionBounds(card: CollectionPlacement) {
  return getRotatedBounds(withDecorationMargin(card, PHOTO_COMPOSITION_DECORATION));
}

function placeAt(card: CollectionPlacement, left: number, top: number): CollectionPlacement {
  const bounds = getPhotoCompositionBounds(card);
  return { ...card, left: card.left + left - bounds.left, top: card.top + top - bounds.top };
}

/** Runtime-only reading groups; saved members are never reordered. */
export type PhotoComposition = CollectionLayout & Readonly<{ readingGroups: readonly (readonly string[])[] }>;

export function buildCollectionPhotoComposition(
  cards: readonly CollectionLayoutCard[],
  options: Readonly<{ focusId?: string | null; viewportWidth?: number; kind?: "covers" | "photos" }> = {},
): PhotoComposition {
  if (cards.length > MAX_CARDS) throw new RangeError("A photo composition supports at most 500 cards.");
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new RangeError("Collection card IDs must be unique.");
  if (!cards.length) return { canvasWidth: 1, canvasHeight: 1, focusId: null, placements: [], threads: [], readingGroups: [] };
  const viewportWidth = Math.max(1, options.viewportWidth ?? 1280);
  const compact = viewportWidth < PHOTO_COMPOSITION_COMPACT_WIDTH;
  const focusIndex = Math.max(0, cards.findIndex((card) => card.id === options.focusId));
  const verticalChrome = options.kind === "covers" ? 108 : COLLECTION_CARD_CHROME.vertical;
  const metrics = cards.map((card, index): CollectionPlacement => {
    const ratio = Number.isFinite(card.aspectRatio) && card.aspectRatio > 0 ? card.aspectRatio : 1;
    const hero = index === focusIndex;
    const rotation = compact ? [-1.2, 1.4, -0.7][index % 3] : [-3.2, 2.5, -1.5, 3.5, -2.2][index % 5];
    const root = Math.sqrt(ratio);
    const area = hero ? 82000 : [51000, 43000, 56000][index % 3];
    let photoWidth = Math.sqrt(area) * root;
    let photoHeight = Math.sqrt(area) / root;
    if (compact) {
      // Solve the decorated rotated width. Tall images scroll naturally;
      // a height cap would turn portrait photographs into tiny thumbnails.
      const radians = Math.abs(rotation) * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const available = Math.max(1, viewportWidth - INSET * 2 - 8
        - (COLLECTION_CARD_CHROME.horizontal + 48) * cosine - (verticalChrome + 48) * sine);
      photoWidth = available / (cosine + sine / ratio);
      photoHeight = photoWidth / ratio;
    } else {
      const edge = hero ? 360 : 290;
      const scale = Math.min(1, edge / Math.max(photoWidth, photoHeight));
      photoWidth *= scale;
      photoHeight *= scale;
    }
    return { id: card.id, index, aspectRatio: ratio, photoWidth, photoHeight,
      width: photoWidth + COLLECTION_CARD_CHROME.horizontal, height: photoHeight + verticalChrome,
      left: 0, top: 0, rotation, zIndex: hero ? cards.length + 2 : index + 1,
      tone: (["coral", "blue", "sand", "ink"] as const)[index % 4] };
  });
  const readingGroups: string[][] = [];
  const positioned: CollectionPlacement[] = [];
  if (compact) {
    let top = INSET;
    for (const card of metrics) {
      const bounds = getPhotoCompositionBounds(card);
      const width = bounds.right - bounds.left;
      const placed = placeAt(card, (viewportWidth - width) / 2 + (card.index % 2 ? 3 : -3), top);
      positioned.push(placed);
      readingGroups.push([card.id]);
      top = getPhotoCompositionBounds(placed).bottom + GAP;
    }
  } else {
    // Sequential phrases run left-to-right, then continue in a band below.
    // No mirrored phrases, insertion before earlier photos, or focus promotion.
    const groupCount = Math.ceil(cards.length / 3);
    const groupsPerBand = Math.max(1, Math.ceil(Math.sqrt(groupCount * 0.5)));
    let bandTop = INSET;
    let bandBottom = bandTop;
    let left = INSET;
    for (let start = 0, group = 0; start < metrics.length; start += 3, group++) {
      if (group > 0 && group % groupsPerBand === 0) {
        bandTop = bandBottom + 46;
        left = INSET + (Math.floor(group / groupsPerBand) % 2 ? 18 : 0);
      }
      const phrase = metrics.slice(start, start + 3);
      readingGroups.push(phrase.map((card) => card.id));
      for (const [index, card] of phrase.entries()) {
        const placed = placeAt(card, left, bandTop + [18, 0, 32][index]);
        positioned.push(placed);
        const bounds = getPhotoCompositionBounds(placed);
        left = bounds.right + GAP;
        bandBottom = Math.max(bandBottom, bounds.bottom);
      }
      left += 24;
    }
  }
  const bounds = positioned.map(getPhotoCompositionBounds);
  return {
    canvasWidth: compact ? viewportWidth : Math.ceil(Math.max(...bounds.map((box) => box.right)) + INSET),
    canvasHeight: Math.ceil(Math.max(...bounds.map((box) => box.bottom)) + INSET),
    focusId: cards[focusIndex].id, placements: positioned, threads: [], readingGroups,
  };
}
