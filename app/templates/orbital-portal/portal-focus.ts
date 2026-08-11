export type OrbitalPortalFocusInput = Readonly<{
  position: string;
  previewWidth: number;
  previewHeight: number;
}>;

const DEFAULT_PHOTO_POSITION = "50% 50%";
const PORTRAIT_PORTAL_POSITION = "50% 32%";

/**
 * The formal Orbital slots are portrait, while the active portal is 3:2.
 * Protect the upper part of default-centred portraits in that secondary crop,
 * without overriding an explicit focus chosen in Admin.
 */
export function getOrbitalPortalObjectPosition(work: OrbitalPortalFocusInput): string {
  const isPortrait = work.previewHeight > work.previewWidth;
  return isPortrait && work.position === DEFAULT_PHOTO_POSITION
    ? PORTRAIT_PORTAL_POSITION
    : work.position;
}
