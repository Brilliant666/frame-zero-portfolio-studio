import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Exercise actual handlers with deterministic hooks/transports; no server or account writes.
async function component(file, extras = {}) {
  const slots = []; let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; }, useId() { return 'upload-hint'; }, useEffect() {},
  };
  const exports = {}, source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { exports, ...extras, require(id) {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props}) };
    if (id.endsWith('.module.css')) return new Proxy({}, {get: (_, key) => key});
    if (id === 'next/link') return {};
    throw Error(`Unexpected import: ${id}`);
  } });
  return props => { cursor = 0; return exports.default(props); };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
function text(node) {
  if (node == null || node === false) return '';
  if (typeof node !== 'object') return String(node);
  return [node.props?.children].flat(Infinity).map(text).join(' ');
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('failed login preserves username/form values while clearing password and restoring focus', async () => {
  for (const status of [401, 429, 503, 'network']) {
    const render = await component('app/login/login.tsx', {
      FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key]; } },
      fetch: async () => { if (status === 'network') throw Error('network'); return {ok:false, status}; },
    });
    let tree = render(); const formNode = find(tree, node => node.type === 'form');
    const input = find(tree, node => node.type === 'input' && node.props.name === 'password');
    let focus = 0, resets = 0;
    input.props.ref.current = {value:'private-fixture-value', focus(){ focus++; }};
    const form = {username:'retained-fixture-user', password:'private-fixture-value', reset(){ resets++; this.username=''; }};
    await formNode.props.onSubmit({preventDefault(){}, currentTarget:form});
    tree = render();
    assert.equal(form.username, 'retained-fixture-user'); assert.equal(resets, 0);
    assert.equal(input.props.ref.current.value, ''); assert.equal(focus, 1);
    assert.equal(find(tree, node => node.props?.id === 'login-feedback').props.role, 'alert');
    if (status === 429) assert.match(text(tree), /尝试过于频繁/);
  }
});

test('batch upload stops after an uncertain request and retains per-item confirmations without retry', async () => {
  let calls = 0, refresh = 0;
  const render = await component('app/site-editor/asset-upload.tsx', {fetch: async () => { if (++calls === 2) throw Error('lost reply'); return {ok:true,status:201}; }});
  const props = {endpoint:'/api/sites/fixture/assets', onUploaded:async()=>{ refresh++; }};
  const files = [1,2,3].map(i=>({name:`anonymous-${i}.png`,size:1024,type:'image/png'}));
  const tree = render(props), input = find(tree, node => node.type === 'input');
  input.props.onChange({target:{files,value:'chosen'}}); await flush();
  const result = render(props);
  assert.equal(calls,2); assert.equal(refresh,1);
  const results = find(result,node=>node.type === 'ul');
  assert.match(text(results), /anonymous-1.png\s+—\s+已入库/);
  assert.match(text(results), /anonymous-2.png\s+—\s+结果待核对/);
  assert.match(text(results), /anonymous-3.png\s+—\s+未上传/);
  assert.equal(find(result,node=>node.type === 'input').props.disabled,false);
  assert.equal(find(result,node=>node.type === 'p' && node.props.role === 'alert').props.role,'alert');
});
test('upload validates limits before transport and unlocks even when library refresh fails', async () => {
  let calls=0;
  const render = await component('app/site-editor/asset-upload.tsx', {fetch:async()=>{calls++;return {ok:true,status:201};}});
  const props={endpoint:'/api/sites/fixture/assets',onUploaded:async()=>{throw Error('read failed');}};
  const choose = files => find(render(props),node=>node.type==='input').props.onChange({target:{files,value:'chosen'}});
  const file={name:'anonymous.png',size:1024,type:'image/png'};
  for (const files of [Array(9).fill(file),[{...file,size:20*1024*1024+1}],[{...file,type:'image/gif'}]]) { choose(files); await flush(); assert.equal(calls,0); }
  assert.match(text(render(props)),/每批最多 8 张/);
  choose([file]);await flush();assert.equal(calls,1);assert.equal(find(render(props),node=>node.type==='input').props.disabled,false);
  assert.match(text(render(props)),/图库刷新失败/);
  choose([file]);await flush();assert.equal(calls,2,'Refresh errors cannot leave the upload lock stuck');
});
