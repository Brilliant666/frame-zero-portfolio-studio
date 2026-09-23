import { COLLECTION_CARD_CHROME, type CollectionLayout, type CollectionLayoutCard, type CollectionPlacement } from "./collection-layout";
import { getRotatedBounds, type Bounds } from "./viewport-fit";

const MAX_CARDS = 500;
const GAP = 28;
const CLUSTER_GAP = 52;
const INSET = 40;
type Cluster = { cards: CollectionPlacement[]; width: number; height: number; left: number; top: number };

function overlaps(a: Bounds, b: Bounds, gap = GAP) {
  return a.left < b.right + gap && a.right + gap > b.left
    && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

function placeAt(card: CollectionPlacement, left: number, top: number): CollectionPlacement {
  const bounds = getRotatedBounds(card);
  return { ...card, left: card.left + left - bounds.left, top: card.top + top - bounds.top };
}

function hash(id: string) {
  let value = 0;
  for (const char of id) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

function clusterBounds(cluster: Cluster): Bounds {
  return { left: cluster.left, top: cluster.top, right: cluster.left + cluster.width, bottom: cluster.top + cluster.height };
}

/** Three-photo editorial phrases, rather than columns or a ring around a centre.
 * Their bounding boxes make collision checks bounded and independent of ratios. */
function makeCluster(cards: CollectionPlacement[], reverse: boolean): Cluster {
  const placed = [placeAt(cards[0], 0, 0)];
  if (cards[1]) {
    const first = getRotatedBounds(placed[0]);
    placed.push(placeAt(cards[1], first.right + GAP, reverse ? 0 : 72));
  }
  if (cards[2]) {
    const first = getRotatedBounds(placed[0]);
    const second = placed[1] && getRotatedBounds(placed[1]);
    const third = placeAt(cards[2], first.right + GAP + (reverse ? 18 : 0), second ? second.bottom + GAP : first.bottom + GAP);
    placed.push(third);
  }
  const bounds = placed.map(getRotatedBounds);
  const width = Math.max(...bounds.map((box) => box.right));
  const height = Math.max(...bounds.map((box) => box.bottom));
  // Mirror the complete phrase, not its image content.
  const mirrored = reverse ? placed.map((card) => {
    const bounds = getRotatedBounds(card);
    return placeAt(card, width - bounds.right, bounds.top);
  }) : placed;
  return { cards: mirrored, width, height, left: 0, top: 0 };
}

function arrangeClusters(clusters: Cluster[]) {
  const placed: Cluster[] = [];
  for (const [index, cluster] of clusters.entries()) {
    if (index === 0) { placed.push({ ...cluster, left: 0, top: 76 }); continue; }
    if (index === 1) { placed.push({ ...cluster, left: placed[0].width + CLUSTER_GAP, top: 0 }); continue; }
    if (index === 2) {
      const existing = placed.flatMap((item) => item.cards.map((card) => getRotatedBounds({ ...card, left: card.left + item.left, top: card.top + item.top })));
      const right = Math.max(...existing.map((box) => box.right));
      const bottom = Math.max(...existing.map((box) => box.bottom));
      let best = { left: right + CLUSTER_GAP, top: 0 };
      let bestScore = Infinity;
      // Only the opening three phrases interlock: actual card bounds allow
      // the third phrase into the others' negative space without overlaps.
      // Forty-pixel candidates bound the work to a small, deterministic grid;
      // the selected card positions themselves are never a photo grid.
      for (let left = 0; left <= right + CLUSTER_GAP; left += 40) {
        for (let top = 0; top <= bottom + CLUSTER_GAP; top += 40) {
          const boxes = cluster.cards.map((card) => getRotatedBounds({ ...card, left: card.left + left, top: card.top + top }));
          if (boxes.some((box) => existing.some((other) => overlaps(box, other, CLUSTER_GAP)))) continue;
          const width = Math.max(right, ...boxes.map((box) => box.right));
          const height = Math.max(bottom, ...boxes.map((box) => box.bottom));
          const score = width * height + Math.abs(width - height * 1.8) ** 2 * 3;
          if (score < bestScore) { best = { left, top }; bestScore = score; }
        }
      }
      placed.push({ ...cluster, ...best });
      continue;
    }
    // At most six candidates per prior cluster, plus two guaranteed fallbacks.
    // No random seed, unbounded retry, or per-pixel optimization.
    const right = Math.max(...placed.map((item) => item.left + item.width));
    const bottom = Math.max(...placed.map((item) => item.top + item.height));
    const candidates = placed.flatMap((item) => [-80, 0, 80].flatMap((offset) => [
      { left: item.left + item.width + CLUSTER_GAP, top: Math.max(0, item.top + offset) },
      { left: Math.max(0, item.left + offset), top: item.top + item.height + CLUSTER_GAP },
    ]));
    candidates.push({ left: right + CLUSTER_GAP, top: 0 }, { left: 0, top: bottom + CLUSTER_GAP });
    let best = candidates[candidates.length - 1];
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const box = clusterBounds({ ...cluster, ...candidate });
      if (placed.some((item) => overlaps(box, clusterBounds(item), CLUSTER_GAP))) continue;
      const width = Math.max(right, box.right);
      const height = Math.max(bottom, box.bottom);
      const score = width * height + Math.abs(width - height * 1.15) ** 2 * 0.7;
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    placed.push({ ...cluster, ...best });
  }
  return placed.flatMap((cluster) => cluster.cards.map((card) => ({ ...card, left: card.left + cluster.left, top: card.top + cluster.top })));
}

export function buildCollectionPhotoComposition(
  cards: readonly CollectionLayoutCard[],
  options: Readonly<{ focusId?: string | null; viewportWidth?: number }> = {},
): CollectionLayout {
  if (cards.length > MAX_CARDS) throw new RangeError("A photo composition supports at most 500 cards.");
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new RangeError("Collection card IDs must be unique.");
  if (!cards.length) return { canvasWidth: 960, canvasHeight: 640, focusId: null, placements: [], threads: [] };
  const focusIndex = Math.max(0, cards.findIndex((card) => card.id === options.focusId));
  const compact = (options.viewportWidth ?? 1280) < 600;
  const secondaryIndex = cards.length > 1 ? (focusIndex === 0 ? Math.min(3, cards.length - 1) : 0) : -1;
  const metrics = cards.map((card, index): CollectionPlacement => {
    const ratio = Number.isFinite(card.aspectRatio) && card.aspectRatio > 0 ? card.aspectRatio : 1;
    const hero = index === focusIndex;
    const secondary = index === secondaryIndex;
    const area = hero ? 94000 : secondary ? 61000 : 33000;
    // Two square roots avoid overflow for extremely large finite positive ratios.
    const root = Math.sqrt(ratio);
    let photoWidth = Math.sqrt(area) * root;
    let photoHeight = Math.sqrt(area) / root;
    const longest = compact ? (hero ? 278 : secondary ? 240 : 214) : hero ? 410 : secondary ? 350 : 280;
    const scale = Math.min(1, longest / Math.max(photoWidth, photoHeight));
    photoWidth *= scale;
    photoHeight *= scale;
    const rotation = hero ? -2.2 : secondary ? 2.8 : (hash(card.id) % 71 - 35) / 10;
    if (compact) {
      const maxWidth = Math.max(140, Math.min(360, options.viewportWidth ?? 390) - 52);
      const radians = Math.abs(rotation) * Math.PI / 180;
      const available = maxWidth - COLLECTION_CARD_CHROME.horizontal * Math.cos(radians) - COLLECTION_CARD_CHROME.vertical * Math.sin(radians);
      const mobileScale = Math.min(1, available / (photoWidth * Math.cos(radians) + photoHeight * Math.sin(radians)));
      photoWidth *= mobileScale;
      photoHeight *= mobileScale;
    }
    return { id: card.id, index, aspectRatio: ratio, photoWidth, photoHeight,
      width: photoWidth + COLLECTION_CARD_CHROME.horizontal, height: photoHeight + COLLECTION_CARD_CHROME.vertical,
      left: 0, top: 0, rotation, zIndex: hero ? cards.length + 2 : index + 1,
      tone: hero ? "coral" : secondary ? "blue" : hash(card.id) % 2 ? "sand" : "ink" };
  });
  let positioned: CollectionPlacement[];
  if (compact) {
    let top = 0;
    positioned = metrics.map((card) => {
      const offset = card.index === focusIndex ? 0 : hash(card.id) % 23;
      const placed = placeAt(card, offset, top);
      top = getRotatedBounds(placed).bottom + 28;
      return placed;
    });
  } else {
    const remaining = metrics.filter((card) => card.index !== focusIndex && card.index !== secondaryIndex);
    const ordered = [metrics[focusIndex], ...remaining.slice(0, 2), ...(secondaryIndex >= 0 ? [metrics[secondaryIndex]] : []), ...remaining.slice(2)];
    const clusters: Cluster[] = [];
    for (let index = 0; index < ordered.length; index += 3) clusters.push(makeCluster(ordered.slice(index, index + 3), clusters.length % 2 === 1));
    positioned = arrangeClusters(clusters);
  }
  const bounds = positioned.map(getRotatedBounds);
  const left = Math.min(...bounds.map((box) => box.left));
  const top = Math.min(...bounds.map((box) => box.top));
  const inset = compact ? 14 : INSET;
  const placements = positioned.map((card) => ({ ...card, left: card.left - left + inset, top: card.top - top + inset })).sort((a, b) => a.index - b.index);
  return {
    canvasWidth: Math.ceil(Math.max(...bounds.map((box) => box.right)) - left + inset * 2),
    canvasHeight: Math.ceil(Math.max(...bounds.map((box) => box.bottom)) - top + inset * 2),
    focusId: cards[focusIndex].id, placements, threads: [],
  };
}
