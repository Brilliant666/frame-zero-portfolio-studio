import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Observation only: never scrolls, focuses, changes layout or waits for recovery.
// The optional directory must be an existing private/CI evidence directory.
export async function createPreviewReturnDiagnostics(page, { port, cover, label = 'preview-return', outputDirectory = process.env.FRAME_ZERO_BROWSER_OUTPUT_DIR }) {
  const key = `__previewReturnProbe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await page.evaluate(({ key, port, cover }) => {
    const rows = [], nodes = new WeakMap();
    let sequence = 0, dropped = 0, finished = false;
    const timers = new Set(), frames = new Set();
    const coverId = cover.getAttribute('data-motion-cover');
    const identify = node => {
      if (!node) return null;
      if (!nodes.has(node)) nodes.set(node, ++sequence);
      return { identity: nodes.get(node), tag: node.tagName, id: node.id || null,
        role: node.getAttribute?.('role'), label: node.getAttribute?.('aria-label'),
        coverId: node.getAttribute?.('data-motion-cover'), cardId: node.getAttribute?.('data-card-id'), connected: node.isConnected };
    };
    const rect = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const sample = (stage, detail = null, eventTarget = null) => {
      if (finished) return;
      // Leave room for explicit phases even when scroll events are frequent.
      if (rows.length >= 100 || (stage === 'event:scroll' && rows.length >= 75)) { dropped++; return; }
      const current = [...port.querySelectorAll('[data-motion-cover]')].find(node => node.getAttribute('data-motion-cover') === coverId);
      const image = current?.querySelector('img');
      const scrollAncestors = [];
      for (let node = (current ?? port.querySelector('[data-card-id]'))?.parentElement; node && node !== document.body; node = node.parentElement) {
        if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) scrollAncestors.push({ ...identify(node), scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight });
      }
      rows.push({ stage, time: performance.now(), detail, port: { ...identify(port), scrollTop: port.scrollTop,
        scrollHeight: port.scrollHeight, clientHeight: port.clientHeight, rect: rect(port), overflowY: getComputedStyle(port).overflowY },
        windowY: scrollY, scrollAncestors, coverId, originalCoverConnected: cover.isConnected, cover: identify(current), coverRect: rect(current),
        active: identify(document.activeElement), target: identify(eventTarget),
        image: image ? { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: image.width, height: image.height, rect: rect(image) } : null,
        bodyOverflow: document.body.style.overflow, bodyComputedOverflow: getComputedStyle(document.body).overflow,
        locked: document.body.classList.contains('is-locked'), previewTheme: document.documentElement.dataset.previewTheme ?? null,
        starTheme: document.documentElement.dataset.starTheme ?? null, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, visibility: document.visibilityState,
        covers: [...port.querySelectorAll('[data-motion-cover]')].map(node => node.getAttribute('data-motion-cover')) });
    };
    const capture = event => {
      if (!(event.target instanceof Element) || !port.contains(event.target)) return;
      const target = event.target.closest('button,a') ?? event.target;
      sample(`event:${event.type}`, null, target);
      if (event.type === 'click' && target.textContent?.trim() === '← 返回图集首页') {
        const frame = index => {
          const id = requestAnimationFrame(() => { frames.delete(id); sample(`return:rAF${index}`); if (index < 3) frame(index + 1); });
          frames.add(id);
        };
        frame(1);
        const timer = setTimeout(() => { timers.delete(timer); sample('return:100ms'); }, 100);
        timers.add(timer);
      }
    };
    const scrolled = () => sample('event:scroll');
    const events = ['pointerdown', 'mousedown', 'click', 'focusin'];
    for (const name of events) document.addEventListener(name, capture, true);
    port.addEventListener('scroll', scrolled, { passive: true });
    window[key] = { sample, finish: () => {
      sample('diagnostics:finish'); finished = true;
      for (const name of events) document.removeEventListener(name, capture, true);
      port.removeEventListener('scroll', scrolled);
      for (const timer of timers) clearTimeout(timer);
      for (const frame of frames) cancelAnimationFrame(frame);
      return { userAgent: navigator.userAgent, dropped, samples: rows };
    } };
    sample('diagnostics:installed');
  }, { key, port: await port.elementHandle(), cover: await cover.elementHandle() });
  return {
    sample: (stage, detail = null) => page.evaluate(({ key, stage, detail }) => window[key]?.sample(stage, detail), { key, stage, detail }),
    async finish(result, error) {
      const observation = await page.evaluate(key => { const value = window[key]?.finish(); delete window[key]; return value; }, key);
      const report = { label, result, error: error ? String(error.message ?? error) : null,
        browserVersion: page.context().browser()?.version() ?? null, ...observation };
      if (outputDirectory) {
        const file = join(outputDirectory, `${label.replace(/[^a-z0-9_-]/gi, '-')}-${process.pid}.json`);
        await writeFile(file, JSON.stringify(report, null, 2));
        console.log(`[preview-return] ${result} evidence ${file}`);
      } else console.log(`[preview-return] ${JSON.stringify(report)}`);
      return report;
    },
  };
}
