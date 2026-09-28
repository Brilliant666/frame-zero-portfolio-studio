"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cloneSiteContent, siteConfig, type SiteContent } from "../site-config";
import type { SiteEditorScope } from "../site-editor/scope";
import { hydrateConfirmedSiteWorks, hydrateSiteWorks, loadSiteAssets } from "../site-editor/assets-client";
import { confirmDraftSave, DraftSaveRejected, DraftSaveUncertain, writeSiteDraft, type DraftSaveOptions, type DraftSaveReceipt, type PendingDraftSave } from "../site-editor/draft-save";
import {
  canSubmitAdminSave,
  hasAdminChanges,
  isAdminSaveShortcut,
  reconcileAdminSave,
  saveStateAfterDraftChange,
  type AdminLoadState,
  type AdminSaveState,
} from "./admin-state";

type AdminContextValue = {
  siteScope?: SiteEditorScope;
  conflict: boolean;
  content: SiteContent;
  savedContent: SiteContent;
  setContent: Dispatch<SetStateAction<SiteContent>>;
  loadState: AdminLoadState;
  saveState: AdminSaveState;
  message: string;
  updatedAt: string | null;
  dirty: boolean;
  busy: boolean;
  editorLabel: string;
  localPhotoImportOrigin: string | null;
  localPhotoImportState: "configured" | "missing" | "hosted";
  revision: number;
  pendingSave: boolean;
  save: (options?: DraftSaveOptions) => Promise<DraftSaveReceipt | null>;
  checkSave: () => Promise<void>;
  reload: () => Promise<boolean>;
  resetToExample: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function formatSavedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(date);
}

export function AdminProvider({
  children,
  editorLabel,
  localPhotoImportOrigin,
  localPhotoImportState,
  siteScope,
  initialContent,
}: Readonly<{
  children: ReactNode;
  editorLabel: string;
  localPhotoImportOrigin: string | null;
  localPhotoImportState: "configured" | "missing" | "hosted";
  siteScope?: SiteEditorScope;
  initialContent?: SiteContent;
}>) {
  const [content, setContentState] = useState<SiteContent>(() => {
    if (siteScope && !initialContent) throw new Error("Site editor requires an explicit empty document");
    return cloneSiteContent(initialContent);
  });
  const [savedContent, setSavedContent] = useState<SiteContent>(() => cloneSiteContent(content));
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  const endpoint = siteScope?.endpoint ?? "/api/site-content";
  const scoped = Boolean(siteScope);
  const draftVersion = useRef(0);
  const [loadState, setLoadState] = useState<AdminLoadState>("loading");
  const [saveState, setSaveState] = useState<AdminSaveState>("idle");
  const [message, setMessage] = useState("正在读取数据库…");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const contentRef = useRef(content);
  const savingRef = useRef(false);
  const loadRequestRef = useRef(0);
  const lifetime = useRef(new AbortController());
  const pendingRef = useRef<PendingDraftSave | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [endpoint]);

  const replaceContent = useCallback((next: SiteContent) => {
    contentRef.current = next;
    setContentState(next);
  }, []);

  const setContent = useCallback<Dispatch<SetStateAction<SiteContent>>>((action) => {
    draftVersion.current += 1;
    const next = typeof action === "function" ? action(contentRef.current) : action;
    replaceContent(next);
    setSaveState(saveStateAfterDraftChange);
  }, [replaceContent]);

  const dirty = useMemo(
    () => hasAdminChanges(content, savedContent),
    [content, savedContent],
  );
  const busy = loadState !== "ready" || saveState === "saving";

  const reload = useCallback(async () => {
    if (savingRef.current) return false;
    const request = loadRequestRef.current + 1;
    loadRequestRef.current = request;
    const startVersion = draftVersion.current;
    setLoadState("loading");
    setSaveState("idle");
    setMessage("正在读取数据库…");

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("读取失败");
      const result = await response.json() as {
        content: SiteContent;
        updatedAt: string | null;
        warning?: string;
        revision?: number;
      };

      if (request !== loadRequestRef.current) return false;
      if (scoped && draftVersion.current !== startVersion) throw new Error("读取期间有新修改，草稿已保留；请确认后重新读取。");
      if (scoped && (!Number.isSafeInteger(result.revision) || result.revision! < 0 || !result.content || result.warning)) throw new Error("站点草稿响应无效，草稿已保留");
      const loaded = siteScope
        ? hydrateSiteWorks(cloneSiteContent(result.content), (await loadSiteAssets(siteScope.assetsEndpoint)).assets)
        : cloneSiteContent(result.content);
      if (request !== loadRequestRef.current || scoped && draftVersion.current !== startVersion) return false;
      replaceContent(loaded);
      setSavedContent(cloneSiteContent(loaded));
      setUpdatedAt(result.updatedAt);
      setRevision(result.revision ?? 0);
      setConflict(false);
      pendingRef.current = null; setPendingSave(false);
      setLoadState(result.warning ? "degraded" : "ready");
      setMessage(result.warning
        ? "数据库暂不可用；已显示示例数据并暂停编辑，请重新读取"
        : "内容已载入");
      return !result.warning;
    } catch (error: unknown) {
      if (request !== loadRequestRef.current) return false;
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "读取失败");
      return false;
    }
  }, [endpoint, replaceContent, scoped, siteScope]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void reload(), 0);
    return () => {
      window.clearTimeout(timeout);
      loadRequestRef.current += 1;
    };
  }, [reload]);

  const save = useCallback(async (options?: DraftSaveOptions): Promise<DraftSaveReceipt | null> => {
    const submitted = cloneSiteContent(contentRef.current);
    const signal = options?.signal ? AbortSignal.any([options.signal, lifetime.current.signal]) : lifetime.current.signal;
    if (
      savingRef.current
      || conflict
      || pendingRef.current || signal.aborted || loadState !== "ready"
    ) return null;
    if (!canSubmitAdminSave(loadState, saveState, submitted, savedContent)) return siteScope && revision > 0 ? { revision, content: cloneSiteContent(savedContent), updatedAt } : null;

    savingRef.current = true;
    setSaveState("saving");
    setMessage("正在保存修改…");

    try {
      const confirmed = siteScope ? await writeSiteDraft(endpoint, "basic", { content: submitted, expectedRevision: revision }, signal) : null;
      const response = confirmed ? null : await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: submitted, ...(siteScope ? { expectedRevision: revision } : {}) }),
        signal,
      });
      if (siteScope && response?.status === 409) {
        setConflict(true);
        throw new Error("版本冲突：当前草稿已保留。请备份当前修改，再重新读取并人工合并；不会自动覆盖。");
      }
      const result = (confirmed ?? await response!.json()) as {
        content?: SiteContent;
        updatedAt?: string | null;
        error?: string;
        revision?: number;
      };
      if (signal.aborted) return null;
      if (response && !response.ok || !result.content) throw new Error(result.error ?? "保存失败");
      if (siteScope && (!Number.isSafeInteger(result.revision) || result.revision! <= revision)) throw new Error("保存确认版本无效，草稿已保留");

      const saved = siteScope
        ? hydrateConfirmedSiteWorks(cloneSiteContent(result.content), siteScope.assetsEndpoint)
        : cloneSiteContent(result.content);
      const reconciled = reconcileAdminSave(submitted, contentRef.current, saved);
      replaceContent(cloneSiteContent(reconciled.draft));
      setSavedContent(cloneSiteContent(saved));
      setUpdatedAt(result.updatedAt ?? null);
      setRevision(result.revision ?? 0);
      setSaveState("success");
      setMessage(reconciled.changedWhileSaving
        ? "提交版本已保存；保存期间产生的新修改仍未保存"
        : siteScope ? "本站基础版草稿已保存；公开页面未改变" : "保存成功，主页刷新后即显示最新内容");
      return { content: result.content, revision: result.revision ?? 0, updatedAt: result.updatedAt ?? null };
    } catch (error) {
      if (signal.aborted) return null;
      if (error instanceof DraftSaveRejected && error.status === 409) setConflict(true);
      if (error instanceof DraftSaveUncertain) { pendingRef.current = error.pending; setPendingSave(true); }
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "保存失败");
      return null;
    } finally {
      savingRef.current = false;
    }
  }, [conflict, endpoint, loadState, replaceContent, revision, savedContent, saveState, siteScope, updatedAt]);

  const checkSave = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || savingRef.current || !siteScope) return;
    savingRef.current = true;
    try {
      const receipt = await confirmDraftSave(endpoint, "basic", pending, lifetime.current.signal);
      if (lifetime.current.signal.aborted) return;
      const confirmed = hydrateConfirmedSiteWorks(cloneSiteContent(receipt.content as SiteContent), siteScope.assetsEndpoint);
      const reconciled = reconcileAdminSave(pending.content, contentRef.current, confirmed);
      replaceContent(cloneSiteContent(reconciled.draft as SiteContent)); setSavedContent(confirmed); setRevision(receipt.revision); setUpdatedAt(receipt.updatedAt);
      pendingRef.current = null; setPendingSave(false); setSaveState("success"); setMessage("已确认原提交的草稿保存成功；未自动发布。后续编辑仍保留。");
    } catch { if (!lifetime.current.signal.aborted) setMessage("保存结果仍待确认，未再次写入。请保留当前编辑，检查其他标签页；必要时备份后明确重新读取。"); }
    finally { savingRef.current = false; }
  }, [endpoint, replaceContent, siteScope]);

  useEffect(() => {
    if (saveState !== "success") return;
    const timeout = window.setTimeout(() => setSaveState("idle"), 2500);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  useEffect(() => {
    const handleKeyboardSave = (event: KeyboardEvent) => {
      if (!isAdminSaveShortcut(event)) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", handleKeyboardSave);
    return () => window.removeEventListener("keydown", handleKeyboardSave);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const resetToExample = useCallback(() => {
    if (siteScope) return;
    setContent(cloneSiteContent(siteConfig));
    setSaveState("idle");
    setMessage("示例数据已载入当前草稿，尚未写入数据库");
  }, [setContent, siteScope]);

  const value = useMemo<AdminContextValue>(() => ({
    siteScope,
    revision,
    pendingSave,
    checkSave,
    conflict,
    content,
    savedContent,
    setContent,
    loadState,
    saveState,
    message,
    updatedAt,
    dirty,
    busy,
    editorLabel,
    localPhotoImportOrigin,
    localPhotoImportState,
    save,
    reload,
    resetToExample,
  }), [busy, checkSave, conflict, content, dirty, editorLabel, loadState, localPhotoImportOrigin, localPhotoImportState, message, pendingSave, reload, resetToExample, revision, save, savedContent, saveState, setContent, siteScope, updatedAt]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
