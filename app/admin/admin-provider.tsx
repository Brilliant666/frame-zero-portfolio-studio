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
  useState,
} from "react";
import { cloneSiteContent, siteConfig, type SiteContent } from "../site-config";

export type AdminSavePhase = "loading" | "idle" | "saving" | "success" | "error";

type AdminContextValue = {
  content: SiteContent;
  savedContent: SiteContent;
  setContent: Dispatch<SetStateAction<SiteContent>>;
  phase: AdminSavePhase;
  message: string;
  updatedAt: string | null;
  dirty: boolean;
  busy: boolean;
  editorLabel: string;
  save: () => Promise<boolean>;
  resetToExample: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

function contentFingerprint(content: SiteContent) {
  return JSON.stringify(content);
}

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
}: Readonly<{
  children: ReactNode;
  editorLabel: string;
}>) {
  const [content, setContent] = useState<SiteContent>(() => cloneSiteContent());
  const [savedContent, setSavedContent] = useState<SiteContent>(() => cloneSiteContent());
  const [phase, setPhase] = useState<AdminSavePhase>("loading");
  const [message, setMessage] = useState("正在读取数据库…");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () => contentFingerprint(content) !== contentFingerprint(savedContent),
    [content, savedContent],
  );
  const busy = phase === "loading" || phase === "saving";

  useEffect(() => {
    let cancelled = false;

    fetch("/api/site-content", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("读取失败");
        return response.json() as Promise<{
          content: SiteContent;
          updatedAt: string | null;
          warning?: string;
        }>;
      })
      .then((result) => {
        if (cancelled) return;
        const loaded = cloneSiteContent(result.content);
        setContent(loaded);
        setSavedContent(cloneSiteContent(loaded));
        setUpdatedAt(result.updatedAt);
        setPhase("idle");
        setMessage(result.warning ? "已使用默认数据，数据库暂不可用" : "内容已载入");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "读取失败");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    if (!dirty || busy) return false;

    setPhase("saving");
    setMessage("正在保存到数据库…");

    try {
      const response = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json() as {
        content?: SiteContent;
        updatedAt?: string | null;
        error?: string;
      };
      if (!response.ok || !result.content) throw new Error(result.error ?? "保存失败");

      const saved = cloneSiteContent(result.content);
      setContent(saved);
      setSavedContent(cloneSiteContent(saved));
      setUpdatedAt(result.updatedAt ?? null);
      setPhase("success");
      setMessage("保存成功，主页刷新后会读取最新内容");
      return true;
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "保存失败");
      return false;
    }
  }, [busy, content, dirty]);

  useEffect(() => {
    const handleKeyboardSave = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
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
    setContent(cloneSiteContent(siteConfig));
    setPhase("idle");
    setMessage("示例数据已载入当前草稿，尚未写入数据库");
  }, []);

  const value = useMemo<AdminContextValue>(() => ({
    content,
    savedContent,
    setContent,
    phase,
    message,
    updatedAt,
    dirty,
    busy,
    editorLabel,
    save,
    resetToExample,
  }), [busy, content, dirty, editorLabel, message, phase, resetToExample, save, savedContent, updatedAt]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
