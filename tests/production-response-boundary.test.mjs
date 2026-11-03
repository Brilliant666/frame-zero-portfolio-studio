import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { UUID, assetDto } from '../db/accounts/assets.mjs';
import * as requestBodies from '../db/accounts/request-body.mjs';
import { isSiteSlug } from '../db/accounts/site-slug.mjs';

async function load(file, dependencies = {}, env = {}) {
  const code = ts.transpileModule(await readFile(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, Request, Response, URL, Headers, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw Error('Unexpected dependency ' + id);
  } });
  return exports;
}
const production = { FRAME_ZERO_PRODUCTION_SITE: '1', FRAME_ZERO_ACCOUNT_ORIGIN: 'https://portfolio.example' };
const notFound = () => { throw Error('NOT_FOUND'); };
const jsx = { jsx() {}, jsxs() {} };

test('legacy admin and internal test layouts reject production before reading identity headers', async () => {
  for (const file of ['app/admin/layout.tsx', 'app/test/layout.tsx']) {
    let reads = 0;
    const m = await load(file, {
      'react/jsx-runtime': jsx, 'next/headers': { headers: async () => { reads++; throw Error('must not read'); } },
      'next/navigation': { notFound }, 'next/link': {}, '../chatgpt-auth': {}, './admin-provider': {}, './admin-shell': {},
    }, production);
    await assert.rejects(m.default({ children: null }), /NOT_FOUND/);
    assert.equal(reads, 0);
  }
});

test('legacy content APIs reject production before touching D1 or legacy content', async () => {
  const m = await load('app/api/site-content/route.ts', { 'drizzle-orm': {}, '../../../db': {}, '../../../db/schema': {}, '../../site-config': {} }, production);
  assert.equal((await m.GET()).status, 404);
  assert.equal((await m.PUT()).status, 404);
});

test('production rejects preview proof and local photo service despite configured legacy values', async () => {
  const m = await load('app/preview-workspace/server.ts', {
    'cloudflare:workers': { env: { FRAME_ZERO_PREVIEW_WORKSPACE_SECRET: 'a'.repeat(64) } }, 'next/headers': {}, '../../db': {}, './storage': {},
  }, production);
  assert.equal(await m.requirePreviewWorkspace(), false);
  const photos = await load('app/platform-qr-server.ts', {}, { ...production, FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN: 'http://127.0.0.1:3100' });
  assert.equal(photos.getLocalEditingServiceOrigin(), null);
});

test('production root metadata uses configured origin despite hostile forwarding headers', async () => {
  const m = await load('app/layout.tsx', {
    'react/jsx-runtime': jsx, 'next/font/google': { Geist: () => ({}), Geist_Mono: () => ({}) },
    'next/headers': { headers: async () => new Headers({ 'x-forwarded-host': 'hostile.example', 'x-forwarded-proto': 'http' }) },
    './globals.css': {}, './site-config': { siteConfig: { profile: {}, trustItems: [{}, { value: '' }] } }, './preview-workspace/preview-theme': {},
  }, production);
  const metadata = await m.generateMetadata();
  assert.equal(metadata.metadataBase.origin, production.FRAME_ZERO_ACCOUNT_ORIGIN);
  assert.equal(metadata.openGraph.url, production.FRAME_ZERO_ACCOUNT_ORIGIN);
});

test('standard Node artifact disables unnecessary image optimization and powered-by disclosure', async () => {
  const m = await load('next.config.ts', {}, { FRAME_ZERO_NEXT_NODE_PARITY_BUILD: '1' });
  assert.equal(m.default.poweredByHeader, false);
  assert.equal(m.default.images.unoptimized, true);
});

test('Site HTTPS proxy sets baseline response protection without subdomain HSTS policy', async () => {
  const proxy = await readFile(new URL('../deploy/caddy/site-proxy.caddy', import.meta.url), 'utf8');
  for (const value of ['Strict-Transport-Security "max-age=31536000"', 'X-Content-Type-Options "nosniff"', 'Referrer-Policy "strict-origin-when-cross-origin"', 'Permissions-Policy "camera=(), microphone=(), geolocation=()"', "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'", '-X-Powered-By']) assert.ok(proxy.includes(value), value);
  assert.doesNotMatch(proxy, /includeSubDomains/);
});

const accountHttp = await load('db/accounts/http.mjs', {
  '../../scripts/lib/account-config.mjs': {}, './runtime.mjs': {}, './request-body.mjs': requestBodies,
});
const uuidVersions = ['12345678-abcd-1234-89ab-123456789abc', '12345678-abcd-4234-89ab-123456789abc', '12345678-ABCD-8234-ABCD-123456789ABC'];

async function publicationFixture(denied) {
  const calls = [], reads = [], pool = {};
  const handler = await load('app/site-editor/publication-server.ts', {
    '../../db/accounts/http.mjs': accountHttp, '../../db/accounts/assets.mjs': { UUID },
    '../../db/accounts/request-body.mjs': { ...requestBodies, readBoundedText: (...args) => { reads.push(args); return requestBodies.readBoundedText(...args); } },
    '../../db/accounts/publications.mjs': { PublicationError: class extends Error {}, changePublication: async (db, input) => {
      assert.equal(db, pool); calls.push(input); return { id: 'published-result' };
    } },
    './server': { authorizeEditor: async () => denied ? { denied } : { runtime: { pool }, userId: 'owner', account: { site: { id: 'site-id' }, templates: { premium: [] } } } },
    './content-schema': { isContentSpace: space => space === 'basic' }, './publication-projection': { preparePublication() {} },
  });
  const request = body => handler.handlePublicationRequest(new Request('https://portfolio.example/api/publication', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }), 'alice', 'basic');
  return { request, calls, reads };
}

test('publication accepts UUID v1/v4/v8 and null pointers, passing rollback payloads to the repository', async () => {
  const f = await publicationFixture();
  const payloads = uuidVersions.map(id => ({ action: 'rollback', revisionId: id, expectedPublicationId: id }));
  payloads.push({ action: 'publish', expectedDraftRevision: 1, expectedPublicationId: null },
    { action: 'rollback', revisionId: uuidVersions[0], expectedPublicationId: null });
  for (const payload of payloads) {
    const response = await f.request(payload);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { publication: { id: 'published-result' } });
    const input = f.calls.at(-1);
    assert.deepEqual(JSON.parse(JSON.stringify(input.payload)), payload);
    assert.equal(input.siteId, 'site-id'); assert.equal(input.userId, 'owner'); assert.equal(input.space, 'basic');
  }
  assert.equal(f.calls.length, payloads.length);
});

test('publication rejects malformed UUID fields, missing pointers and extra keys before repository access', async () => {
  const f = await publicationFixture(), valid = { action: 'rollback', revisionId: uuidVersions[1], expectedPublicationId: null };
  const invalid = ['12345678-abcd-0234-89ab-123456789abc', '12345678-abcd-9234-89ab-123456789abc',
    '12345678-abcd-4234-79ab-123456789abc', 42, {}, ''];
  const payloads = invalid.flatMap(value => [{ ...valid, revisionId: value }, { ...valid, expectedPublicationId: value }]);
  payloads.push({ action: 'publish', expectedDraftRevision: 1 }, { action: 'rollback', revisionId: uuidVersions[1] },
    { ...valid, extra: true }, { action: 'publish', expectedDraftRevision: 1, expectedPublicationId: null, extra: true });
  for (const payload of payloads) assert.equal((await f.request(payload)).status, 400, JSON.stringify(payload));
  assert.equal(f.calls.length, 0);
});

test('publication authorization denial precedes JSON body parsing', async () => {
  const f = await publicationFixture(403);
  assert.equal((await f.request('{invalid JSON')).status, 403);
  assert.equal(f.reads.length, 0); assert.equal(f.calls.length, 0);
});

async function publicFixture() {
  const events = [], state = { rowCount: 1, allowed: true, snapshot: null, rows: [], failure: null, acceptance: null };
  const pool = { query: async (sql, values) => {
    events.push('query');
    assert.match(sql, /SELECT s\.id FROM sites s/);
    assert.match(sql, /JOIN portfolio_users p ON p\.id=s\.owner_id/);
    assert.match(sql, /JOIN account_provisioning op ON op\.id=p\.provisioning_id AND op\.completed_at IS NOT NULL/);
    assert.match(sql, /WHERE s\.slug=\$1/); assert.deepEqual(Array.from(values), ['alice']);
    if (state.failure) throw state.failure;
    return { rowCount: state.rowCount, rows: [] };
  } };
  const http = { ...accountHttp, getAccountRuntime: () => { events.push('runtime'); return { pool, config: {} }; },
    accountRequestAllowed: (_request, _config, options) => { events.push('allowed'); assert.equal(options.publicRead, true); return state.allowed; } };
  const publications = { readPublished: async (db, slug) => {
    events.push('published'); assert.equal(db, pool); assert.equal(slug, 'alice'); return state.snapshot;
  }, readPublishedAssets: async (db, snapshot) => {
    events.push('assets'); assert.equal(db, pool); assert.equal(snapshot, state.snapshot); return state.rows;
  }, publicationHistory() { throw Error('public entry must not read owner history'); } };
  const acceptance = { unpublishedAcceptanceRedirect: async () => { events.push('acceptance'); return state.acceptance; } };
  const publicModule = await load('app/site-editor/public-server.ts', {
    react: { cache: fn => fn }, 'next/headers': { headers: async () => new Headers({ host: 'portfolio.example' }) },
    '../../db/accounts/http.mjs': http, '../../db/accounts/site-slug.mjs': { isSiteSlug },
    '../../db/accounts/publications.mjs': publications, '../../db/accounts/assets.mjs': { assetDto }, '../../db/accounts/local-acceptance.mjs': acceptance,
  });
  const entry = await load('db/accounts/site-entry.mjs', {
    './http.mjs': http, './site-slug.mjs': { isSiteSlug }, './local-acceptance.mjs': acceptance,
    './publications.mjs': publications, './site-entry-style.mjs': { siteEntryStyle: '' },
  });
  return { state, events, pool, publicSite: publicModule.publicSite,
    entry: (slug = 'alice', search = '') => entry.handleSiteEntry(new Request('https://portfolio.example/' + slug + search), slug, 'public') };
}

test('completed Site existence helper returns booleans from the counting pool', async () => {
  const f = await publicFixture();
  for (const [rowCount, expected] of [[0, false], [2, true]]) {
    f.state.rowCount = rowCount;
    assert.equal(await accountHttp.completedSiteExists(f.pool, 'alice'), expected);
  }
  assert.deepEqual(f.events, ['query', 'query']);
});

test('publicSite rejects invalid slugs and denied requests before querying, and skips missing publications', async () => {
  const f = await publicFixture();
  for (const slug of ['bad/slug', 'admin', 'api']) assert.equal(await f.publicSite(slug), null);
  assert.deepEqual(f.events, []);
  f.state.allowed = false;
  assert.equal(await f.publicSite('alice'), null); assert.deepEqual(f.events, ['runtime', 'allowed']);
  f.events.length = 0; f.state.allowed = true; f.state.rowCount = 0;
  assert.equal(await f.publicSite('alice'), null); assert.deepEqual(f.events, ['runtime', 'allowed', 'query']);
});

test('publicSite preserves unpublished acceptance and published snapshot/asset mapping; query failures propagate', async () => {
  const f = await publicFixture();
  assert.deepEqual(JSON.parse(JSON.stringify(await f.publicSite('alice'))), { snapshot: null, assets: [], acceptanceHref: null });
  f.state.acceptance = new Response(null, { status: 302, headers: { location: '/acceptance' } });
  assert.equal((await f.publicSite('alice')).acceptanceHref, '/acceptance');
  f.state.snapshot = { id: 'snapshot', space: 'basic', content: { title: 'Published only' } };
  f.state.rows = [{ id: uuidVersions[1], width: 1200, height: 800,
    variants: Object.fromEntries(['thumbnail', 'card', 'full'].map(kind => [kind, { width: 300, height: 200, bytes: 123 }])) }];
  f.events.length = 0;
  const result = await f.publicSite('alice');
  assert.equal(result.snapshot, f.state.snapshot);
  const expected = assetDto(f.state.rows[0], 'alice');
  for (const kind of ['thumbnail', 'card', 'full']) expected.variants[kind].src = `/api/public-sites/alice/assets/${expected.id}/${kind}`;
  assert.deepEqual(JSON.parse(JSON.stringify(result.assets)), [expected]);
  assert.deepEqual(f.events, ['runtime', 'allowed', 'query', 'published', 'assets']);
  f.state.failure = new Error('database offline');
  await assert.rejects(f.publicSite('alice'), error => error === f.state.failure);
});

test('public Site entry rejects invalid slugs, query strings and denied requests before database access', async () => {
  const f = await publicFixture();
  for (const slug of ['bad/slug', 'admin', 'api']) assert.equal((await f.entry(slug)).status, 404);
  assert.equal((await f.entry('alice', '?siteId=other')).status, 400); assert.deepEqual(f.events, []);
  f.state.allowed = false;
  assert.equal((await f.entry()).status, 403); assert.deepEqual(f.events, ['runtime', 'allowed']);
});

test('public Site entry distinguishes missing, completed unpublished, acceptance and unavailable states', async () => {
  const f = await publicFixture();
  f.state.rowCount = 0;
  assert.equal((await f.entry()).status, 404); assert.deepEqual(f.events, ['runtime', 'allowed', 'query']);
  f.state.rowCount = 1; f.events.length = 0;
  const response = await f.entry();
  assert.equal(response.status, 200); assert.match(await response.text(), /data-site-state="unpublished"/);
  assert.deepEqual(f.events, ['runtime', 'allowed', 'query', 'acceptance']);
  f.state.acceptance = new Response(null, { status: 302, headers: { location: '/acceptance' } });
  assert.equal(await f.entry(), f.state.acceptance);
  f.state.failure = new Error('database offline');
  assert.equal((await f.entry()).status, 503);
});
