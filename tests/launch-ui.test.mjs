import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import sharp from 'sharp';
import { publishedDraftTarget, publishedWorkspaceSummary, renderSiteWorkspace, siteEntryPage } from '../db/accounts/site-entry.mjs';
import { createReviewRequestHandler, nextReviewPathAllowed, reviewResponse, reviewStates, workspaceReviewFixture } from './launch-ui-review-server.mjs';

const polaroid = 'premium-polaroid', flow = 'premium-flow-gallery';
const render = state => {
  const { account, slug, published, templateNames, grantConfirmed } = workspaceReviewFixture(state);
  return renderSiteWorkspace(account, slug, published, templateNames, grantConfirmed);
};
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map(match => match[1]);
const editLinks = html => links(html).filter(href => href.includes('/admin/'));

// Execute the actual homepage component and actual Next Link under React SSR.
// Only CSS module lookups are replaced: Node does not load Next's CSS bundler.
const require = createRequire(import.meta.url);
const appModules = new Map();
function loadAppModule(filename) {
  if (appModules.has(filename)) return appModules.get(filename);
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => `css-${String(key)}` }) };
    if (!name.startsWith('.')) return require(name);
    const target = resolve(dirname(filename), name);
    const source = ['.tsx', '.ts'].map(extension => target + extension).find(existsSync);
    assert.ok(source, `Missing local homepage module: ${name}`);
    return loadAppModule(source);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, loaded, loaded.exports);
  appModules.set(filename, loaded.exports);
  return loaded.exports;
}
const homeModule = { exports: loadAppModule(fileURLToPath(new URL('../app/page.tsx', import.meta.url))) };
const homeHtml = () => renderToStaticMarkup(React.createElement(homeModule.exports.default));
const attribute = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1];

test('actual homepage SSR uses approved public diagrams and eagerly loads its primary product image', () => {
  const html = homeHtml(), images = html.match(/<img\b[^>]*>/g) ?? [];
  const approved = new Set(['archive-os', 'character-select', 'cinematic-light', 'editorial-duet', 'film-rail', 'manga-panels', 'museum-depth', 'neon-hud', 'orbital-portal', 'polaroid-field', 'prism-liquid'].map(id => `/template-structure-previews/${id}.webp`));
  for (const id of ['premium-polaroid', 'premium-flow-gallery']) approved.add(`/template-showcase-previews/${id}.webp`);
  assert.ok(images.length >= 2);
  for (const image of images) assert.ok(approved.has(attribute(image, 'src')), `Unreviewed public image: ${attribute(image, 'src')}`);
  assert.equal(attribute(images[0], 'loading'), 'eager');
  assert.equal(attribute(images[0], 'fetchPriority'), 'high');
  assert.match(attribute(images[0], 'alt'), /布局示意/);
  assert.match(html, /不含客户照片/);
});

test('actual homepage SSR keeps login and invited-account actions without promoting internal tools', () => {
  const html = homeHtml(), anchors = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.ok(anchors.some(([, href, text]) => href === '/login' && /进入我的工作台/.test(text)));
  assert.match(html, /受邀账号可登录/); assert.match(html, /暂不开放公众注册/);
  assert.ok(!anchors.some(([, href]) => /^\/(test|preview)(?:[/?#]|$)/.test(href)));
  assert.doesNotMatch(html, /<form|href="\/(register|signup|payment)(?:[/?#"])/);
});

test('actual homepage directly presents nine distinct basic layouts as one named grid', () => {
  const html = homeHtml();
  const catalog = loadAppModule(fileURLToPath(new URL('../app/templates/catalog.ts', import.meta.url))).templateCatalog;
  const grid = /<ol\b[^>]*aria-label="基础版九宫格布局示意"[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1];
  assert.ok(grid, 'Basic layouts must be directly visible in their own grid');
  const ids = [...grid.matchAll(/data-template-layout="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, 9);
  for (const id of ids) {
    const item = catalog.find(item => item.id === id);
    assert.ok(item, 'Only real catalog layouts may be displayed');
    assert.ok(grid.includes(`src="/template-structure-previews/${id}.webp"`));
    assert.ok(grid.includes(item.name));
  }
  assert.doesNotMatch(grid, /<button|aria-pressed|\/api\//);
  assert.match(html.replace(/<[^>]*>/g, ''), /共11种风格.*首屏2套，以下9套/);
  assert.doesNotMatch(html, /src="[^" ]*(?:\/photos\/|\/api\/sites\/|\/assets\/)/);
});

test('hero and nine-grid show each of the eleven real basic templates exactly once', () => {
  const html = homeHtml();
  const catalog = loadAppModule(fileURLToPath(new URL('../app/templates/catalog.ts', import.meta.url))).templateCatalog;
  const ids = [...html.matchAll(/data-template-layout="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 11);
  assert.equal(new Set(ids).size, 11);
  assert.deepEqual([...ids].sort(), catalog.map(item => item.id).sort());
  const stage = /<figure\b[^>]*class="css-heroStage"[^>]*>([\s\S]*?)<\/figure>/.exec(html)?.[1];
  assert.ok(stage);
  for (const { id, name } of catalog.slice(9)) {
    assert.ok(stage.includes(`data-template-layout="${id}"`));
    assert.ok(stage.includes(`src="/template-structure-previews/${id}.webp"`));
    assert.ok(stage.includes(name));
  }
  assert.doesNotMatch(stage, /aria-hidden="true"/);
});

test('the two premium spaces have their own showcase after the basic grid', () => {
  const html = homeHtml();
  const premium = /<section\b[^>]*aria-labelledby="premium-showcase-title"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1];
  assert.ok(premium, 'Premium layouts must not share the basic grid');
  assert.equal((premium.match(/<article\b/g) ?? []).length, 2);
  assert.match(premium, /<h3[^>]*id="premium-showcase-title"[^>]*>高级版<\/h3>/);
  for (const name of ['星轨', '流影视廊']) assert.match(premium, new RegExp(`<h4[^>]*>${name}<\\/h4>`));
  assert.doesNotMatch(premium, /data-template-layout=|href="\/(?:register|payment)/);
  assert.ok(html.indexOf('基础版九宫格布局示意') < html.indexOf('premium-showcase-title'));
  const images = premium.match(/<img\b[^>]*>/g) ?? [];
  assert.equal(images.length, 2);
  assert.deepEqual(images.map(image => attribute(image, 'src')).sort(), ['premium-flow-gallery', 'premium-polaroid'].map(id => `/template-showcase-previews/${id}.webp`));
  for (const image of images) {
    assert.equal(attribute(image, 'width'), '1440');
    assert.equal(attribute(image, 'height'), '900');
    assert.match(attribute(image, 'alt'), /实际模板示意.*自绘匿名素材/);
  }
  assert.match(html, /高级版为真实模板搭配自绘素材的效果示意/);
});

test('actual homepage SSR explains three separate spaces and the single published homepage', () => {
  const html = homeHtml(), headings = [...html.matchAll(/<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/g)].map(match => match[1].replace(/<[^>]*>/g, ''));
  for (const name of ['基础版', '星轨', '流影视廊']) assert.ok(headings.includes(name));
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
  assert.match(text, /内容各自编辑，本站照片可复用/);
  assert.match(text, /一个主页地址，展示你最后发布的版本/);
  assert.match(text, /草稿只对你可见；保存并发布后，公开主页才会更新/);
});

test('premium captures are compact public assets included in production packaging', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../config/production-public-files.json', import.meta.url), 'utf8'));
  for (const id of ['premium-polaroid', 'premium-flow-gallery']) {
    const relative = `template-showcase-previews/${id}.webp`;
    const file = readFileSync(new URL(`../public/${relative}`, import.meta.url));
    const metadata = await sharp(file).metadata();
    assert.deepEqual([metadata.format, metadata.width, metadata.height], ['webp', 1440, 900]);
    assert.ok(file.length < 128 * 1024);
    assert.ok(manifest.files.includes(relative));
    assert.equal(nextReviewPathAllowed(`/${relative}`), true);
  }
  assert.equal(nextReviewPathAllowed('/template-showcase-previews/private.webp'), false);
});

test('workspace identifies the published space and keeps all three independent editor destinations', () => {
  const html = render('published');
  assert.match(html, /data-site-admin="true"/);
  assert.match(html, /data-workspace-public="premium-polaroid"/);
  assert.match(html, /data-published-draft-entry="premium-polaroid"/);
  for (const route of ['basic/profile', polaroid, flow]) assert.ok(editLinks(html).includes(`/review-studio/admin/${route}`));
  assert.ok(links(html).includes('/review-studio'));
  assert.doesNotMatch(html, /revisionId|returnTo|publications\//);
});

test('published draft shortcut stays in the correct space rather than a historical snapshot', () => {
  for (const [state, space, route] of [['basic', 'basic', 'basic/profile'], ['published', polaroid, polaroid], ['flow', flow, flow]]) {
    const { account, published } = workspaceReviewFixture(state);
    assert.equal(publishedDraftTarget(published, account), `/review-studio/admin/${route}`);
    assert.match(render(state), new RegExp(`data-published-draft-entry="${space}"`));
  }
});

test('unknown publication is not represented as unpublished and still allows authorized drafts', () => {
  const html = render('unknown');
  assert.match(html, /data-workspace-public="unknown"/);
  assert.doesNotMatch(html, /data-workspace-public="unpublished"|尚未发布作品集|本站尚未发布/);
  assert.doesNotMatch(html, /data-published-draft-entry=/);
  assert.equal(new Set(editLinks(html)).size, 3);
});

test('unpublished workspace has no fake current-public space or automatic published editor', () => {
  const html = render('unpublished');
  assert.match(html, /data-workspace-public="unpublished"/);
  assert.doesNotMatch(html, /data-current-public="true"|data-published-draft-entry=/);
  assert.equal(new Set(editLinks(html)).size, 3);
});

test('ungranted premium spaces remain visible but have no operative editor links', () => {
  const html = render('ungranted');
  assert.match(html, /星轨/); assert.match(html, /流影视廊/);
  assert.ok(editLinks(html).includes('/review-studio/admin/basic/profile'));
  assert.ok(!editLinks(html).some(href => href.includes(polaroid) || href.includes(flow)));
});

test('revocation preserves the public identity while removing its stale edit shortcut and card link', () => {
  const html = render('revoked');
  assert.match(html, /data-workspace-public="premium-polaroid"/);
  assert.match(html, /data-published-draft-unavailable="true"/);
  assert.doesNotMatch(html, /data-published-draft-entry=/);
  assert.ok(!editLinks(html).some(href => href.includes(polaroid)));
  assert.ok(editLinks(html).includes(`/review-studio/admin/${flow}`));
  assert.ok(links(html).includes('/review-studio'));
});

test('absence of every grant cannot render any editor action', () => {
  const html = render('basic-none');
  assert.deepEqual(editLinks(html), []);
  assert.match(html, /基础版|基础模板/); assert.match(html, /星轨/); assert.match(html, /流影视廊/);
});

test('a failed publication grant recheck cannot expose a published-draft entry', () => {
  const { account, published } = workspaceReviewFixture('published');
  assert.equal(publishedDraftTarget(published, account, false), null);
  const summary = publishedWorkspaceSummary(published, {}, account, false);
  assert.doesNotMatch(summary, /href=/);
  assert.match(summary, /data-published-draft-unavailable/);
});

test('site and account display data are escaped without constructing markup or script actions', () => {
  const { account, published } = workspaceReviewFixture('published');
  account.user.username = '<img src=x onerror="alert(1)">';
  account.site.slug = 'unsafe"<svg onload="alert(1)">';
  const html = renderSiteWorkspace(account, 'review-studio', published, {}, true);
  assert.match(html, /&lt;img/); assert.match(html, /&lt;svg/);
  assert.doesNotMatch(html, /<img src=x|<svg onload|href="javascript:/);
});

test('template display names and unexpected published identities are escaped', () => {
  const { account, published } = workspaceReviewFixture('basic');
  const summary = publishedWorkspaceSummary(published, { 'film-rail': '<script>alert(1)</script>' }, account);
  assert.match(summary, /&lt;script&gt;/); assert.doesNotMatch(summary, /<script>/);
  const unknown = publishedWorkspaceSummary({ ...published, space: '<img src=x>' }, {}, account);
  assert.match(unknown, /&lt;img/); assert.doesNotMatch(unknown, /<img|href=/);
});

test('public message pages omit workspace product markers including shared CSS', async () => {
  for (const [title, body, status] of [['作品集尚未发布', '<p>请稍后再来。</p>', 200], ['请先登录', '<p>请先登录。</p>', 401], ['无权访问此后台', '<p>无权访问。</p>', 403]]) {
    const response = siteEntryPage(title, body, status);
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /data-site-admin=|premium-polaroid|premium-flow-gallery|已授权|<img\b/);
  }
});

test('real workspace page response keeps private no-store and noindex boundaries', async () => {
  const response = siteEntryPage('站点工作台', render('published'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store.*private/);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /<html lang="zh-CN"/);
});

test('isolated state responses use the real renderer and explicitly identify anonymous fixtures', async () => {
  for (const state of Object.keys(reviewStates)) {
    const response = await reviewResponse(new Request(`http://127.0.0.1:3004/__review/workspace?state=${state}`));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /隔离展示样本/); assert.match(html, /不连接数据库/);
    assert.match(html, /data-site-admin="true"/);
    assert.doesNotMatch(html, /\/api\/(?:sites|public-sites)\/|\/photos\/|type="password"/);
  }
});

test('all non-read methods stop at the fixture boundary before any Next or account handler', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/', '/login', '/api/auth/sign-in/username', '/api/site-content', '/__review/workspace']) {
      const response = await reviewResponse(new Request(`http://127.0.0.1:3004${path}`, { method }));
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
  }
});

test('candidate login and editor clicks provide explicit no-write explanations instead of live forms', async () => {
  for (const path of ['/login', '/review-studio/admin/basic/profile', `/review-studio/admin/${polaroid}`, `/review-studio/admin/${flow}`]) {
    const response = await reviewResponse(new Request(`http://127.0.0.1:3004${path}`));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /隔离入口检查/); assert.match(html, /不保存任何业务内容/);
    assert.doesNotMatch(html, /<form|type="password"|3001/);
  }
});

test('invalid fixture states and extra selectors never become Site/account queries', async () => {
  for (const query of ['state=other-site', 'site=other-site', 'state=published&user=other-user']) {
    assert.equal((await reviewResponse(new Request(`http://127.0.0.1:3004/__review/workspace?${query}`))).status, 400);
  }
  assert.equal(workspaceReviewFixture('other-site'), null);
});

test('anonymous Next forwarding only permits the homepage and approved static asset categories', () => {
  for (const path of ['/', '/?_rsc=sample', '/_next/static/chunks/example.js', '/fonts/noto-serif-sc-900/subset-001.woff2', '/template-structure-previews/film-rail.webp']) assert.equal(nextReviewPathAllowed(path), true, path);
  for (const path of ['/other-site', '/other-site/admin', '/api/site-content', '/photos/private.jpg', '/test', '/test/admin', '/preview', '/admin', '/_next/image?url=%2Fphotos%2Fprivate.jpg', '/fonts/%2e%2e/photos/private.jpg', 'http://other.example/', '//other.example/', '/fonts\\private.jpg']) assert.equal(nextReviewPathAllowed(path), false, path);
});

test('fixtures are recreated for each request and cannot change a later state', () => {
  const first = workspaceReviewFixture('published');
  first.account.templates.premium.length = 0;
  assert.deepEqual(workspaceReviewFixture('published').account.templates.premium, [polaroid, flow]);
});

test('actual loopback HTTP handler blocks writes/private routes and never forwards browser credentials', async t => {
  const forwarded = [];
  const server = createServer(createReviewRequestHandler((request, response) => {
    forwarded.push({ url: request.url, headers: { ...request.headers } });
    response.end('anonymous Next handler');
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const root = await fetch(origin, { headers: { Cookie: 'fixture=anonymous', Authorization: 'Bearer anonymous-fixture', Connection: 'close' } });
  assert.equal(root.status, 200); assert.equal(await root.text(), 'anonymous Next handler');
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].headers.cookie, undefined); assert.equal(forwarded[0].headers.authorization, undefined);
  for (const path of ['/api/site-content', '/photos/private.jpg', '/test/admin', '/preview']) {
    assert.equal((await fetch(`${origin}${path}`, { headers: { Connection: 'close' } })).status, 404);
  }
  assert.equal((await fetch(`${origin}/api/site-content`, { method: 'POST', body: '{}', headers: { Connection: 'close' } })).status, 405);
  assert.equal((await fetch(`${origin}/`, { headers: { 'x-forwarded-host': 'other.example', Connection: 'close' } })).status, 403);
  const fixture = await fetch(`${origin}/__review/workspace?state=unknown`, { headers: { Connection: 'close' } });
  assert.equal(fixture.status, 200); assert.match(await fixture.text(), /data-workspace-public="unknown"/);
  assert.equal(forwarded.length, 1);
});
