import { notFound } from "next/navigation";
import AdminDesignProof from "../../admin-design-proof/workspace";

export const metadata = { title: "流影视廊 · 后台设计候选", robots: { index: false, follow: false } };

export default function AdminDesignProofPage() {
  // /preview/layout independently requires a signed loopback runner request.
  if (process.env.FRAME_ZERO_ADMIN_DESIGN_PROOF !== "1") notFound();
  return <AdminDesignProof />;
}
