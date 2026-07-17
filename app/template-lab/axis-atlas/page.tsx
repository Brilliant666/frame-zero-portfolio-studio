import type { Metadata } from "next";
import AxisAtlasPrototype from "../_prototypes/axis-atlas/prototype";

export const metadata: Metadata = {
  title: "Axis Atlas · FRAME//ZERO Template Lab",
  description: "An isolated semantic two-axis photography atlas experiment.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function AxisAtlasPage() {
  return <AxisAtlasPrototype />;
}
