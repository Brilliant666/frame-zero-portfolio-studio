// Geometry port of the supplied polaroid-composer.html. Positions are card centres.
export type ComposerMode = "constellation" | "scatter" | "editorial";
type Point = { x: number; y: number };
type Box = { l: number; t: number; r: number; b: number };
type Member = { id: string; r: number };
type Cluster = { start: number; size: number };
export type ComposerTape = { color: string; x: number; w: number; rot: number };
export type ComposerCard = Point & {
  id: string; i: number; role: "hero" | "lead" | "small"; r: number;
  pw: number; ph: number; f: { side: number; top: number; bottom: number };
  w: number; h: number; rot: number; z: number; cap: "left" | "right";
  tape: ComposerTape | null; tape2?: ComposerTape; pin: boolean; px?: number; py?: number;
};
export type ComposerLayout = {
  cards: ComposerCard[]; lines: [number, number, number, number, number][];
  note: { cx: number; cy: number; rot: number } | null;
  heroIdx: number[]; heroOnly: number[]; heroPad?: number; world: { w: number; h: number };
  openingCluster?: number[]; heroStartsOpeningCluster?: boolean;
  meta?: { selectedRows: number; availableW: number; availableH: number; candidates: { rows: number; width: number; height: number; fitScale: number; score?: number }[] };
};
type RawLayout = Omit<ComposerLayout, "world" | "heroOnly"> & {
  heroOnly?: number[]; wm: boolean; defaultView: string;
};
type Parameters = {
  id: ComposerMode; base: number; heroK: number; leadK: number; jitter: number;
  tuck: number; downA: number; upB: number; fanGap: number; satOverlap: number;
  maxCluster: number; heroCluster: number; sizes: number[]; tpl2: string[]; tpl3: string[];
  gap: [number, number]; heroGapK: number; wave: number; aspect: number; rowGapK: number;
  rot: { hero: [number, number]; lead: [number, number]; sat: [number, number] };
  serpentine: boolean; pins: boolean; tapeP: number; margin: number; note?: boolean;
};
function mulberry32(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const between = (rng: () => number, [a,b]: [number,number]) => a + (b-a)*rng();
const WASHI = ['#f2b8c3','#f6c9a6','#f3dd92','#bfe0cf','#b8dbe6','#c3d2f2','#d7c7ef'];
const washiFor = (rng: () => number) => WASHI[Math.floor(rng()*WASHI.length)];
export function composerCardBounds(c: Pick<ComposerCard, "x" | "y" | "w" | "h" | "rot">, margin = 30): Box {
  const a = Math.abs(c.rot)*Math.PI/180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
  const w = (c.w+2*margin)*cs+(c.h+2*margin)*sn, h = (c.w+2*margin)*sn+(c.h+2*margin)*cs;
  return { l:c.x-w/2, t:c.y-h/2, r:c.x+w/2, b:c.y+h/2 };
}
const aabb = (c: Pick<ComposerCard, "x" | "y" | "w" | "h" | "rot">, margin = 0) => composerCardBounds(c, margin);
const union = (boxes: Box[]): Box => boxes.reduce((u,b) => ({l:Math.min(u.l,b.l), t:Math.min(u.t,b.t), r:Math.max(u.r,b.r), b:Math.max(u.b,b.b)}), {l:Infinity,t:Infinity,r:-Infinity,b:-Infinity});
/** Actual rotated photo and paper polygons, not their axis-aligned envelopes. */
function polygon(c: ComposerCard, photo: boolean): Point[] {
  const left = photo ? -c.w/2+c.f.side : -c.w/2;
  const top = photo ? -c.h/2+c.f.top : -c.h/2;
  const w = photo ? c.pw : c.w, h = photo ? c.ph : c.h;
  const a = c.rot*Math.PI/180, cs = Math.cos(a), sn = Math.sin(a);
  return [[left,top],[left+w,top],[left+w,top+h],[left,top+h]]
    .map(([x,y]) => ({x:c.x+x*cs-y*sn,y:c.y+x*sn+y*cs}));
}
function separation(a: Point[], b: Point[]): Point | null {
  let shortest = Infinity, move: Point | null = null;
  for (const points of [a,b]) for (let i=0;i<4;i++) {
    const p=points[i], q=points[(i+1)%4], len=Math.hypot(q.x-p.x,q.y-p.y);
    const axis={x:-(q.y-p.y)/len,y:(q.x-p.x)/len};
    const aa=a.map(p=>p.x*axis.x+p.y*axis.y), bb=b.map(p=>p.x*axis.x+p.y*axis.y);
    const amin=Math.min(...aa),amax=Math.max(...aa),bmin=Math.min(...bb),bmax=Math.max(...bb);
    if (amax<=bmin+.001 || bmax<=amin+.001) return null;
    const negative=bmin-amax,positive=bmax-amin;
    const d=Math.abs(negative)<positive?negative:positive;
    if(Math.abs(d)<shortest){shortest=Math.abs(d);move={x:axis.x*(d+Math.sign(d)*1.5),y:axis.y*(d+Math.sign(d)*1.5)};}
  }
  return move;
}
export function composerPhotoIsOccluded(back: ComposerCard, front: ComposerCard): boolean {
  const A=aabb(back),B=aabb(front);
  if(A.r<=B.l || B.r<=A.l || A.b<=B.t || B.b<=A.t) return false;
  return separation(polygon(back,true),polygon(front,false))!==null;
}
export function composerSheetsOverlap(a: ComposerCard, b: ComposerCard): boolean {
  return separation(polygon(a,false),polygon(b,false))!==null;
}
function frameFor(pw: number, ph: number, style: string){
  if (style === 'current') return { side:12, top:12, bottom:56 };
  if (style === 'editorial'){ const s = Math.round(clamp(Math.min(pw,ph)*.035 + 4, 7, 13)); return { side:s, top:s, bottom:Math.round(s*2.4 + 12) }; }
  const s = Math.round(clamp(Math.min(pw,ph)*.05 + 4, 8, 20));
  return { side:s, top:s, bottom:Math.round(s*3 + 8) };
}
function makeCard(i: number, m: Member, role: ComposerCard['role'], area: number, style: string): ComposerCard{
  const r = m.r, rr = clamp(r, .45, 2.3);
  let pw = Math.sqrt(area*rr), ph = pw/rr;
  if (r > rr) ph = pw / r; else if (r < rr) pw = ph * r;
  const f = frameFor(pw, ph, style);
  return { id:m.id, i, role, r, pw, ph, f, w: pw + 2*f.side, h: ph + f.top + f.bottom, x:0, y:0, rot:0, z:10, cap:'left', tape:null, pin:false };
}

/* ---------- styles 1 & 2: clusters strung along a path ---------- */
const P_CONST: Parameters = { id:'constellation', base:38000, heroK:3.4, leadK:1.4, jitter:.1, tuck:.13, downA:-.04, upB:.06, fanGap:16, satOverlap:.03,
  maxCluster:3, heroCluster:3, sizes:[2,3,3,2], tpl2:['fan','chainD','chainU'], tpl3:['fanChain','zig'], gap:[170,260], heroGapK:1.3,
  wave:.18, aspect:2.4, rowGapK:.35, rot:{hero:[0,1],lead:[1.2,3],sat:[2.6,6]}, serpentine:true, pins:true, tapeP:0, margin:12 };
const P_SCATTER: Parameters = { id:'scatter', base:36000, heroK:2.3, leadK:1.45, jitter:.14, tuck:.15, downA:-.12, upB:.14, fanGap:-18, satOverlap:.2,
  maxCluster:5, heroCluster:3, sizes:[3,4,3,5,4], tpl2:['fan','chainD','chainU','sideBelow'], tpl3:['fanChain','zig'], gap:[40,90], heroGapK:1.25,
  wave:.1, aspect:1.8, rowGapK:.2, rot:{hero:[1,2.4],lead:[2,4.5],sat:[4,9]}, serpentine:false, pins:false, tapeP:.9, margin:8, note:true };

function makeClusters(n: number, h: number, P: Parameters, rng: () => number){
  const segs = h > 0 ? [[0,h],[h,n]] : [[0,n]], out = [];
  for (const [a, b] of segs){
    let i = a;
    while (i < b){
      const remain = b - i, maxC = i === h ? Math.min(P.maxCluster, P.heroCluster) : P.maxCluster;
      let size;
      if (remain <= maxC && (remain <= 2 || rng() < .55)) size = remain;
      else {
        size = Math.min(P.sizes[Math.floor(rng()*P.sizes.length)], maxC, remain);
        if (remain - size === 1) size = size + 1 <= maxC ? size + 1 : Math.max(2, size - 1);
      }
      out.push({ start:i, size });
      i += size;
    }
  }
  return out;
}

function buildCluster(cl: Cluster, cards: ComposerCard[], dir: number, P: Parameters, rng: () => number){
  const idx = Array.from({length:cl.size}, (_, k) => cl.start + k);
  const pos = new Map<number, Point>(), z = new Map<number, number>(), cap = new Map<number, ComposerCard['cap']>();
  const get = (i: number) => ({ ...cards[i], ...pos.get(i) });
  pos.set(idx[0], {x:0, y:0}); z.set(idx[0], 100); cap.set(idx[0], dir > 0 ? 'left' : 'right');
  const S = idx.slice(1), k = S.length, pick = (a: string[]) => a[Math.floor(rng()*a.length)];
  const sideX = (ref: ComposerCard, C: ComposerCard) => ref.x + dir*(ref.w/2 + C.w/2 - P.tuck*C.w);
  function side(ri: number, i: number, v: string){
    const ref = get(ri), C = cards[i];
    const y = v === 'down' ? ref.y + P.downA*ref.h + C.h/2 : v === 'up' ? ref.y + P.upB*ref.h - C.h/2 : ref.y + (rng() - .5)*.12*ref.h;
    pos.set(i, { x: sideX(ref, C), y });
  }
  function fan(ri: number, iu: number, id: number){
    const ref = get(ri), U = cards[iu], D = cards[id], g = P.fanGap;
    pos.set(iu, { x: sideX(ref, U), y: ref.y - g/2 - U.h/2 });
    pos.set(id, { x: sideX(ref, D), y: ref.y + g/2 + D.h/2 });
  }
  function below(ri: number, i: number){ const ref = get(ri), C = cards[i]; pos.set(i, { x: ref.x + dir*ref.w*.2, y: ref.y + ref.h/2 + C.h/2 - P.tuck*1.2*C.h }); }
  if (k === 1) side(idx[0], S[0], pick(['down','up']));
  else if (k === 2){
    const t = pick(P.tpl2);
    if (t === 'fan') fan(idx[0], S[0], S[1]);
    else if (t === 'chainD'){ side(idx[0], S[0], 'down'); side(S[0], S[1], 'down'); }
    else if (t === 'chainU'){ side(idx[0], S[0], 'up'); side(S[0], S[1], 'up'); }
    else { side(idx[0], S[0], 'mid'); below(idx[0], S[1]); }
  } else if (k === 3){
    if (pick(P.tpl3) === 'fanChain'){ fan(idx[0], S[0], S[1]); side(S[1], S[2], 'up'); }
    else { side(idx[0], S[0], 'down'); side(S[0], S[1], 'up'); side(S[1], S[2], 'down'); }
  } else if (k >= 4){
    fan(idx[0], S[0], S[1]); side(S[1], S[2], 'up'); below(idx[0], S[3]);
    for (let q = 4; q < k; q++) side(S[q-1], S[q], q % 2 ? 'down' : 'up');
  }
  S.forEach((i, q) => { z.set(i, 90 - q*2); cap.set(i, dir > 0 ? 'right' : 'left'); });
  for (let pass = 0; pass < 8; pass++){
    let moved = false;
    for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++){
      const A = aabb(get(S[a])), B = aabb(get(S[b]));
      const ox = Math.min(A.r,B.r) - Math.max(A.l,B.l), oy = Math.min(A.b,B.b) - Math.max(A.t,B.t);
      if (ox > 0 && oy > 0){
        const minA = Math.min((A.r-A.l)*(A.b-A.t), (B.r-B.l)*(B.b-B.t));
        if (ox*oy/minA > P.satOverlap){ pos.get(S[b])!.x += dir*(ox*.6 + 6); moved = true; }
      }
    }
    if (!moved) break;
  }
  if (P.id === 'scatter') {
    // Resolve each rear photo against all already-fixed foreground sheets.
    // Zero photo/paper intersections also avoids cumulative multi-card occlusion;
    // paper/paper overlap is deliberately not forbidden.
    S.forEach((i,k) => {
      const foreground=idx.slice(0,k+1);
      for(let pass=0;pass<24;pass++) {
        let moved=false;
        for(const front of foreground) {
          const correction=separation(polygon(get(i),true),polygon(get(front),false));
          if(correction){const p=pos.get(i)!;p.x+=correction.x;p.y+=correction.y;moved=true;}
        }
        if(!moved) break;
      }
      // A bounded escape for rare mutually-constraining corners; group only.
      for(let pass=0;pass<240 && foreground.some(front=>composerPhotoIsOccluded(get(i),get(front)));pass++) pos.get(i)!.x+=dir*12;
    });
  }
  const box = union(idx.map(i => aabb(get(i), P.margin)));
  return { idx, pos, z, cap, box, w: box.r - box.l, h: box.b - box.t };
}

function layoutClusters(members: Member[], h: number, P: Parameters, seed: number, availableW: number, availableH: number): RawLayout{
  const n = members.length, rng = mulberry32(seed);
  const cl = makeClusters(n, h, P, rng), cards = new Array<ComposerCard>(n);
  cl.forEach(c => { for (let k = 0; k < c.size; k++){
    const i = c.start + k, role = k === 0 ? (i === h ? 'hero' : 'lead') : 'small';
    const j = role === 'hero' ? 1 : 1 + (rng() - .5)*2*P.jitter;
    cards[i] = makeCard(i, members[i], role, P.base*(role === 'hero' ? P.heroK : role === 'lead' ? P.leadK : 1)*j, P.id);
  }});
  const s0 = rng() < .5 ? -1 : 1;
  cl.forEach((c, ci) => {
    const sign = (ci % 2 ? -1 : 1)*s0, L = cards[c.start];
    L.rot = L.role === 'hero' ? (rng() < .5 ? -1 : 1)*between(rng, P.rot.hero) : sign*between(rng, P.rot.lead);
    for (let k = 1; k < c.size; k++) cards[c.start+k].rot = (k % 2 ? -sign : sign)*between(rng, P.rot.sat);
  });
  cards.forEach(c => {
    if (P.pins) c.pin = true;
    if (rng() < P.tapeP){
      const corner = c.role !== 'hero' && rng() < .28;
      c.tape = { color: washiFor(rng), x: corner ? (rng() < .5 ? .12 : .88) : .5 + (rng()-.5)*.12,
        w: clamp(c.w*.3, 46, 118), rot: corner ? (rng() < .5 ? -38 : 38) : (rng()-.5)*14 };
      if (c.role === 'hero') c.tape2 = { color: washiFor(rng), x:.88, w: clamp(c.w*.24, 46, 96), rot: 36 };
    }
  });
  const clusterSeed = (ci: number) => (seed ^ Math.imul(ci + 1, 2654435761)) >>> 0;
  const pre = cl.map((c, ci) => buildCluster(c, cards, 1, P, mulberry32(clusterSeed(ci))));
  const heroCi = cl.findIndex(c => c.start === h);
  const avgGap = (P.gap[0] + P.gap[1]) / 2;
  const noteW = P.note ? 270 : 0;
  const total = pre.reduce((a, g) => a + g.w, 0) + avgGap*(cl.length - 1) + noteW;
  const rowH = Math.max(...pre.map(g => g.h)) * (1 + P.wave);
  const estimate = Math.max(1,Math.round(Math.sqrt(total/((availableW/availableH)*rowH))));
  const rowCounts = n<=13 ? Array.from({length:Math.min(3,cl.length)},(_,i)=>i+1)
    : [...new Set([1,estimate-2,estimate-1,estimate,estimate+1,estimate+2].map(v=>clamp(v,1,cl.length)))];
  const templates=cards;
  function arrange(rows: number): RawLayout {
  const cards=templates.map(c=>({...c}));
  const rng=mulberry32(seed ^ 0x5bd1e995);
  const rowOf: number[]=[];
  let ci=0, remaining=total;
  for(let row=0;row<rows;row++){
    const target=remaining/(rows-row); let weight=row===0?noteW:0;
    const first=ci, last=cl.length-(rows-row-1);
    while(ci<last){
      const next=pre[ci].w+avgGap;
      if(row<rows-1 && ci>first && weight+next/2>target) break;
      rowOf[ci++]=row;weight+=next;
    }
    remaining-=weight;
  }
  const smallH = median(cards.filter(c => c.role === 'small').map(c => c.h)) || 240;
  const placed = []; let note: ComposerLayout['note'] = null;
  for (let r = 0; r < rows; r++){
    const dir = P.serpentine && r % 2 ? -1 : 1, list = cl.map((_, ci) => ci).filter(ci => rowOf[ci] === r);
    let cursor = 0; const items: { ci: number; g: ReturnType<typeof buildCluster>; cx: number; cy: number }[] = [], phase = rng()*Math.PI*2;
    if (r === 0 && P.note){ note = { cx: 125, cy: -rowH*.12, rot: -3.5 }; cursor = 250; }
    list.forEach((ci, j) => {
      const g = buildCluster(cl[ci], cards, dir, P, mulberry32(clusterSeed(ci)));
      let gap = (j === 0 && !(r === 0 && P.note)) ? 0 : between(rng, P.gap);
      if (ci === heroCi || list[j-1] === heroCi) gap *= P.heroGapK;
      const cx = cursor + gap + g.w/2; cursor = cx + g.w/2;
      let cy = P.wave*rowH*Math.sin(phase + j*1.75); if (ci === heroCi) cy *= .3;
      items.push({ ci, g, cx, cy });
    });
    if (dir < 0) items.forEach(it => { it.cx = cursor - it.cx; });
    placed.push({ items, w: cursor });
  }
  const maxW = Math.max(...placed.map(p => p.w));
  let top = 0;
  placed.forEach((row, r) => {
    const ox = (maxW - row.w) / 2;
    const boxes = row.items.map(it => ({ l: it.cx - it.g.w/2, r: it.cx + it.g.w/2, t: it.cy - it.g.h/2, b: it.cy + it.g.h/2 }));
    if (r === 0 && note) boxes.push({ l: 0, r: 250, t: note.cy - 90, b: note.cy + 90 });
    const u = union(boxes), dy = top - u.t;
    row.items.forEach(it => {
      const gx = (it.g.box.l + it.g.box.r)/2, gy = (it.g.box.t + it.g.box.b)/2;
      for (const i of it.g.idx){
        const p = it.g.pos.get(i)!, c = cards[i];
        c.x = p.x - gx + it.cx + ox; c.y = p.y - gy + it.cy + dy; c.z = it.g.z.get(i)! + (it.ci === heroCi ? 200 : 0); c.cap = it.g.cap.get(i)!;
      }
    });
    if (r === 0 && note){ note.cx += ox; note.cy += dy; }
    top = u.b + dy + P.rowGapK*smallH;
  });
  // safety: clusters that still collide are pushed apart horizontally
  const clusterOf = new Array(n); cl.forEach((c, ci) => { for (let k = 0; k < c.size; k++) clusterOf[c.start+k] = ci; });
  for (let pass = 0; pass < 30; pass++){
    let moved = false;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++){
      if (clusterOf[a] === clusterOf[b]) continue;
      const A = aabb(cards[a], 6), B = aabb(cards[b], 6);
      const ox = Math.min(A.r,B.r) - Math.max(A.l,B.l), oy = Math.min(A.b,B.b) - Math.max(A.t,B.t);
      if (ox > 0 && oy > 0){
        const shift = (ox < oy ? ox : oy) + 4, horiz = ox < oy, sgn = horiz ? Math.sign(cards[b].x - cards[a].x) || 1 : Math.sign(cards[b].y - cards[a].y) || 1;
        for (let q = 0; q < n; q++) if (clusterOf[q] === clusterOf[b]){ if (horiz) cards[q].x += sgn*shift; else cards[q].y += sgn*shift; }
        moved = true;
      }
    }
    if (!moved) break;
  }
  if(note && heroCi>0){
    const principal=aabb(cards[h],36),paper=aabb({x:note.cx,y:note.cy,w:250,h:160,rot:note.rot},30);
    if(paper.r>principal.l && paper.l<principal.r){
      // A title directly above a later hero can be impossible to frame out.
      // Move only that conflicting paper to the outer opening margin; the
      // gap corresponds to the camera's 40px safe edge plus 8px clearance.
      const scale=Math.min(1.05,availableW/(principal.r-principal.l),availableH/(principal.b-principal.t));
      note.cx=Math.min(note.cx,Math.min(...cards.map(c=>aabb(c,36).l))-48/scale-(paper.r-paper.l)/2);
    }
  }
  const lines: ComposerLayout['lines'] = [];
  if (P.pins) for (let i = 0; i < n; i++){ const c = cards[i]; const a = c.rot*Math.PI/180, py = -c.h/2 + c.f.top*.55; c.px = c.x - Math.sin(a)*py; c.py = c.y + Math.cos(a)*py; }
  if (P.pins) for (let i = 1; i < n; i++) lines.push([cards[i-1].px!, cards[i-1].py!, cards[i].px!, cards[i].py!, i % 2 ? 1 : -1]);
  const hc = cl[heroCi] ? heroCi : 0, nb = cl[hc + 1] ? hc + 1 : hc - 1;
  const focusIdx = cards.map((c, i) => i).filter(i => clusterOf[i] === hc || clusterOf[i] === nb);
  const heroOnly = cards.map((c, i) => i).filter(i => clusterOf[i] === hc);
  return { cards, lines, heroIdx: focusIdx, heroOnly, note, openingCluster:pre[0].idx,
    heroStartsOpeningCluster:heroCi===0, wm:false, defaultView:'hero' };
  }
  const trials=rowCounts.map(rows=>{
    const layout=arrange(rows), boxes=layout.cards.map(c=>aabb(c,36));
    if(layout.note) boxes.push(aabb({x:layout.note.cx,y:layout.note.cy,w:250,h:160,rot:layout.note.rot},30));
    const b=union(boxes),width=b.r-b.l,height=b.b-b.t;
    return {layout,rows,width,height,fitScale:Math.min(availableW/width,availableH/height)};
  });
  const best=trials.reduce((a,b)=>b.fitScale>a.fitScale?b:a);
  return {...best.layout,meta:{selectedRows:best.rows,availableW,availableH,
    candidates:trials.map(({rows,width,height,fitScale})=>({rows,width,height,fitScale}))}};
}
function median(a: number[]){ if (!a.length) return 0; const s = [...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; }

/* ---------- style 3: editorial spread ---------- */
function layoutEditorial(members: Member[], h: number, seed: number, availableW: number, availableH: number): RawLayout{
  const n=members.length,H=980,gap=34,maxSide=Math.max(h,n-h-1,1);
  const estimate=Math.max(2,Math.round(Math.sqrt(maxSide/1.8)));
  const rowCounts=[...new Set((n<=5?[1,2]:n<=14?[2,3]:[estimate-1,estimate,estimate+1])
    .map(rows=>clamp(rows,1,maxSide)))];
  function arrange(targetRows: number): RawLayout {
  // Reuse the same seeded per-photo rotation and spacing in every candidate.
  const rng=mulberry32(seed),cards=new Array<ComposerCard>(n);
  const hm = members[h];
  let hph = H - 70, hpw = hph*hm.r;
  const maxHeroWidth = n>1 && hm.r>=1 ? 820 : 1250;
  if (hpw > maxHeroWidth){ hpw = maxHeroWidth; hph = hpw / hm.r; }
  cards[h] = makeCard(h, hm, 'hero', hpw*hph, 'editorial');
  function block(list: number[], x0: number){
    if (!list.length) return x0;
    const rows = Math.min(targetRows,list.length);
    const rowH = (H - gap*(rows - 1)) / rows, per = Math.ceil(list.length / rows);
    let maxX = x0;
    for (let r = 0; r < rows; r++){
      const seg = list.slice(r*per, (r + 1)*per); let x = x0;
      seg.forEach(i => {
        const m = members[i], fr = frameFor(rowH*.8*m.r, rowH*.8, 'editorial');
        const ph = rowH - fr.top - fr.bottom, pw = Math.min(ph*m.r, ph*2.2);
        // A short prefix/suffix must not turn one auxiliary into a second hero.
        // This editorial-only ceiling balances the one-row and two-row blocks.
        const area=Math.min(pw*ph,cards[h].pw*cards[h].ph*.55);
        const c = makeCard(i, m, 'small', area, 'editorial');
        c.x = x + c.w/2; c.y = r*(rowH + gap) + rowH/2 + (H - (rows*rowH + (rows - 1)*gap))/2;
        c.rot = (rng() - .5)*1.4; c.z = 20 + i;
        cards[i] = c; x += c.w + gap*(.8 + rng()*.5);
      });
      maxX = Math.max(maxX, x - gap);
    }
    return maxX;
  }
  const preEnd = block([...Array(h).keys()], 0);
  const hero = cards[h];
  hero.x = (h ? preEnd + gap*2 : 0) + hero.w/2; hero.y = H/2; hero.rot = 0; hero.z = 400;
  block(Array.from({length: n - h - 1}, (_, k) => h + 1 + k), hero.x + hero.w/2 + gap*2);
  const nearest = (side: ComposerCard[]) => side.sort((a,b)=>Math.hypot(a.x-hero.x,a.y-hero.y)-Math.hypot(b.x-hero.x,b.y-hero.y))[0]?.i;
  const neighbors=[nearest(cards.slice(0,h)),nearest(cards.slice(h+1))].filter((i): i is number=>i!==undefined);
  return { cards, lines:[], heroIdx:[h,...neighbors], heroOnly:[h], note:null, wm:false, defaultView:'hero' };
  }
  const trials=rowCounts.map(rows=>{
    const layout=arrange(rows),b=union(layout.cards.map(c=>aabb(c,36)));
    const width=b.r-b.l,height=b.b-b.t,fitScale=Math.min(1,availableW/width,availableH/height);
    const hero=layout.cards[h],heroArea=hero.pw*hero.ph;
    const auxiliaryArea=median(layout.cards.filter(c=>c.i!==h).map(c=>c.pw*c.ph)) || heroArea;
    // Compare real photo areas after overview scaling, not paper/world area.
    const score=fitScale*fitScale*Math.sqrt(heroArea*auxiliaryArea);
    return {layout,rows,width,height,fitScale,score};
  });
  const best=trials.reduce((a,b)=>b.score>a.score?b:a);
  return {...best.layout,meta:{selectedRows:best.rows,availableW,availableH,
    candidates:trials.map(({rows,width,height,fitScale,score})=>({rows,width,height,fitScale,score}))}};
}



export function buildComposerLayout(
  input: readonly { id: string; aspectRatio: number }[],
  options: { mode: ComposerMode; focusId?: string | null; seed: number; viewportWidth?: number; viewportHeight?: number; viewportTop?: number },
): ComposerLayout {
  if (input.length > 500) throw new RangeError("Composer supports at most 500 photos");
  if (new Set(input.map(m => m.id)).size !== input.length) throw new RangeError("Composer photo IDs must be unique");
  const members = input.map(m => ({id:m.id, r:Number.isFinite(m.aspectRatio) && m.aspectRatio > 0 ? m.aspectRatio : 1}));
  if (!members.length) return {cards:[], lines:[], note:null, heroIdx:[], heroOnly:[], world:{w:1,h:1}};
  const h = Math.max(0, members.findIndex(m => m.id === options.focusId));
  const mobile=options.viewportWidth!==undefined && options.viewportWidth<768;
  const availableW=Math.max(80,(mobile?1440:options.viewportWidth ?? 1440)-80);
  const availableH=mobile?608:Math.max(80,(options.viewportHeight ?? 820)-(options.viewportTop ?? 140)-72);
  const L = options.mode === "editorial" ? layoutEditorial(members,h,options.seed,availableW,availableH)
    : layoutClusters(members,h,options.mode === "scatter" ? P_SCATTER : P_CONST,options.seed,availableW,availableH);
  const width = options.viewportWidth;
  if (width !== undefined && width < 768) {
    const available = Math.max(80,width), inset = 8;
    let top = inset;
    for (const c of L.cards) {
      c.rot = options.mode === "editorial" ? 0 : c.rot*.12;
      // Phone sizes derive from its content width, not a desktop thumbnail cap.
      // Keep actual paper dimensions; natural ratio may make a long photo tall.
      const angle=Math.abs(c.rot)*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
      const side=options.mode === 'editorial'?9:11, bottom=options.mode === 'editorial'?34:43;
      const budget=available-inset*2-48*(cs+sn);
      c.pw=Math.max(1,(budget-2*side*cs-(side+bottom)*sn)/(cs+sn/c.r));c.ph=c.pw/c.r;
      c.f={side,top:side,bottom};c.w=c.pw+2*side;c.h=c.ph+side+bottom;
      if(c.tape)c.tape.w=clamp(c.w*.3,46,96);
      if(c.tape2)c.tape2.w=clamp(c.w*.24,46,80);
      const bounds = aabb(c,24);
      c.x = available/2; c.y = top+(bounds.b-bounds.t)/2;
      top += bounds.b-bounds.t+24;
    }
    // A narrow screen uses natural document flow, never a scaled desktop world.
    return {...L,lines:[],note:null,heroOnly:L.heroOnly ?? [h],world:{w:available,h:top}};
  }
  const boxes = L.cards.map(c => aabb(c,30));
  // The prototype forgot the full rotated title note when normalising and fitting.
  if(L.note) boxes.push(aabb({x:L.note.cx,y:L.note.cy,w:250,h:160,rot:L.note.rot},30));
  const u = union(boxes), pad = 80, dx = pad-u.l, dy = pad-u.t;
  L.cards.forEach(c => {c.x+=dx;c.y+=dy;if(c.px!==undefined)c.px+=dx;if(c.py!==undefined)c.py+=dy;});
  L.lines = L.lines.map(([a,b,c,d,s]) => [a+dx,b+dy,c+dx,d+dy,s]);
  if(L.note){L.note.cx+=dx;L.note.cy+=dy;}
  return {...L,heroOnly:L.heroOnly ?? [h],world:{w:u.r-u.l+pad*2,h:u.b-u.t+pad*2}};
}
