import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function InternalTestLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const match = /^(127\.0\.0\.1|localhost|\[::1\])(?::([1-9][0-9]{0,4}))?$/i.exec(host);
  const local = Boolean(match && match[0] === host && (!match[2] || Number(match[2]) <= 65535));
  const enabled = process.env.NODE_ENV === "development" || process.env.FRAME_ZERO_INTERNAL_TEST_AREA === "1";
  if (!local || !enabled) notFound();
  return children;
}
