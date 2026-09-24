"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import styles from "./star-motion.module.css";
import StarSky from "./star-sky";

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
    <StarSky active={theme === "night"} className={styles.stars} />
    {children}
  </div></ThemeContext.Provider>;
}
