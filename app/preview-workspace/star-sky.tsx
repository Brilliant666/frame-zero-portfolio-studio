"use client";

import { useEffect, useRef } from "react";

/*
 * The sky turns around a celestial pole above the top-right corner. Scrolling turns it, and
 * the faster it turns, the less of the previous frame is erased, so stars draw long-exposure
 * star trails. "preview:star-boost" dollies the camera (in on a cover, out on the way home,
 * or a short pulse), which the same persistence turns into radial warp streaks.
 * Tokens choose the look: --star-sky-style "sky" (night) or "chart" (an ink star atlas).
 */

type Particle = { rho: number; th: number; px?: number; py?: number };
type Star = Particle & { z: number; phase: number; speed: number; gold: boolean; big: boolean };
type Dust = Particle & { a: number; s: number };
type BoostDetail = { duration?: number; phase?: "in" | "out"; origin?: { x: number; y: number } };

const NAMES = ["织女", "天狼", "北落师门", "参宿四", "大角", "心宿二", "毕宿五", "轩辕十四", "南河三", "天津四", "河鼓二", "角宿一"];
/** Deterministic PRNG: the same sky on every visit. */
const seeded = (seed: number) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function sparklePath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const k = s * .14;
  ctx.beginPath(); ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + k, y - k, x + s, y); ctx.quadraticCurveTo(x + k, y + k, x, y + s);
  ctx.quadraticCurveTo(x - k, y + k, x - s, y); ctx.quadraticCurveTo(x - k, y - k, x, y - s);
  ctx.fill();
}

const NEBULA_VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const NEBULA_FS = `precision mediump float;uniform vec2 r;uniform float t;uniform float m;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;vec2 p=uv*vec2(r.x/r.y,1.);float tt=t*.018;
  vec2 q=vec2(fbm(p*1.5+tt),fbm(p*1.5-tt+3.1));
  float f=fbm(p*1.25+q*1.9+vec2(tt*.7,-tt*.45));
  float d=(1.-uv.y)-.45-(uv.x-.38)*-.9;float band=exp(-d*d*9.);
  vec3 nc=mix(vec3(.30,.22,.24),vec3(.62,.47,.36),f);float na=smoothstep(.42,.95,f)*(.06+.34*band);
  vec3 cc=mix(vec3(.55,.52,.92),vec3(1.,.80,.66),clamp(1.-uv.y+(f-.5)*.5,0.,1.));
  float silk=smoothstep(.35,.9,fbm(vec2(p.x*1.2+p.y*.6,p.y*2.2)+q*1.4+tt*.8));float ca=.08+.26*silk;
  vec3 col=mix(nc,cc,m);float a=mix(na,ca,m);
  float g=(h(gl_FragCoord.xy+fract(t*.37))-.5)*.06;
  gl_FragColor=vec4((col+g)*a,a);
}`;

/** Decorative sky owns its own clock; never updates React on animation frames. */
export default function StarSky({ active, paused = false, className }: { active: boolean; paused?: boolean; className: string }) {
  const starsRef = useRef<HTMLCanvasElement>(null), gridRef = useRef<HTMLCanvasElement>(null), nebulaRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = starsRef.current, gridCanvas = gridRef.current, nebula = nebulaRef.current;
    const ctx = canvas?.getContext("2d"), gg = gridCanvas?.getContext("2d");
    if (!active || !canvas || !gridCanvas || !nebula || !ctx || !gg) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tokens = getComputedStyle(canvas), token = (name: string) => tokens.getPropertyValue(name).trim();
    const chart = token("--star-sky-style") === "chart";
    const starColor = token("--star-sky-star"), goldColor = token("--star-sky-highlight"), dustColor = token("--star-sky-band") || starColor;
    const gridColor = token("--star-sky-grid") || "rgba(34,31,63,.13)", labelColor = token("--star-sky-label") || "rgba(34,31,63,.55)";
    const density = Math.max(.5, Math.min(2, Number(token("--star-sky-density")) || 1));
    let width = 0, height = 0, dpr = 1, frame = 0, last = 0, mobile = false;
    let pole = { x: 0, y: 0 }, th0 = 0, span = 1, stars: Star[] = [], dust: Dust[] = [], named: { star: Star; name: string }[] = [];
    let rot = 0, rotTarget = 0, rotPrev = 0, idle = 0;
    const zoom = { v: 1, target: 1, ease: .05, cx: 0, cy: 0, prev: 1, pulseUntil: 0, holdUntil: 0 };
    const pointer = { x: -999, y: -999 };
    const still = () => paused || reduced.matches;
    const halo = (color: string) => {
      const sprite = document.createElement("canvas"); sprite.width = sprite.height = 64;
      const g = sprite.getContext("2d")!, gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, color); gradient.addColorStop(1, "transparent");
      g.globalAlpha = .55; g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
      return sprite;
    };
    const halos = { star: halo(starColor || "#fff"), gold: halo(goldColor || "#fff") };

    // ---------- nebula / dawn silk (WebGL, half resolution, optional) ----------
    const gl = nebula.getContext("webgl", { premultipliedAlpha: true, antialias: false });
    let nebulaU: { r: WebGLUniformLocation | null; t: WebGLUniformLocation | null; m: WebGLUniformLocation | null } | null = null;
    if (gl) {
      const compile = (type: number, source: string) => { const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader); return shader; };
      const program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, NEBULA_VS)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, NEBULA_FS)); gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const location = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
        nebulaU = { r: gl.getUniformLocation(program, "r"), t: gl.getUniformLocation(program, "t"), m: gl.getUniformLocation(program, "m") };
      }
    }
    const drawNebula = (now: number) => {
      if (!gl || !nebulaU) return;
      gl.uniform2f(nebulaU.r, nebula.width, nebula.height); gl.uniform1f(nebulaU.t, still() ? 40 : now / 1000); gl.uniform1f(nebulaU.m, chart ? 1 : 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // ---------- the sky: polar coordinates around an off-screen pole ----------
    const build = () => {
      const random = seeded(11), gauss = () => (random() + random() + random() + random() - 2) / 2;
      pole = mobile ? { x: width * 1.15, y: -height * .3 } : { x: width * 1.04, y: -height * .46 };
      const corners = [[0, 0], [width, 0], [0, height], [width, height]];
      const angles = corners.map(([x, y]) => Math.atan2(y - pole.y, x - pole.x));
      const reach = corners.map(([x, y]) => Math.hypot(x - pole.x, y - pole.y));
      th0 = Math.min(...angles) - .25; span = Math.max(...angles) + .25 - th0;
      const nx = Math.max(0, Math.min(width, pole.x)), ny = Math.max(0, Math.min(height, pole.y));
      const r0 = Math.max(0, Math.hypot(nx - pole.x, ny - pole.y) - 40), r1 = Math.max(...reach) + 60;
      const radius = () => Math.sqrt(random() * (r1 * r1 - r0 * r0) + r0 * r0);
      const area = span / 2 * (r1 * r1 - r0 * r0);
      const count = Math.round(area * (mobile ? 300 : 520) * density / Math.max(1, width * height));
      stars = Array.from({ length: count }, (_, i) => ({ rho: radius(), th: th0 + random() * span, z: random() ** 1.8 * .85 + .15, phase: random() * 6.3, speed: .5 + random() * 2, gold: i % 13 === 0, big: i % 23 === 0 }));
      // the Milky Way: a spoke of dust from the pole, so it sweeps across the view as the sky turns
      const center = Math.atan2(height * .55 - pole.y, width * .38 - pole.x);
      const dustCount = Math.round((mobile ? 1500 : 4000) * density * span / 1.2);
      dust = Array.from({ length: dustCount }, () => { const rho = radius(); return { rho, th: center + gauss() * Math.min(width, height) * .16 / rho + (random() - .5) * .02, a: random() * random() * .55, s: random() < .9 ? .9 : 1.7 }; });
      named = stars.filter(star => star.big).slice(0, NAMES.length).map((star, i) => ({ star, name: NAMES[i] }));
      canvas.dataset.particles = String(count);
    };
    const P = { x: 0, y: 0 };
    const project = (p: Particle) => {
      let a = p.th + rot - th0; a = ((a % span) + span) % span + th0;
      let x = pole.x + p.rho * Math.cos(a), y = pole.y + p.rho * Math.sin(a);
      if (zoom.v !== 1) { x = zoom.cx + (x - zoom.cx) * zoom.v; y = zoom.cy + (y - zoom.cy) * zoom.v; }
      P.x = x; P.y = y; return P;
    };
    const near = (p: { x: number; y: number }) => Math.max(0, 1 - Math.hypot(p.x - pointer.x, p.y - pointer.y) / 160);

    const draw = (now: number) => {
      const t = now / 1000;
      const omega = Math.abs(rot - rotPrev), zeta = Math.abs(zoom.v - zoom.prev);
      rotPrev = rot; zoom.prev = zoom.v;
      const motion = Math.max(0, omega - .00008) * 5200 + zeta * 70;
      const fade = still() ? 1 : Math.max(chart ? .08 : .045, Math.min(1, 1 / (1 + motion)));
      const streak = fade < .9;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over"; ctx.lineCap = "round";
      ctx.fillStyle = dustColor; ctx.strokeStyle = dustColor;
      const dustAlpha = chart ? .32 : 1;
      for (const d of dust) {
        project(d); const px = d.px, py = d.py; d.px = P.x; d.py = P.y;
        if (P.x < -2 || P.y < -2 || P.x > width + 2 || P.y > height + 2) continue;
        if (streak && px !== undefined && py !== undefined && Math.abs(P.x - px) + Math.abs(P.y - py) < 90) {
          ctx.globalAlpha = d.a * dustAlpha * .4; ctx.lineWidth = d.s * .8; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(P.x, P.y); ctx.stroke();
        } else { ctx.globalAlpha = d.a * dustAlpha; ctx.fillRect(P.x, P.y, d.s, d.s); }
      }
      for (const s of stars) {
        project(s); const px = s.px, py = s.py; s.px = P.x; s.py = P.y;
        if (P.x < -12 || P.y < -12 || P.x > width + 12 || P.y > height + 12) continue;
        const color = s.gold ? goldColor : starColor, lit = near(P);
        const twinkle = still() ? .8 : .5 + .5 * Math.sin(t * s.speed + s.phase);
        ctx.fillStyle = color; ctx.strokeStyle = color;
        if (streak && px !== undefined && py !== undefined && Math.abs(P.x - px) + Math.abs(P.y - py) < 90) {
          ctx.globalAlpha = chart ? .3 + .45 * s.z : Math.min(1, .3 + .6 * s.z);
          ctx.lineWidth = chart ? .5 + s.z * 1.6 : s.big ? 1.6 : .6 + s.z * 1.9;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(P.x, P.y); ctx.stroke();
        } else if (chart) {
          // atlas symbology: magnitude-sized ink dots; bright stars ringed, with four ticks
          ctx.globalAlpha = .45 + .45 * s.z + lit * .3;
          if (s.big) {
            ctx.beginPath(); ctx.arc(P.x, P.y, 2.3, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(P.x, P.y, 4.6 + lit * 2, 0, Math.PI * 2); ctx.stroke();
            for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(P.x + Math.cos(a) * 6.5, P.y + Math.sin(a) * 6.5); ctx.lineTo(P.x + Math.cos(a) * 10, P.y + Math.sin(a) * 10); ctx.stroke(); }
          } else { ctx.beginPath(); ctx.arc(P.x, P.y, .45 + s.z * 1.5 + lit, 0, Math.PI * 2); ctx.fill(); }
        } else if (s.big) {
          const size = (3.2 + s.z * 6) * (.75 + .25 * twinkle) + lit * 4;
          ctx.globalAlpha = .55 + .45 * twinkle; ctx.drawImage(s.gold ? halos.gold : halos.star, P.x - size * 2.2, P.y - size * 2.2, size * 4.4, size * 4.4);
          ctx.globalAlpha = .8 + .2 * twinkle; sparklePath(ctx, P.x, P.y, size);
        } else {
          ctx.globalAlpha = Math.min(1, .6 + .6 * twinkle * s.z + lit * .7);
          ctx.beginPath(); ctx.arc(P.x, P.y, .4 + s.z * 1.35 + lit * 1.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      drawGrid();
    };
    // the chart's coordinate net and star names turn with the sky but never leave trails
    const drawGrid = () => {
      gg.setTransform(dpr, 0, 0, dpr, 0, 0); gg.clearRect(0, 0, width, height);
      if (!chart) return;
      const z = zoom.v, at = (x: number, y: number) => z === 1 ? [x, y] : [zoom.cx + (x - zoom.cx) * z, zoom.cy + (y - zoom.cy) * z];
      const [px, py] = at(pole.x, pole.y);
      gg.strokeStyle = gridColor; gg.fillStyle = labelColor; gg.lineWidth = 1; gg.font = '11px "Noto Serif SC",serif';
      const step = Math.max(width, height) * .18, maxR = Math.hypot(width - px, height - py) + Math.hypot(px, py);
      let degree = 80;
      for (let r = step; r < maxR; r += step, degree -= 10) {
        gg.beginPath(); gg.arc(px, py, r * z, 0, Math.PI * 2); gg.stroke();
        const a = th0 + span * .52 + rot, lx = px + Math.cos(a) * r * z, ly = py + Math.sin(a) * r * z;
        if (lx > 0 && lx < width && ly > 0 && ly < height) gg.fillText(`+${degree}°`, lx + 4, ly - 4);
      }
      for (let hour = 0; hour < 24; hour++) {
        const a = hour / 24 * Math.PI * 2 + rot;
        gg.beginPath(); gg.moveTo(px, py); gg.lineTo(px + Math.cos(a) * maxR, py + Math.sin(a) * maxR); gg.stroke();
      }
      gg.font = 'italic 11px "Noto Serif SC",serif';
      for (const { star, name } of named) { project(star); if (P.x > 10 && P.x < width - 60 && P.y > 70 && P.y < height - 10) gg.fillText(name, P.x + 12, P.y + 4); }
    };

    const step = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000);
      if (!still()) idle += dt * .0035;
      // a jump (anchor, restored scroll) sweeps at most a quarter radian instead of smearing the sky
      const target = rotTarget + idle;
      if (Math.abs(target - rot) > .25) rot = target - Math.sign(target - rot) * .25;
      rot += (target - rot) * (still() ? 1 : .12);
      if (zoom.pulseUntil && now > zoom.pulseUntil) { zoom.pulseUntil = 0; zoom.target = 1; zoom.ease = .04; }
      if (zoom.holdUntil && now > zoom.holdUntil) { zoom.holdUntil = 0; zoom.target = 1; zoom.ease = .04; }
      zoom.v += (zoom.target - zoom.v) * zoom.ease;
      if (Math.abs(zoom.target - zoom.v) < .0005) zoom.v = zoom.target;
    };
    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || still()) return;
      const moving = Math.abs(rotTarget + idle - rot) > .0004 || zoom.v !== zoom.target;
      // full frame rate while the sky moves (smooth trails), 30 fps while it only twinkles
      if (moving || now - last >= 33) { step(now); draw(now); if (now - last >= 33) drawNebula(now); last = now; }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (document.hidden) return;
      const now = performance.now(); last = now; step(now); draw(now); drawNebula(now);
      if (!still()) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect(); width = box.width; height = box.height; mobile = width < 768;
      dpr = Math.min(1.5, devicePixelRatio || 1);
      for (const layer of [canvas, gridCanvas]) { layer.width = Math.round(width * dpr); layer.height = Math.round(height * dpr); }
      nebula.width = Math.max(1, Math.round(width * .5)); nebula.height = Math.max(1, Math.round(height * .5)); gl?.viewport(0, 0, nebula.width, nebula.height);
      build(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); resume();
    };
    // scrolling anywhere (window or the preview scrollport) turns the sky by the distance scrolled
    const scrollTops = new WeakMap<object, number>();
    const onScroll = (event: Event) => {
      const target = event.target instanceof Element ? event.target : document.scrollingElement;
      if (!target) return;
      const top = target.scrollTop, before = scrollTops.get(target);
      scrollTops.set(target, top);
      if (before === undefined) return;
      rotTarget += Math.max(-.25, Math.min(.25, (top - before) * (mobile ? .00055 : .00042)));
      if (!frame && !document.hidden && !still()) resume();
    };
    const onPointer = (event: PointerEvent) => { const box = canvas.getBoundingClientRect(); pointer.x = event.clientX - box.left; pointer.y = event.clientY - box.top; };
    const onLeave = () => { pointer.x = pointer.y = -999; };
    const boost = (event: Event) => {
      if (still() || document.hidden) return;
      const detail = ((event as CustomEvent).detail ?? {}) as BoostDetail, box = canvas.getBoundingClientRect(), now = performance.now();
      if (detail.phase === "in") {
        // dolly toward the chosen cover; the album's entrance boost settles it
        zoom.cx = (detail.origin?.x ?? box.left + width / 2) - box.left; zoom.cy = (detail.origin?.y ?? box.top + height / 2) - box.top;
        zoom.target = 2.4; zoom.ease = .05; zoom.pulseUntil = 0; zoom.holdUntil = now + 2600;
      } else if (detail.phase === "out") {
        zoom.cx = width / 2; zoom.cy = height * .45; zoom.v = zoom.prev = .7; zoom.target = 1; zoom.ease = .045; zoom.pulseUntil = zoom.holdUntil = 0;
      } else if (zoom.target > 1.01 || zoom.v > 1.05) {
        zoom.target = 1; zoom.ease = .035; zoom.holdUntil = 0;
      } else {
        zoom.cx = width / 2; zoom.cy = height * .42; zoom.target = 1.7; zoom.ease = .06;
        zoom.pulseUntil = now + Math.max(0, Math.min(1500, Number(detail.duration) || 1100)) / 2;
      }
      if (!frame) resume();
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    document.addEventListener("visibilitychange", resume); reduced.addEventListener("change", resume);
    window.addEventListener("preview:star-boost", boost);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true }); document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener("visibilitychange", resume); reduced.removeEventListener("change", resume);
      window.removeEventListener("preview:star-boost", boost);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("pointermove", onPointer); document.removeEventListener("pointerleave", onLeave);
      ctx.clearRect(0, 0, canvas.width, canvas.height); gg.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    };
  }, [active, paused]);
  return <>
    <canvas ref={nebulaRef} className={className} data-sky-layer="nebula" aria-hidden="true" />
    <canvas ref={gridRef} className={className} data-sky-layer="grid" aria-hidden="true" />
    <canvas ref={starsRef} className={className} data-sky-layer="stars" aria-hidden="true" />
  </>;
}
