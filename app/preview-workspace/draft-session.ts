"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEmptyPreviewDocument, parsePreviewDocument, type PreviewPortfolioDocumentV1 } from "./document";
import { previewIsDirty, reconcilePreviewSave } from "./admin-state";
import { parseSitePremiumDocument } from "../site-editor/content-schema";
import { type DraftSaveOptions, type DraftSaveReceipt } from "../site-editor/draft-save";
import { DraftLoadChanged, DraftLoadRejected, useSiteDraft, type SiteDraftAdapter } from "../site-editor/use-site-draft";

type Document = PreviewPortfolioDocumentV1;
type Envelope = { content: Document | null; revision: number; updatedAt: string | null };
function readEnvelope(value: unknown, siteMode = false): Envelope {
  if (!value || typeof value !== "object") throw new Error("新版数据响应格式错误，草稿未改变。");
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || !(raw.updatedAt === null || typeof raw.updatedAt === "string")) throw new Error("新版版本信息无效，草稿未改变。");
  return { content: raw.content === null ? null : siteMode ? parseSitePremiumDocument(raw.content) : parsePreviewDocument(raw.content), revision: raw.revision as number, updatedAt: raw.updatedAt };
}
const isDirty = (draft: Document, saved: Document | null) => previewIsDirty(draft, saved ?? createEmptyPreviewDocument());
const initial = () => ({ draft: createEmptyPreviewDocument(), baseline: null as Document | null });
const adapter: SiteDraftAdapter<Document, Document | null> = {
  decodeLoad(body) {
    const result = readEnvelope(body, true);
    return { draft: result.content ?? createEmptyPreviewDocument(), baseline: result.content, revision: result.revision, updatedAt: result.updatedAt };
  },
  prepare: parseSitePremiumDocument,
  accept(submitted, current, receipt) {
    const result = reconcilePreviewSave(submitted, current, parseSitePremiumDocument(receipt.content));
    return { draft: result.draft, baseline: result.saved, changedWhileSaving: result.changedWhileSaving };
  },
  dirty: isDirty,
};

export function useSitePolaroidSession(endpoint: string) {
  const state = useSiteDraft({ endpoint, space: "premium-polaroid", initial, adapter });
  const { reload: read, save: write, checkSave: confirm, getSnapshot } = state;
  const [message, setMessage] = useState("正在读取新版工作区…");
  const reload = useCallback(async () => {
    if (getSnapshot().saving) return;
    setMessage("正在读取新版保存内容…");
    const result = await read();
    if (result.status === "loaded") setMessage("");
    if (result.status === "error") setMessage(result.error instanceof DraftLoadRejected ? "新版内容读取失败；没有载入默认数据，也不会覆盖草稿。" : result.error instanceof DraftLoadChanged ? "读取期间草稿发生变化，未覆盖。请再次明确重新读取。" : result.error instanceof Error ? result.error.message : "读取失败；草稿保留。");
  }, [getSnapshot, read]);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer); }, [reload]);
  const save = useCallback(async (options?: DraftSaveOptions, forPublication = false): Promise<DraftSaveReceipt | null> => {
    const value = getSnapshot();
    if (value.saving || value.loadState !== "ready" || value.conflict || value.pending || options?.signal?.aborted) return null;
    if (!isDirty(value.draft, value.baseline)) return value.baseline && value.revision > 0 ? { content: value.baseline, revision: value.revision, updatedAt: value.updatedAt } : null;
    setMessage(forPublication ? "" : "正在保存新版修改…");
    const result = await write(options);
    if (result.status === "saved") {
      setMessage(forPublication ? "" : result.changedWhileSaving ? "提交的版本已保存；保存期间的新编辑仍保留为未保存修改。" : "本站星轨草稿已保存。基础版内容和公开页面未改变。");
      return result.receipt;
    }
    if (result.status === "error") setMessage(result.error instanceof Error ? result.error.message : "保存失败；草稿保留。");
    return null;
  }, [getSnapshot, write]);
  const checkSave = useCallback(async () => {
    const result = await confirm();
    if (result.status === "saved") setMessage("已确认原提交的草稿保存成功；未自动发布。后续编辑仍保留。");
    if (result.status === "error") setMessage("保存结果仍待确认，未再次写入。请保留当前编辑，检查其他标签页；必要时导出后明确重新读取。");
  }, [confirm]);
  return { draft: state.draft, saved: state.baseline, revision: state.revision, updatedAt: state.updatedAt, loadState: state.loadState,
    saving: state.saving, conflict: state.conflict, current: state.current, lifetime: state.lifetime, pendingSave: Boolean(state.pending),
    dirty: isDirty(state.draft, state.baseline), edit: state.setDraft, message, setMessage, reload, save, checkSave };
}

// The independent preview keeps its own envelope, raw PUT and manual-save semantics.
export function usePreviewDraftSession() {
  const endpoint = "/api/preview/site-content";
  const [draft, setDraft] = useState(createEmptyPreviewDocument);
  const [saved, setSaved] = useState<Document | null>(null);
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("正在读取新版工作区…");
  const current = useRef(draft), savingLock = useRef(false), readingLock = useRef(false), draftVersion = useRef(0), requestNumber = useRef(0);
  const lifetime = useRef(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const dirty = isDirty(draft, saved);
  const edit = useCallback((transform: (value: Document) => Document) => {
    const next = transform(current.current);
    current.current = next; draftVersion.current += 1; setDraft(next);
  }, []);
  const reload = useCallback(async () => {
    if (savingLock.current || readingLock.current) return;
    readingLock.current = true;
    const request = ++requestNumber.current, startVersion = draftVersion.current;
    setLoadState("loading"); setMessage("正在读取新版保存内容…");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("新版内容读取失败；没有载入默认数据，也不会覆盖草稿。");
      const result = readEnvelope(await response.json());
      if (request !== requestNumber.current) return;
      if (draftVersion.current !== startVersion) throw new Error("读取期间草稿发生变化，未覆盖。请再次明确重新读取。");
      const next = result.content ?? createEmptyPreviewDocument();
      current.current = next; draftVersion.current += 1; setDraft(next); setSaved(result.content); setRevision(result.revision); setUpdatedAt(result.updatedAt);
      setConflict(false); setLoadState("ready"); setMessage(result.content ? "新版内容已读取。保存只影响 /preview。" : "尚未配置新版。请填写资料、新建图集后保存；不会自动复制旧站。");
    } catch (error) { if (request === requestNumber.current) { setLoadState("error"); setMessage(error instanceof Error ? error.message : "读取失败；草稿保留。"); } }
    finally { readingLock.current = false; }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => { clearTimeout(timer); requestNumber.current += 1; }; }, [reload]);
  const save = useCallback(async (options?: DraftSaveOptions, forPublication = false): Promise<DraftSaveReceipt | null> => {
    const signal = options?.signal ? AbortSignal.any([options.signal, lifetime.current.signal]) : lifetime.current.signal;
    if (savingLock.current || loadState !== "ready" || conflict || signal.aborted) return null;
    if (!dirty) return saved && revision > 0 ? { content: saved, revision, updatedAt } : null;
    let submitted: Document;
    try { submitted = parsePreviewDocument(current.current); }
    catch (error) { setMessage(error instanceof Error ? error.message : "内容校验失败，草稿保留。"); return null; }
    savingLock.current = true; setSaving(true); setMessage(forPublication ? "" : "正在保存新版修改…");
    try {
      const response = await fetch(endpoint, { method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: submitted, expectedRevision: revision }) });
      if (response.status === 409) { setConflict(true); throw new Error("版本冲突：其他标签页已保存新版本。当前草稿已保留；请先导出草稿，再重新读取并人工合并。不会自动覆盖。"); }
      const body: unknown = await response.json();
      if (signal.aborted) return null;
      if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "保存失败；草稿保留。");
      const result = readEnvelope(body);
      if (!result.content || result.revision <= revision) throw new Error("未收到有效保存确认，草稿保留；请核对重新读取。");
      const reconciled = reconcilePreviewSave(submitted, current.current, result.content);
      current.current = reconciled.draft; draftVersion.current += 1; setDraft(reconciled.draft); setSaved(reconciled.saved); setRevision(result.revision); setUpdatedAt(result.updatedAt);
      setMessage(forPublication ? "" : reconciled.changedWhileSaving ? "提交的版本已保存；保存期间的新编辑仍保留为未保存修改。" : "新版保存成功。/preview 刷新后读取此版本；旧站内容未改变。");
      return { content: result.content, revision: result.revision, updatedAt: result.updatedAt };
    } catch (error) { if (!signal.aborted) setMessage(error instanceof Error ? error.message : "保存失败；草稿保留。"); return null; }
    finally { savingLock.current = false; if (!signal.aborted) setSaving(false); }
  }, [conflict, dirty, loadState, revision, saved, updatedAt]);
  return { draft, saved, revision, updatedAt, loadState, saving, conflict, current, lifetime, pendingSave: false,
    dirty, edit, message, setMessage, reload, save, checkSave: async () => {} };
}
export type PolaroidDraftSession = Omit<ReturnType<typeof useSitePolaroidSession>, "edit"> & {
  edit: (transform: (value: Document) => Document) => void;
};
