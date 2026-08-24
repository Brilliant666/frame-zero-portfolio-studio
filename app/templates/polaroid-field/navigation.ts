export type PolaroidView = "field" | "packages" | "booking";

export const POLAROID_VIEW_HASHES = Object.freeze({
  field: "#polaroid-top",
  packages: "#polaroid-packages",
  booking: "#polaroid-booking",
} satisfies Record<PolaroidView, string>);

export function getPolaroidViewFromHash(hash: string): PolaroidView {
  switch (hash.trim().toLowerCase()) {
    case "#polaroid-packages":
      return "packages";
    case "#polaroid-booking":
      return "booking";
    case "#polaroid-top":
    case "#polaroid-field":
    default:
      return "field";
  }
}
