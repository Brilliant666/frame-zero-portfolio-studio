/** Presentation-only proof data. No account, draft, publication or platform bindings. */
export interface GalleryPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface GalleryDocument {
  profile: { brand: string; title: string; intro: string };
  background: GalleryPhoto;
  groups: { id: string; name: string; photos: GalleryPhoto[] }[];
  pricing?: {
    heading: string;
    introduction: string;
    packages: { id: string; name: string; price: string; description: string; details: string[] }[];
  };
  contact?: {
    heading: string;
    intro: string;
    items: { id: string; label: string; value: string; href?: string }[];
  };
}
