"use client";

import { useEffect, useRef } from "react";

/** Decorative sky owns its own clock; never updates React on animation frames. */
export default function StarSky({ active, className }: { active: boolean; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!active || !canvas || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tokens=getComputedStyle(canvas), starColor=tokens.getPropertyValue("--star-sky-star").trim(), highlightColor=tokens.getPropertyValue("--star-sky-highlight").trim();
    let width = 0, height = 0, dpr = 1, frame = 0, last = 0, boostStart = 0, boostEnd = 0;
    let stars: { x: number; y: number; z: number; phase: number; gold: boolean }[] = [];
    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const boost = !reduced.matches && now < boostEnd ? Math.sin(Math.PI * (now - boostStart) / (boostEnd - boostStart)) : 0;
      for (const star of stars) {
        const x = star.x * width, y = star.y * height;
        ctx.globalAlpha = reduced.matches ? .55 : .35 + .3 * (1 + Math.sin(now * .0006 + star.phase));
        ctx.fillStyle = star.gold ? highlightColor : starColor;
        const radius = .35 + star.z * 1.2;
        if (boost > .02) {
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = radius; ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x + (x - width / 2) * boost * .16 * star.z, y + (y - height / 2) * boost * .16 * star.z); ctx.stroke();
        } else { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    };
    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || reduced.matches) return;
      if (now - last >= 30) { draw(now); last = now; }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (document.hidden) return;
      draw(performance.now());
      if (!reduced.matches) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect(); width = box.width; height = box.height;
      dpr = Math.min(1.5, devicePixelRatio || 1); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const count = Math.round(Math.max(140, Math.min(460, width * height / 4200)) * (width < 768 ? .5 : 1));
      stars = Array.from({ length: count }, (_, i) => ({ x: (i * .61803398875) % 1, y: (i * .41421356237) % 1, z: .1 + ((i * .73205080757) % .9), phase: i * 1.7, gold: i % 13 === 0 }));
      canvas.dataset.particles = String(count); resume();
    };
    const boost = (event: Event) => {
      if (reduced.matches || document.hidden) return;
      boostStart = performance.now(); boostEnd = boostStart + Math.max(0, Math.min(1500, Number((event as CustomEvent).detail?.duration) || 1100));
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    document.addEventListener("visibilitychange", resume); reduced.addEventListener("change", resume); window.addEventListener("preview:star-boost", boost);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("visibilitychange", resume); reduced.removeEventListener("change", resume); window.removeEventListener("preview:star-boost", boost); ctx.clearRect(0, 0, canvas.width, canvas.height); };
  }, [active]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
