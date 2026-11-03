"use client";

import { useEffect, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { ContentSpace } from "./content-schema";
import { confirmDraftSave, DraftSaveRejected, DraftSaveUncertain, editorJson, writeSiteDraft, type DraftSaveOptions, type DraftSaveReceipt, type PendingDraftSave } from "./draft-save";

export type SiteDraftAdapter<T, B> = {
  decodeLoad(body: unknown, signal: AbortSignal): { draft: T; baseline: B; revision: number; updatedAt: string | null } | Promise<{ draft: T; baseline: B; revision: number; updatedAt: string | null }>;
  prepare(draft: T): T;
  accept(submitted: T, current: T, receipt: DraftSaveReceipt): { draft: T; baseline: B; changedWhileSaving: boolean };
  dirty(draft: T, baseline: B): boolean;
};
export type SiteDraftResult = { status: "loaded" } | { status: "saved"; receipt: DraftSaveReceipt; changedWhileSaving: boolean } | { status: "error"; error: unknown } | { status: "ignored" };
export class DraftLoadRejected extends Error {
  constructor(public status: number) { super("Draft load rejected"); }
}
export class DraftLoadChanged extends Error {
  constructor() { super("Draft changed while loading"); }
}
type SiteDraftOptions<T, B> = { endpoint: string; space: ContentSpace; initial: () => { draft: T; baseline: B }; adapter: SiteDraftAdapter<T, B> };
type DraftState<T, B> = { draft: T; baseline: B; revision: number; updatedAt: string | null; loadState: "loading" | "ready" | "error"; saving: boolean; conflict: boolean; pending: PendingDraftSave | null };
const ignored = { status: "ignored" } as const;

function snapshot<T>(value: T): T {
  const freeze = (item: unknown) => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  const copy = structuredClone(value);
  freeze(copy);
  return copy;
}

// Exported so async ordering is tested directly; React only owns subscription and lifetime.
export function createSiteDraftSession<T, B>({ endpoint, space, initial, adapter: firstAdapter }: SiteDraftOptions<T, B>) {
  let adapter = firstAdapter;
  let state: DraftState<T, B> = { ...initial(), revision: 0, updatedAt: null, loadState: "loading", saving: false, conflict: false, pending: null };
  const current = { current: state.draft }, lifetime = { current: new AbortController() };
  const listeners = new Set<() => void>();
  let active = false, generation = 0, edits = 0;
  let lock: symbol | null = null;
  let pending: PendingDraftSave | null = null;
  let submitted: T;
  const publish = (patch: Partial<DraftState<T, B>>) => {
    state = { ...state, ...patch };
    current.current = state.draft;
    listeners.forEach(listener => listener());
  };
  const setDraft: Dispatch<SetStateAction<T>> = next => {
    if (lifetime.current.signal.aborted) return;
    const draft = typeof next === "function" ? (next as (draft: T) => T)(current.current) : next;
    edits++;
    publish({ draft });
  };
  function operation(signal?: AbortSignal) {
    const id = ++generation, life = lifetime.current, controller = new AbortController();
    const abort = () => controller.abort(signal?.aborted ? signal.reason : life.signal.reason);
    for (const source of [life.signal, signal]) {
      if (source?.aborted) abort();
      else source?.addEventListener("abort", abort, { once: true });
    }
    return {
      signal: controller.signal,
      current: () => active && generation === id && lifetime.current === life && !controller.signal.aborted,
      check: () => { controller.signal.throwIfAborted(); },
      dispose: () => { life.signal.removeEventListener("abort", abort); signal?.removeEventListener("abort", abort); },
    };
  }
  async function reload(signal?: AbortSignal): Promise<SiteDraftResult> {
    if (!active || lock || signal?.aborted) return ignored;
    const op = operation(signal), startedAt = edits;
    publish({ loadState: "loading" });
    try {
      op.check();
      const { response, body } = await editorJson(endpoint, { cache: "no-store" }, op.signal);
      if (!op.current()) return ignored;
      op.check();
      if (!response.ok) throw new DraftLoadRejected(response.status);
      if (edits !== startedAt) throw new DraftLoadChanged();
      const loaded = await adapter.decodeLoad(body, op.signal);
      if (!op.current()) return ignored;
      op.check();
      if (edits !== startedAt) throw new DraftLoadChanged();
      pending = null;
      publish({ ...loaded, loadState: "ready", conflict: false, pending });
      return { status: "loaded" };
    } catch (error) {
      if (!op.current()) return ignored;
      publish({ loadState: "error" });
      return { status: "error", error: error instanceof DraftLoadRejected || edits === startedAt ? error : new DraftLoadChanged() };
    } finally { op.dispose(); }
  }
  async function persist(checking: boolean, options: DraftSaveOptions = {}): Promise<SiteDraftResult> {
    if (!active || lock || options.signal?.aborted || (checking ? !pending : state.loadState !== "ready" || pending || state.conflict)) return ignored;
    const token = Symbol(), op = operation(options.signal);
    lock = token;
    publish({ saving: true });
    try {
      op.check();
      let candidate = pending;
      let sent = submitted;
      if (!checking) {
        sent = snapshot(adapter.prepare(structuredClone(current.current)));
        candidate = Object.freeze({ content: sent, expectedRevision: state.revision });
      }
      if (!op.current()) return ignored;
      op.check();
      submitted = sent;
      const receipt = await (checking ? confirmDraftSave(endpoint, space, candidate!, op.signal) : writeSiteDraft(endpoint, space, candidate!, op.signal));
      if (!op.current()) return ignored;
      op.check();
      const accepted = adapter.accept(sent, current.current, receipt);
      if (!op.current()) return ignored;
      op.check();
      pending = null;
      publish({ draft: accepted.draft, baseline: accepted.baseline, revision: receipt.revision, updatedAt: receipt.updatedAt, loadState: "ready", pending, conflict: false });
      return { status: "saved", receipt, changedWhileSaving: accepted.changedWhileSaving };
    } catch (error) {
      if (!op.current()) return ignored;
      if (error instanceof DraftSaveUncertain) pending = error.pending;
      publish({ pending, conflict: state.conflict || error instanceof DraftSaveRejected && error.status === 409 });
      return { status: "error", error };
    } finally {
      op.dispose();
      if (lock === token) { lock = null; publish({ saving: false }); }
    }
  }
  return {
    current, lifetime, setDraft, reload,
    save: (options?: DraftSaveOptions) => persist(false, options),
    checkSave: () => persist(true),
    getSnapshot: () => state,
    getSignal: () => lifetime.current.signal,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setAdapter: (next: SiteDraftAdapter<T, B>) => { adapter = next; },
    activate: () => {
      if (active) return;
      active = true;
      lifetime.current = new AbortController();
      publish({ loadState: "loading" });
    },
    deactivate: () => {
      active = false;
      generation++;
      lifetime.current.abort();
      lock = null;
      publish({ saving: false });
    },
  };
}

export function useSiteDraft<T, B>(options: SiteDraftOptions<T, B>) {
  const { endpoint, space } = options;
  // Endpoint/space identify a session; initial and adapter identity never trigger a reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const session = useMemo(() => createSiteDraftSession(options), [endpoint, space]);
  session.setAdapter(options.adapter);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => { void session.activate(); return session.deactivate; }, [session]);
  return { ...state, current: session.current, lifetime: session.lifetime, getSnapshot: session.getSnapshot, getSignal: session.getSignal, setDraft: session.setDraft, reload: session.reload, save: session.save, checkSave: session.checkSave };
}
