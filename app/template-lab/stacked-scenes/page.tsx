import type { Metadata } from "next";
import { StackedScenesPrototype } from "../_prototypes/stacked-scenes/prototype";

export const metadata: Metadata = {
  title: "Stacked Scenes | FRAME//ZERO Template Lab",
  description: "An isolated five-layer sticky card photography prototype for design review.",
};

export default function StackedScenesPage() {
  return <StackedScenesPrototype />;
}
