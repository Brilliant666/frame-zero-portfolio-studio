import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/premium-gallery-proof/contact-platform.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, URL });
const { contactPlatform } = exports;

test('known channel labels retain their platform identity', () => {
  for (const [label, expected] of [['抖音', 'douyin'], ['抖音主页', 'douyin'], ['小红书', 'xiaohongshu'], [' REDNOTE ', 'xiaohongshu'], ['QQ号', 'qq'], [' qq ', 'qq'], ['微信', 'wechat'], ['WeChat', 'wechat'], ['微信联系', 'wechat']]) {
    assert.equal(contactPlatform(label), expected);
  }
});

test('custom labels can identify genuine profile domains and short links', () => {
  for (const [href, expected] of [['https://v.douyin.com/example/', 'douyin'], ['https://www.douyin.com/user/example', 'douyin'], ['https://xhslink.cn/o/example', 'xiaohongshu'], ['https://www.xiaohongshu.com/user/profile/example', 'xiaohongshu']]) {
    assert.equal(contactPlatform('我的作品', href), expected);
  }
});

test('unknown contacts and lookalike domains do not receive a misleading brand', () => {
  for (const href of [undefined, '', '/douyin.com', 'https://douyin.com.example.org', 'https://notdouyin.com', 'https://douyin.com@example.invalid', 'https://example.org/xiaohongshu.com', 'mailto:hello@example.invalid', 'mailto://douyin.com/contact', 'javascript:alert(1)']) {
    assert.equal(contactPlatform('自定义联系', href), null);
  }
  assert.equal(contactPlatform('QQ交流群说明'), null);
});
