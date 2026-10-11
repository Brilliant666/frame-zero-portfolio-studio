import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/templates/polaroid-field/booking-copy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { polaroidContactNote, packageInquiry } = exports;
const seed = '当前为示例联系方式与价格，后续可在后台统一替换。';
test('only the exact legacy premium notice is hidden; custom notes and basic content survive', () => {
  assert.equal(polaroidContactNote(seed, true), '');
  assert.equal(polaroidContactNote(` ${seed}\n`, true), '');
  assert.equal(polaroidContactNote(seed, false), seed);
  for (const custom of ['', '请提前一周预约。', '示例联系方式用于教学展示。', `${seed}\n自定义补充`]) assert.equal(polaroidContactNote(custom, true), custom);
});
test('inquiry keeps the editable checklist byte-for-byte and does not accumulate previous packages', () => {
  const original = '【约拍】\n选择套餐：自行填写\n角色：\n原文 & < >';
  assert.equal(packageInquiry(original, null), original);
  assert.equal(packageInquiry(original, '漫展场照'), `本次咨询套餐：漫展场照\n\n${original}`);
  const changed = packageInquiry(original, '外景拍摄');
  assert.ok(changed.startsWith('本次咨询套餐：外景拍摄\n\n'));
  assert.ok(changed.endsWith(original));
  assert.ok(!changed.includes('漫展场照'));
});
