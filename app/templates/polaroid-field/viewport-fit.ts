export type ViewState = Readonly<{
  x: number;
  y: number;
  scale: number;
}>;

export type ViewportSize = Readonly<{
  width: number;
  height: number;
}>;

export type RotatedRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}>;

export type Bounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type ViewportFit = Readonly<{
  viewport: ViewportSize;
  canvas: ViewportSize;
  content: Bounds;
  inset: number;
  view: ViewState;
}>;

export type PanBounds = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}>;

const EPSILON = 0.0001;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function getRotatedBounds(rect: RotatedRect): Bounds {
  const radians = rect.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotatedWidth = Math.abs(rect.width * cosine) + Math.abs(rect.height * sine);
  const rotatedHeight = Math.abs(rect.width * sine) + Math.abs(rect.height * cosine);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return {
    left: centerX - rotatedWidth / 2,
    top: centerY - rotatedHeight / 2,
    right: centerX + rotatedWidth / 2,
    bottom: centerY + rotatedHeight / 2,
  };
}

export function getMinimumScale(fitScale: number, preferredMinimum = 0.72) {
  return Math.min(preferredMinimum, fitScale);
}

export function fitRectsToViewport(
  viewport: ViewportSize,
  canvas: ViewportSize,
  rects: readonly RotatedRect[],
  inset = 32,
  maximumScale = 1,
): ViewportFit | null {
  if (
    !isPositiveFinite(viewport.width)
    || !isPositiveFinite(viewport.height)
    || !isPositiveFinite(canvas.width)
    || !isPositiveFinite(canvas.height)
    || !isPositiveFinite(maximumScale)
    || rects.length === 0
  ) {
    return null;
  }

  const safeInset = Math.max(0, inset);
  const availableWidth = viewport.width - safeInset * 2;
  const availableHeight = viewport.height - safeInset * 2;
  if (!isPositiveFinite(availableWidth) || !isPositiveFinite(availableHeight)) return null;

  const rotated = rects.map(getRotatedBounds);
  const content = rotated.reduce<Bounds>((combined, bounds) => ({
    left: Math.min(combined.left, bounds.left),
    top: Math.min(combined.top, bounds.top),
    right: Math.max(combined.right, bounds.right),
    bottom: Math.max(combined.bottom, bounds.bottom),
  }), rotated[0]);
  const contentWidth = content.right - content.left;
  const contentHeight = content.bottom - content.top;
  if (!isPositiveFinite(contentWidth) || !isPositiveFinite(contentHeight)) return null;

  const scale = Math.min(maximumScale, availableWidth / contentWidth, availableHeight / contentHeight);
  const contentCenterX = (content.left + content.right) / 2;
  const contentCenterY = (content.top + content.bottom) / 2;

  return {
    viewport,
    canvas,
    content,
    inset: safeInset,
    view: {
      x: (canvas.width / 2 - contentCenterX) * scale,
      y: (canvas.height / 2 - contentCenterY) * scale,
      scale,
    },
  };
}

export function getPanBounds(fit: ViewportFit, scale: number): PanBounds {
  const contentWidth = fit.content.right - fit.content.left;
  const contentHeight = fit.content.bottom - fit.content.top;
  const availableWidth = fit.viewport.width - fit.inset * 2;
  const availableHeight = fit.viewport.height - fit.inset * 2;
  const contentCenterX = (fit.content.left + fit.content.right) / 2;
  const contentCenterY = (fit.content.top + fit.content.bottom) / 2;
  const centerX = (fit.canvas.width / 2 - contentCenterX) * scale;
  const centerY = (fit.canvas.height / 2 - contentCenterY) * scale;
  const overflowX = Math.max(0, (contentWidth * scale - availableWidth) / 2);
  const overflowY = Math.max(0, (contentHeight * scale - availableHeight) / 2);

  return {
    minX: centerX - overflowX,
    maxX: centerX + overflowX,
    minY: centerY - overflowY,
    maxY: centerY + overflowY,
  };
}

export function constrainView(
  view: ViewState,
  fit: ViewportFit,
  minimumScale: number,
  maximumScale: number,
): ViewState {
  const scale = clamp(view.scale, minimumScale, maximumScale);
  const bounds = getPanBounds(fit, scale);

  return {
    x: clamp(view.x, bounds.minX - EPSILON, bounds.maxX + EPSILON),
    y: clamp(view.y, bounds.minY - EPSILON, bounds.maxY + EPSILON),
    scale,
  };
}
