import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { authorizeEditor } from "./server";
import type { ContentSpace } from "./content-schema";

export async function requireEditor(slug: string, space: ContentSpace) {
  const requestHeaders = new Headers(await headers());
  const request = new Request(`http://127.0.0.1/${encodeURIComponent(slug)}/admin`, { headers: requestHeaders });
  const auth = await authorizeEditor(request, slug, space);
  if ("denied" in auth) {
    if (auth.denied === 401) redirect("/login");
    if (auth.denied === 503) throw new Error("站点服务暂不可用，请稍后重试");
    notFound();
  }
  return { auth, request, scope: {
    endpoint: `/api/sites/${encodeURIComponent(slug)}/drafts/${space}`,
    adminBasePath: `/${encodeURIComponent(slug)}/admin/${space}`,
    previewHref: `/${encodeURIComponent(slug)}/admin/preview/${space}`,
    assetsMode: "unconnected" as const,
  } };
}
