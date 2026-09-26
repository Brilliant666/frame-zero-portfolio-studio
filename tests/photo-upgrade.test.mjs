import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const compile=async name=>ts.transpileModule(await fs.readFile(new URL(`../app/templates/polaroid-field/${name}.ts`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=js=>`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const entry=url(await compile("entry-photos"));
const {schedulePhotoChecks,photoUpgradeTarget,observePhotoUpgrades}=await import(url((await compile("photo-upgrade")).replace('"./entry-photos"',JSON.stringify(entry))));
let serial=0;
function fixture(){
  const names=["setTimeout","clearTimeout","performance","document","window","innerWidth","innerHeight","devicePixelRatio","ResizeObserver","IntersectionObserver","Image","location"];
  const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  let now=0,index=0;
  const timers=new Map(),requests=[],observers=[];
  const target=()=>{const listeners=new Map();return {addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),emit:(name,event)=>listeners.get(name)?.(event),listeners};};
  const doc={...target(),hidden:false},win=target();
  const asset={variants:{card:{src:`/photos/library/test-${++serial}-card.webp`,width:1100},full:{src:`/photos/library/test-${serial}-full.webp`,width:2400}}};
  const image={dataset:{photoId:"a",photoTier:"600"},box:{left:10,top:10,right:410,bottom:400,width:400,height:390},getBoundingClientRect(){return this.box;}};
  const world={...target(),isConnected:true,querySelectorAll:()=>[image],contains:node=>node===image};
  class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  const globals={setTimeout:(fn,delay)=>{timers.set(++index,{fn,at:now+delay});return index;},clearTimeout:id=>timers.delete(id),performance:{now:()=>now,mark(){}},document:doc,window:win,innerWidth:1440,innerHeight:900,devicePixelRatio:2,ResizeObserver:Observer,IntersectionObserver:Observer,location:{href:"http://localhost/preview"},Image:class{set src(value){this.url=value;requests.push(this);}decode(){return Promise.resolve();}}};
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const advance=ms=>{const end=now+ms;for(;;){const pair=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!pair||pair[1].at>end)break;now=pair[1].at;timers.delete(pair[0]);pair[1].fn();}now=end;};
  const updates=[];
  const start=(allowed=()=>true)=>observePhotoUpgrades(world,new Map([["a",asset]]),{allowed,protectedUntil:1600,update:(id,value)=>{updates.push({id,...value});image.dataset.photoTier=String(value.tier);}});
  return {advance,start,asset,image,world,doc,win,requests,observers,updates,timers,restore(){for(const [key,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}};
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test("protection expiry schedules a check without another interaction and coalesces triggers",()=>{
  const f=fixture();try{let checks=0;const scheduler=schedulePhotoChecks(()=>checks++,()=>true,1600);
    scheduler.request();f.advance(200);scheduler.request();f.advance(1399);assert.equal(checks,0);f.advance(1);assert.equal(checks,1);
    f.advance(10000);assert.equal(checks,1,"no permanent polling");scheduler.request();scheduler.dispose();f.advance(1000);assert.equal(checks,1);
  }finally{f.restore();}
});
test("source-limited targets avoid invented clarity and unnecessary requests",()=>{
  const f=fixture();try{
    assert.equal(photoUpgradeTarget(f.asset,599,600),null);
    assert.equal(photoUpgradeTarget(f.asset,800,600).tier,1100);
    assert.equal(photoUpgradeTarget(f.asset,1500,600).tier,2200);
    assert.equal(photoUpgradeTarget({...f.asset,variants:{card:{width:400},full:{width:500}}},900,500),null);
    const target=photoUpgradeTarget({...f.asset,variants:{card:{src:"/small",width:650},full:{src:"/full",width:800}}},1500,600);
    assert.equal(target.tier,800);assert.match(target.src,/src=%2Ffull/);
  }finally{f.restore();}
});
test("real observer requests decode after protection, deduplicates and cleans all triggers",async()=>{
  const f=fixture();try{const stop=f.start();f.advance(1599);assert.equal(f.requests.length,0);f.advance(1);assert.equal(f.requests.length,1);
    f.world.emit("composer:scale");f.advance(180);assert.equal(f.requests.length,1);
    assert.equal(f.updates.length,0,"low tier retained before decoding");f.requests[0].onload();await flush();assert.equal(f.updates[0].tier,1100);
    f.world.emit("composer:scale");f.advance(180);assert.equal(f.requests.length,1,"sufficient image is not fetched again");
    stop();assert.ok(f.observers.every(o=>o.disconnected));assert.equal(f.world.listeners.size,0);assert.equal(f.doc.listeners.size,0);assert.equal(f.win.listeners.size,0);
  }finally{f.restore();}
});
test("ready, mobile scroll, resize and visibility recheck without polling",async()=>{
  const f=fixture();try{let ready=false;const stop=f.start(()=>ready);f.advance(2000);assert.equal(f.requests.length,0);
    ready=true;f.image.box.top=1000;f.image.box.bottom=1300;f.world.emit("composer:ready");f.advance(180);assert.equal(f.requests.length,0);
    f.image.box.top=10;f.image.box.bottom=400;f.win.emit("scroll");f.advance(180);assert.equal(f.requests.length,1);
    f.requests[0].onload();await flush();f.doc.hidden=true;f.image.box.width=800;f.observers[0].callback();f.advance(180);assert.equal(f.requests.length,1);
    f.doc.hidden=false;f.doc.emit("visibilitychange");f.advance(180);assert.equal(f.requests.length,2);stop();f.requests[1].onload();await flush();assert.equal(f.updates.length,1,"disposed request ignored");
  }finally{f.restore();}
});
test("failed high tier retries once and never marks the asset unavailable",async()=>{
  const f=fixture();try{const stop=f.start();f.advance(1600);f.requests[0].onerror();await flush();f.advance(1180);assert.equal(f.requests.length,2);
    f.requests[1].onerror();await flush();f.advance(5000);f.world.emit("composer:scale");f.advance(180);assert.equal(f.requests.length,2);assert.equal(f.updates.length,0);stop();
  }finally{f.restore();}
});
test("late lower-tier decode cannot overwrite the higher tier",async()=>{
  const f=fixture();try{const stop=f.start();f.advance(1600);f.image.box.width=800;f.world.emit("composer:scale");f.advance(180);assert.equal(f.requests.length,2);
    f.requests[1].onload();await flush();f.requests[0].onload();await flush();assert.equal(f.updates.length,1);assert.equal(f.updates[0].tier,2200);stop();
  }finally{f.restore();}
});
test("display failure invalidates decoded cache and retries the failed tier at most once",async()=>{
  const f=fixture();try{const stop=f.start();f.advance(1600);f.requests[0].onload();await flush();
    f.image.dataset.photoTier="600";f.world.emit("composer:photo-error",{detail:{id:"a",src:f.updates[0].src}});
    f.advance(1180);assert.equal(f.requests.length,2,"cached predecode success must not suppress retry");
    f.requests[1].onload();await flush();assert.equal(f.updates.length,2);
    f.image.dataset.photoTier="600";f.world.emit("composer:photo-error",{detail:{id:"a",src:f.updates[1].src}});
    f.advance(5000);f.world.emit("composer:scale");f.advance(180);assert.equal(f.requests.length,2);stop();
  }finally{f.restore();}
});
