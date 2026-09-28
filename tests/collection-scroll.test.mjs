import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/templates/polaroid-field/collection-scroll.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { collectionScrollTarget, collectionScrollTop, collectionCameraKey } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function fixture() {
  const calls = [];
  const view = { innerWidth: 1440, scrollY: 420, getComputedStyle: node => ({ overflowY: node.overflowY }), scrollTo: options => calls.push(['window', options.top]) };
  const body = { overflowY: 'visible' }, document = { body, defaultView: view };
  const dialog = { parentElement: body, overflowY: 'auto', scrollTop: 275, scrollTo: options => calls.push(['dialog', options.top]) };
  const wrapper = { parentElement: dialog, overflowY: 'hidden' };
  const root = { clientWidth: 390, parentElement: wrapper, ownerDocument: document };
  return { root, dialog, wrapper, view, calls };
}
test('embedded collection remembers and restores the actual scrolling dialog, not the background window', () => {
  const { root, dialog, view, calls } = fixture();
  const target = collectionScrollTarget(root);
  assert.equal(target, dialog); assert.equal(collectionScrollTop(target), 275);
  target.scrollTo({ top: 125, behavior: 'instant' });
  assert.deepEqual(calls, [['dialog', 125]]); assert.equal(view.scrollY, 420);
});
test('nested scroll containers take precedence and full-page collections retain window scrolling', () => {
  const { root, dialog, wrapper, view } = fixture();
  wrapper.overflowY = 'scroll'; assert.equal(collectionScrollTarget(root), wrapper);
  wrapper.overflowY = 'visible'; dialog.overflowY = 'visible';
  assert.equal(collectionScrollTarget(root), view); assert.equal(collectionScrollTop(view), 420);
});
test('camera restoration uses current container width and the scene breakpoint rather than browser width', () => {
  const { root } = fixture();
  assert.equal(collectionCameraKey(root, 'home'), 'home:mobile');
  root.clientWidth = 650;
  assert.equal(collectionCameraKey(root, 'home'), 'home:desktop');
  assert.equal(collectionCameraKey(root, 'home', 768), 'home:mobile');
  root.clientWidth = 900;
  assert.equal(collectionCameraKey(root, 'photos', 768), 'photos:desktop');
});
