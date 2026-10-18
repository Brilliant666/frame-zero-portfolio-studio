"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { WorkbenchSpace } from "./workbench";
import styles from "./live-preview.module.css";

/**
 * The editor publishes its in-memory draft (unsaved edits included) on its own window; the
 * same-origin preview iframe reads it from window.parent. Nothing is saved or sent anywhere.
 */
export const LIVE_PREVIEW_EVENT = "frame-zero:live-preview";
export type LivePreviewChannel = Partial<Record<WorkbenchSpace, { content: unknown; at: number }>>;
declare global { interface Window { __frameZeroLivePreview?: LivePreviewChannel } }

export function useLivePreviewSource(space: WorkbenchSpace, content: unknown, enabled: boolean) {
  useEffect(() => {
    if (!enabled || content == null) return;
    const timer = window.setTimeout(() => {
      (window.__frameZeroLivePreview ??= {})[space] = { content, at: Date.now() };
      window.dispatchEvent(new Event(LIVE_PREVIEW_EVENT));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [space, content, enabled]);
}

/* Per-browser open/closed preference; unset follows the screen width. */
const PREFERENCE_KEY = "frame-zero:admin-live-preview";
const listeners = new Set<() => void>();
function readOpen() {
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(PREFERENCE_KEY); } catch { /* storage denied */ }
  return stored === "open" || stored !== "closed" && window.innerWidth >= 1600;
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("resize", notify);
  return () => { listeners.delete(notify); window.removeEventListener("resize", notify); };
}
function setOpen(open: boolean) {
  try { window.localStorage.setItem(PREFERENCE_KEY, open ? "open" : "closed"); } catch { /* per page */ }
  listeners.forEach(notify => notify());
}
export function useLivePreviewOpen() {
  return useSyncExternalStore(subscribe, readOpen, () => false);
}

export function LivePreviewToggle() {
  const open = useLivePreviewOpen();
  return <button type="button" className={styles.toggle} aria-pressed={open} onClick={() => setOpen(!open)} data-admin-kit="live-preview-toggle">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /></svg>
    <span>实时预览</span>
  </button>;
}

const DEVICES = { desktop: { width: 1280, label: "桌面" }, phone: { width: 390, label: "手机" } } as const;

export function LivePreviewPane({ src, label }: { src: string; label: string }) {
  const open = useLivePreviewOpen();
  const [device, setDevice] = useState<keyof typeof DEVICES>("desktop");
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = stage.current;
    if (!open || !node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(measure); observer.observe(node); measure();
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    // Editors leave room for the pane on wide screens; on narrow ones it is a sheet over the editor.
    const root = document.documentElement;
    if (open) root.dataset.livePreview = "open"; else delete root.dataset.livePreview;
    return () => { delete root.dataset.livePreview; };
  }, [open]);
  const frameWidth = DEVICES[device].width;
  const scale = size.width ? Math.min(1, (size.width - 24) / frameWidth) : 1;
  const frameHeight = size.height ? (size.height - 24) / scale : 0;
  return <aside className={styles.pane} hidden={!open} aria-label={`${label}实时预览`} data-admin-kit="live-preview">
    <header className={styles.header}>
      <div className={styles.heading}><strong>实时预览</strong><small>包括还没保存的修改 · 仅你可见</small></div>
      <div className={styles.devices} role="radiogroup" aria-label="预览设备">
        {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map(key => <button key={key} type="button" role="radio" aria-checked={device === key} onClick={() => setDevice(key)}>{DEVICES[key].label}</button>)}
      </div>
      <button type="button" className={styles.close} aria-label="关闭实时预览" onClick={() => setOpen(false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <div ref={stage} className={styles.stage}>
      {open && frameHeight > 0 && <div className={styles.device} data-device={device} style={{ width: frameWidth * scale, height: frameHeight * scale }}>
        <iframe title={`${label}实时预览`} src={src} style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }} />
      </div>}
    </div>
  </aside>;
}
