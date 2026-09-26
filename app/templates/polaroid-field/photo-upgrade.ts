import type { PhotoAsset } from "../../photo-library";
import { entryPhotoSource, prepareEntryPhoto, invalidateEntryPhoto } from "./entry-photos";

export type PhotoUpgrade = { base: string; src: string; tier: number; previous?:PhotoUpgrade };

/** Finite, coalesced checks: protection expiry is a deadline, not a polling loop. */
export function schedulePhotoChecks(check:()=>void, allowed:()=>boolean, protectedUntil:number) {
  let timer:ReturnType<typeof setTimeout>|undefined, disposed=false;
  const request=()=>{
    if(disposed)return;
    clearTimeout(timer);
    timer=setTimeout(()=>{timer=undefined;if(!disposed && allowed())check();},Math.max(180,protectedUntil-performance.now()));
  };
  return {request,dispose(){disposed=true;clearTimeout(timer);}};
}

export function photoUpgradeTarget(asset:PhotoAsset,required:number,current:number) {
  const available=Math.max(asset.variants.card.width,asset.variants.full.width);
  const needed=Math.min(required,available);
  if(!Number.isFinite(needed)||needed<=current)return null;
  const tier=needed>1100?2200:needed>600?1100:600;
  const actual=Math.min(tier,available);
  return actual>current ? {src:entryPhotoSource(asset,tier),tier:actual} : null;
}

/** Owned by one mounted scene. Requests decode before React exposes a new src. */
export function observePhotoUpgrades(world:HTMLElement,assets:ReadonlyMap<string,PhotoAsset>,options:{
  allowed:()=>boolean; protectedUntil:number; update:(id:string,value:PhotoUpgrade)=>void;
}) {
  let disposed=false;
  const attempts=new Map<string,number>(),pending=new Set<string>(),completed=new Map<string,number>();
  const retries=new Set<ReturnType<typeof setTimeout>>();
  const check=()=>{
    if(document.hidden || !world.isConnected)return;
    world.querySelectorAll<HTMLImageElement>("img[data-photo-id]").forEach(image=>{
      const id=image.dataset.photoId!,asset=assets.get(id);if(!asset)return;
      const box=image.getBoundingClientRect();
      if(box.width<=0||box.height<=0||box.right<=0||box.left>=innerWidth||box.bottom<=0||box.top>=innerHeight)return;
      const current=Math.max(Number(image.dataset.photoTier||Math.min(600,asset.variants.card.width)),completed.get(id)||0);
      const target=photoUpgradeTarget(asset,box.width*Math.min(2,devicePixelRatio||1),current);
      if(!target || pending.has(target.src) || (attempts.get(target.src)||0)>=2)return;
      pending.add(target.src);attempts.set(target.src,(attempts.get(target.src)||0)+1);
      void prepareEntryPhoto(target.src).then(loaded=>{
        pending.delete(target.src);
        if(disposed || !world.contains(image))return;
        if(loaded){
          if(target.tier<=Math.max(Number(image.dataset.photoTier||0),completed.get(id)||0))return;
          completed.set(id,target.tier);
          options.update(id,{base:entryPhotoSource(asset),...target});
        }else if((attempts.get(target.src)||0)<2){
          const retry=setTimeout(()=>{retries.delete(retry);scheduler.request();},1000);retries.add(retry);
        }
      });
    });
  };
  const scheduler=schedulePhotoChecks(check,options.allowed,options.protectedUntil);
  const displayFailed=(event:Event)=>{
    const {id,src}= (event as CustomEvent<{id:string;src:string}>).detail;
    completed.delete(id);invalidateEntryPhoto(src);
    if((attempts.get(src)||0)<2){const retry=setTimeout(()=>{retries.delete(retry);scheduler.request();},1000);retries.add(retry);}
  };
  const resize=new ResizeObserver(scheduler.request),visible=new IntersectionObserver(scheduler.request);
  world.querySelectorAll<HTMLImageElement>("img[data-photo-id]").forEach(image=>{resize.observe(image);visible.observe(image);});
  world.addEventListener("composer:scale",scheduler.request);
  world.addEventListener("composer:ready",scheduler.request);
  world.addEventListener("composer:photo-error",displayFailed);
  document.addEventListener("visibilitychange",scheduler.request);
  // Capture includes native mobile scrolling in either the page or a scene scroller.
  window.addEventListener("scroll",scheduler.request,true);
  scheduler.request();
  return ()=>{disposed=true;scheduler.dispose();retries.forEach(clearTimeout);resize.disconnect();visible.disconnect();
    world.removeEventListener("composer:scale",scheduler.request);world.removeEventListener("composer:ready",scheduler.request);
    world.removeEventListener("composer:photo-error",displayFailed);
    document.removeEventListener("visibilitychange",scheduler.request);window.removeEventListener("scroll",scheduler.request,true);};
}
