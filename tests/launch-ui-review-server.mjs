#!/usr/bin/env node

// Loopback-only visual fixture. No account runtime, credentials or business APIs.
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSiteWorkspace, siteEntryPage } from '../db/accounts/site-entry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const polaroid = 'premium-polaroid', flow = 'premium-flow-gallery';
export const reviewStates = Object.freeze({
  published: '已发布 · 星轨',
  basic: '已发布 · 基础版',
  flow: '已发布 · 流影视廊',
  unpublished: '尚未发布',
  unknown: '公开状态读取失败',
  ungranted: '高级空间未授权',
  revoked: '当前公开空间授权已撤销',
  'basic-none': '没有可编辑空间',
});

export function workspaceReviewFixture(state = 'published') {
  if (!Object.hasOwn(reviewStates, state)) return null;
  const account = { user: { username: 'review-photographer' }, site: { id: 'anonymous-site', slug: 'review-studio' }, templates: {
    basic: ['cinematic-light', 'neon-hud', 'film-rail', 'manga-panels', 'prism-liquid', 'orbital-portal', 'archive-os', 'editorial-duet', 'polaroid-field', 'character-select', 'museum-depth'],
    premium: [polaroid, flow],
  } };
  let published = { id: 'anonymous-publication', space: polaroid, templateId: polaroid, draftRevision: 3 };
  let grantConfirmed = true;
  if (state === 'basic' || state === 'ungranted') published = { ...published, space: 'basic', templateId: 'film-rail' };
  if (state === 'flow') published = { ...published, space: flow, templateId: flow };
  if (state === 'unpublished') published = null;
  if (state === 'unknown') published = undefined;
  if (state === 'ungranted') account.templates.premium = [];
  if (state === 'revoked') { account.templates.premium = [flow]; grantConfirmed = false; }
  if (state === 'basic-none') { account.templates = { basic: [], premium: [] }; published = null; }
  return { account, slug: account.site.slug, published, grantConfirmed, templateNames: { 'film-rail': '胶片长廊' } };
}

function reviewControls(state) {
  return `<details class="review-tools"><summary>隔离展示样本 · ${reviewStates[state]}</summary><p>匿名账号与状态样本，不连接数据库；编辑、保存、发布和上传均未启用。</p><nav aria-label="隔离样本状态">${Object.entries(reviewStates).map(([id, label]) => `<a${id === state ? ' aria-current="page"' : ''} href="/__review/workspace?state=${id}">${label}</a>`).join('')}</nav><a href="/">查看候选首页</a></details>`;
}
const reviewStyle = `<style>.review-tools{position:relative;width:calc(100% - 32px);max-width:1120px;margin:12px auto 24px;padding:9px 12px;border:1px solid #b7c6d8;border-radius:9px;background:#fff;color:#243247;font:12px/1.6 system-ui,sans-serif;box-shadow:0 3px 14px #24324714}.review-tools summary{cursor:pointer}.review-tools[open]{max-height:65vh;overflow:auto}.review-tools p{margin:9px 0}.review-tools nav{display:grid;gap:6px;margin-bottom:10px}.review-tools a{color:#334a68}.review-tools [aria-current]{font-weight:700}</style>`;

export async function reviewResponse(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Visual fixture: all writes are disabled.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  if (url.pathname === '/__review/workspace') {
    if ([...url.searchParams.keys()].some(key => key !== 'state')) return new Response('Unknown fixture option.', { status: 400 });
    const state = url.searchParams.get('state') ?? 'published', fixture = workspaceReviewFixture(state);
    if (!fixture) return new Response('Unknown fixture state.', { status: 400 });
    const { account, slug, published, templateNames, grantConfirmed } = fixture;
    const page = siteEntryPage('站点工作台', renderSiteWorkspace(account, slug, published, templateNames, grantConfirmed));
    const html = (await page.text()).replace('</head>', `${reviewStyle}</head>`).replace('</body>', `${reviewControls(state)}</body>`);
    return new Response(request.method === 'HEAD' ? null : html, { status: page.status, headers: page.headers });
  }
  if (url.pathname === '/login' || /^\/review-studio\/admin\/(basic\/profile|premium-polaroid|premium-flow-gallery)$/.test(url.pathname)) {
    const target = url.pathname === '/login' ? '账号登录入口' : '内容空间编辑入口';
    return siteEntryPage('隔离入口检查', `<h2>${target}</h2><p>此链接的路径已保留。本候选只供页面视觉验收，不提供真实账号登录或编辑，不保存任何业务内容。</p><a class="button" href="/__review/workspace">返回隔离工作台</a><a class="button" href="/">返回候选首页</a>`);
  }
  if (url.pathname === '/review-studio') return siteEntryPage('隔离公开主页入口', '<p>这是公开主页路径的匿名检查入口，候选没有真实Published或私人照片。</p><a class="button" href="/__review/workspace">返回隔离工作台</a>');
  return null;
}

export function nextReviewPathAllowed(rawPath) {
  // Never forward a Site, account, API, preview, image-proxy or private-photo path.
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\') || /%2e|%2f|%5c/i.test(rawPath)) return false;
  const pathname = new URL(rawPath, 'http://127.0.0.1').pathname;
  return pathname === '/' || pathname.startsWith('/_next/static/') || pathname.startsWith('/fonts/') || /^\/template-structure-previews\/[a-z-]+\.webp$/.test(pathname) || pathname === '/favicon.ico';
}

export function createReviewRequestHandler(nextHandler) {
  return async (request, response) => {
    const origin = `http://127.0.0.1:${request.socket.localPort}`;
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') || request.headers.host !== new URL(origin).host || ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'].some(key => key in request.headers)) {
      response.writeHead(403); response.end('Loopback fixture only.'); return;
    }
    try {
      const fixture = await reviewResponse(new Request(`${origin}${request.url}`, { method: request.method }));
      if (fixture) { response.writeHead(fixture.status, Object.fromEntries(fixture.headers)); response.end(request.method === 'HEAD' ? undefined : await fixture.text()); return; }
      if (!nextReviewPathAllowed(request.url ?? '/')) { response.writeHead(404); response.end('Not available in the isolated visual fixture.'); return; }
      // Forward no browser cookies/authorization to the anonymous Next handler.
      delete request.headers.cookie; delete request.headers.authorization;
      await nextHandler(request, response);
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end('Visual fixture unavailable.');
    }
  };
}

export async function startReviewServer(port = 3004) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3001) throw new Error('Use an isolated non-daily port.');
  // Next loads conventional env files automatically. Refuse them rather than
  // accidentally loading an existing account/asset configuration into this fixture.
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    if (await access(path.join(root, name)).then(() => true, () => false)) throw new Error(`Fixture refuses environment file: ${name}`);
  }
  if (['FRAME_ZERO_LOCAL_ACCOUNTS', 'FRAME_ZERO_ACCOUNT_NODE_RUNTIME', 'FRAME_ZERO_ACCOUNT_DATABASE_URL', 'DATABASE_URL'].some(key => process.env[key])) throw new Error('Start the fixture without account/database environment variables.');
  process.env.NODE_ENV = 'production';
  process.env.FRAME_ZERO_NEXT_NODE_PARITY_BUILD = '1';
  const { default: next } = await import('next');
  const app = next({ dev: false, dir: root, hostname: '127.0.0.1', port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const origin = `http://127.0.0.1:${port}`;
  const server = createServer(createReviewRequestHandler(handle));
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await new Promise(resolve => server.close(resolve)); await app.close(); };
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  console.log(`Isolated UI review: ${origin}/ and ${origin}/__review/workspace (anonymous fixtures, no database)`);
  return { server, stop };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port')) throw new Error('Usage: node tests/launch-ui-review-server.mjs [--port 3004]');
  await startReviewServer(Number(args[1] ?? 3004));
}
