export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const accounts = await import('../../../../db/accounts/http.mjs');
  if (!accounts.accountRuntimeEnabled()) return new Response(null, { status: 404 });
  return accounts.handleSiteRequest(request);
}
