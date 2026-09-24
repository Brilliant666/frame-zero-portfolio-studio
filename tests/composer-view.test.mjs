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
const {parseComposerPreference:parse,composerSeed,composerBounds,composerNoteBounds,composerView}=await load("composer-view");
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
test("automatic scatter view contains opening paper or completely excludes it for later heroes",()=>{
  for(const n of [2,11,13,40,200]) for(const ratios of (n===11 || n===13 ? [[1.5,2/3,1],[1.5],[2/3],[.12,6]] : [[1.5,2/3,1]])) for(const seed of [0,6,17,233]) for(const focus of [0,Math.floor(n/2),n-1]){
    const input=Array.from({length:n},(_,i)=>({id:"p"+i,aspectRatio:ratios[i%ratios.length]}));
    for(const [w,h,top] of [[1440,820,146],[1024,680,180]]){
      const layout=build(input,{mode:"scatter",seed,focusId:input[focus].id,viewportWidth:w,viewportHeight:h,viewportTop:top});
      const note=composerNoteBounds(layout);
      assert.ok(note);
      const view=composerView(layout,w,h,top,"hero");
      const rect={left:note.left*view.scale+view.x,right:note.right*view.scale+view.x,top:note.top*view.scale+view.y,bottom:note.bottom*view.scale+view.y};
      if(layout.heroStartsOpeningCluster ?? layout.heroOnly.includes(0)){
        assert.ok(rect.left>=40-1e-6 && rect.right<=w-40+1e-6 && rect.top>=top-1e-6 && rect.bottom<=h-72+1e-6,JSON.stringify({n,seed,focus,w,rect}));
      }else{
        assert.ok(rect.right<=-8+1e-6 || rect.left>=w+8-1e-6 || rect.bottom<=-8+1e-6 || rect.top>=h+8-1e-6,JSON.stringify({n,seed,focus,w,rect}));
      }
      const hero=layout.cards.findIndex(c=>c.role==="hero");
      const b=composerBounds(layout,[hero]);
      assert.ok(b.left*view.scale+view.x>=40-1e-6 && b.right*view.scale+view.x<=w-40+1e-6 && b.top*view.scale+view.y>=top-1e-6 && b.bottom*view.scale+view.y<=h-72+1e-6,"hero stays complete");
      assert.deepEqual(composerView(layout,w,h,top,"hero"),view,"repeated mode return is deterministic");
    }
  }
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
      assert.ok(Number.isFinite(hero.scale) && hero.scale>=v.scale);
      if(layout.cards.length){
        const principal=composerBounds(layout,[layout.cards.findIndex(card=>card.role==="hero")]);
        assert.ok((principal.right-principal.left)*hero.scale<=w-80+1e-6 && (principal.bottom-principal.top)*hero.scale<=h-top-72+1e-6,"hero zoom is bounded by the real available rectangle");
      }
    }
    if(layout.note){
      const noteOnly={...layout,cards:[]};
      const b=composerBounds(noteOnly),note=layout.note;
      assert.ok(b.left<note.cx-125 && b.right>note.cx+125 && b.top<note.cy-80 && b.bottom>note.cy+80);
    }
  }
});
test("FIT has no minimum zoom floor even for a deliberately very wide scene",()=>{
  const layout=build([{id:"a",aspectRatio:1},{id:"b",aspectRatio:1}],{mode:"editorial",seed:0});
  layout.cards[1].x=100000;
  const view=composerView(layout,1024,680,180,"fit");
  assert.ok(view.scale<.05 && view.scale>0);
  const bounds=composerBounds(layout);
  assert.ok(bounds.left*view.scale+view.x>=40-1e-6 && bounds.right*view.scale+view.x<=984+1e-6);
});
test("editorial hero view frames actual neighbouring photos rather than blank padding",()=>{
  for(const n of [11,13]) for(const focus of [0,5,n-1]) for(const ratio of [1.5,2/3]){
    const input=Array.from({length:n},(_,i)=>({id:"p"+i,aspectRatio:i===focus?ratio:[1.5,2/3][i%2]}));
    const layout=build(input,{mode:"editorial",focusId:input[focus].id,seed:17});
    assert.ok(layout.heroIdx.includes(focus) && layout.heroIdx.length>=2);
    const view=composerView(layout,1440,820,146,"hero");
    const bounds=composerBounds(layout,layout.heroIdx);
    assert.ok(bounds.left*view.scale+view.x>=40-1e-6 && bounds.right*view.scale+view.x<=1400+1e-6);
    assert.ok(bounds.top*view.scale+view.y>=146-1e-6 && bounds.bottom*view.scale+view.y<=748+1e-6);
  }
});
