"use client";

import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import styles from "./star-motion.module.css";
import sections from "./theme-sections.module.css";
import "./theme-media.css";
import "./preview-theme.css";
import "../templates/polaroid-field/motion-fonts.css";
import StarSky from "./star-sky";
import { PREVIEW_THEME_KEY } from "./preview-theme";

type Theme = "paper" | "night";
const themeEvent="preview:theme-change";
const subscribeTheme=(notify:()=>void)=>{window.addEventListener(themeEvent,notify);return ()=>window.removeEventListener(themeEvent,notify);};
const currentTheme=():Theme|"disabled"=>!/^\/preview\/?$/.test(location.pathname)?"disabled":document.documentElement.dataset.previewTheme==="night"?"night":"paper";
const serverTheme=()=>"disabled" as const;
const ThemeContext = createContext<{ theme: Theme; enabled:boolean; change: (theme: Theme, origin:{x:number;y:number}) => void }>({ theme: "paper", enabled:false, change: () => {} });
export function StarThemeToggle() {
  const { theme, enabled, change } = useContext(ThemeContext);
  if(!enabled)return null;
  const label=theme==="paper"?"切换到夜空":"切换到纸面";
  return <button className={styles.toggle} type="button" aria-label={label} title={label} onClick={event=>{
    const box=event.currentTarget.getBoundingClientRect();change(theme==="paper"?"night":"paper",{x:box.left+box.width/2,y:box.top+box.height/2});
  }}><svg key={theme} className={styles.themeIcon} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {theme==="paper"?<path d="M20.8 13.2A8.8 8.8 0 0 1 10.8 3.2a8.8 8.8 0 1 0 10 10Z"/>:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41m0-14.14-1.41 1.41M6.34 17.66l-1.41 1.41"/></>}
  </svg></button>;
}
export default function StarMotionShell({ children }: { children: ReactNode }) {
  const snapshot=useSyncExternalStore(subscribeTheme,currentTheme,serverTheme);
  const theme:Theme=snapshot==="night"?"night":"paper",enabled=snapshot!=="disabled";
  const transition=useRef<ViewTransition|null>(null),reveal=useRef<Animation|null>(null);
  const mounted=useRef(false);
  useLayoutEffect(() => {
    if(!/^\/preview\/?$/.test(location.pathname))return;
    mounted.current=true;
    const root=document.documentElement;
    let next:Theme=root.dataset.previewTheme==="night"?"night":"paper";
    try { next=localStorage.getItem(PREVIEW_THEME_KEY)==="night"?"night":"paper"; } catch { /* Private browser uses the prepaint theme. */ }
    root.dataset.previewTheme=next;root.dataset.starTheme=next;
    window.dispatchEvent(new Event(themeEvent));
    const reduced=matchMedia("(prefers-reduced-motion: reduce)");
    const stop=()=>{reveal.current?.cancel();reveal.current=null;transition.current?.skipTransition();transition.current=null;};
    const onReduced=()=>{if(reduced.matches)stop();};
    reduced.addEventListener("change",onReduced);
    return ()=>{mounted.current=false;stop();reduced.removeEventListener("change",onReduced);delete root.dataset.previewTheme;delete root.dataset.starTheme;};
  }, []);
  const change = (next: Theme,origin:{x:number;y:number}) => {
    const root=document.documentElement;
    reveal.current?.cancel();transition.current?.skipTransition();
    const apply=()=>{if(!mounted.current || !/^\/preview\/?$/.test(location.pathname))return;root.dataset.previewTheme=next;root.dataset.starTheme=next;window.dispatchEvent(new Event(themeEvent));try{localStorage.setItem(PREVIEW_THEME_KEY,next);}catch{/* Per-visit fallback. */}};
    if(!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches){apply();return;}
    let current:ViewTransition;
    try{current=document.startViewTransition(()=>flushSync(apply));}catch{apply();return;}
    transition.current=current;
    void current.ready.then(()=>{
      if(transition.current!==current)return;
      const radius=Math.hypot(Math.max(origin.x,innerWidth-origin.x),Math.max(origin.y,innerHeight-origin.y));
      reveal.current=root.animate({clipPath:[`circle(0px at ${origin.x}px ${origin.y}px)`,`circle(${radius}px at ${origin.x}px ${origin.y}px)`]},
        {duration:450,easing:"cubic-bezier(.22,1,.36,1)",pseudoElement:"::view-transition-new(root)"});
    }).catch(()=>{/* Skipped or unsupported snapshot: theme still changes. */});
    void current.finished.finally(()=>{if(transition.current===current){transition.current=null;reveal.current=null;}}).catch(()=>{});
  };
  // Keep the preview subtree mounted while restoring the initial theme; rebuilding
  // it here would replay/consume the first-visit entrance before it can be seen.
  const localPaper=typeof window!=="undefined" && !/^\/preview\/?$/.test(location.pathname);
  return <ThemeContext.Provider value={{theme, enabled, change}}><div className={`${styles.shell}${localPaper?"":` ${sections.sections}`}`} data-preview-local-theme={localPaper?"paper":undefined} data-star-theme={localPaper?"paper":undefined}>
    <StarSky active={theme === "night"} className={styles.stars} />
    {children}
  </div></ThemeContext.Provider>;
}
