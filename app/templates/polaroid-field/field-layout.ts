export type PolaroidFieldRatio = "3:2" | "2:3" | "16:9";

export type PolaroidFieldTone = "coral" | "blue" | "ink" | "sand";

export type PolaroidFieldPlacement = Readonly<{
  slotIndex: number;
  ratio: PolaroidFieldRatio;
  band: "top" | "hero" | "bottom";
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  tone: PolaroidFieldTone;
}>;

export type PolaroidFieldThread = Readonly<{
  left: number;
  top: number;
  width: number;
  rotation: number;
}>;

export type PolaroidFieldBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type PolaroidFieldLayout = Readonly<{
  canvasWidth: number;
  canvasHeight: number;
  placements: readonly PolaroidFieldPlacement[];
  threads: readonly PolaroidFieldThread[];
}>;

export const POLAROID_FIELD_SLOT_COUNT = 9;
export const POLAROID_FIELD_SAFE_INSET_REM = 3.5;
export const POLAROID_FIELD_MIN_GAP_REM = 3;

const BASE_CANVAS_WIDTH_REM = 132;
const PERIMETER_PHOTO_HEIGHT_REM = 13;
const HERO_PHOTO_HEIGHT_REM = 18;
const CARD_HORIZONTAL_CHROME_REM = 1.7;
const CARD_VERTICAL_CHROME_REM = 6.2;
const PAIR_GAP_REM = 3.25;
const HERO_GAP_REM = 4.25;
const ROW_GAP_REM = 4.25;

const slotPresentation = [
  { rotation: -7, zIndex: 5, tone: "coral" },
  { rotation: 4, zIndex: 3, tone: "blue" },
  { rotation: -2, zIndex: 7, tone: "ink" },
  { rotation: 6, zIndex: 8, tone: "blue" },
  { rotation: -4, zIndex: 12, tone: "coral" },
  { rotation: 8, zIndex: 4, tone: "sand" },
  { rotation: 3, zIndex: 6, tone: "ink" },
  { rotation: -8, zIndex: 9, tone: "sand" },
  { rotation: 5, zIndex: 11, tone: "coral" },
] as const satisfies readonly Readonly<{
  rotation: number;
  zIndex: number;
  tone: PolaroidFieldTone;
}>[];

const threadPairs = [
  [0, 1],
  [1, 4],
  [4, 2],
  [2, 3],
  [0, 5],
  [5, 6],
  [6, 4],
  [4, 7],
  [7, 8],
  [3, 8],
] as const;

type CardMetrics = Readonly<{
  width: number;
  height: number;
  rotatedWidth: number;
  rotatedHeight: number;
  rotation: number;
}>;

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function ratioValue(ratio: PolaroidFieldRatio) {
  if (ratio === "2:3") return 2 / 3;
  if (ratio === "16:9") return 16 / 9;
  return 3 / 2;
}

function cardMetrics(ratio: PolaroidFieldRatio, photoHeight: number, rotation: number): CardMetrics {
  const width = photoHeight * ratioValue(ratio) + CARD_HORIZONTAL_CHROME_REM;
  const height = photoHeight + CARD_VERTICAL_CHROME_REM;
  const radians = rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width,
    height,
    rotatedWidth: width * cosine + height * sine,
    rotatedHeight: width * sine + height * cosine,
    rotation,
  };
}

function rowHeight(metrics: readonly CardMetrics[]) {
  return Math.max(...metrics.map((item) => item.rotatedHeight));
}

function pairWidth(metrics: readonly [CardMetrics, CardMetrics]) {
  return metrics[0].rotatedWidth + PAIR_GAP_REM + metrics[1].rotatedWidth;
}

function placementFromBounds(
  slotIndex: number,
  ratio: PolaroidFieldRatio,
  band: PolaroidFieldPlacement["band"],
  metrics: CardMetrics,
  boundsLeft: number,
  boundsTop: number,
): PolaroidFieldPlacement {
  const presentation = slotPresentation[slotIndex];
  return Object.freeze({
    slotIndex,
    ratio,
    band,
    left: round(boundsLeft + (metrics.rotatedWidth - metrics.width) / 2),
    top: round(boundsTop + (metrics.rotatedHeight - metrics.height) / 2),
    width: round(metrics.width),
    height: round(metrics.height),
    rotation: presentation.rotation,
    zIndex: presentation.zIndex,
    tone: presentation.tone,
  });
}

function placePair(
  slotIndexes: readonly [number, number],
  ratios: readonly PolaroidFieldRatio[],
  metrics: readonly [CardMetrics, CardMetrics],
  band: "top" | "bottom",
  rowTop: number,
  rowSize: number,
  pairLeft: number,
) {
  const first = placementFromBounds(
    slotIndexes[0],
    ratios[slotIndexes[0]],
    band,
    metrics[0],
    pairLeft,
    rowTop + (rowSize - metrics[0].rotatedHeight) / 2,
  );
  const second = placementFromBounds(
    slotIndexes[1],
    ratios[slotIndexes[1]],
    band,
    metrics[1],
    pairLeft + metrics[0].rotatedWidth + PAIR_GAP_REM,
    rowTop + (rowSize - metrics[1].rotatedHeight) / 2,
  );
  return [first, second] as const;
}

export function getPolaroidFieldPlacementBounds(
  placement: PolaroidFieldPlacement,
): PolaroidFieldBounds {
  const radians = placement.rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const rotatedWidth = placement.width * cosine + placement.height * sine;
  const rotatedHeight = placement.width * sine + placement.height * cosine;
  const centerX = placement.left + placement.width / 2;
  const centerY = placement.top + placement.height / 2;
  return Object.freeze({
    left: centerX - rotatedWidth / 2,
    top: centerY - rotatedHeight / 2,
    right: centerX + rotatedWidth / 2,
    bottom: centerY + rotatedHeight / 2,
  });
}

function threadBetween(
  from: PolaroidFieldPlacement,
  to: PolaroidFieldPlacement,
): PolaroidFieldThread {
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  const toX = to.left + to.width / 2;
  const toY = to.top + to.height / 2;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  return Object.freeze({
    left: round(fromX),
    top: round(fromY),
    width: round(Math.hypot(deltaX, deltaY)),
    rotation: round(Math.atan2(deltaY, deltaX) * 180 / Math.PI),
  });
}

/**
 * Builds a two-row constellation around the fixed central hero. Card widths
 * follow the actual presentation ratio while photo heights stay constant, so
 * portrait and landscape sources remain equally legible. Rotated AABBs, not
 * unrotated boxes, determine every gap and canvas boundary.
 */
export function buildPolaroidFieldLayout(
  ratios: readonly PolaroidFieldRatio[],
): PolaroidFieldLayout {
  if (ratios.length !== POLAROID_FIELD_SLOT_COUNT) {
    throw new RangeError(`Polaroid field requires exactly ${POLAROID_FIELD_SLOT_COUNT} ratios.`);
  }

  const metrics = ratios.map((ratio, slotIndex) => cardMetrics(
    ratio,
    slotIndex === 4 ? HERO_PHOTO_HEIGHT_REM : PERIMETER_PHOTO_HEIGHT_REM,
    slotPresentation[slotIndex].rotation,
  ));
  const topMetrics = [metrics[0], metrics[1], metrics[2], metrics[3]] as const;
  const bottomMetrics = [metrics[5], metrics[6], metrics[7], metrics[8]] as const;
  const heroMetrics = metrics[4];
  const topRowHeight = rowHeight(topMetrics);
  const bottomRowHeight = rowHeight(bottomMetrics);
  const canvasHeight = Math.max(
    topRowHeight + bottomRowHeight + ROW_GAP_REM + POLAROID_FIELD_SAFE_INSET_REM * 2,
    heroMetrics.rotatedHeight + POLAROID_FIELD_SAFE_INSET_REM * 2,
  );
  const maximumSideWidth = Math.max(
    pairWidth([metrics[0], metrics[1]]),
    pairWidth([metrics[2], metrics[3]]),
    pairWidth([metrics[5], metrics[6]]),
    pairWidth([metrics[7], metrics[8]]),
  );
  const canvasWidth = Math.max(
    BASE_CANVAS_WIDTH_REM,
    2 * (
      heroMetrics.rotatedWidth / 2
      + HERO_GAP_REM
      + maximumSideWidth
      + POLAROID_FIELD_SAFE_INSET_REM
    ),
  );
  const heroBoundsLeft = (canvasWidth - heroMetrics.rotatedWidth) / 2;
  const heroBoundsTop = (canvasHeight - heroMetrics.rotatedHeight) / 2;
  const hero = placementFromBounds(
    4,
    ratios[4],
    "hero",
    heroMetrics,
    heroBoundsLeft,
    heroBoundsTop,
  );
  const topRowTop = POLAROID_FIELD_SAFE_INSET_REM;
  const bottomRowTop = canvasHeight - POLAROID_FIELD_SAFE_INSET_REM - bottomRowHeight;
  const leftLimit = heroBoundsLeft - HERO_GAP_REM;
  const rightLimit = heroBoundsLeft + heroMetrics.rotatedWidth + HERO_GAP_REM;
  const topLeftMetrics = [metrics[0], metrics[1]] as const;
  const topRightMetrics = [metrics[2], metrics[3]] as const;
  const bottomLeftMetrics = [metrics[5], metrics[6]] as const;
  const bottomRightMetrics = [metrics[7], metrics[8]] as const;
  const topLeft = placePair(
    [0, 1], ratios, topLeftMetrics, "top", topRowTop, topRowHeight,
    leftLimit - pairWidth(topLeftMetrics),
  );
  const topRight = placePair(
    [2, 3], ratios, topRightMetrics, "top", topRowTop, topRowHeight,
    rightLimit,
  );
  const bottomLeft = placePair(
    [5, 6], ratios, bottomLeftMetrics, "bottom", bottomRowTop, bottomRowHeight,
    leftLimit - pairWidth(bottomLeftMetrics),
  );
  const bottomRight = placePair(
    [7, 8], ratios, bottomRightMetrics, "bottom", bottomRowTop, bottomRowHeight,
    rightLimit,
  );
  const placements = [
    ...topLeft,
    ...topRight,
    hero,
    ...bottomLeft,
    ...bottomRight,
  ].sort((left, right) => left.slotIndex - right.slotIndex);
  const threads = threadPairs.map(([from, to]) => threadBetween(placements[from], placements[to]));

  return Object.freeze({
    canvasWidth: round(canvasWidth),
    canvasHeight: round(canvasHeight),
    placements: Object.freeze(placements),
    threads: Object.freeze(threads),
  });
}
