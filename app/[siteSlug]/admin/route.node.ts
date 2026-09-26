import { handleSiteEntry } from '../../../db/accounts/site-entry.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ siteSlug: string }> }) {
  return handleSiteEntry(request, (await context.params).siteSlug, true);
}
