"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { shouldAutosave, type AutosaveInput } from "./autosave-policy";

export { shouldAutosave };

/** Per-browser preference. Absent means on; people (and manual-save test suites) may turn it off. */
export const AUTOSAVE_PREFERENCE_KEY = "frame-zero:admin-autosave";
export const AUTOSAVE_DELAY_MS = 1500;

const listeners = new Set<() => void>();
function readPreference() {
  try { return window.localStorage.getItem(AUTOSAVE_PREFERENCE_KEY) !== "off"; } catch { return true; }
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  const storage = (event: StorageEvent) => { if (event.key === AUTOSAVE_PREFERENCE_KEY) notify(); };
  window.addEventListener("storage", storage);
  return () => { listeners.delete(notify); window.removeEventListener("storage", storage); };
}
export function setAutosavePreference(enabled: boolean) {
  try {
    if (enabled) window.localStorage.removeItem(AUTOSAVE_PREFERENCE_KEY);
    else window.localStorage.setItem(AUTOSAVE_PREFERENCE_KEY, "off");
  } catch { /* Private browsing: the switch still applies to this page. */ }
  listeners.forEach(notify => notify());
}
/** Server render and hydration see "off", so no save is ever scheduled before the draft is loaded. */
export function useAutosavePreference() {
  return useSyncExternalStore(subscribe, readPreference, () => false);
}

/**
 * Saves the draft through the editor's own save() after a quiet pause. save() keeps every guard:
 * revision checks, conflict and pending-confirmation states, and reconciling edits made while saving.
 * A save that returns null (refused or failed) is not retried until the draft changes again.
 */
export function useDraftAutosave({ enabled, dirty, blocked, version, save, delay = AUTOSAVE_DELAY_MS }: Omit<AutosaveInput, "failedVersion"> & { save: () => Promise<unknown>; delay?: number }) {
  const saveRef = useRef(save);
  const failedVersion = useRef<unknown>(undefined);
  const latest = useRef({ enabled, dirty, blocked, version });
  useEffect(() => { saveRef.current = save; latest.current = { enabled, dirty, blocked, version }; });
  const attempt = useRef(async (forVersion: unknown) => {
    const result = await saveRef.current();
    if (result === null) failedVersion.current = forVersion;
  });
  useEffect(() => {
    if (!shouldAutosave({ enabled, dirty, blocked, version, failedVersion: failedVersion.current })) return;
    const timer = window.setTimeout(() => void attempt.current(version), delay);
    return () => window.clearTimeout(timer);
  }, [enabled, dirty, blocked, version, delay]);
  useEffect(() => {
    // Leaving the tab is the moment edits are most likely to be lost: save now instead of after the pause.
    const hidden = () => {
      const state = latest.current;
      if (document.visibilityState === "hidden" && shouldAutosave({ ...state, failedVersion: failedVersion.current })) void attempt.current(state.version);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
}
