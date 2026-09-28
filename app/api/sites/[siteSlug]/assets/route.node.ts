import { handleAssetsRequest } from "../../../../site-editor/assets-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ siteSlug: string }> };
export async function GET(request: Request, { params }: Context) { return handleAssetsRequest(request, (await params).siteSlug); }
export async function POST(request: Request, { params }: Context) { return handleAssetsRequest(request, (await params).siteSlug); }
