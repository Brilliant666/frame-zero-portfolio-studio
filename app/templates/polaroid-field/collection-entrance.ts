export type CollectionFlight = { element: HTMLElement; stopPreparation: () => void; cleanup: () => void };
export type CollectionEntranceSource = {
  x: number; y: number; width: number; height: number; src: string; assetId: string;
  flight?: CollectionFlight; ready?: Promise<unknown>; startedAt?: number; paperColor?: string; cancelled?: boolean; accepted?: boolean;
};

export function collectionLandingGeometry(box: {left:number;top:number;width:number;height:number}, width:number, height:number, angle:number) {
  const radians=angle*Math.PI/180, c=Math.abs(Math.cos(radians)), s=Math.abs(Math.sin(radians));
  const scale=(box.width/(width*c+height*s)+box.height/(width*s+height*c))/2;
  return {x:box.left+box.width/2,y:box.top+box.height/2,width,height,angle,scale};
}

const intersectsViewport = (box: {left:number;top:number;width:number;height:number}) => box.width > 0 && box.height > 0 && box.left < innerWidth && box.top < innerHeight && box.left + box.width > 0 && box.top + box.height > 0;

/** Called in the click frame: only a paper rectangle and the already loaded cover URL. */
export function createCollectionFlight(source: CollectionEntranceSource): CollectionFlight | undefined {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  if (media.matches || !source.src || !intersectsViewport({left:source.x,top:source.y,width:source.width,height:source.height})) return;
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true"); element.dataset.collectionFlight = "true"; element.dataset.collectionFlightAsset = source.assetId;
  Object.assign(element.style, { position:"fixed", left:`${source.x}px`, top:`${source.y}px`, width:`${source.width}px`, height:`${source.height}px`, padding:"8px 8px 28px", boxSizing:"border-box", background:source.paperColor || "var(--star-paper)", boxShadow:"var(--star-shadow)", pointerEvents:"none", zIndex:"40", transformOrigin:"center" });
  const image=document.createElement("img"); image.src=source.src; image.alt="";
  Object.assign(image.style,{display:"block",width:"100%",height:"100%",objectFit:"contain"}); element.append(image); document.body.append(element);
  let preparation: Animation | undefined = element.animate([{transform:"translateY(0) scale(1)"},{transform:"translateY(-6px) scale(1.015)"}],{duration:300,easing:"ease-out",fill:"forwards"});
  void preparation.finished.catch(()=>{});
  let removed=false;
  const stopPreparation=()=>{preparation?.cancel();preparation=undefined;};
  const cleanup=()=>{if(removed)return;removed=true;stopPreparation();element.remove();media.removeEventListener("change",changed);};
  const changed=()=>{if(media.matches)cleanup();};
  media.addEventListener("change",changed);
  return {element,stopPreparation,cleanup};
}

/** Exit is independent of scene mounting. Cancellation restores hidden homepage nodes. */
export function playHomeExit(home: HTMLElement, selectedCoverId?: string | null) {
  const media=matchMedia("(prefers-reduced-motion: reduce)");
  const animations: Animation[]=[];
  const covers=[...home.querySelectorAll<HTMLElement>("[data-motion-cover]")];
  const selected=covers.find(card=>card.dataset.motionCover===selectedCoverId);
  const previousVisibility=selected?.style.visibility ?? "";
  const track=(node:HTMLElement,frames:Keyframe[],options:KeyframeAnimationOptions)=>{
    const animation=node.animate(frames,{...options,fill:"forwards"});animations.push(animation);return animation;
  };
  let resolveFinished:()=>void=()=>{};
  const finished=new Promise<void>(resolve=>{resolveFinished=resolve;});
  const cleanup=()=>{animations.forEach(animation=>animation.cancel());if(selected)selected.style.visibility=previousVisibility;media.removeEventListener("change",changed);resolveFinished();};
  const changed=()=>{if(media.matches)cleanup();};
  if(media.matches){resolveFinished();return{finished,cleanup};}
  media.addEventListener("change",changed);
  if(selected)selected.style.visibility="hidden";
  home.querySelectorAll<HTMLElement>("[data-title-character]").forEach((character,index)=>track(character,[{transform:"translateY(0)",opacity:1},{transform:"translateY(-112%)",opacity:0}],{duration:520,delay:Math.min(index,8)*60,easing:"cubic-bezier(.65,0,.35,1)"}));
  home.querySelectorAll<HTMLElement>("[data-home-exit-part]").forEach((part,index)=>track(part,[{opacity:1,translate:"0 0"},{opacity:0,translate:"0 -14px"}],{duration:380,delay:Math.min(index,6)*40,easing:"cubic-bezier(.42,0,1,1)"}));
  covers.filter(card=>card!==selected).forEach((card,index)=>track(card,[{opacity:1,translate:"0 0",rotate:"0deg"},{opacity:0,translate:"0 70px",rotate:"8deg"}],{duration:460,delay:Math.min(index,6)*50,easing:"cubic-bezier(.65,0,.35,1)"}));
  void Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).then(resolveFinished);
  return {finished,cleanup};
}

export function collectionEntranceTiming(index: number, flight: boolean, night: boolean) {
  return { delay: (flight ? 980 : 0) + index * 60, duration: 760,
    easing: night ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.34,1.42,.64,1)" };
}

/** Only visible cards participate; offscreen papers are immediately ready for browsing. */
export function playCollectionEntrance(world: HTMLElement, source: CollectionEntranceSource | undefined,
  selectors: { pin: string; tape: string; lines: string }, _compact = false) {
  void _compact;
  const animations=new Set<Animation>(),media=matchMedia("(prefers-reduced-motion: reduce)");
  let session=source?.flight;
  const cleanup=()=>{animations.forEach(animation=>animation.cancel());animations.clear();session?.cleanup();session=undefined;world.style.visibility="visible";media.removeEventListener("change",onChange);};
  const onChange=()=>{if(media.matches)cleanup();};
  const track=(element:Element,frames:Keyframe[],options:KeyframeAnimationOptions)=>{
    const animation=element.animate(frames,{...options,fill:"backwards"});animations.add(animation);
    void animation.finished.then(()=>{animations.delete(animation);animation.cancel();}).catch(()=>animations.delete(animation));return animation;
  };
  if(media.matches){cleanup();return cleanup;}
  media.addEventListener("change",onChange);
  const cards=[...world.querySelectorAll<HTMLElement>("[data-card-id]")];
  const clip=world.closest<HTMLElement>("[data-composer]")?.getBoundingClientRect();
  const visible=(box:DOMRect)=>intersectsViewport(box)&&box.right>Math.max(0,clip?.left??0)&&box.bottom>Math.max(0,clip?.top??0)&&box.left<Math.min(innerWidth,clip?.right??innerWidth)&&box.top<Math.min(innerHeight,clip?.bottom??innerHeight);
  const fullyVisible=(box:DOMRect)=>visible(box)&&box.left>=Math.max(0,clip?.left??0)&&box.top>=Math.max(0,clip?.top??0)&&box.right<=Math.min(innerWidth,clip?.right??innerWidth)&&box.bottom<=Math.min(innerHeight,clip?.bottom??innerHeight);
  const landingCard=source?cards.find(card=>card.dataset.cardId===source.assetId):undefined;
  const target=landingCard?.getBoundingClientRect();
  const flight=!!(source?.src&&target&&intersectsViewport({left:source.x,top:source.y,width:source.width,height:source.height})&&fullyVisible(target));
  const night=world.closest("[data-star-theme]")?.getAttribute("data-star-theme")==="night";
  if(flight&&source&&landingCard&&target){
    session??=createCollectionFlight(source);
    if(session){
      const ghost=session.element,from=ghost.getBoundingClientRect();session.stopPreparation();
      const geometry=collectionLandingGeometry(target,landingCard.offsetWidth,landingCard.offsetHeight,Number(landingCard.dataset.rotation??0));
      Object.assign(ghost.style,{left:"0px",top:"0px",width:`${geometry.width}px`,height:`${geometry.height}px`});
      // Actual untransformed photo insets, not assumptions about dynamic frame sizes.
      const photo=landingCard.querySelector("img")?.parentElement;
      if(photo){
        const left=photo.offsetLeft,top=photo.offsetTop,width=photo.offsetWidth,height=photo.offsetHeight;
        ghost.style.padding=`${top}px ${Math.max(0,geometry.width-left-width)}px ${Math.max(0,geometry.height-top-height)}px ${left}px`;
      }
      const start=`translate(${from.left+from.width/2-geometry.width/2}px,${from.top+from.height/2-geometry.height/2}px) rotate(0deg) scale(${from.width/geometry.width})`;
      const landing=`translate(${geometry.x-geometry.width/2}px,${geometry.y-geometry.height/2}px) rotate(${geometry.angle}deg) scale(${geometry.scale})`;
      ghost.style.transform=landing;
      const animation=track(ghost,[{transform:start,opacity:1},{transform:landing,opacity:1}],{duration:980,easing:"cubic-bezier(.7,0,.2,1)"});
      void animation.finished.then(()=>{if(!session)return;const fade=track(ghost,[{opacity:1},{opacity:0}],{duration:180});void fade.finished.then(()=>{session?.cleanup();session=undefined;}).catch(()=>{});}).catch(()=>{});
    }
  }else{session?.cleanup();session=undefined;}
  const visibleCards=cards.map(card=>({card,box:card.getBoundingClientRect()})).filter(item=>visible(item.box)).sort((a,b)=>a.box.top-b.box.top||a.box.left-b.box.left);
  let order=0;
  visibleCards.forEach(({card})=>{
    if(flight&&card===landingCard)return;
    const timing=collectionEntranceTiming(order++,Boolean(session),night),delay=timing.delay;
    track(card,[{opacity:0,translate:"0 -46px",rotate:"7deg",scale:".94"},{opacity:1,translate:"0 0",rotate:"0deg",scale:"1"}],timing);
    const image=card.querySelector("img");if(image)track(image,[{filter:"brightness(1.2) saturate(.6)"},{filter:"none"}],{duration:1200,delay:delay+180,easing:"ease-out"});
    card.querySelectorAll(`${selectors.pin},${selectors.tape}`).forEach(pin=>track(pin,[{opacity:0,scale:".1"},{opacity:1,scale:"1.3",offset:.65},{opacity:1,scale:"1"}],{duration:560,delay:delay+460,easing:timing.easing}));
  });
  world.querySelectorAll(`${selectors.lines} path`).forEach((path,index)=>track(path,[{strokeDashoffset:1,opacity:0},{strokeDashoffset:0,opacity:.55}],{duration:560,delay:(session?980:0)+360+index*60,easing:"ease-out"}));
  world.style.visibility="visible";window.dispatchEvent(new CustomEvent("preview:star-boost",{detail:{duration:1100}}));
  return cleanup;
}
