import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source=await fs.readFile(new URL("../app/templates/polaroid-field/collection-entrance.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {playCollectionEntrance,collectionEntranceTiming}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));

function fixture(reduced=false){
  const running=[],ghosts=[],events=[],listeners=new Set();
  const node=(role)=>({dataset:{role,rotation:"-3"},style:{},children:[],setAttribute(){},append(child){this.children.push(child);},remove(){this.removed=true;},
    animate(frames,options){const a={frames,options,cancelled:false,finished:new Promise(()=>{}),cancel(){this.cancelled=true;}};running.push(a);return a;},
    getBoundingClientRect(){return {left:200,top:100,width:240,height:350};}});
  const cards=["support","hero","support"].map(role=>{const n=node(role),img=node(),pin=node();n.querySelector=()=>img;n.querySelectorAll=()=>[pin];return n;});
  const line=node();
  const world={style:{visibility:"hidden"},closest:()=>({getAttribute:()=>"night"}),querySelectorAll:selector=>selector==="[data-card-id]"?cards:[line]};
  globalThis.matchMedia=()=>({matches:reduced,addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)});
  globalThis.document={createElement:()=>node(),body:{append(element){ghosts.push(element);}}};
  globalThis.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init.detail;}};
  globalThis.window={dispatchEvent:event=>events.push(event)};
  globalThis.innerWidth=1440;globalThis.innerHeight=900;
  globalThis.getComputedStyle=()=>({getPropertyValue:()=>"#eee"});
  return {world,cards,running,ghosts,events,listeners};
}
test("entrance preserves saved order and distinct theme timing",()=>{
  assert.equal(collectionEntranceTiming(2,true,false).delay,1100);
  assert.equal(collectionEntranceTiming(2,false,true).delay,120);
  assert.equal(collectionEntranceTiming(0,false,false).duration,760);
  assert.notEqual(collectionEntranceTiming(0,false,false).easing,collectionEntranceTiming(0,false,true).easing);
});
test("flight, developing, line redraw and cancellation are scene owned",()=>{
  const f=fixture();
  const cleanup=playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg"},{pin:".pin",tape:".tape",lines:".lines"},false);
  assert.equal(f.ghosts.length,1);assert.equal(f.running[0].options.duration,980);
  assert.match(f.running[0].frames[1].transform,/scale\(2\.4\)/);
  assert.equal(f.running.filter(a=>a.options.duration===1700).length,3);
  assert.equal(f.running.at(-1).frames[0].strokeDashoffset,1);
  assert.equal(f.world.style.visibility,"visible");assert.equal(f.events[0].detail.duration,1100);
  cleanup();cleanup();
  assert.ok(f.running.every(a=>a.cancelled));assert.ok(f.ghosts[0].removed);assert.equal(f.listeners.size,0);
});
test("reduced motion is immediate and offscreen sources do not create flights",()=>{
  let f=fixture(true);
  playCollectionEntrance(f.world,undefined,{pin:".pin",tape:".tape",lines:".lines"},false)();
  assert.equal(f.running.length,0);assert.equal(f.events.length,0);assert.equal(f.world.style.visibility,"visible");
  f=fixture();playCollectionEntrance(f.world,{x:0,y:-200,width:100,height:140,src:"/anonymous.svg"},{pin:".pin",tape:".tape",lines:".lines"})();
  assert.equal(f.ghosts.length,0);assert.equal(f.running[0].options.delay,0);
});
test("mobile offscreen saved hero lands at visible paper without reordering",()=>{
  const f=fixture();globalThis.innerWidth=390;globalThis.innerHeight=844;
  f.cards[0].getBoundingClientRect=()=>({left:24,top:180,width:330,height:420});
  f.cards[1].getBoundingClientRect=()=>({left:24,top:2200,width:330,height:420});
  const cleanup=playCollectionEntrance(f.world,{x:24,y:220,width:330,height:420,src:"/anonymous.svg"},{pin:".pin",tape:".tape",lines:".lines"},true);
  assert.equal(f.ghosts.length,1);
  assert.match(f.running[0].frames[1].transform,/translate\(0px,-40px\)/);
  assert.equal(f.cards[1].dataset.role,"hero");
  cleanup();
});
