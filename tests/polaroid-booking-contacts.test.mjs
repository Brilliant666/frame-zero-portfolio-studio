import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const modules = new Map();

// Execute the real component and channel/URL helpers. Only CSS module class names
// are substituted. SSR verifies content and semantics; layout/copy need a browser.
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(filename), specifier);
    const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    assert.ok(resolved, `Cannot resolve ${specifier} from ${filename}`);
    return load(resolved);
  };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: localRequire, URL }, { filename });
  return loaded.exports;
}

const Contacts = load('app/templates/polaroid-field/booking-contacts.tsx').default;
const render = (props = {}) => renderToStaticMarkup(createElement(Contacts, {
  contact: { wechat: '', email: 'legacy-email@example.invalid', note: '' }, social: [], ...props,
}));
const escape = (text) => renderToStaticMarkup(createElement('span', null, text)).replace(/^<span>|<\/span>$/gu, '');
const sections = (html) => [...html.matchAll(/<section\b[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/section>/gu)];
const rows = (html) => [...html.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gu)];

test('premium contact markup has two groups and four rows in the requested order', () => {
  const html = render({
    contact: { wechat: 'wechat_original_01', email: 'legacy-email@example.invalid', note: '' },
    social: [
      { label: '小红书', handle: '小红书账号' },
      { label: 'QQ', handle: '00123456789' },
      { label: '抖音', handle: '抖音账号' },
    ],
  });
  const groups = sections(html);
  assert.deepEqual(groups.map((match) => match[1]), ['联系方式', '平台账号']);
  assert.deepEqual(rows(html).map((match) => match[2].match(/aria-label="([^"]+)"/u)?.[1]), [
    '复制QQ账号', '复制Wechat账号', '复制抖音账号', '复制小红书账号',
  ]);
  assert.equal(rows(groups[0][2]).length, 2);
  assert.equal(rows(groups[1][2]).length, 2);
  assert.ok(html.includes('<strong>00123456789</strong>'), 'QQ leading zeroes survive rendering');
  assert.ok(html.includes('<strong>wechat_original_01</strong>'));
  assert.equal((html.match(/role="status"/gu) ?? []).length, 4, 'copy controls have feedback regions');
});

test('HTTPS platform share messages produce safe new-tab links with descriptive labels', () => {
  const html = render({ social: [
    { label: '抖音', handle: '复制此消息查看主页 https://v.douyin.com/fixture_123/ 。' },
    { label: '小红书', handle: '我的主页>> https://xhslink.cn/o/fixture_456' },
  ] });
  const links = rows(html);
  assert.equal(links.length, 2);
  for (const [index, url] of ['https://v.douyin.com/fixture_123/', 'https://xhslink.cn/o/fixture_456'].entries()) {
    assert.equal(links[index][1], 'a');
    assert.ok(links[index][2].includes(`href="${url}"`));
    assert.match(links[index][2], /target="_blank"/u);
    assert.match(links[index][2], /rel="noopener noreferrer"/u);
    assert.match(links[index][2], /aria-label="查看(?:抖音|小红书)主页（在新标签页打开）"/u);
  }
  assert.ok(html.includes('<strong>查看抖音主页</strong>'));
  assert.ok(html.includes('<strong>查看小红书主页</strong>'));
  assert.equal(sections(html)[0][1], '平台账号');
});

test('ordinary handles and unsafe or ambiguous URLs remain copyable text, never navigation', () => {
  for (const value of [
    '摄影账号_原值', 'http://example.invalid/profile', 'javascript:alert(1)',
    'https://user:password@example.invalid/profile',
    'https://one.example.invalid https://two.example.invalid',
    '<img src=x onerror=alert(1)>',
  ]) {
    const html = render({ social: [{ label: '抖音', handle: value }] });
    const renderedRows = rows(html);
    assert.equal(renderedRows.length, 1);
    assert.equal(renderedRows[0][1], 'button');
    assert.match(renderedRows[0][2], /type="button"/u);
    assert.match(renderedRows[0][2], /aria-label="复制抖音账号"/u);
    assert.ok(html.includes(`<strong>${escape(value)}</strong>`));
    assert.doesNotMatch(html, /<a\b|<img\b|\shref=/u);
  }
});

test('empty channels hide their rows and groups without exposing legacy email or QR cards', () => {
  const empty = render({
    contact: { wechat: '   ', email: 'legacy-email@example.invalid', note: '' },
    social: [
      { label: 'QQ', handle: '', qrAssetId: 'a'.repeat(64) },
      { label: '抖音', handle: '\n ', qrAssetId: 'b'.repeat(64) },
      { label: '小红书', handle: '', qrAssetId: 'c'.repeat(64) },
      { label: '其他平台', handle: 'legacy-handle', qrAssetId: 'd'.repeat(64) },
    ],
  });
  assert.equal(rows(empty).length, 0);
  assert.equal(sections(empty).length, 0);
  assert.doesNotMatch(empty, /legacy-email|legacy-handle|<img\b|<svg\b|mailto:|二维码|分享卡/u);

  const populated = render({
    contact: { wechat: 'fixture', email: 'legacy-email@example.invalid', note: '' },
    social: [{ label: 'QQ', handle: '012345', qrAssetId: 'a'.repeat(64) }],
  });
  assert.equal(rows(populated).length, 2);
  assert.doesNotMatch(populated, /legacy-email|<img\b|<svg\b|mailto:|二维码|分享卡/u);
});

test('long mixed-language handles render completely with punctuation and HTML characters escaped', () => {
  const value = '长账号Studio_001「预约」＆摄影/中文-English·'.repeat(8) + '<原值>&尾部';
  const html = render({
    contact: { wechat: value, email: '', note: '' },
    social: [{ label: 'QQ', handle: value }, { label: '抖音', handle: value }, { label: '小红书', handle: value }],
  });
  const renderedRows = rows(html);
  assert.equal(renderedRows.length, 4);
  for (const row of renderedRows) assert.ok(row[3].includes(`<strong>${escape(value)}</strong>`));
  assert.doesNotMatch(html, /<原值>/u);
});
