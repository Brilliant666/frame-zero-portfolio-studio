import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function load(file, dependencies = {}, env = {}) {
  const code = ts.transpileModule(await readFile(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, Response, URL, Headers, require(id) {
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
