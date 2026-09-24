import type { ComposerView } from "./composer-view";

export type MotionSample = {x:number;y:number;t:number};
export function zoomComposerAt(view:ComposerView,x:number,y:number,scale:number):ComposerView {
  const k=scale/view.scale;
  return {x:x-(x-view.x)*k,y:y-(y-view.y)*k,scale};
}
/** Prototype quartic ease, with logarithmic scale for camera destination moves. */
export function interpolateComposer(from:ComposerView,to:ComposerView,progress:number):ComposerView {
  const p=Math.max(0,Math.min(1,progress)),e=p<.5?8*p**4:1-(-2*p+2)**4/2;
  if(p===1)return {...to};
  return {x:from.x+(to.x-from.x)*e,y:from.y+(to.y-from.y)*e,scale:Math.exp(Math.log(from.scale)+(Math.log(to.scale)-Math.log(from.scale))*e)};
}
export function composerReleaseVelocity(samples:readonly MotionSample[],now:number) {
  const last=samples.at(-1);
  if(!last || now-last.t>100)return {x:0,y:0};
  const first=samples.find(sample=>sample.t>=last.t-80);
  if(!first || last.t-first.t<8)return {x:0,y:0};
  const dt=last.t-first.t,limit=2;
  return {x:Math.max(-limit,Math.min(limit,(last.x-first.x)/dt)),y:Math.max(-limit,Math.min(limit,(last.y-first.y)/dt))};
}
/** Integrate exponential friction analytically so 60/120 Hz travel agrees. */
export function composerInertiaStep(view:ComposerView,velocity:{x:number;y:number},elapsed:number) {
  const dt=Math.max(0,Math.min(48,elapsed)),decay=Math.exp(-dt/330),travel=330*(1-decay);
  return {view:{...view,x:view.x+velocity.x*travel,y:view.y+velocity.y*travel},velocity:{x:velocity.x*decay,y:velocity.y*decay}};
}
