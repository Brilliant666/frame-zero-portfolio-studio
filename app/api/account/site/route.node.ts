export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME !== '1') return new Response(null, { status: 404 });
  return (await import('../../../../db/accounts/http.mjs')).handleSiteRequest(request);
}
