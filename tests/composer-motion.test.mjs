import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const text=await fs.readFile(new URL("../app/templates/polaroid-field/composer-motion.ts",import.meta.url),"utf8");
const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {zoomComposerAt,interpolateComposer,composerReleaseVelocity,composerInertiaStep,composerZoomLimit,composerWheelKind,constrainComposer,composerSpringStep,composerFlip}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));

test("wheel/button zoom keeps the chosen world point under its screen anchor",()=>{
  const from={x:-120,y:36,scale:.7},point={x:456,y:234};
  for(const scale of [.05,.7,1.2,2.4]){
    const to=zoomComposerAt(from,point.x,point.y,scale);
    assert.ok(Math.abs((point.x-to.x)/to.scale-(point.x-from.x)/from.scale)<1e-9);
    assert.ok(Math.abs((point.y-to.y)/to.scale-(point.y-from.y)/from.scale)<1e-9);
    // Wheel easing linearly mixes all three coordinates with the same weight.
    const k=.31,middle={x:from.x+(to.x-from.x)*k,y:from.y+(to.y-from.y)*k,scale:from.scale+(to.scale-from.scale)*k};
    assert.ok(Math.abs((point.x-middle.x)/middle.scale-(point.x-from.x)/from.scale)<1e-9);
  }
});
test("destination easing is bounded, monotone and lands exactly",()=>{
  const from={x:0,y:-100,scale:.2},to={x:500,y:300,scale:1.3};
  assert.deepEqual(interpolateComposer(from,to,0),from);
  assert.deepEqual(interpolateComposer(from,to,1),to);
  assert.deepEqual(interpolateComposer(from,to,5),to);
  let previous=from;
  for(let i=1;i<=20;i++){
    const next=interpolateComposer(from,to,i/20);
    assert.ok(next.x>=previous.x && next.x<=to.x && next.y>=previous.y && next.scale>=previous.scale && next.scale<=to.scale);
    previous=next;
  }
});
test("release velocity ignores stale gestures and caps fast flings",()=>{
  assert.deepEqual(composerReleaseVelocity([],100),{x:0,y:0});
  const samples=[{x:0,y:0,t:0},{x:8,y:-4,t:16},{x:16,y:-8,t:32}];
  assert.deepEqual(composerReleaseVelocity(samples,32),{x:.5,y:-.25});
  assert.deepEqual(composerReleaseVelocity(samples,133),{x:0,y:0});
  const fast=composerReleaseVelocity([{x:0,y:0,t:0},{x:1000,y:-1000,t:10}],10);
  assert.ok(Math.abs(Math.hypot(fast.x,fast.y)-3)<1e-9,"vector speed, not each axis, is capped at 3px/ms");
  assert.deepEqual(composerReleaseVelocity([{x:0,y:0,t:0},{x:42,y:0,t:85}],85),{x:42/85,y:0},"90ms sample remains usable");
});
test("all zoom inputs share FIT-relative floor and trackpad gestures are classified",()=>{
  for(const fit of [.02,.4,.99]){
    assert.equal(composerZoomLimit(.00001,fit),fit*.8);
    assert.equal(composerZoomLimit(99,fit),2.4);
    assert.equal(composerZoomLimit(fit,fit),fit);
  }
  assert.equal(composerWheelKind(1,4,0,false),"pan");
  assert.equal(composerWheelKind(0,4.2,0,false),"pan");
  assert.equal(composerWheelKind(0,120,0,false),"zoom");
  assert.equal(composerWheelKind(1,4.2,0,true),"zoom");
  assert.equal(composerWheelKind(0,3,1,false),"zoom");
});
test("soft bounds retain both axes, apply .35 resistance and settle with 120ms spring",()=>{
  const box={left:0,right:2000,top:0,bottom:1500},view={x:-5000,y:4000,scale:1};
  const target=constrainComposer(view,box,1000,800);
  assert.deepEqual(target,{x:-1700,y:560,scale:1});
  const rubber=constrainComposer(view,box,1000,800,true);
  assert.equal(rubber.x,target.x+(view.x-target.x)*.35);
  assert.equal(rubber.y,target.y+(view.y-target.y)*.35);
  let settled=rubber;
  for(let i=0;i<88;i++)settled=composerSpringStep(settled,target,16);
  assert.ok(Math.abs(settled.x-target.x)<.1 && Math.abs(settled.y-target.y)<.1);
  const one=composerSpringStep(rubber,target,16);
  assert.ok(Math.abs((one.x-target.x)/(rubber.x-target.x)-Math.exp(-16/120))<1e-9);
  const small=constrainComposer({x:9999,y:-9999,scale:.2},{left:0,right:100,top:0,bottom:100},1000,800);
  assert.ok(small.x<1000 && small.y+20>0,"tiny content still has a valid visible interval");
});
test("FLIP preserves old screen pose and uses bounded stagger with theme-specific curve",()=>{
  const old={x:80,y:90,width:150,angle:-3},next={x:300,y:240,width:300,angle:5};
  const flip=composerFlip(old,next,.5,2,false);
  assert.deepEqual(flip.keyframes[0],{translate:"-440px -300px",rotate:"-8deg",scale:"0.5"});
  assert.equal(flip.options.duration,950);assert.equal(flip.options.delay,28);
  assert.equal(composerFlip(old,next,.5,200,true).options.delay,260);
  assert.notEqual(flip.options.easing,composerFlip(old,next,.5,2,true).options.easing);
  assert.deepEqual(flip.keyframes[1],{translate:"0 0",rotate:"0deg",scale:"1"});
});
test("inertia decay is frame-rate independent, finite and retains scale",()=>{
  const simulate=dt=>{let state={view:{x:0,y:0,scale:.8},velocity:{x:1,y:-.3}};for(let t=0;t<960;t+=dt)state=composerInertiaStep(state.view,state.velocity,dt);return state;};
  const a=simulate(16),b=simulate(8);
  assert.ok(Math.abs(a.view.x-b.view.x)<1e-9 && Math.abs(a.view.y-b.view.y)<1e-9);
  assert.equal(a.view.scale,.8);
  assert.ok(a.view.x<330 && a.velocity.x<.06);
  const paused=composerInertiaStep(a.view,a.velocity,10000);
  assert.ok(paused.view.x-a.view.x<3,"background pause is clamped, not a giant jump");
});
