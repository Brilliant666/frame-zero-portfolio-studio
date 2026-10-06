type TouchPoint = Readonly<{ identifier: number; clientX: number; clientY: number }>;
export type GallerySwipe = Readonly<{ id: number; x: number; y: number }>;

export function beginGallerySwipe(touches: ArrayLike<TouchPoint>, interactive: boolean): GallerySwipe | null {
  if (interactive || touches.length !== 1) return null;
  const touch = touches[0];
  return { id: touch.identifier, x: touch.clientX, y: touch.clientY };
}

export function completeGallerySwipe(start: GallerySwipe | null, touches: ArrayLike<TouchPoint>, remaining: number): -1 | 1 | null {
  if (!start || remaining || touches.length !== 1 || touches[0].identifier !== start.id) return null;
  const dx = touches[0].clientX - start.x, dy = touches[0].clientY - start.y;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return null;
  return dx < 0 ? 1 : -1;
}

export function nextGalleryPhotoIndex(index: number, count: number, direction: -1 | 1): number {
  return count > 0 ? (index + direction + count) % count : 0;
}
