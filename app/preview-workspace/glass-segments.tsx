"use client";

import { useLayoutEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import styles from "./glass-segments.module.css";

type Option<T extends string> = { value:T; label:string; href?:string };
export default function GlassSegments<T extends string>({ options, value, label, onChange, navigation=false }: {
  options:readonly Option<T>[]; value:T; label:string; navigation?:boolean;
  onChange:(value:T,event:MouseEvent<HTMLElement>)=>void;
}) {
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const element=root.current;if(!element)return;
    const update=()=>{
      const selected=element.querySelector<HTMLElement>('[data-segment-active="true"]');
      if(!selected)return;
      element.style.setProperty("--segment-left",`${selected.offsetLeft}px`);
      element.style.setProperty("--segment-width",`${selected.offsetWidth}px`);
    };
    update();const observer=new ResizeObserver(update);observer.observe(element);
    return()=>observer.disconnect();
  },[value]);
  return <div ref={root} className={styles.segments} role={navigation?"navigation":"group"} aria-label={label} data-preview-segments style={{"--segment-count":options.length} as CSSProperties}>
    <span className={styles.indicator} aria-hidden="true" />
    {options.map(option=>option.href?<a key={option.value} href={option.href} data-segment-active={value===option.value} aria-current={value===option.value?"page":undefined} onClick={event=>onChange(option.value,event)}>{option.label}</a>:<button key={option.value} type="button" data-segment-active={value===option.value} aria-pressed={value===option.value} onClick={event=>onChange(option.value,event)}>{option.label}</button>)}
  </div>;
}
