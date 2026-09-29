import { parseSpaceContent, type ContentSpace } from "./content-schema";

export type DraftSaveReceipt = { revision: number; content: unknown; updatedAt: string | null; confirmedAfterLoss?: boolean };
export type DraftSaveOptions = { signal?: AbortSignal };
export type PendingDraftSave = { content: unknown; expectedRevision: number };
export class DraftSaveUncertain extends Error {
  constructor(public pending: PendingDraftSave) { super("保存结果待确认：连接中断或确认响应无效。当前编辑已保留，请检查保存结果；不会自动再次保存或发布。"); }
}
export class DraftSaveRejected extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Include response decoding in the deadline; an HTTP header is not a save receipt.
export async function editorJson(url: string, init: RequestInit = {}, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    // A definite rejection already supplies its authoritative HTTP status.
    // Do not make a 401/409 depend on a possibly interrupted error-body stream.
    const body: unknown = !response.ok && response.status < 500 ? null : await response.json();
    return { response, body };
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function readSaveReceipt(value: unknown, space: ContentSpace): DraftSaveReceipt {
  if (!value || typeof value !== "object") throw new Error("保存确认格式无效");
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || !(raw.updatedAt === null || typeof raw.updatedAt === "string")) throw new Error("保存确认版本无效");
  return { revision: raw.revision as number, content: parseSpaceContent(space, raw.content), updatedAt: raw.updatedAt };
}
export function matchesDraftSave(receipt: DraftSaveReceipt, pending: PendingDraftSave, space: ContentSpace) {
  return receipt.revision === pending.expectedRevision + 1 && stable(parseSpaceContent(space, receipt.content)) === stable(parseSpaceContent(space, pending.content));
}
export async function confirmDraftSave(endpoint: string, space: ContentSpace, pending: PendingDraftSave, signal?: AbortSignal) {
  const { response, body } = await editorJson(endpoint, { cache: "no-store" }, signal);
  if (!response.ok) throw new DraftSaveUncertain(pending);
  const receipt = readSaveReceipt(body, space);
  if (!matchesDraftSave(receipt, pending, space)) throw new DraftSaveUncertain(pending);
  return { ...receipt, confirmedAfterLoss: true };
}
export async function writeSiteDraft(endpoint: string, space: ContentSpace, pending: PendingDraftSave, signal?: AbortSignal) {
  try {
    const { response, body } = await editorJson(endpoint, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: pending.content, expectedRevision: pending.expectedRevision }) }, signal);
    if (!response.ok && response.status < 500) throw new DraftSaveRejected(response.status === 409 ? "版本冲突：其他标签页已保存新版本。当前草稿已保留；请先备份，再重新读取并人工合并。不会自动覆盖。" : body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "保存被拒绝；当前草稿已保留。", response.status);
    if (!response.ok) throw new Error("保存确认失败");
    const receipt = readSaveReceipt(body, space);
    if (!matchesDraftSave(receipt, pending, space)) throw new Error("保存确认与提交快照不符");
    return receipt;
  } catch (error) {
    if (signal?.aborted || error instanceof DraftSaveRejected) throw error;
    try { return await confirmDraftSave(endpoint, space, pending, signal); }
    catch { throw new DraftSaveUncertain(pending); }
  }
}
