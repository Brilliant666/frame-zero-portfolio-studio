"use client";
import {useCallback,useLayoutEffect,useMemo,useRef,type MutableRefObject} from "react";
import type {ComposerView} from "./composer-view";
import {composerInertiaStep,composerSpringStep,interpolateComposer} from "./composer-motion";

type Job={kind:"move";from:ComposerView;to:ComposerView;start:number;duration:number}
  |{kind:"zoom";to:ComposerView;last:number}
  |{kind:"inertia";velocity:{x:number;y:number};start:number;last:number};

/** Runs only during an interaction, never a permanent scene render loop. */
export function useComposerMotion(view:MutableRefObject<ComposerView>,commit:(next:ComposerView)=>void,enabled:boolean,constrain:(value:ComposerView)=>ComposerView){
  const frame=useRef<number|null>(null),job=useRef<Job|null>(null),reduced=useRef(false),active=useRef(enabled);
  const stop=useCallback(()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;job.current=null;},[]);
  const run=useCallback(()=>{
    if(frame.current!==null)return;
    const tick=(now:number)=>{
      frame.current=null;
      const current=job.current;
      if(!current || !active.current)return;
      if(current.kind==="move"){
        const p=(now-current.start)/current.duration;
        commit(interpolateComposer(current.from,current.to,p));
        if(p>=1)job.current=null;
      }else if(current.kind==="zoom"){
        const k=1-Math.exp(-Math.min(48,now-current.last)/85),old=view.current;
        current.last=now;
        const next={x:old.x+(current.to.x-old.x)*k,y:old.y+(current.to.y-old.y)*k,scale:old.scale+(current.to.scale-old.scale)*k};
        if(Math.abs(next.x-current.to.x)<.3 && Math.abs(next.y-current.to.y)<.3 && Math.abs(next.scale-current.to.scale)<.0005){commit(current.to);job.current=null;}
        else commit(next);
      }else{
        const dt=now-current.last,next=composerInertiaStep(view.current,current.velocity,dt),target=constrain(next.view);
        const outside=Math.abs(target.x-next.view.x)+Math.abs(target.y-next.view.y)>.2;
        current.last=now;current.velocity={x:next.velocity.x*(outside?.7:1),y:next.velocity.y*(outside?.7:1)};
        commit(outside?composerSpringStep(next.view,target,dt):next.view);
        if((!outside && Math.abs(next.velocity.x)+Math.abs(next.velocity.y)<.005) || now-current.start>=1400){commit(constrain(view.current));job.current=null;}
      }
      if(job.current)frame.current=requestAnimationFrame(tick);
    };
    frame.current=requestAnimationFrame(tick);
  },[commit,view,constrain]);
  const move=useCallback((destination:ComposerView,duration=850)=>{
    const to=constrain(destination);
    stop();
    if(!active.current || reduced.current){commit(to);return;}
    job.current={kind:"move",from:{...view.current},to,start:performance.now(),duration};run();
  },[commit,run,stop,view,constrain]);
  const zoom=useCallback((destination:ComposerView)=>{
    const to=constrain(destination);
    stop();
    if(!active.current || reduced.current){commit(to);return;}
    job.current={kind:"zoom",to,last:performance.now()};run();
  },[commit,run,stop,constrain]);
  const release=useCallback((velocity:{x:number;y:number})=>{
    stop();if(!active.current || reduced.current){commit(constrain(view.current));return;}
    const now=performance.now();job.current={kind:"inertia",velocity,start:now,last:now};run();
  },[run,stop,commit,constrain,view]);
  const target=useCallback(()=>job.current?.kind==="zoom"?job.current.to:view.current,[view]);
  useLayoutEffect(()=>{active.current=enabled;if(!enabled)stop();},[enabled,stop]);
  useLayoutEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const change=()=>{reduced.current=media.matches;if(media.matches){const current=job.current;stop();if(current)commit(constrain(current.kind!=="inertia"?current.to:view.current));}};
    change();media.addEventListener("change",change);
    const hidden=()=>{if(document.hidden)stop();};document.addEventListener("visibilitychange",hidden);
    return ()=>{stop();media.removeEventListener("change",change);document.removeEventListener("visibilitychange",hidden);};
  },[commit,stop,constrain,view]);
  return useMemo(()=>({stop,move,zoom,release,target}),[stop,move,zoom,release,target]);
}
