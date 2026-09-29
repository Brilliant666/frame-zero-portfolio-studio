"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { editorJson, type DraftSaveOptions, type DraftSaveReceipt } from "./draft-save";
import type { ContentSpace } from "./content-schema";
import { publicationMatches as matches, publicationSynced, type PublicationSummary as Publication, type PendingPublication } from "./publication-state";
import { templateCatalog } from "../templates/catalog";
import { useEditorActionVisibility } from "./use-editor-action-visibility";
import styles from "./publication-controls.module.css";

export type PublicationEditorProps = {
  revision: number; dirty: boolean; disabled: boolean; templateId: string;
  draftAction?: ReactNode; tools?: ReactNode; draftStatus?: string;
  saveDraft: (options?: DraftSaveOptions) => Promise<DraftSaveReceipt | null>;
};
type PublicationState = { current: Publication | null; history: Publication[] };
const spaceName = (space: ContentSpace) => space === "basic" ? "基础版" : "高级拍立得";
const title = (value: Publication) => `${spaceName(value.space)}${value.space === "basic" ? ` · ${templateCatalog.find(item => item.id === value.templateId)?.name ?? value.templateId}` : ""} · v${value.draftRevision}`;
function parseState(value: unknown): PublicationState {
  if (!value || typeof value !== "object" || !("history" in value) || !Array.isArray(value.history) || !("current" in value)) throw new Error("发布状态响应无效");
  const valid = (item: unknown): item is Publication => !!item && typeof item === "object" && "id" in item && typeof item.id === "string" && "space" in item && ["basic", "premium-polaroid"].includes(String(item.space)) && "templateId" in item && typeof item.templateId === "string" && "draftRevision" in item && Number.isSafeInteger(item.draftRevision) && "publishedAt" in item && typeof item.publishedAt === "string";
  if (value.current !== null && !valid(value.current) || !value.history.every(valid)) throw new Error("发布版本身份无效");
  return value as PublicationState;
}

export default function PublicationControls({ endpoint, publicHref, space, revision, templateId, dirty, disabled, saveDraft, draftAction, tools, draftStatus }: PublicationEditorProps & { endpoint: string; publicHref: string; space: ContentSpace }) {
  const [state, setState] = useState<PublicationState | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingPublication | null>(null);
  const lock = useRef(false), lifetime = useRef(new AbortController());
  const read = useCallback(async (signal?: AbortSignal) => {
    const { response, body } = await editorJson(endpoint, { cache: "no-store" }, signal);
    if (!response.ok) throw new Error("发布状态读取失败，请重试。");
    return parseState(body);
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void read(controller.signal).then(value => { if (!controller.signal.aborted) setState(value); }, () => { if (!controller.signal.aborted) setMessage("发布状态暂不可用，请刷新发布状态。"); });
    return () => controller.abort();
  }, [read]);
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const value = await read(lifetime.current.signal);
      if (lifetime.current.signal.aborted) return;
      setState(value);
      if (pending && matches(value.current, pending)) { setPending(null); setMessage(`已确认目标版本当前公开：${title(value.current!)}。未再次写入。`); }
      else if (pending) setMessage("发布结果仍待确认。已显示当前公开状态，不会自动重跑或覆盖其他标签页的发布。请核对历史记录。");
      else setMessage("发布状态已更新。刷新不会发布或改变草稿。");
    } catch { if (!lifetime.current.signal.aborted) setMessage("发布状态仍无法读取；结果待确认，请稍后检查。"); }
    finally { lock.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  async function publish(rollback?: Publication) {
    if (!state || lock.current || disabled || pending) return;
    const pointer = state.current?.id ?? null;
    const targetSpace = rollback?.space ?? space, targetTemplate = rollback?.templateId ?? templateId;
    if (rollback) {
      if (!confirm(`将公开主页切换到 ${title(rollback)}？当前编辑和草稿不会改变。`)) return;
    } else if (state.current && state.current.space !== space && !confirm(`公开主页将从 ${title(state.current)} 切换为本次${spaceName(space)} · ${templateId}版本。保存后发布，另一空间的草稿和历史保留。继续？`)) return;
    lock.current = true; setBusy(true); setMessage(rollback ? "正在恢复公开版本…" : "正在保存本次内容并发布…");
    const signal = lifetime.current.signal;
    let target: PendingPublication | null = null;
    try {
      const receipt = rollback ? null : await saveDraft({ signal });
      if (signal.aborted) return;
      if (!rollback && !receipt) { setMessage("未取得准确的保存确认，未尝试发布。请处理草稿提示后再操作。"); return; }
      target = { space: targetSpace, templateId: targetTemplate, revision: rollback?.draftRevision ?? receipt!.revision, expectedPublicationId: pointer, ...(rollback ? { rollbackId: rollback.id } : {}) };
      const targetEndpoint = endpoint.replace(/\/(?:basic|premium-polaroid)$/, `/${targetSpace}`);
      const { response, body } = await editorJson(targetEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rollback ? { action: "rollback", revisionId: rollback.id, expectedPublicationId: pointer } : { action: "publish", expectedDraftRevision: receipt!.revision, expectedPublicationId: pointer }) }, signal);
      if (signal.aborted) return;
      if (!response.ok && response.status < 500) {
        setMessage(rollback ? "恢复被拒绝，未覆盖公开指针。请刷新核对其他标签页的操作。" : `草稿 v${receipt!.revision} 已保存，但发布被拒绝（${response.status}）。未覆盖公开指针；请刷新核对版本和权限。`);
        return;
      }
      if (!response.ok || !body || typeof body !== "object" || !("publication" in body)) throw new Error("发布确认无效");
      const next = parseState({ current: body.publication, history: [] }).current!;
      if (!matches(next, target)) throw new Error("发布确认身份不符");
      setState(previous => ({ current: next, history: [next, ...(previous?.history ?? []).filter(item => item.id !== next.id)] }));
      setMessage(rollback ? `已恢复公开版本：${title(next)}；当前草稿保持不变。` : `发布成功：${title(next)}。请求期间新增的编辑仍未保存、未发布。`);
    } catch {
      if (signal.aborted) return;
      if (!target) { setMessage("保存结果待确认，未尝试发布。请检查草稿保存状态。"); return; }
      setPending(target); setMessage("发布结果待确认：连接中断或确认响应无效。正在只读核对，不会自动重试发布。");
      try {
        const value = await read(signal);
        if (signal.aborted) return;
        setState(value);
        if (matches(value.current, target)) { setPending(null); setMessage(`已确认目标版本当前公开：${title(value.current!)}。未再次写入。`); }
        else setMessage("发布结果待确认；当前公开版本与目标不同。草稿已保留，请检查发布状态和历史，不会自动覆盖。");
      } catch { if (!signal.aborted) setMessage("发布结果待确认，暂时无法读取公开状态。请稍后检查；不会自动重试写入。"); }
    } finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  const { modalOpen, keyboardOpen } = useEditorActionVisibility();
  const synced = publicationSynced(state?.current ?? null, space, templateId, revision, dirty);
  const status = pending ? "结果待确认" : !state ? "发布状态暂不可用" : dirty ? "有修改待保存发布" : synced ? "已同步" : state.current ? "当前编辑尚未发布" : "尚未发布";
  return <section className={styles.panel} aria-label="公开发布"><div className={styles.row}>
    <div className={styles.overview}><div className={styles.versions}><strong>{spaceName(space)}草稿 v{revision} · {draftStatus ?? (dirty ? "未保存修改" : "已保存")}</strong><span>{!state ? "公开状态待确认" : state.current ? `公开：${title(state.current)}` : "暂无公开版本"}</span><span className={synced ? styles.synced : styles.status}>{status}</span></div>
    </div><div className={styles.actions} data-editor-save-actions="true" data-keyboard-open={keyboardOpen || undefined} data-modal-open={modalOpen || undefined} inert={modalOpen || undefined}>
      {draftAction}<button className={styles.primary} type="button" disabled={!state || busy || disabled || !!pending || !dirty && revision === 0} onClick={() => void publish()}>{busy ? "正在处理…" : "保存并发布"}</button>
    </div>
  </div><div className={styles.tools} aria-label="预览与草稿工具">{tools}<a className={styles.secondary} href={publicHref} target="_blank" rel="noreferrer">查看公开主页 ↗</a>
    <details className={styles.history}><summary>发布历史与回退 {state?.history.length ?? 0}</summary><div className={styles.historyContent}>
      <button className={styles.refresh} type="button" disabled={busy} onClick={() => void refresh()}>刷新发布状态</button>
      {!!state?.history.length && <ul>{state.history.map(item => <li key={item.id}><span>{title(item)} · {new Date(item.publishedAt).toLocaleString()}</span>{state.current?.id === item.id ? <span className={styles.current}>当前公开</span> : <button className={styles.secondary} type="button" disabled={busy || disabled || !!pending} onClick={() => void publish(item)}>恢复此公开版本</button>}</li>)}</ul>}
    </div></details>

  </div>{(pending || !state || message) && <button className={styles.refresh} type="button" disabled={busy} onClick={() => void refresh()}>{pending ? "检查发布结果" : "刷新发布状态"}</button>}{message && <p className={styles.message} role="status">{message}</p>}</section>;
}
