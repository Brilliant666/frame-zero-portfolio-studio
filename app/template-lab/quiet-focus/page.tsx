import type { Metadata } from "next";
import { QuietFocusPrototype } from "../_prototypes/quiet-focus/prototype";

export const metadata: Metadata = {
  title: "Quiet Focus | FRAME//ZERO Template Lab",
  description: "An isolated full-screen sequential photography prototype for design review.",
};

export default function QuietFocusPage() {
  return <QuietFocusPrototype />;
}
