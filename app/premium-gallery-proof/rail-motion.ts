// Move through the existing loop without restarting its animation or changing speed.
export function railTimeAfterWheel(currentMs: number, durationMs: number, loopHeight: number, deltaPixels: number, reverse: boolean) {
  const next = currentMs + deltaPixels / loopHeight * durationMs * (reverse ? -1 : 1);
  return ((next % durationMs) + durationMs) % durationMs;
}
