import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const source=await fs.readFile(new URL("../app/preview-workspace/glass-segments.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function mount(props){
  const effect=[],changes={},selected={offsetLeft:88,offsetWidth:96};let observed=false,disconnected=false;
  const element={style:{setProperty:(key,value)=>changes[key]=value},querySelector:()=>selected};
  const exports={};
  vm.runInNewContext(compiled,{exports,require:(id)=>id==="react"?{useRef:()=>({current:element}),useLayoutEffect:fn=>effect.push(fn)}:id.endsWith(".css")?{default:{segments:"segments",indicator:"indicator"}}:require(id),ResizeObserver:class {observe(){observed=true;}disconnect(){disconnected=true;}}});
  const tree=exports.default(props),cleanup=effect[0]();
  return {tree,changes,selected,cleanup,observed:()=>observed,disconnected:()=>disconnected};
}
test("navigation preserves real links and reports the selected destination and original event",()=>{
  const calls=[];const result=mount({navigation:true,label:"主导航",value:"packages",options:[{value:"field",label:"作品",href:"#polaroid-top"},{value:"packages",label:"拍摄套餐",href:"#polaroid-packages"}],onChange:(...args)=>calls.push(args)});
  assert.equal(result.tree.props.role,"navigation");
  const links=result.tree.props.children[1];
  assert.equal(links[0].props["aria-current"],undefined);
  assert.equal(links[1].props["aria-current"],"page");
  assert.equal(links[1].props.href,"#polaroid-packages");
  const event={};links[0].props.onClick(event);
  assert.deepEqual(calls,[["field",event]]);
  assert.deepEqual(result.changes,{"--segment-left":"88px","--segment-width":"96px"});
  assert.equal(result.observed(),true);result.cleanup();assert.equal(result.disconnected(),true);
});
test("composition uses pressed buttons rather than page-navigation semantics",()=>{
  const result=mount({label:"构图",value:"scatter",options:[{value:"constellation",label:"星座"},{value:"scatter",label:"散落"}],onChange:()=>{}});
  const buttons=result.tree.props.children[1];
  assert.equal(result.tree.props.role,"group");
  assert.equal(buttons[1].type,"button");assert.equal(buttons[1].props.type,"button");
  assert.equal(buttons[1].props["aria-pressed"],true);assert.equal(buttons[0].props["aria-pressed"],false);
  assert.equal(buttons[1].props["aria-current"],undefined);result.cleanup();
});
