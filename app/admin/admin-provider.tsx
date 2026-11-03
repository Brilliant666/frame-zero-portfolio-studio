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
import { type DraftSaveOptions, type DraftSaveReceipt } from "../site-editor/draft-save";
import { useBasicSiteSession } from "./site-draft-session";
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

type AdminProviderProps = Readonly<{
  children: ReactNode;
  editorLabel: string;
  localPhotoImportOrigin: string | null;
  localPhotoImportState: "configured" | "missing" | "hosted";
  siteScope?: SiteEditorScope;
  initialContent?: SiteContent;
}>;
export function AdminProvider(props: AdminProviderProps) {
  if (props.siteScope) {
    if (!props.initialContent) throw new Error("Site editor requires an explicit empty document");
    return <SiteAdminProvider key={props.siteScope.endpoint} {...props} siteScope={props.siteScope} initialContent={props.initialContent} />;
  }
  return <LegacyAdminProvider {...props} />;
}
function SiteAdminProvider({ children, editorLabel, localPhotoImportOrigin, localPhotoImportState, siteScope, initialContent }: AdminProviderProps & { siteScope: SiteEditorScope; initialContent: SiteContent }) {
  const session = useBasicSiteSession(siteScope, initialContent);
  useAdminInteractions(session.save, session.dirty, session.saveState, session.setSaveState);
  const value: AdminContextValue = { ...session, siteScope, editorLabel, localPhotoImportOrigin, localPhotoImportState };
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
function LegacyAdminProvider({ children, editorLabel, localPhotoImportOrigin, localPhotoImportState, initialContent }: AdminProviderProps) {
  const [content, setContentState] = useState<SiteContent>(() => {
    return cloneSiteContent(initialContent);
  });
  const [savedContent, setSavedContent] = useState<SiteContent>(() => cloneSiteContent(content));
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  const endpoint = "/api/site-content";
  const [loadState, setLoadState] = useState<AdminLoadState>("loading");
  const [saveState, setSaveState] = useState<AdminSaveState>("idle");
  const [message, setMessage] = useState("正在读取数据库…");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const contentRef = useRef(content);
  const savingRef = useRef(false);
  const loadRequestRef = useRef(0);
  const lifetime = useRef(new AbortController());
  const pendingSave = false;
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [endpoint]);

  const replaceContent = useCallback((next: SiteContent) => {
    contentRef.current = next;
    setContentState(next);
  }, []);

  const setContent = useCallback<Dispatch<SetStateAction<SiteContent>>>((action) => {
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
      const loaded = cloneSiteContent(result.content);
      replaceContent(loaded);
      setSavedContent(cloneSiteContent(loaded));
      setUpdatedAt(result.updatedAt);
      setRevision(result.revision ?? 0);
      setConflict(false);
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
  }, [replaceContent]);

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
      || signal.aborted || loadState !== "ready"
    ) return null;
    if (!canSubmitAdminSave(loadState, saveState, submitted, savedContent)) return null;

    savingRef.current = true;
    setSaveState("saving");
    setMessage("正在保存修改…");

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: submitted }),
        signal,
      });
      const result = (await response.json()) as {
        content?: SiteContent;
        updatedAt?: string | null;
        error?: string;
        revision?: number;
      };
      if (signal.aborted) return null;
      if (response && !response.ok || !result.content) throw new Error(result.error ?? "保存失败");

      const saved = cloneSiteContent(result.content);
      const reconciled = reconcileAdminSave(submitted, contentRef.current, saved);
      replaceContent(cloneSiteContent(reconciled.draft));
      setSavedContent(cloneSiteContent(saved));
      setUpdatedAt(result.updatedAt ?? null);
      setRevision(result.revision ?? 0);
      setSaveState("success");
      setMessage(reconciled.changedWhileSaving
        ? "提交版本已保存；保存期间产生的新修改仍未保存"
        : "保存成功，主页刷新后即显示最新内容");
      return { content: result.content, revision: result.revision ?? 0, updatedAt: result.updatedAt ?? null };
    } catch (error) {
      if (signal.aborted) return null;
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "保存失败");
      return null;
    } finally {
      savingRef.current = false;
    }
  }, [conflict, loadState, replaceContent, savedContent, saveState]);
  const checkSave = useCallback(async () => {}, []);
  useAdminInteractions(save, dirty, saveState, setSaveState);

  const resetToExample = useCallback(() => {
    setContent(cloneSiteContent(siteConfig));
    setSaveState("idle");
    setMessage("示例数据已载入当前草稿，尚未写入数据库");
  }, [setContent]);

  const value = useMemo<AdminContextValue>(() => ({
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
  }), [busy, checkSave, conflict, content, dirty, editorLabel, loadState, localPhotoImportOrigin, localPhotoImportState, message, pendingSave, reload, resetToExample, revision, save, savedContent, saveState, setContent, updatedAt]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

function useAdminInteractions(save: AdminContextValue["save"], dirty: boolean, saveState: AdminSaveState, setSaveState: Dispatch<SetStateAction<AdminSaveState>>) {
  useEffect(() => {
    if (saveState !== "success") return;
    const timeout = window.setTimeout(() => setSaveState("idle"), 2500);
    return () => window.clearTimeout(timeout);
  }, [saveState, setSaveState]);

  useEffect(() => {
    const handleKeyboardSave = (event: KeyboardEvent) => {
      if (!isAdminSaveShortcut(event)) return;
      event.preventDefault();
      if (Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open]')).some(element => element.getClientRects().length > 0)) return;
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

}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
