import { handleSiteEntry } from '../../../db/accounts/site-entry.mjs';
import { templateCatalog } from '../../templates/catalog';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ siteSlug: string }> }) {
  return handleSiteEntry(request, (await context.params).siteSlug, 'admin', Object.fromEntries(templateCatalog.map(item => [item.id, item.name])));
}
