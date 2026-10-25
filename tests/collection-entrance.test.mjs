import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source=await fs.readFile(new URL("../app/templates/polaroid-field/collection-entrance.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {playCollectionEntrance,collectionEntranceTiming,collectionLandingGeometry,createCollectionFlight,playHomeExit,prepareCollectionBackground}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));

function fixture(reduced=false,{cardCount=3,lineCount=1,backdrops=false}={}){
  const running=[],ghosts=[],events=[],listeners=new Set();
  const node=(role)=>({dataset:{role,rotation:"-3"},style:{visibility:"",setProperty(key,value){this[key]=value;}},offsetWidth:240,offsetHeight:350,children:[],setAttribute(){},removeAttribute(key){if(key==="data-card-id")delete this.dataset.cardId;},append(child){this.children.push(child);},remove(){this.removed=true;},
    animate(frames,options){let finish;const a={element:this,frames,options,cancelled:false,finished:new Promise(resolve=>{finish=resolve;}),finish:()=>finish(),cancel(){this.cancelled=true;}};running.push(a);return a;},
    querySelectorAll(){return [];},cloneNode(){const n=node(role);n.dataset={...this.dataset};return n;},
    getBoundingClientRect(){return {left:200,top:100,right:440,bottom:450,width:240,height:350};}});
  const cards=Array.from({length:cardCount},(_,i)=>{const n=node(i===1?"hero":"support"),img=node(),glow=node(),glowImage=node(),pin=node(),tape=node();n.dataset.cardId=`photo-${i}`;n.querySelector=selector=>selector==="[data-collection-glow]"?backdrops?glow:null:selector==="img[data-photo-id]"?img:backdrops?glowImage:img;n.querySelectorAll=selector=>selector===".pin"?[pin]:selector===".tape"?[tape]:selector===".pin,.tape"?[pin,tape]:[];return n;});
  const lines=Array.from({length:lineCount},()=>node());
  const world={dataset:{},style:{visibility:"hidden"},closest:selector=>selector==="[data-star-theme]"?{getAttribute:()=>"night"}:null,querySelectorAll:selector=>selector==="[data-card-id]"?cards:selector===".lines path"?lines:[]};
  const media={matches:reduced,addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)};
  globalThis.matchMedia=()=>media;
  globalThis.document={createElement:()=>node(),body:{append(element){ghosts.push(element);}}};
  globalThis.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init.detail;}};
  globalThis.window={dispatchEvent:event=>events.push(event)};
  globalThis.innerWidth=1440;globalThis.innerHeight=900;
  globalThis.getComputedStyle=()=>({length:0,getPropertyValue:()=>"#eee"});
  return {world,cards,lines,node,running,ghosts,events,listeners,media};
}
const ghostFlight=f=>f.running.find(a=>a.element===f.ghosts[0]&&a.frames.at(-1).transform?.startsWith("translate("));
const developing=f=>f.running.filter(a=>a.frames.some(frame=>Object.hasOwn(frame,"filter")));
const endsAt=a=>Number(a.options.delay??0)+Number(a.options.duration);

test("entrance keeps the original e462891 duration, order and stagger",()=>{
  assert.equal(collectionEntranceTiming(2,true,false).delay,410);
  assert.equal(collectionEntranceTiming(0,true,false).duration,900);
  assert.equal(collectionEntranceTiming(2,false,true).delay,120);
  assert.equal(collectionEntranceTiming(0,false,false).duration,760);
  assert.notEqual(collectionEntranceTiming(0,false,false).easing,collectionEntranceTiming(0,false,true).easing);
  for(const flight of [false,true]){
    const timings=Array.from({length:1000},(_,index)=>collectionEntranceTiming(index,flight,false));
    assert.ok(timings.every((timing,index)=>timing.delay===(flight?320+index*45:index*60)));
    assert.ok(timings.every(timing=>timing.duration===(flight?900:760)));
  }
});
test("flight, developing, line redraw and cancellation are scene owned",()=>{
  const f=fixture();
  const cleanup=playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"},false);
  assert.equal(f.ghosts.length,1);assert.equal(ghostFlight(f).options.duration,980);
  assert.equal(f.ghosts[0].dataset.collectionFlightAsset,"photo-0");
  assert.equal(f.ghosts[0].dataset.cardId,undefined);
  assert.equal(developing(f).length,2);
  assert.ok(!f.running.some(a=>a.element===f.cards[0] || a.element===f.cards[0].querySelector("img")));
  assert.ok(developing(f).every(a=>a.frames[0].filter==="brightness(.22) contrast(.7) saturate(0)" && a.frames[1].filter==="brightness(.75) contrast(.9) saturate(.55) sepia(.18)" && a.frames[1].offset===.5 && a.frames.at(-1).filter==="none" && a.frames.every(frame=>frame.opacity===undefined)&&a.options.duration===1200));
  // from the homepage every other paper is born at the clicked cover's centre (5+50, 10+70) and grows into place
  const births=f.running.filter(a=>f.cards.includes(a.element));
  // the offset is divided by the world's scale (here the fixture's rotated -3deg paper)
  const birthScale=collectionLandingGeometry({left:200,top:100,width:240,height:350},240,350,-3).scale;
  assert.ok(births.length===2&&births.every(a=>a.frames[0].opacity===0&&a.frames[0].scale===".12"&&a.frames[0].translate===`${Math.round(-265/birthScale)}px ${Math.round(-195/birthScale)}px`&&a.frames.at(-1).translate==="0 0"&&a.options.duration===900));
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
    assert.equal(developing(f).length,3);
    assert.ok(developing(f).every(a=>a.frames[0].filter==="brightness(1.2) saturate(.6)"));
  }
});

test("rotated landing geometry retains unrotated paper dimensions and uniform world scale",()=>{
  const width=300,height=470,angle=-7,scale=.83,r=Math.abs(angle)*Math.PI/180;
  const w=(width*Math.cos(r)+height*Math.sin(r))*scale,h=(width*Math.sin(r)+height*Math.cos(r))*scale;
  const g=collectionLandingGeometry({left:100,top:200,width:w,height:h},width,height,angle);
  assert.equal(g.width,width);assert.equal(g.height,height);assert.equal(g.angle,angle);
  assert.ok(Math.abs(g.scale-scale)<1e-10);assert.equal(g.x,100+w/2);assert.equal(g.y,200+h/2);
  assert.ok(!source.includes("brightness(1.65)"));assert.ok(!source.includes("blur(2px)"));
});

test("click-frame preparation creates one simple paper and reuses it for uniform flight",()=>{
  const f=fixture(),input={x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"};
  input.flight=createCollectionFlight(input);
  assert.equal(f.ghosts.length,1);
  assert.equal(f.ghosts[0].children.length,1);
  assert.equal(f.ghosts[0].children[0].src,input.src);
  assert.equal(f.ghosts[0].style.padding,"8px 8px 28px");
  assert.equal(f.ghosts[0].children[0].style.objectFit,"contain");
  assert.equal(f.ghosts[0].style.background,"var(--star-paper)");
  assert.equal(f.ghosts[0].style.boxShadow,"var(--star-shadow)");
  assert.equal(f.running[0].options.duration,300,"click-frame lift retains its original duration");
  f.cards[0].querySelector("img").parentElement={offsetLeft:14,offsetTop:12,offsetWidth:212,offsetHeight:284};
  f.ghosts[0].getBoundingClientRect=()=>({left:5,top:10,width:120,height:70});
  const cleanup=playCollectionEntrance(f.world,input,{pin:".pin",tape:".tape",lines:".lines"});
  assert.equal(f.ghosts.length,1);
  const flight=ghostFlight(f);
  assert.ok(flight.frames.every(frame=>/scale\([^,)]+\)/.test(frame.transform)));
  assert.match(flight.frames[0].transform,/scale\(0\.5\)/);
  assert.equal(f.ghosts[0].style.padding,"12px 14px 54px 14px");
  assert.equal(f.running[0].cancelled,true);
  assert.doesNotMatch(source,/cloneNode|getComputedStyle/);
  cleanup();assert.equal(f.ghosts[0].removed,true);
});

test("visible pin-in order uses top then left and never animates offscreen papers",()=>{
  const f=fixture();
  const box=(left,top)=>({left,top,right:left+100,bottom:top+100,width:100,height:100});
  f.cards[0].getBoundingClientRect=()=>box(300,200);
  f.cards[1].getBoundingClientRect=()=>box(100,200);
  f.cards[2].getBoundingClientRect=()=>box(100,1200);
  const cleanup=playCollectionEntrance(f.world,undefined,{pin:".pin",tape:".tape",lines:".lines"});
  const entrances=f.running.filter(a=>f.cards.includes(a.element));
  assert.deepEqual(entrances.map(a=>a.element.dataset.cardId),["photo-1","photo-0"]);
  assert.deepEqual(entrances.map(a=>a.options.delay),[0,60]);
  assert.ok(entrances.every(a=>a.frames[0].opacity===0&&a.options.fill==="backwards"&&a.options.duration===760));
  assert.ok(!f.running.some(a=>a.element===f.cards[2]||a.element===f.cards[2].querySelector("img")));
  cleanup();
});

test("home exit skips selected cover and cleanup restores visibility and resolves",async()=>{
  const f=fixture();
  f.cards.forEach((card,index)=>{card.dataset.motionCover=String(index);card.style.visibility="";});
  const home={querySelectorAll:selector=>selector==="[data-motion-cover]"?f.cards:[]};
  const exit=playHomeExit(home,"1");
  assert.equal(f.cards[1].style.visibility,"hidden");
  assert.equal(f.running.length,2);
  assert.ok(!f.running.some(a=>a.element===f.cards[1]));
  exit.cleanup();await exit.finished;
  assert.equal(f.cards[1].style.visibility,"");assert.ok(f.running.every(a=>a.cancelled));assert.equal(f.listeners.size,0);
});

test("long titles and many covers retain the original bounded exit and resolve naturally",{timeout:1000},async()=>{
  const f=fixture();
  const titles=Array.from({length:80},()=>f.node("title"));
  const parts=Array.from({length:30},()=>f.node("copy"));
  const covers=Array.from({length:24},(_,index)=>{const card=f.node("cover");card.dataset.motionCover=String(index);card.style.visibility="visible";return card;});
  const home={querySelectorAll:selector=>selector==="[data-motion-cover]"?covers:selector==="[data-title-character]"?titles:parts};
  const exit=playHomeExit(home,"7");
  assert.equal(covers[7].style.visibility,"hidden");
  assert.equal(f.running.length,titles.length+parts.length+covers.length-1);
  assert.ok(!f.running.some(a=>a.element===covers[7]));
  assert.ok(f.running.every(a=>Number.isFinite(endsAt(a))&&endsAt(a)<=1000),"content length must not extend the original exit budget");
  assert.equal(f.running.find(a=>a.element===titles[0]).options.duration,520);
  assert.equal(f.running.find(a=>a.element===parts[0]).options.duration,380);
  assert.equal(f.running.find(a=>a.element===covers[0]).options.duration,460);
  f.running.forEach(a=>a.finish());
  await exit.finished;
  exit.cleanup();exit.cleanup();
  assert.equal(covers[7].style.visibility,"visible");
  assert.ok(f.running.every(a=>a.cancelled));assert.equal(f.listeners.size,0);
});

test("all visible card and decoration timelines retain the original sequence",async()=>{
  for(const flight of [false,true]){
    const f=fixture(false,{cardCount:16,lineCount:20});
    const input=flight?{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"}:undefined;
    const cleanup=playCollectionEntrance(f.world,input,{pin:".pin",tape:".tape",lines:".lines"});
    const count=f.cards.length-(flight?1:0);
    const cards=f.running.filter(a=>f.cards.includes(a.element));
    const decorations=f.cards.flatMap(card=>card.querySelectorAll(".pin,.tape"));
    const pins=f.running.filter(a=>decorations.includes(a.element));
    const lines=f.running.filter(a=>f.lines.includes(a.element));
    assert.equal(cards.length,count);assert.equal(developing(f).length,count);
    assert.equal(pins.length,count*2);assert.equal(lines.length,f.lines.length);
    const lastDelay=collectionEntranceTiming(count-1,flight,false).delay;
    assert.ok(cards.every(a=>endsAt(a)<=lastDelay+(flight?900:760)));
    assert.ok(developing(f).every(a=>endsAt(a)<=lastDelay+(flight?120:180)+1200&&a.frames.at(-1).filter==="none"));
    assert.ok(pins.every(a=>endsAt(a)<=lastDelay+460+560));assert.ok(lines.every(a=>endsAt(a)<=(flight?980:0)+360+(f.lines.length-1)*60+560));
    assert.equal(f.world.style.visibility,"visible","scene exposure must not await all decorative animations");
    if(flight){
      const arrival=ghostFlight(f);arrival.finish();await Promise.resolve();
      assert.equal(f.cards[0].style.visibility,"");
      const landingPin=f.running.find(a=>a.element===f.cards[0].querySelectorAll(".pin")[0]);
      assert.ok(landingPin);assert.equal(endsAt(arrival)+endsAt(landingPin),1540);
    }
    cleanup();assert.ok(f.running.every(a=>a.cancelled));assert.equal(f.listeners.size,0);
  }
});

test("flight hides landing paper until arrival, restores synchronously, then pops pin and fades ghost",async()=>{
  const f=fixture(),card=f.cards[0];card.style.visibility="visible";
  const cleanup=playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"});
  assert.equal(f.world.style.visibility,"visible");assert.equal(card.style.visibility,"hidden");
  assert.ok(!f.running.some(a=>a.element===card||a.element===card.querySelector("img")||a.element===card.querySelectorAll(".pin")[0]));
  ghostFlight(f).finish();
  await Promise.resolve();
  assert.equal(card.style.visibility,"visible");
  assert.ok(f.running.some(a=>a.element===card.querySelectorAll(".pin")[0]&&a.options.duration===560));
  assert.ok(!f.running.some(a=>a.element===card||a.element===card.querySelector("img")));
  const fade=f.running.find(a=>a.element===f.ghosts[0]&&a.frames[0].opacity===1&&a.frames.at(-1).opacity===0);
  assert.ok(fade);assert.equal(fade.options.duration,180);assert.notEqual(f.ghosts[0].removed,true);
  fade.finish();await Promise.resolve();assert.equal(f.ghosts[0].removed,true);
  cleanup();assert.equal(card.style.visibility,"visible");
});

test("navigation cancellation and midflight reduced motion restore original landing visibility",async()=>{
  for(const cancel of ["navigation","reduced"]){
    const f=fixture(),card=f.cards[0];card.style.visibility="";
    const cleanup=playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"});
    const flight=ghostFlight(f);assert.equal(card.style.visibility,"hidden");
    if(cancel==="navigation")cleanup();else{f.media.matches=true;for(const listener of [...f.listeners])listener();}
    assert.equal(card.style.visibility,"");assert.equal(f.ghosts[0].removed,true);
    const count=f.running.length;flight.finish();await Promise.resolve();assert.equal(f.running.length,count,"cancelled arrival must not create new pin/fade animations");
    cleanup();
  }
});

test("invalid flight and initially reduced motion never hide the destination",()=>{
  for(const reduced of [false,true]){
    const f=fixture(reduced);f.cards[0].style.visibility="visible";
    const cleanup=playCollectionEntrance(f.world,{x:0,y:-200,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"});
    assert.equal(f.cards[0].style.visibility,"visible");assert.equal(f.ghosts.length,0);cleanup();
  }
});

test("entrance batches geometry reads before starting any paper animation",()=>{
  for(const flight of [false,true]){
    const f=fixture(false,{cardCount:12}),events=[];
    const input=flight?{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"}:undefined;
    if(input)input.flight=createCollectionFlight(input);
    const watch=node=>{
      const bounds=node.getBoundingClientRect.bind(node),animate=node.animate.bind(node);
      node.getBoundingClientRect=()=>{events.push("read");return bounds();};
      for(const property of ["offsetWidth","offsetHeight"]){const value=node[property];Object.defineProperty(node,property,{get(){events.push("read");return value;}});}
      node.style=new Proxy(node.style,{set(target,key,value){events.push("write");target[key]=value;return true;}});
      node.animate=(...args)=>{events.push("write");return animate(...args);};
    };
    f.cards.forEach(watch);if(input)watch(input.flight.element);
    const cleanup=playCollectionEntrance(f.world,input,{pin:".pin",tape:".tape",lines:".lines"});
    const firstWrite=events.indexOf("write");
    assert.ok(firstWrite>0);
    assert.ok(!events.slice(firstWrite).includes("read"),"geometry reads after animation writes can force synchronous layout");
    cleanup();
  }
});

async function withBackgroundClock(run){
  const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  let now=0,id=0;const pending=new Map();
  globalThis.setTimeout=(callback,delay)=>{pending.set(++id,{callback,at:now+delay});return id;};
  globalThis.clearTimeout=key=>pending.delete(key);
  const clock={pending,advance(ms){now+=ms;for(const [key,task] of [...pending])if(task.at<=now){pending.delete(key);task.callback();}}};
  try{await run(clock);}finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
}

test("backgrounds share the cover's actual landing rather than each paper's stagger",()=>withBackgroundClock(async clock=>{
  const f=fixture();
  const cleanup=playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"});
  try{
    assert.equal(f.world.dataset.collectionBackground,"pending");
    f.running.find(a=>a.element===f.cards[1]).finish();await Promise.resolve();
    assert.equal(f.world.dataset.collectionBackground,"pending","support arrival must not start a separate background");
    ghostFlight(f).finish();await Promise.resolve();
    assert.equal(f.world.dataset.collectionBackground,"revealing");assert.equal(clock.pending.size,1);
    clock.advance(200);f.running.find(a=>a.element===f.cards[2]).finish();await Promise.resolve();
    clock.advance(299);assert.equal(f.world.dataset.collectionBackground,"revealing");
    clock.advance(1);assert.equal(f.world.dataset.collectionBackground,"ready");assert.equal(clock.pending.size,0);
  }finally{cleanup();}
}));

test("direct entry uses the first visible paper and empty entry never waits for a landing",()=>withBackgroundClock(async clock=>{
  const f=fixture();const cleanup=playCollectionEntrance(f.world,undefined,{pin:".pin",tape:".tape",lines:".lines"});
  try{
    f.running.find(a=>a.element===f.cards[2]).finish();await Promise.resolve();
    assert.equal(f.world.dataset.collectionBackground,"pending");
    f.running.find(a=>a.element===f.cards[0]).finish();await Promise.resolve();
    assert.equal(f.world.dataset.collectionBackground,"revealing");clock.advance(500);
    assert.equal(f.world.dataset.collectionBackground,"ready");
  }finally{cleanup();}
  const empty=fixture(false,{cardCount:0});
  const stop=playCollectionEntrance(empty.world,undefined,{pin:".pin",tape:".tape",lines:".lines"});
  assert.notEqual(empty.world.dataset.collectionBackground,"pending");assert.equal(clock.pending.size,0);stop();
}));

test("cancel and reduced motion settle backgrounds and ignore late landing completion",()=>withBackgroundClock(async clock=>{
  for(const phase of ["pending","revealing"])for(const reason of ["navigation","reduced"]){
    const f=fixture();const cleanup=playCollectionEntrance(f.world,{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"},{pin:".pin",tape:".tape",lines:".lines"});
    const arrival=ghostFlight(f);
    if(phase==="revealing"){arrival.finish();await Promise.resolve();}
    if(reason==="navigation")cleanup();else{f.media.matches=true;for(const change of [...f.listeners])change();}
    assert.equal(f.world.dataset.collectionBackground,"cancelled");assert.equal(clock.pending.size,0);
    arrival.finish();await Promise.resolve();clock.advance(5000);
    assert.equal(f.world.dataset.collectionBackground,"cancelled");cleanup();
  }
}));

test("a background clock cannot restart on later images or overwrite a newer scene owner",()=>withBackgroundClock(async clock=>{
  const world=fixture().world,old=prepareCollectionBackground(world);
  old.reveal();clock.advance(200);old.reveal();clock.advance(300);
  assert.equal(world.dataset.collectionBackground,"ready","repeated readiness must not restart the shared fade");
  const next=prepareCollectionBackground(world);old.cancel();old.reveal();clock.advance(1000);
  assert.equal(world.dataset.collectionBackground,"pending");
  next.reveal();clock.advance(500);assert.equal(world.dataset.collectionBackground,"ready");
  next.reveal();assert.equal(clock.pending.size,0);next.cancel();
}));

test("star backdrops never lose their static blur to per-paper filter animations",async()=>{
  for(const flight of [false,true]){
    const f=fixture(false,{backdrops:true});
    const input=flight?{x:5,y:10,width:100,height:140,src:"/anonymous.svg",assetId:"photo-0"}:undefined;
    const cleanup=playCollectionEntrance(f.world,input,{pin:".pin",tape:".tape",lines:".lines"});
    try{
      assert.equal(developing(f).length,0,"neither background thumbnails nor foreground photos should acquire a new filter cycle");
      assert.equal(f.running.filter(a=>f.cards.includes(a.element)).length,flight?2:3,"paper motion and its original stagger remain");
      if(flight)assert.equal(ghostFlight(f).options.duration,980);
    }finally{cleanup();}
  }
});
