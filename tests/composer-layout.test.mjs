import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await fs.readFile(new URL("../app/templates/polaroid-field/composer-layout.ts",import.meta.url),"utf8");
const js = ts.transpileModule(source+"\nexport {frameFor,makeCard};",{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildComposerLayout:build,composerCardBounds:bounds,composerPhotoIsOccluded,composerSheetsOverlap,frameFor,makeCard} = await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const modes = ["constellation","scatter","editorial"];
const members = n => Array.from({length:n},(_,i)=>({id:"member-"+i,aspectRatio:[1.5,2/3,1,2.1,.5][i%5]}));
test("unchanged prototype sizing primitives preserve their exact formulas",()=>{
 for(const mode of modes)for(const ratio of [.1,.45,2/3,1,1.5,2.3,7])for(const area of [36000,38000,98800]){
  const rr=Math.max(.45,Math.min(2.3,ratio));
  let pw=Math.sqrt(area*rr),ph=pw/rr;
  if(ratio>rr)ph=pw/ratio;else if(ratio<rr)pw=ph*ratio;
  const side=mode==="editorial"?Math.round(Math.max(7,Math.min(13,Math.min(pw,ph)*.035+4))):Math.round(Math.max(8,Math.min(20,Math.min(pw,ph)*.05+4)));
  const f={side,top:side,bottom:Math.round(mode==="editorial"?side*2.4+12:side*3+8)};
  assert.deepEqual(frameFor(pw,ph,mode),f);
  const card=makeCard(0,{id:"fixture",r:ratio},"small",area,mode);
  assert.equal(card.pw,pw);assert.equal(card.ph,ph);assert.deepEqual(card.f,f);
 }
});
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
    if(mode==="editorial"){assert.equal(a.heroPad,undefined);assert.ok(a.heroIdx.length>1);assert.equal(a.lines.length,0);assert.equal(a.note,null);}
  }
});
test("scatter protects actual rotated photo polygons while retaining paper overlap",()=>{
 let paperOverlap=0;
 for(const n of [2,11,13,40]) for(const ratios of [[1.5],[2/3],[.1,4,1.5,2/3]]) for(const seed of [0,183,7919]){
  const input=members(n).map((m,i)=>({...m,aspectRatio:ratios[i%ratios.length]}));
  const result=build(input,{mode:"scatter",seed,focusId:input[Math.min(4,n-1)].id});
  for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){
   const x=result.cards[a],y=result.cards[b], back=x.z<y.z?x:y, front=x.z<y.z?y:x;
   assert.equal(composerPhotoIsOccluded(back,front),false,JSON.stringify({n,seed,a,b,ratios}));
   if(composerSheetsOverlap(x,y)) paperOverlap++;
  }
 }
 assert.ok(paperOverlap>0,"actual rotated paper polygons still overlap, not just their envelopes");
});
test("bounded row trials keep identity and random styling stable across viewports",()=>{
 for(const mode of ["constellation","scatter"])for(const n of [1,2,11,13,40,200]){
  const input=members(n),base={mode,seed:731,focusId:input[Math.min(4,n-1)].id};
  const a=build(input,{...base,viewportWidth:1440,viewportHeight:820,viewportTop:150});
  const b=build(input,{...base,viewportWidth:1024,viewportHeight:680,viewportTop:150});
  const style=c=>[c.id,c.i,c.role,c.pw,c.ph,c.rot,c.tape,c.tape2,c.pin];
  assert.deepEqual(a.cards.map(style),b.cards.map(style));
  for(const result of [a,b]){
   assert.ok(result.meta.candidates.length<=6);
   if(n<=13)assert.ok(result.meta.candidates.every(c=>c.rows<=3));
   const best=Math.max(...result.meta.candidates.map(c=>c.fitScale));
   assert.equal(result.meta.candidates.find(c=>c.rows===result.meta.selectedRows).fitScale,best);
   assert.ok(result.meta.candidates.every(c=>c.width>0 && c.height>0 && Number.isFinite(c.fitScale)));
  }
 }
});
test("phone ordinary photos can grow independently of desktop small-card caps",()=>{
 const input=Array.from({length:13},(_,i)=>({id:"portrait-"+i,aspectRatio:2/3}));
 for(const mode of modes)for(const viewportWidth of [320,390,480]){
  const mobile=build(input,{mode,seed:44,viewportWidth});
  for(const c of mobile.cards) assert.ok(c.pw>viewportWidth*.7,"natural portrait is comfortably readable");
  const resized=build(input,{mode,seed:44,viewportWidth,viewportHeight:9999,viewportTop:9000});
  assert.deepEqual(mobile.cards,resized.cards,"mobile sizing never depends on its auto document height");
 }
});
test("legal aspect extremes and larger fixtures remain finite, reachable and bounded",()=>{
 for(const mode of modes)for(const n of [0,1,2,11,13,40,200])for(const ratios of [[.05],[20],[1.5],[2/3],[.05,20,1.5,2/3]]){
  const input=members(n).map((m,i)=>({...m,aspectRatio:ratios[i%ratios.length]}));
  for(const viewportWidth of [1440,320,480]){
   const result=build(input,{mode,seed:91,focusId:input.at(-1)?.id,viewportWidth});
   assert.equal(result.cards.length,n);
   assert.ok(Number.isFinite(result.world.w) && Number.isFinite(result.world.h));
   for(const c of result.cards){
    assert.ok(Math.abs(c.pw/c.ph-input[c.i].aspectRatio)<1e-8);
    const b=bounds(c,viewportWidth<768?24:30);
    assert.ok(b.l>=-1e-8 && b.t>=-1e-8 && b.r<=result.world.w+1e-8 && b.b<=result.world.h+1e-8);
   }
  }
 }
});
test("editorial short prefix or suffix cannot exceed the multi-photo hero",()=>{
 for(const n of [2,11,13])for(const focus of [0,Math.floor(n/2),n-2,n-1])for(const ratios of [[1.5],[2/3],[1.5,2/3]]){
  const input=members(n).map((m,i)=>({...m,aspectRatio:ratios[i%ratios.length]}));
  const result=build(input,{mode:"editorial",seed:0,focusId:input[focus].id});
  const hero=result.cards[focus];
  for(const c of result.cards)if(c!==hero)assert.ok(c.pw*c.ph<=hero.pw*hero.ph*.55+1e-7);
  assert.ok(result.heroIdx.includes(focus));
 }
});
