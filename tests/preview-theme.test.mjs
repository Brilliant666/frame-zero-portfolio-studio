import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source=await fs.readFile(new URL("../app/preview-workspace/preview-theme.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {PREVIEW_THEME_BOOTSTRAP,PREVIEW_THEME_BOOTSTRAP_CSS,PREVIEW_THEME_KEY}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));

function boot(pathname,value,blocked=false,missing=false){
  const dataset={},reads=[];
  const context={location:{pathname},document:{documentElement:{dataset}}};
  if(!missing)context.localStorage={getItem(key){reads.push(key);if(blocked)throw new Error("Storage unavailable");return value;}};
  vm.runInNewContext(PREVIEW_THEME_BOOTSTRAP,context);
  return {dataset,reads};
}

test("prepaint bootstrap restores a saved dawn choice only on the exact preview route",()=>{
  for(const path of ["/preview","/preview/"]){
    const result=boot(path,"paper");
    assert.deepEqual(result.dataset,{previewTheme:"paper",starTheme:"paper"});
    assert.deepEqual(result.reads,[PREVIEW_THEME_KEY]);
  }
});

test("legacy and admin routes never read or apply preview preferences",()=>{
  for(const path of ["/","/admin","/admin/template","/preview/admin","/preview-admin","/preview-other","/preview//"]){
    const result=boot(path,"night");
    assert.deepEqual(result.dataset,{},path);assert.deepEqual(result.reads,[],path);
  }
});

test("missing, corrupt and inaccessible preference storage safely defaults to the night sky",()=>{
  for(const value of [null,undefined,"night","light","{broken","PAPER"]){
    assert.deepEqual(boot("/preview",value).dataset,{previewTheme:"night",starTheme:"night"});
  }
  assert.equal(boot("/preview","paper",true).dataset.previewTheme,"night");
  assert.equal(boot("/preview",null,false,true).dataset.previewTheme,"night");
});

test("prepaint style remains preview-scoped and gives the loading scene dark paint",()=>{
  assert.match(PREVIEW_THEME_BOOTSTRAP_CSS,/html\[data-preview-theme="night"\]\{background:#171716/);
  assert.match(PREVIEW_THEME_BOOTSTRAP_CSS,/--star-intro-bg:#171716;--star-accent:#e4ded3/);
  assert.match(PREVIEW_THEME_BOOTSTRAP_CSS,/html\[data-preview-theme\] body\{background:transparent/);
  assert.ok(PREVIEW_THEME_BOOTSTRAP_CSS.split("}").filter(Boolean).every(rule=>rule.startsWith("html[data-preview-theme")));
});

test("embedded preview receives local paper variables without global page styling",async()=>{
  const css=await fs.readFile(new URL("../app/preview-workspace/preview-theme.css",import.meta.url),"utf8");
  const [firstRule]=css.split("}");
  const [selectors,declarations]=firstRule.split("{");
  assert.equal(selectors.trim(),'html[data-preview-theme], [data-preview-local-theme="paper"]');
  assert.ok(declarations.split(";").map(value=>value.trim()).filter(Boolean).every(value=>value.startsWith("--star-")||value.startsWith("color-scheme:")));
  assert.match(declarations,/--star-paper:#ffffff/);
  assert.ok(!css.includes('[data-preview-local-theme="night"]'));
  assert.deepEqual(boot("/preview/admin","night").dataset,{});
});
