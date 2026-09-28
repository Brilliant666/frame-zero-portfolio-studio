import { accountRequestAllowed, getAccountRuntime, readSiteForPrincipal } from './http.mjs';

export function localAcceptanceEnabled(request, config) {
  return process.env.FRAME_ZERO_LOCAL_ACCEPTANCE === '1'
    && process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME === '1'
    && process.env.FRAME_ZERO_LOCAL_ACCOUNTS === '1'
    && accountRequestAllowed(request, config);
}
export function privateRedirect(location) {
  return new Response(null, { status: 307, headers: { Location: location, 'Cache-Control': 'no-store, private', Vary: 'Cookie' } });
}
export async function handleLocalAdminShortcut(request) {
  const runtime = getAccountRuntime();
  if (!localAcceptanceEnabled(request, runtime.config)) return null;
  const url = new URL(request.url);
  if (url.pathname !== '/test/admin' || url.search || request.method !== 'GET') return null;
  const session = await runtime.auth.api.getSession({ headers: request.headers });
  if (!session) return privateRedirect('/login');
  const account = await readSiteForPrincipal(runtime, session.user);
  return privateRedirect(account ? `/${account.site.slug}/admin/basic/profile` : '/login');
}
export async function unpublishedAcceptanceRedirect(request, runtime, slug, published = false) {
  if (published || !localAcceptanceEnabled(request, runtime.config)) return null;
  const session = await runtime.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const account = await readSiteForPrincipal(runtime, session.user, null, slug);
  if (!account?.templates.premium.includes('premium-polaroid')) return null;
  return privateRedirect(`/${account.site.slug}/admin/preview/premium-polaroid`);
}
