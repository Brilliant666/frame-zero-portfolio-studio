"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import styles from "./star-motion.module.css";

type Theme = "paper" | "night";
const ThemeContext = createContext<{ theme: Theme; change: (theme: Theme) => void }>({ theme: "paper", change: () => {} });
const key = "frame-zero:preview-star-theme:v1";
export function StarThemeToggle() {
  const { theme, change } = useContext(ThemeContext);
  return <div className={styles.toggle} role="group" aria-label="画布主题">
    {(["paper", "night"] as const).map(mode => <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => change(mode)}>{mode === "paper" ? "纸面" : "夜空"}</button>)}
  </div>;
}
export default function StarMotionShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("paper");
  useEffect(() => {
    let value: string | null = null;
    try { value = localStorage.getItem(key); } catch { /* Read-only/private browser still works. */ }
    if (value === "night") { const frame = requestAnimationFrame(() => setTheme("night")); return () => cancelAnimationFrame(frame); }
  }, []);
  const change = (next: Theme) => { setTheme(next); try { localStorage.setItem(key, next); } catch { /* Per-visit fallback. */ } };
  return <ThemeContext.Provider value={{theme, change}}><div className={styles.shell} data-star-theme={theme}>
    <div className={styles.stars} aria-hidden="true">{Array.from({length:48},(_,i)=><i key={i} style={{left:`${(i*37.13)%100}%`,top:`${(i*61.79)%100}%`,animationDelay:`${-(i%9)}s`,width:i%5===0?3:1,height:i%5===0?3:1}} />)}</div>
    {children}
  </div></ThemeContext.Provider>;
}
