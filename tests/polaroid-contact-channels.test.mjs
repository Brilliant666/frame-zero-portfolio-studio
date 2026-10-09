import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path) {
  const source = await fs.readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, TextEncoder });
  return exports;
}
const { readPolaroidSocial: read, writePolaroidSocial: write } = await loadModule('../app/preview-workspace/contact-channels.ts');
const { parsePreviewDocument, createEmptyPreviewDocument } = await loadModule('../app/preview-workspace/document.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('channel identity uses explicit labels, never an email or another platform account', () => {
  for (const [label, kind] of [[' QQ号 ', 'qq'], ['qq联系', 'qq'], ['Douyin', 'douyin'], ['抖音主页', 'douyin'], [' REDNOTE ', 'xiaohongshu'], ['小红书主页', 'xiaohongshu']]) {
    const account = { label, handle: 'fixture' };
    assert.equal(read([account], kind), account);
  }
  const other = [{ label: '邮箱', handle: 'qq-mailbox@example.invalid' }, { label: 'QQ交流群说明', handle: '123456' }, { label: '我的作品', handle: 'https://www.douyin.com/example' }];
  for (const kind of ['qq', 'douyin', 'xiaohongshu']) assert.equal(read(other, kind), undefined);
});

test('editing an existing channel preserves position, metadata, and unknown entries without mutation', () => {
  const social = Object.freeze([
    Object.freeze({ label: '其他平台', handle: 'kept', extra: { untouched: true } }),
    Object.freeze({ label: ' QQ号 ', handle: 'old', qrAssetId: 'a'.repeat(64), unknown: 'preserve' }),
    Object.freeze({ label: '小红书', handle: 'another' }),
  ]);
  const updated = write(social, 'qq', 'new');
  assert.notEqual(updated, social);
  assert.equal(updated[0], social[0]);
  assert.equal(updated[2], social[2]);
  assert.deepEqual(plain(updated[1]), { ...social[1], handle: 'new' });
  assert.equal(social[1].handle, 'old');
});

test('first duplicate wins, including an empty first entry; later duplicates remain intact', () => {
  const first = { label: 'QQ', handle: '', qrAssetId: 'b'.repeat(64) };
  const second = { label: 'qq号', handle: 'second' };
  const social = [first, second, first];
  assert.equal(read(social, 'qq'), first);
  const updated = write(social, 'qq', 'replacement');
  assert.equal(updated.length, 3);
  assert.equal(updated[0].handle, 'replacement');
  assert.equal(updated[1], second);
  assert.equal(updated[2], first, 'even the same object repeated later is not rewritten');
});

test('clearing retains an existing card and empty input never creates a channel', () => {
  const social = [{ label: '抖音', handle: 'old', qrAssetId: 'c'.repeat(64) }];
  const cleared = write(social, 'douyin', '');
  assert.deepEqual(plain(cleared), [{ ...social[0], handle: '' }]);
  assert.deepEqual(plain(write(social, 'qq', '  ')), social);
  assert.deepEqual(plain(write([], 'xiaohongshu', '')), []);
});

test('new channels append canonical labels without altering supplied text or existing order', () => {
  const social = [{ label: '保留', handle: 'unchanged' }];
  const qq = write(social, 'qq', '001234');
  const douyin = write(qq, 'douyin', '打开主页 https://v.douyin.com/example/');
  const all = write(douyin, 'xiaohongshu', 'https://xhslink.cn/o/example');
  assert.deepEqual(plain(all), [...social,
    { label: 'QQ', handle: '001234' },
    { label: '抖音', handle: '打开主页 https://v.douyin.com/example/' },
    { label: '小红书', handle: 'https://xhslink.cn/o/example' },
  ]);
  assert.equal(social.length, 1);
});

test('four channel edits round-trip through the unchanged premium document schema', () => {
  const document = createEmptyPreviewDocument();
  document.contact = { wechat: 'fixture-wechat', email: 'retain@example.invalid', note: '说明' };
  document.social = [{ label: '其他', handle: 'retained' }, { label: '抖音', handle: 'old', qrAssetId: 'd'.repeat(64) }];
  document.social = write(document.social, 'qq', '001234');
  document.social = write(document.social, 'douyin', 'https://v.douyin.com/fixture/');
  document.social = write(document.social, 'xiaohongshu', 'https://xhslink.cn/o/fixture');
  const parsed = parsePreviewDocument(plain(document));
  assert.deepEqual(plain(parsed), plain(document));
  assert.deepEqual(plain(parsed.contact), { wechat: 'fixture-wechat', email: 'retain@example.invalid', note: '说明' });
  assert.equal(parsed.social[1].qrAssetId, 'd'.repeat(64));
  assert.equal(read(parsed.social, 'qq').handle, '001234');
  assert.equal('qq' in parsed.contact, false);
});

test('full social lists reject new channels explicitly while allowing existing edits and clearing', () => {
  const social = Array.from({ length: 20 }, (_, index) => ({ label: `保留平台${index}`, handle: `fixture-${index}` }));
  const snapshot = structuredClone(social);
  for (const kind of ['qq', 'douyin', 'xiaohongshu']) {
    assert.throws(() => write(social, kind, 'new'), (error) => error.name === 'RangeError' && error.message.includes('已达 20 项') && error.message.includes('兼容设置'));
    assert.deepEqual(plain(write(social, kind, '  ')), social);
  }
  assert.deepEqual(social, snapshot, 'failed additions never mutate or discard old records');
  social[4] = { label: 'QQ', handle: 'old', qrAssetId: 'e'.repeat(64) };
  const edited = write(social, 'qq', 'replacement');
  assert.equal(edited.length, 20);
  assert.deepEqual(plain(edited[4]), { ...social[4], handle: 'replacement' });
  const cleared = write(edited, 'qq', '');
  assert.equal(cleared.length, 20);
  assert.equal(cleared[4].qrAssetId, 'e'.repeat(64));
  assert.equal(cleared[4].handle, '');
});

test('the twentieth record remains valid through the premium schema', () => {
  const document = createEmptyPreviewDocument();
  document.social = Array.from({ length: 19 }, (_, index) => ({ label: `保留平台${index}`, handle: `fixture-${index}` }));
  document.social = write(document.social, 'qq', '001234');
  assert.equal(document.social.length, 20);
  assert.deepEqual(plain(parsePreviewDocument(plain(document))), plain(document));
});
