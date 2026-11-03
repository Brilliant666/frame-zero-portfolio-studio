"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { cloneSiteContent, type SiteContent } from "../site-config";
import type { SiteEditorScope } from "../site-editor/scope";
import { hydrateConfirmedSiteWorks, hydrateSiteWorks, loadSiteAssets } from "../site-editor/assets-client";
import { readSaveReceipt, type DraftSaveOptions, type DraftSaveReceipt } from "../site-editor/draft-save";
import { DraftLoadChanged, DraftLoadRejected, useSiteDraft, type SiteDraftAdapter } from "../site-editor/use-site-draft";
import { useAutosavePreference, useDraftAutosave } from "../admin-kit/autosave";
import { hasAdminChanges, reconcileAdminSave, saveStateAfterDraftChange, type AdminSaveState } from "./admin-state";

export function useBasicSiteSession(siteScope: SiteEditorScope, initialContent: SiteContent) {
  const assetsEndpoint = siteScope.assetsEndpoint;
  const adapter = useMemo<SiteDraftAdapter<SiteContent, SiteContent>>(() => ({
    async decodeLoad(body, signal) {
      if (body && typeof body === "object" && "warning" in body && body.warning) throw new Error("站点草稿响应无效，草稿已保留");
      const receipt = readSaveReceipt(body, "basic");
      const assets = await loadSiteAssets(assetsEndpoint, signal);
      signal.throwIfAborted();
      const draft = hydrateSiteWorks(cloneSiteContent(receipt.content as SiteContent), assets.assets);
      return { draft, baseline: cloneSiteContent(draft), revision: receipt.revision, updatedAt: receipt.updatedAt };
    },
    prepare: cloneSiteContent,
    accept(submitted, current, receipt) {
      const saved = hydrateConfirmedSiteWorks(cloneSiteContent(receipt.content as SiteContent), assetsEndpoint);
      const result = reconcileAdminSave(submitted, current, saved);
      return { draft: cloneSiteContent(result.draft), baseline: cloneSiteContent(saved), changedWhileSaving: result.changedWhileSaving };
    },
    dirty: hasAdminChanges,
  }), [assetsEndpoint]);
  const state = useSiteDraft({ endpoint: siteScope.endpoint, space: "basic", adapter,
    initial: () => ({ draft: cloneSiteContent(initialContent), baseline: cloneSiteContent(initialContent) }) });
  const { getSnapshot, setDraft, reload: read, save: write, checkSave: confirm } = state;
  const [saveState, setSaveState] = useState<AdminSaveState>("idle");
  const [message, setMessage] = useState("正在读取数据库…");
  const setContent = useCallback<Dispatch<SetStateAction<SiteContent>>>(action => {
    setDraft(action);
    setSaveState(saveStateAfterDraftChange);
  }, [setDraft]);
  const reload = useCallback(async () => {
    if (getSnapshot().saving) return false;
    setSaveState("idle"); setMessage("正在读取数据库…");
    const result = await read();
    if (result.status === "loaded") { setMessage("内容已载入"); return true; }
    if (result.status === "error") {
      const error = result.error;
      setMessage(error instanceof DraftLoadChanged ? "读取期间有新修改，草稿已保留；请确认后重新读取。" : error instanceof DraftLoadRejected ? "读取失败" : error instanceof Error ? error.message : "读取失败");
    }
    return false;
  }, [getSnapshot, read]);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer); }, [reload]);
  const save = useCallback(async (options?: DraftSaveOptions): Promise<DraftSaveReceipt | null> => {
    const value = getSnapshot();
    if (value.saving || value.conflict || value.pending || value.loadState !== "ready" || options?.signal?.aborted) return null;
    if (!hasAdminChanges(value.draft, value.baseline)) return value.revision > 0 ? { revision: value.revision, content: cloneSiteContent(value.baseline), updatedAt: value.updatedAt } : null;
    setSaveState("saving"); setMessage("正在保存修改…");
    const result = await write(options);
    if (result.status === "saved") {
      setSaveState("success");
      setMessage(result.changedWhileSaving ? "提交版本已保存；保存期间产生的新修改仍未保存" : "本站基础版草稿已保存；公开页面未改变");
      return result.receipt;
    }
    if (result.status === "error") { setSaveState("error"); setMessage(result.error instanceof Error ? result.error.message : "保存失败"); }
    return null;
  }, [getSnapshot, write]);
  const checkSave = useCallback(async () => {
    const result = await confirm();
    if (result.status === "saved") { setSaveState("success"); setMessage("已确认原提交的草稿保存成功；未自动发布。后续编辑仍保留。"); }
    if (result.status === "error") setMessage("保存结果仍待确认，未再次写入。请保留当前编辑，检查其他标签页；必要时备份后明确重新读取。");
  }, [confirm]);
  const dirty = hasAdminChanges(state.draft, state.baseline);
  const autosave = useAutosavePreference();
  useDraftAutosave({ enabled: autosave, dirty, version: state.draft, save: () => save(),
    blocked: state.conflict || Boolean(state.pending) || state.loadState !== "ready" || state.saving });
  return { content: state.draft, savedContent: state.baseline, setContent, loadState: state.loadState,
    saveState: state.saving ? "saving" as const : saveState === "saving" ? "idle" as const : saveState,
    message, updatedAt: state.updatedAt, revision: state.revision, conflict: state.conflict, pendingSave: Boolean(state.pending),
    dirty, busy: state.loadState !== "ready" || state.saving, save, checkSave, reload, resetToExample: () => {}, setSaveState };
}
