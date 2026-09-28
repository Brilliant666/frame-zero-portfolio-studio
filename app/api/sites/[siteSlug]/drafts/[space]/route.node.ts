import { handleDraftRequest } from "../../../../../site-editor/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ siteSlug: string; space: string }> };
export async function GET(request: Request, { params }: Context) {
  const { siteSlug, space } = await params;
  return handleDraftRequest(request, siteSlug, space);
}
export async function PUT(request: Request, { params }: Context) {
  const { siteSlug, space } = await params;
  return handleDraftRequest(request, siteSlug, space);
}
