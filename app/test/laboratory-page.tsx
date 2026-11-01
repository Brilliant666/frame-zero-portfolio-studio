import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { accountRequestAllowed, getAccountRuntime } from "../../db/accounts/http.mjs";
import { isTemplateId } from "../templates/catalog";
import TemplateLaboratory from "./template-laboratory";

export default async function TestHome({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  if (process.env.FRAME_ZERO_PRODUCTION_SITE === "1") notFound();
  try {
    const runtime = getAccountRuntime();
    const request = new Request(`${runtime.config.origin}/test`, { headers: await headers() });
    if (!accountRequestAllowed(request, runtime.config)) notFound();
  } catch { notFound(); }
  const { template } = await searchParams;
  return <TemplateLaboratory templateId={template && isTemplateId(template) ? template : "cinematic-light"} />;
}
