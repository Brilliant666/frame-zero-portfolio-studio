import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await fs.readFile(new URL("../app/templates/polaroid-field/composer-layout.ts",import.meta.url),"utf8");
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildComposerLayout:build,composerCardBounds:bounds} = await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const modes = ["constellation","scatter","editorial"];
const members = n => Array.from({length:n},(_,i)=>({id:"member-"+i,aspectRatio:[1.5,2/3,1,2.1,.5][i%5]}));
test("composer rejects excess count and duplicate identifiers without silent loss",()=>{
  const options={mode:"constellation",seed:0};
  assert.throws(()=>build(members(501),options),RangeError);
  assert.throws(()=>build([{id:"same",aspectRatio:1},{id:"same",aspectRatio:1.5}],options),RangeError);
});
test("composer preserves deterministic identity, natural ratio and bounded geometry for all three modes",()=>{
  for(const mode of modes) for(const n of [0,1,11,13,40,500]){
    const input=members(n), options={mode,seed:183,focusId:input[4]?.id};
    const t=performance.now(), result=build(input,options);
    assert.ok(performance.now()-t<15000,"bounded 500-member run");
    assert.deepEqual(result,build(input,options));
    assert.deepEqual(result.cards.map(c=>c.id),input.map(m=>m.id));
    assert.deepEqual(result.cards.map(c=>c.i),input.map((_,i)=>i));
    for(const c of result.cards){
      assert.ok(Math.abs(c.pw/c.ph-input[c.i].aspectRatio)<1e-9);
      for(const k of ["w","h","x","y","rot","pw","ph"]) assert.ok(Number.isFinite(c[k]));
      const b=bounds(c);
      assert.ok(b.l>=0 && b.t>=0 && b.r<=result.world.w+1e-8 && b.b<=result.world.h+1e-8);
    }
    if(n) assert.equal(result.cards.filter(c=>c.role==="hero").length,1);
    if(result.note){
      const b=bounds({x:result.note.cx,y:result.note.cy,w:250,h:160,rot:result.note.rot});
      assert.ok(b.l>=0 && b.t>=0 && b.r<=result.world.w && b.b<=result.world.h);
    }
  }
});
test("mobile maintains sequential natural flow without horizontal overflow",()=>{
  for(const mode of modes) for(const width of [320,390,767]){
    const result=build(members(13),{mode,seed:22,viewportWidth:width});
    let bottom=0;
    for(const c of result.cards){
      const b=bounds(c);
      assert.ok(b.l>=0 && b.r<=width+1e-8);
      assert.ok(b.t>=bottom);
      bottom=b.b;
      assert.ok(Math.abs(c.pw/c.ph-members(13)[c.i].aspectRatio)<1e-9);
    }
    assert.equal(result.note,null);
    assert.deepEqual(result.lines,[]);
  }
});
test("prototype roles and decoration remain mode-specific and seed changes position only",()=>{
  const input=members(13);
  for(const mode of modes){
    const a=build(input,{mode,seed:12,focusId:input[8].id});
    const b=build(input,{mode,seed:13,focusId:input[8].id});
    assert.deepEqual(a.cards.map(c=>c.id),b.cards.map(c=>c.id));
    assert.equal(a.cards[8].role,"hero");
    assert.notDeepEqual(a.cards.map(c=>[c.x,c.y,c.rot]),b.cards.map(c=>[c.x,c.y,c.rot]));
    if(mode==="constellation"){assert.equal(a.lines.length,12);assert.ok(a.cards.every(c=>c.pin));}
    if(mode==="scatter"){assert.ok(a.note);assert.ok(a.cards.some(c=>c.tape));}
    if(mode==="editorial"){assert.equal(a.heroPad,.45);assert.equal(a.lines.length,0);assert.equal(a.note,null);}
  }
});
