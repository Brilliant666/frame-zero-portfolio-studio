import { readAccountConfig } from '../../scripts/lib/account-config.mjs';
import { createAccountRuntime } from './runtime.mjs';

let singleton;
export function getAccountRuntime() {
  const config = readAccountConfig();
  if (process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME !== '1') throw new Error('ACCOUNT_NODE_ONLY');
  singleton ??= createAccountRuntime(config);
  return singleton;
}
export function accountRequestAllowed(request, config) {
  const url = new URL(request.url);
  // Next may normalize Request.url to its internal hostname. The socket runner
  // validates Host before dispatch; validate that header again, not forwarded data.
  if (!['http:'].includes(url.protocol) || request.headers.get('host') !== new URL(config.origin).host) return false;
  const proof = process.env.FRAME_ZERO_ACCOUNT_REQUEST_PROOF;
  if (!proof || request.headers.get('x-account-local-proof') !== proof) return false;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  return request.method === 'GET' ? !origin || origin === config.origin : origin === config.origin;
}
export function accountJson(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
export const BASIC_TEMPLATES = Object.freeze(['cinematic-light','neon-hud','film-rail','manga-panels','prism-liquid','orbital-portal','archive-os','editorial-duet','polaroid-field','character-select','museum-depth']);

export async function readOwnedSite(runtime, headers, requestedId = null, requestedSlug = null) {
  const session = await runtime.auth.api.getSession({ headers });
  if (!session) return null;
  return readSiteForPrincipal(runtime, session.user, requestedId, requestedSlug);
}

/** @param {string|null} requestedId @param {string|null} requestedSlug */
export async function readSiteForPrincipal(runtime, user, requestedId = null, requestedSlug = null) {
  const result = await runtime.pool.query(`SELECT s.id, s.slug, p.id AS portfolio_user_id,
    COALESCE(array_agg(g.product) FILTER (WHERE g.product IS NOT NULL), '{}') AS premium
    FROM sites s JOIN portfolio_users p ON p.id=s.owner_id
    JOIN account_provisioning op ON op.id=p.provisioning_id AND op.completed_at IS NOT NULL
    LEFT JOIN site_template_grants g ON g.site_id=s.id
    WHERE p.auth_user_id=$1 AND ($2::uuid IS NULL OR s.id=$2::uuid)
      AND ($3::text IS NULL OR s.slug=$3::text)
    GROUP BY s.id,p.id`, [user.id, requestedId, requestedSlug]);
  if (!result.rows.length) return null;
  const site = result.rows[0];
  return { user: { username: user.username, email: user.email, emailVerified: user.emailVerified, role: user.role }, site: { id: site.id, slug: site.slug }, templates: { basic: BASIC_TEMPLATES, premium: site.premium } };
}

export async function handleAuthRequest(request) {
  try {
    const runtime = getAccountRuntime();
    if (!accountRequestAllowed(request, runtime.config)) return accountJson({ error: 'FORBIDDEN' }, 403);
    const path = new URL(request.url).pathname;
    const allowed = new Map([
      ['/api/auth/sign-in/username','POST'], ['/api/auth/sign-out','POST'],
      ['/api/auth/revoke-sessions','POST'],
    ]);
    if (allowed.get(path) !== request.method) return accountJson({ error: 'NOT_AVAILABLE' }, 404);
    if (path.endsWith('/sign-in/username')) {
      const raw = await request.text();
      if (raw.length > 2048) return accountJson({ error: 'INVALID_REQUEST' }, 400);
      let body;
      try { body = JSON.parse(raw); } catch { return accountJson({ error: 'INVALID_REQUEST' }, 400); }
      if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || Object.keys(body).some(k => !['username','password'].includes(k))) return accountJson({ error: 'INVALID_REQUEST' }, 400);
      request = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ username: body.username.toLowerCase(), password: body.password }) });
    }
    const cleanHeaders = new Headers(request.headers);
    for (const key of ['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip','x-account-local-proof']) cleanHeaders.delete(key);
    request = new Request(`${runtime.config.origin}${new URL(request.url).pathname}`, { method: request.method, headers: cleanHeaders, body: await request.text() });
    const response = await runtime.auth.handler(request);
    // Do not expose Better Auth's session token response body to application JS.
    const safe = accountJson(response.ok ? { ok: true } : { error: response.status === 429 ? 'TOO_MANY_ATTEMPTS' : 'AUTH_FAILED' }, response.status);
    for (const cookie of response.headers.getSetCookie()) safe.headers.append('Set-Cookie', cookie);
    if (response.headers.has('retry-after')) safe.headers.set('Retry-After', response.headers.get('retry-after'));
    return safe;
  } catch { return accountJson({ error: 'ACCOUNT_SERVICE_UNAVAILABLE' }, 503); }
}

export async function handleSiteRequest(request) {
  try {
    const runtime = getAccountRuntime();
    if (!accountRequestAllowed(request, runtime.config)) return accountJson({ error: 'FORBIDDEN' }, 403);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== 'siteId')) return accountJson({ error: 'FORBIDDEN' }, 403);
    const id = params.get('siteId');
    if (id !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return accountJson({ error: 'FORBIDDEN' }, 403);
    const site = await readOwnedSite(runtime, request.headers, id);
    return site ? accountJson(site) : accountJson({ error: 'UNAUTHORIZED_OR_NO_SITE' }, 401);
  } catch { return accountJson({ error: 'ACCOUNT_SERVICE_UNAVAILABLE' }, 503); }
}
