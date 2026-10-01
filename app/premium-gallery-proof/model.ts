/** Presentation data resolved by the caller from its authorized resources. */
export interface GalleryPhoto {
  id: string;
  url: string;
  /** Authorized display variants; proof assets keep their single authored URL. */
  variants?: { url: string; width: number }[];
  /** The full display variant is requested when the viewer opens. Never an original. */
  fullUrl?: string;
  width: number;
  height: number;
  alt: string;
}

export interface GalleryDocument {
  profile: { brand: string; title: string; intro: string };
  background: GalleryPhoto | null;
  backgroundFocus?: { x: number; y: number };
  /** Omitted only by the anonymous design proof. An explicit null leaves a rail empty. */
  featuredGroupIds?: { left: string | null; right: string | null };
  /** Omitted documents retain the original 2:1 layout. */
  leftRailWidthPercent?: number;
  groups: { id: string; name: string; photos: GalleryPhoto[] }[];
  pricing?: {
    heading: string;
    introduction: string;
    packages: { id: string; name: string; price: string; description: string; details: string[] }[];
  };
  contact?: {
    heading: string;
    intro: string;
    items: { id: string; label: string; value: string; href?: string; qrPhoto?: GalleryPhoto }[];
  };
}
