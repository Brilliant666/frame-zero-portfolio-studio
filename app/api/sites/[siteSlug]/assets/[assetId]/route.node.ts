import { handleAssetsRequest } from "../../../../../site-editor/assets-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ siteSlug: string; assetId: string }> };
export async function GET(request: Request, { params }: Context) { const p = await params; return handleAssetsRequest(request, p.siteSlug, p.assetId); }
export const HEAD = GET;
