import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source=await fs.readFile(new URL("../app/templates/polaroid-field/motion-diagnostic.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createMotionActivity,motionPromotionDisabled}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function fixture(){
  const names=["window","location","sessionStorage","setTimeout","clearTimeout"];
  const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const env={NODE_ENV:process.env.NODE_ENV,NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW:process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW};
  let now=0,id=0,value=null;
  const timers=new Map();
  const location={hostname:"localhost",pathname:"/preview"};
  const globals={window:{},location,sessionStorage:{getItem:()=>value},setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:key=>timers.delete(key)};
  for(const [key,item] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:item});
  process.env.NODE_ENV="development";delete process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW;
  return {location,timers,setValue:next=>{value=next;},advance(ms){
    const end=now+ms;
    for(;;){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>end)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=end;
  },restore(){for(const [key,item] of original){if(item)Object.defineProperty(globalThis,key,item);else delete globalThis[key];}for(const [key,item]of Object.entries(env)){if(item===undefined)delete process.env[key];else process.env[key]=item;}}};
}

test("camera promotion restores its previous value exactly 150ms after stopping",()=>{
  const f=fixture();try{const world={style:{willChange:"opacity"}},activity=createMotionActivity(world);
    activity.activity(true);assert.equal(world.style.willChange,"transform");
    activity.activity(false);f.advance(149);assert.equal(world.style.willChange,"transform");
    f.advance(1);assert.equal(world.style.willChange,"opacity");assert.equal(f.timers.size,0);activity.dispose();
  }finally{f.restore();}
});

test("resumed motion cancels idle cleanup and dispose permanently restores prior style",()=>{
  const f=fixture();try{const world={style:{willChange:""}},activity=createMotionActivity(world);
    activity.activity(true);activity.activity(false);f.advance(100);activity.activity(true);f.advance(100);
    assert.equal(world.style.willChange,"transform");assert.equal(f.timers.size,0);
    activity.activity(false);activity.dispose();assert.equal(world.style.willChange,"");assert.equal(f.timers.size,0);
    activity.activity(true);activity.activity(false);f.advance(1000);assert.equal(world.style.willChange,"");assert.equal(f.timers.size,0);
  }finally{f.restore();}
});

test("A/B off control is restricted to local preview environments and fail-open on unavailable storage",()=>{
  const f=fixture();try{f.setValue("off");
    for(const hostname of ["localhost","127.0.0.1","[::1]"]){f.location.hostname=hostname;assert.equal(motionPromotionDisabled(),true);}
    const world={style:{willChange:"opacity"}},activity=createMotionActivity(world);activity.activity(true);activity.activity(false);
    assert.equal(world.style.willChange,"opacity");assert.equal(f.timers.size,0);activity.dispose();
    f.location.hostname="portfolio.example";assert.equal(motionPromotionDisabled(),false);
    f.location.hostname="localhost";f.location.pathname="/";assert.equal(motionPromotionDisabled(),false);
    f.location.pathname="/preview";process.env.NODE_ENV="production";assert.equal(motionPromotionDisabled(),false);
    process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW="1";assert.equal(motionPromotionDisabled(),true);
    f.setValue("will-change");assert.equal(motionPromotionDisabled(),false);
    globalThis.sessionStorage={getItem(){throw new Error("unavailable");}};assert.equal(motionPromotionDisabled(),false);
    delete globalThis.window;assert.equal(motionPromotionDisabled(),false);
  }finally{f.restore();}
});
