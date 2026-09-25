import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source=await fs.readFile(new URL("../app/templates/polaroid-field/collection-entrance.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {playCollectionEntrance,collectionEntranceTiming,collectionLandingGeometry}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));

function fixture(reduced=false){
  const running=[],ghosts=[],events=[],listeners=new Set();
  const node=(role)=>({dataset:{role,rotation:"-3"},style:{setProperty(key,value){this[key]=value;}},offsetWidth:240,offsetHeight:350,children:[],setAttribute(){},removeAttribute(key){if(key==="data-card-id")delete this.dataset.cardId;},append(child){this.children.push(child);},remove(){this.removed=true;},
    animate(frames,options){const a={element:this,frames,options,cancelled:false,finished:new Promise(()=>{}),cancel(){this.cancelled=true;}};running.push(a);return a;},
    querySelectorAll(){return [];},cloneNode(){const n=node(role);n.dataset={...this.dataset};return n;},
    getBoundingClientRect(){return {left:200,top:100,right:440,bottom:450,width:240,height:350};}});
  const cards=["support","hero","support"].map((role,i)=>{const n=node(role),img=node(),pin=node();n.dataset.cardId=`photo-${i}`;n.querySelector=()=>img;n.querySelectorAll=selector=>selector==="*"?[]:[pin];return n;});
  const line=node();
  const world={style:{visibility:"hidden"},closest:selector=>selector==="[data-star-theme]"?{getAttribute:()=>"night"}:null,querySelectorAll:selector=>selector==="[data-card-id]"?cards:[line]};
  globalThis.matchMedia=()=>({matches:reduced,addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)});
  globalThis.document={createElement:()=>node(),body:{append(element){ghosts.push(element);}}};
  globalThis.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init.detail;}};
  globalThis.window={dispatchEvent:event=>events.push(event)};
  globalThis.innerWidth=1440;globalThis.innerHeight=900;
  globalThis.getComputedStyle=()=>({length:0,getPropertyValue:()=>"#eee"});
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
  const cleanup=playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"},false);
  assert.equal(f.ghosts.length,1);assert.equal(f.running[0].options.duration,980);
  assert.equal(f.ghosts[0].dataset.collectionFlightAsset,"photo-0");
  assert.equal(f.ghosts[0].dataset.cardId,undefined);
  assert.equal(f.running.filter(a=>a.options.duration===1200).length,2);
  assert.ok(!f.running.some(a=>a.element===f.cards[0] || a.element===f.cards[0].querySelector("img")));
  assert.ok(f.running.filter(a=>a.options.duration===1200).every(a=>a.frames[0].filter==="brightness(1.2) saturate(.6)" && a.frames.every(frame=>frame.opacity===1)));
  assert.equal(f.running.at(-1).frames[0].strokeDashoffset,1);
  assert.equal(f.world.style.visibility,"visible");assert.equal(f.events[0].detail.duration,1100);
  cleanup();cleanup();
  assert.ok(f.running.every(a=>a.cancelled));assert.ok(f.ghosts[0].removed);assert.equal(f.listeners.size,0);
});
test("reduced motion is immediate and offscreen sources do not create flights",()=>{
  let f=fixture(true);
  playCollectionEntrance(f.world,undefined,{pin:".pin",tape:".tape",lines:".lines"},false)();
  assert.equal(f.running.length,0);assert.equal(f.events.length,0);assert.equal(f.world.style.visibility,"visible");
  f=fixture();playCollectionEntrance(f.world,{x:0,y:-200,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"})();
  assert.equal(f.ghosts.length,0);assert.equal(f.running[0].options.delay,0);
});
test("mobile flight matches cover identity instead of an offscreen custom hero",()=>{
  const f=fixture();globalThis.innerWidth=390;globalThis.innerHeight=844;
  f.cards[0].getBoundingClientRect=()=>({left:24,top:180,right:354,bottom:600,width:330,height:420});
  f.cards[1].getBoundingClientRect=()=>({left:24,top:2200,right:354,bottom:2620,width:330,height:420});
  const cleanup=playCollectionEntrance(f.world,{x:24,y:220,width:330,height:420,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"},true);
  assert.equal(f.ghosts.length,1);
  assert.equal(f.ghosts[0].dataset.collectionFlightAsset,"photo-0");
  assert.equal(f.cards[1].dataset.role,"hero");
  cleanup();
});

test("offscreen, clipped, and missing covers never fly to a different card",()=>{
  for(const kind of ["offscreen","clipped","missing"]){
    const f=fixture();
    if(kind==="offscreen")f.cards[0].getBoundingClientRect=()=>({left:-20,top:100,right:220,bottom:450,width:240,height:350});
    if(kind==="clipped"){
      f.world.closest=selector=>selector==="[data-composer]"?{getBoundingClientRect:()=>({left:0,top:120,right:1440,bottom:900}),querySelectorAll:()=>[]}:null;
    }
    playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:kind==="missing"?"unknown":"photo-0"},{pin:".pin",tape:".tape",lines:".lines"})();
    assert.equal(f.ghosts.length,0,kind);
    assert.equal(f.running.filter(a=>a.options.duration===1200).length,3);
  }
});

test("rotated landing geometry retains unrotated paper dimensions and uniform world scale",()=>{
  const width=300,height=470,angle=-7,scale=.83,r=Math.abs(angle)*Math.PI/180;
  const w=(width*Math.cos(r)+height*Math.sin(r))*scale,h=(width*Math.sin(r)+height*Math.cos(r))*scale;
  const g=collectionLandingGeometry({left:100,top:200,width:w,height:h},width,height,angle);
  assert.equal(g.width,width);assert.equal(g.height,height);assert.equal(g.angle,angle);
  assert.ok(Math.abs(g.scale-scale)<1e-10);assert.equal(g.x,100+w/2);assert.equal(g.y,200+h/2);
  assert.match(source,/duration:180/);
  assert.ok(!source.includes("brightness(1.65)"));assert.ok(!source.includes("blur(2px)"));
});
