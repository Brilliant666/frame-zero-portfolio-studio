import { notFound } from "next/navigation";
import FlowGallery from "../../premium-gallery-proof/gallery";
import { galleryFixture } from "../../premium-gallery-proof/fixture";

export const metadata = { title: "流影视廊 · 独立设计验证", robots: { index: false, follow: false } };

export default async function GalleryProofPage({ searchParams }: { searchParams: Promise<{ fixture?: string }> }) {
  // The parent layout additionally requires the existing loopback runner proof.
  if (process.env.FRAME_ZERO_FLOW_GALLERY_PROOF !== "1") notFound();
  const { fixture } = await searchParams;
  return <FlowGallery document={galleryFixture(fixture)} />;
}
