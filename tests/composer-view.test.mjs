import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
async function load(name){
  const text=await fs.readFile(new URL("../app/templates/polaroid-field/"+name+".ts",import.meta.url),"utf8");
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
}
const {buildComposerLayout:build}=await load("composer-layout");
const {parseComposerPreference:parse,composerSeed,composerBounds,composerView}=await load("composer-view");
test("preferences accept only supported modes, unsigned integer seeds and safe IDs",()=>{
  for(const value of [null,undefined,false,33,"scatter",[],{mode:"other",seed:-1,heroId:"../bad"}]){
    assert.deepEqual(parse(value),{mode:"constellation",seed:0});
  }
  for(const seed of [NaN,Infinity,1.2,-1,0x100000000]){
    assert.equal(parse({seed}).seed,0);
  }
  const valid={mode:"scatter",seed:0xffffffff,heroId:"real-photo_123"};
  assert.deepEqual(parse(valid),valid);
  assert.deepEqual(parse({mode:"editorial",seed:18,heroId:""}),{mode:"editorial",seed:18});
  assert.equal(composerSeed("collection",valid),composerSeed("collection",valid));
  assert.notEqual(composerSeed("collection",valid),composerSeed("collection",{...valid,seed:17}));
  assert.notEqual(composerSeed("collection",valid),composerSeed("collection",{...valid,mode:"editorial"}));
});
test("FIT includes whole decorated cards and rotated note for 0, 1 and 500 photos",()=>{
  for(const mode of ["constellation","scatter","editorial"]) for(const n of [0,1,11,13,500]){
    const input=Array.from({length:n},(_,i)=>({id:"p"+i,aspectRatio:[2/3,1.5,1][i%3]}));
    const layout=build(input,{mode,seed:233,focusId:input[4]?.id});
    const bounds=composerBounds(layout);
    for(const [w,h,top] of [[1440,820,146],[1024,680,180],[390,650,180]]){
      const v=composerView(layout,w,h,top,"fit");
      assert.ok(Number.isFinite(v.scale) && v.scale>0);
      const epsilon=1e-7;
      assert.ok(bounds.left*v.scale+v.x>=40-epsilon);
      assert.ok(bounds.right*v.scale+v.x<=w-40+epsilon);
      assert.ok(bounds.top*v.scale+v.y>=top-epsilon);
      assert.ok(bounds.bottom*v.scale+v.y<=h-72+epsilon);
      const hero=composerView(layout,w,h,top,"hero");
      assert.ok(hero.scale>=v.scale && hero.scale<=1.05);
    }
    if(mode==="editorial" && n===500) assert.ok(composerView(layout,1024,680,180,"fit").scale<.05,"FIT has no 5% floor");
    if(layout.note){
      const noteOnly={...layout,cards:[]};
      const b=composerBounds(noteOnly),note=layout.note;
      assert.ok(b.left<note.cx-125 && b.right>note.cx+125 && b.top<note.cy-80 && b.bottom>note.cy+80);
    }
  }
});
