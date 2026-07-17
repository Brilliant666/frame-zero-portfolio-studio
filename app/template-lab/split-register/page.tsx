import type { Metadata } from "next";
import SplitRegisterPrototype from "../_prototypes/split-register/prototype";

export const metadata: Metadata = {
  title: "Split Register · FRAME//ZERO Template Lab",
  description: "An isolated numbered-directory and photography-ledger layout experiment.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SplitRegisterPage() {
  return <SplitRegisterPrototype />;
}
