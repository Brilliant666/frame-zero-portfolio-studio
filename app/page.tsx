import type { Metadata } from "next";
import { headers } from "next/headers";
import HomeClient from "./home-client";
import { buildPublicMetadata } from "./site-metadata";
import { readSiteContent } from "./site-content-read";

export const dynamic = "force-dynamic";

function getRequestOrigin(requestHeaders: Awaited<ReturnType<typeof headers>>) {
  const host = requestHeaders.get("x-forwarded-host")
    ?? requestHeaders.get("host")
    ?? "127.0.0.1:3001";
  const protocol = requestHeaders.get("x-forwarded-proto")
    ?? (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const [requestHeaders, { content }] = await Promise.all([
    headers(),
    readSiteContent(),
  ]);

  return buildPublicMetadata(content, getRequestOrigin(requestHeaders));
}

export default async function Home() {
  const { content } = await readSiteContent();

  return <HomeClient initialContent={content} />;
}
