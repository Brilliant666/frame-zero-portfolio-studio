import type { ComposerView, ComposerBounds } from "./composer-view";

export type MotionSample = {x:number;y:number;t:number};
/** Soft limits use actual rotated paper, not FIT's extra shadow allowance. */
export function composerPaperBounds(cards:readonly {x:number;y:number;w:number;h:number;rot:number}[]):ComposerBounds {
  if(!cards.length)return {left:0,top:0,right:1,bottom:1};
  const boxes=cards.map(card=>{
    const angle=card.rot*Math.PI/180,w=Math.abs(card.w*Math.cos(angle))+Math.abs(card.h*Math.sin(angle)),h=Math.abs(card.w*Math.sin(angle))+Math.abs(card.h*Math.cos(angle));
    return {left:card.x-w/2,right:card.x+w/2,top:card.y-h/2,bottom:card.y+h/2};
  });
  return {left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))};
}
export type ComposerScreenCard={x:number;y:number;width:number;angle:number};
export function composerFlip(from:ComposerScreenCard,to:ComposerScreenCard,worldScale:number,index:number,night:boolean){
  return {keyframes:[{translate:`${(from.x-to.x)/worldScale}px ${(from.y-to.y)/worldScale}px`,rotate:`${from.angle-to.angle}deg`,scale:String(from.width/to.width)},{translate:"0 0",rotate:"0deg",scale:"1"}],
    options:{duration:950,delay:Math.min(260,index*14),easing:night?"cubic-bezier(.22,1,.36,1)":"cubic-bezier(.3,1.25,.5,1)",fill:"backwards" as const}};
}
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
  const first=samples.find(sample=>sample.t>=last.t-90);
  if(!first || last.t-first.t<8)return {x:0,y:0};
  const dt=last.t-first.t,x=(last.x-first.x)/dt,y=(last.y-first.y)/dt,k=Math.min(1,3/Math.hypot(x,y));
  return {x:x*k,y:y*k};
}
export function composerZoomLimit(scale:number,fitScale:number){return Math.max(fitScale*.8,Math.min(2.4,scale));}
export function composerWheelKind(event:{ctrlKey:boolean;shiftKey:boolean}):"pan"|"zoom" {
  // Explicit gesture semantics: never infer a device from fractional deltas.
  return event.shiftKey && !event.ctrlKey ? "pan" : "zoom";
}
/** delta is already normalized to pixels, including Firefox line/page units. */
export function composerWheelZoomFactor(delta:number){
  return Math.exp(-delta*(Math.abs(delta)<50?.01:.0016));
}
export function composerZoomShortcut(event:{key:string;code:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean}) {
  if(!(event.ctrlKey||event.metaKey)||event.altKey)return null;
  if(event.key==="+"||event.key==="="||event.code==="NumpadAdd")return "in";
  if(event.key==="-"||event.code==="NumpadSubtract")return "out";
  if(event.key==="0"||event.code==="Numpad0")return "fit";
  return null;
}
export function constrainComposer(view:ComposerView,box:ComposerBounds,width:number,height:number,rubber=false):ComposerView {
  const kx=Math.min(width*.3,(box.right-box.left)*view.scale*.3),ky=Math.min(height*.3,(box.bottom-box.top)*view.scale*.3);
  const axis=(value:number,min:number,max:number)=>value<min?min+(value-min)*(rubber?.35:0):value>max?max+(value-max)*(rubber?.35:0):value;
  return {...view,x:axis(view.x,kx-box.right*view.scale,width-kx-box.left*view.scale),y:axis(view.y,ky-box.bottom*view.scale,height-ky-box.top*view.scale)};
}
export function composerSpringStep(view:ComposerView,target:ComposerView,elapsed:number):ComposerView {
  const k=1-Math.exp(-Math.max(0,Math.min(48,elapsed))/120);
  return {...view,x:view.x+(target.x-view.x)*k,y:view.y+(target.y-view.y)*k};
}
/** Integrate exponential friction analytically so 60/120 Hz travel agrees. */
export function composerInertiaStep(view:ComposerView,velocity:{x:number;y:number},elapsed:number) {
  const dt=Math.max(0,Math.min(48,elapsed)),decay=Math.exp(-dt/330),travel=330*(1-decay);
  return {view:{...view,x:view.x+velocity.x*travel,y:view.y+velocity.y*travel},velocity:{x:velocity.x*decay,y:velocity.y*decay}};
}
