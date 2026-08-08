export type AdminLoadState = "loading" | "ready" | "degraded" | "error";
export type AdminSaveState = "idle" | "saving" | "success" | "error";

export type AdminStatus = {
  label: string;
  tone: "busy" | "dirty" | "error" | "saved" | "success";
};

export function contentFingerprint(value: unknown) {
  return JSON.stringify(value);
}

export function hasAdminChanges(draft: unknown, persisted: unknown) {
  return contentFingerprint(draft) !== contentFingerprint(persisted);
}

export function canSubmitAdminSave(
  loadState: AdminLoadState,
  saveState: AdminSaveState,
  draft: unknown,
  persisted: unknown,
) {
  return loadState === "ready"
    && saveState !== "saving"
    && hasAdminChanges(draft, persisted);
}

export function saveStateAfterDraftChange(saveState: AdminSaveState): AdminSaveState {
  return saveState === "saving" ? "saving" : "idle";
}

export function isAdminSaveShortcut(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey">) {
  return !event.altKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
}

export function reconcileAdminSave<T>(submitted: T, currentDraft: T, persisted: T) {
  const changedWhileSaving = hasAdminChanges(currentDraft, submitted);
  return {
    draft: changedWhileSaving ? currentDraft : persisted,
    persisted,
    changedWhileSaving,
  };
}

export function getAdminStatus(
  loadState: AdminLoadState,
  saveState: AdminSaveState,
  dirty: boolean,
): AdminStatus {
  if (loadState === "loading") return { label: "正在读取", tone: "busy" };
  if (loadState === "degraded") return { label: "读取受阻", tone: "error" };
  if (loadState === "error") return { label: "读取失败", tone: "error" };
  if (saveState === "saving") return { label: "正在保存", tone: "busy" };
  if (saveState === "error") return { label: "保存失败", tone: "error" };
  if (dirty) return { label: "未保存", tone: "dirty" };
  if (saveState === "success") return { label: "保存成功", tone: "success" };
  return { label: "已保存", tone: "saved" };
}
