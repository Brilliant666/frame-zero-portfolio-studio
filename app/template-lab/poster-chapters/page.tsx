import type { Metadata } from "next";
import { PosterChaptersPrototype } from "../_prototypes/poster-chapters/prototype";

export const metadata: Metadata = {
  title: "Poster Chapters | FRAME//ZERO Template Lab",
  description: "An isolated six-chapter photographic poster prototype for design review.",
};

export default function PosterChaptersPage() {
  return <PosterChaptersPrototype />;
}
