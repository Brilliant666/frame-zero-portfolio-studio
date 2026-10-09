"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { editorJson, type DraftSaveOptions, type DraftSaveReceipt } from "./draft-save";
import { isContentSpace, type ContentSpace } from "./content-schema";
import { publicationMatches as matches, publicationSynced, type PublicationSummary as Publication, type PendingPublication } from "./publication-state";
import { templateCatalog } from "../templates/catalog";
import { useEditorActionVisibility } from "./use-editor-action-visibility";
import { publicationSuccessDetail } from "./publication-feedback";
import styles from "./publication-controls.module.css";

export type PublicationEditorProps = {
  revision: number; dirty: boolean; disabled: boolean; templateId: string;
  draftAction?: ReactNode; tools?: ReactNode; draftStatus?: string; compactTools?: boolean;
  presentation?: "polaroid"; previewAction?: ReactNode; savedPreviewHref?: string; onPublishStart?: () => void;
  saveDraft: (options?: DraftSaveOptions) => Promise<DraftSaveReceipt | null>;
};
type PublicationState = { current: Publication | null; history: Publication[] };
const spaceName = (space: ContentSpace) => space === "basic" ? "基础版" : space === "premium-flow-gallery" ? "流影视廊" : "高级拍立得";
const title = (value: Publication) => `${spaceName(value.space)}${value.space === "basic" ? ` · ${templateCatalog.find(item => item.id === value.templateId)?.name ?? value.templateId}` : ""}`;
const versionDetail = (value: Publication) => `内容版本 v${value.draftRevision} · ${new Date(value.publishedAt).toLocaleString()}`;
const retentionHint = "每个内容空间保留最近 10 个不同内容版本，另保留当前公开版本。恢复只切换公开版本，当前编辑与草稿保留。";
function parseState(value: unknown): PublicationState {
  if (!value || typeof value !== "object" || !("history" in value) || !Array.isArray(value.history) || !("current" in value)) throw new Error("发布状态响应无效");
  const valid = (item: unknown): item is Publication => !!item && typeof item === "object" && "id" in item && typeof item.id === "string" && "space" in item && isContentSpace(String(item.space)) && "templateId" in item && typeof item.templateId === "string" && "draftRevision" in item && Number.isSafeInteger(item.draftRevision) && "publishedAt" in item && typeof item.publishedAt === "string" && (!("matchedDraftRevision" in item) || item.matchedDraftRevision === null || Number.isSafeInteger(item.matchedDraftRevision)) && (!("outcome" in item) || ["unchanged", "reused", "created"].includes(String(item.outcome)));
  if (value.current !== null && !valid(value.current) || !value.history.every(valid)) throw new Error("发布版本身份无效");
  return value as PublicationState;
}

function ActionDisclosure({ label, children, split = false }: { label: string; children: ReactNode; split?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = (restoreFocus: boolean) => {
    const element = ref.current;
    if (!element?.open) return;
    element.open = false;
    if (restoreFocus) element.querySelector("summary")?.focus();
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) {
        if (ref.current) ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <details ref={ref} className={`${styles.actionDisclosure} ${split ? styles.splitDisclosure : ""}`}
    onKeyDown={(event) => { if (event.key === "Escape" && ref.current?.open) { event.preventDefault(); event.stopPropagation(); close(true); } }}
    onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close(false); }}>
    <summary aria-label={label}>{split ? <span aria-hidden="true">⌄</span> : label}</summary>
    <div className={styles.actionMenu} aria-label={label} onClick={(event) => {
      if (event.target instanceof Element && event.target.closest("button, a")) close(true);
    }}>{children}</div>
  </details>;
}

export default function PublicationControls({ endpoint, publicHref, space, revision, templateId, dirty, disabled, saveDraft, draftAction, tools, draftStatus, compactTools, presentation, previewAction, savedPreviewHref, onPublishStart }: PublicationEditorProps & { endpoint: string; publicHref: string; space: ContentSpace }) {
  const [state, setState] = useState<PublicationState | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"info" | "success" | "error" | "pending">("info");
  const [feedbackTitle, setFeedbackTitle] = useState("公开状态");
  const [publishedFeedback, setPublishedFeedback] = useState(false);
  const notify = useCallback((text: string, tone: "info" | "success" | "error" | "pending", heading: string, published = false) => { setMessage(text); setFeedbackTone(tone); setFeedbackTitle(heading); setPublishedFeedback(published); }, []);
  const [pending, setPending] = useState<PendingPublication | null>(null);
  const lock = useRef(false), lifetime = useRef(new AbortController());
  const revisionRead = useRef<AbortController | null>(null);
  const observedDraft = useRef(`${space}:${templateId}:${revision}`);
  const historyDialog = useRef<HTMLDialogElement>(null), historyTrigger = useRef<HTMLButtonElement>(null);
  const historyTitleId = useId();
  useEffect(() => {
    if (presentation !== "polaroid" || feedbackTone !== "success" || !message) return;
    const timer = window.setTimeout(() => setMessage(""), 6000);
    return () => window.clearTimeout(timer);
  }, [presentation, feedbackTone, message]);
  const read = useCallback(async (signal?: AbortSignal) => {
    const { response, body } = await editorJson(endpoint, { cache: "no-store" }, signal);
    if (!response.ok) throw new Error("发布状态读取失败，请重试。");
    return parseState(body);
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void read(controller.signal).then(value => { if (!controller.signal.aborted) setState(value); }, () => { if (!controller.signal.aborted) notify("发布状态暂不可用，请刷新发布状态。", "pending", "公开状态待核对"); });
    return () => { controller.abort(); revisionRead.current?.abort(); };
  }, [read, notify]);
  useEffect(() => {
    const key = `${space}:${templateId}:${revision}`;
    if (observedDraft.current === key) return;
    revisionRead.current?.abort();
    // A publish owns its confirmation lifecycle. Its final read includes saved edits.
    if (lock.current) return;
    observedDraft.current = key;
    const controller = new AbortController(); revisionRead.current = controller;
    void read(controller.signal).then(value => { if (!controller.signal.aborted) setState(value); }, () => { /* Keep the known public state; explicit refresh remains available. */ });
    return () => controller.abort();
  }, [revision, space, templateId, read, busy]);
  async function refresh() {
    if (lock.current) return;
    revisionRead.current?.abort();
    lock.current = true; setBusy(true);
    try {
      const value = await read(lifetime.current.signal);
      if (lifetime.current.signal.aborted) return;
      setState(value);
      if (pending && matches(value.current, pending)) { setPending(null); notify(`已确认目标版本当前公开：${title(value.current!)}。未再次写入。`, "success", "公开结果已确认"); }
      else if (pending) notify("发布结果仍待确认。已显示当前公开状态，不会自动重跑或覆盖其他标签页的发布。请核对历史记录。", "pending", "公开结果待确认");
      else notify("发布状态已更新。刷新不会发布或改变草稿。", "info", "公开状态已读取");
    } catch { if (!lifetime.current.signal.aborted) notify("发布状态仍无法读取；结果待确认，请稍后检查。", "pending", "公开状态待核对"); }
    finally { lock.current = false; if (!lifetime.current.signal.aborted) setBusy(false); }
  }
  async function publish(rollback?: Publication) {
    if (!state || lock.current || disabled || pending) return;
    const pointer = state.current?.id ?? null;
    const targetSpace = rollback?.space ?? space, targetTemplate = rollback?.templateId ?? templateId;
    if (rollback) {
      if (!confirm(`将公开主页切换到 ${title(rollback)}（${new Date(rollback.publishedAt).toLocaleString()}）？当前编辑和草稿不会改变。`)) return;
    } else if (state.current && state.current.space !== space && !confirm(`公开主页将从 ${title(state.current)} 切换为本次${spaceName(space)} · ${templateId}版本。保存后发布，另一空间的草稿和历史保留。继续？`)) return;
    onPublishStart?.();
    revisionRead.current?.abort();
    lock.current = true; setBusy(true); notify(rollback ? "正在恢复公开版本…" : "正在保存本次内容并发布…", "info", rollback ? "正在恢复公开版本" : "正在保存草稿并发布");
    const signal = lifetime.current.signal;
    let target: PendingPublication | null = null;
    try {
      const receipt = rollback ? null : await saveDraft({ signal });
      if (signal.aborted) return;
      if (!rollback && !receipt) { notify("未取得准确的保存确认，未尝试发布。请处理草稿提示后再操作。", "error", "草稿尚未确认 · 未发布"); return; }
      target = { space: targetSpace, templateId: targetTemplate, revision: rollback?.draftRevision ?? receipt!.revision, expectedPublicationId: pointer, ...(rollback ? { rollbackId: rollback.id } : {}) };
      const targetEndpoint = endpoint.replace(/\/(?:basic|premium-polaroid|premium-flow-gallery)$/, `/${targetSpace}`);
      const { response, body } = await editorJson(targetEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rollback ? { action: "rollback", revisionId: rollback.id, expectedPublicationId: pointer } : { action: "publish", expectedDraftRevision: receipt!.revision, expectedPublicationId: pointer }) }, signal);
      if (signal.aborted) return;
      if (!response.ok && response.status < 500) {
        notify(rollback ? "恢复被拒绝，未覆盖公开指针。请刷新核对其他标签页的操作。" : `草稿已保存，但发布被拒绝（${response.status}）。未覆盖公开指针；请刷新核对版本和权限。`, "error", rollback ? "公开恢复未完成" : "草稿已保存 · 发布未完成");
        return;
      }
      if (!response.ok || !body || typeof body !== "object" || !("publication" in body)) throw new Error("发布确认无效");
      const next = parseState({ current: body.publication, history: [] }).current!;
      if (!matches(next, target)) throw new Error("发布确认身份不符");
      setState(previous => ({ current: next, history: [next, ...(previous?.history ?? []).filter(item => item.id !== next.id)] }));
      notify(rollback ? `已恢复公开版本：${title(next)}；当前草稿保持不变。` : next.outcome === "unchanged" ? "当前内容已发布，没有新增重复记录。" : `发布成功：${title(next)}。`, "success", rollback ? "公开版本已恢复" : next.outcome === "unchanged" ? "当前内容已发布" : "本次草稿已保存 · 发布成功", !rollback);
      // Retention can remove old rows. A read failure must not undo a confirmed success.
      try { const latest = await read(signal); if (!signal.aborted) setState(latest); } catch { /* Keep confirmed publication and allow manual refresh. */ }
    } catch {
      if (signal.aborted) return;
      if (!target) { notify("保存结果待确认，未尝试发布。请检查草稿保存状态。", "pending", "草稿结果待确认 · 未发布"); return; }
      setPending(target); notify("公开结果待确认：连接中断或确认响应无效。正在只读核对，不会自动重试写入。", "pending", rollback ? "公开恢复结果待确认" : "草稿已保存 · 公开结果待确认");
      try {
        const value = await read(signal);
        if (signal.aborted) return;
        setState(value);
        if (matches(value.current, target)) { setPending(null); notify(`已确认目标版本当前公开：${title(value.current!)}。未再次写入。`, "success", "公开结果已确认"); }
        else notify("公开结果待确认；当前公开版本与目标不同。草稿已保留，请检查发布状态和历史，不会自动覆盖。", "pending", rollback ? "公开恢复结果待确认" : "草稿已保存 · 公开结果待确认");
      } catch { if (!signal.aborted) notify("发布结果待确认，暂时无法读取公开状态。请稍后检查；不会自动重试写入。", "pending", "公开结果待确认"); }
    } finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  const { modalOpen, keyboardOpen } = useEditorActionVisibility();
  const synced = publicationSynced(state?.current ?? null, space, templateId, revision, dirty);
  const status = pending ? "结果待确认" : !state ? "发布状态暂不可用" : dirty ? "有修改待保存发布" : synced ? "已同步" : state.current ? "当前编辑尚未发布" : "尚未发布";
  const feedbackMessage = publicationSuccessDetail(message, publishedFeedback, dirty, synced);
  if (presentation === "polaroid") {
    const needsRecovery = !!pending || feedbackTone === "error" || feedbackTone === "pending";
    const compactStatus = pending ? "结果待确认" : !state ? "公开状态待确认" : dirty ? "有修改未保存" : synced ? "无待发布改动" : "草稿尚未发布";
    const refreshAction = <button className={styles.refresh} type="button" disabled={busy} onClick={() => void refresh()}>{pending ? "只读检查发布结果" : "刷新公开状态"}</button>;
    const preview = <div className={styles.previewSplit}>{previewAction}{savedPreviewHref && <ActionDisclosure label="更多预览方式" split><a href={savedPreviewHref} target="_blank" rel="noopener noreferrer">预览已保存草稿 ↗</a></ActionDisclosure>}</div>;
    const feedback = message && <div className={styles.compactMessage} data-tone={feedbackTone} role={feedbackTone === "error" ? "alert" : "status"} title={feedbackMessage}>
      {feedbackTone !== "success" && <strong>{feedbackTitle} · </strong>}{feedbackMessage}
    </div>;
    return <section className={`${styles.panel} ${styles.polaroid}`} aria-label="公开发布">
      <div className={styles.compactRow}>
        <div className={styles.compactVersions}><span title={`草稿版本 v${revision}`}><strong>草稿</strong> · {draftStatus ?? (dirty ? "未保存修改" : "已保存")}</span><span title={state?.current ? versionDetail(state.current) : undefined}>{!state ? "当前公开：待核对" : state.current ? `当前公开：${title(state.current)}` : "当前公开：尚无版本"}</span><span className={styles.compactStatus}>{compactStatus}</span></div>
        <div className={styles.compactTools}>
          <div className={styles.inlinePreview}>{preview}</div>
          <a className={styles.secondary} href={publicHref} target="_blank" rel="noopener noreferrer">查看公开主页 ↗</a>
          <button ref={historyTrigger} className={styles.secondary} type="button" aria-haspopup="dialog" onClick={() => historyDialog.current?.showModal()}>发布记录 {state?.history.length ?? 0}</button>
          <ActionDisclosure label="更多 ⋯">{tools}{!needsRecovery && refreshAction}</ActionDisclosure>
        </div>
      </div>
      <div className={styles.actions} data-editor-save-actions="true" data-keyboard-open={keyboardOpen || undefined} data-modal-open={modalOpen || undefined} inert={modalOpen || undefined}>
        <div className={styles.dockedPreview}>{preview}</div>{draftAction}<button className={styles.primary} type="button" disabled={!state || busy || disabled || !!pending || !dirty && revision === 0} onClick={() => void publish()}>{busy ? "正在处理…" : "保存并发布"}</button>
      </div>
      {feedback}{needsRecovery && <div className={styles.recovery}>{refreshAction}</div>}
      <dialog ref={historyDialog} className={styles.historyDrawer} aria-labelledby={historyTitleId}
        onCancel={(event) => { event.preventDefault(); historyDialog.current?.close(); }}
        onClose={() => historyTrigger.current?.focus()}
        onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) historyDialog.current?.close(); } }}>
        <header className={styles.drawerHeading}><div><h2 id={historyTitleId}>发布记录与回退</h2><p>{retentionHint}</p></div><button type="button" className={styles.drawerClose} onClick={() => historyDialog.current?.close()} aria-label="关闭发布记录">×</button></header>
        <div className={styles.drawerContent}>
          <p>{state?.current ? `当前公开：${title(state.current)}` : state ? "尚无公开版本" : "公开状态待核对"}</p>
          {state?.history.length ? <ul>{state.history.map(item => <li key={item.id} data-publication-id={item.id}><div><strong title={versionDetail(item)}>{title(item)}</strong><time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleString()}</time></div>{state.current?.id === item.id ? <span className={styles.current}>当前公开</span> : <button className={styles.secondary} type="button" disabled={busy || disabled || !!pending} onClick={() => void publish(item)}>恢复此公开版本</button>}</li>)}</ul> : <p className={styles.hint}>{state ? "还没有发布记录。" : "请刷新核对发布状态。"}</p>}
          {feedback}<div className={styles.recovery}>{refreshAction}</div>
        </div>
      </dialog>
    </section>;
  }
  const toolsContent = <div className={styles.tools} aria-label="预览与草稿工具">{tools}<a className={styles.secondary} href={publicHref} target="_blank" rel="noreferrer">查看公开主页 ↗</a>
    <details className={styles.history}><summary>发布历史与回退 {state?.history.length ?? 0}</summary><div className={styles.historyContent}>
      <p className={styles.hint}>{retentionHint}</p>
      {!!state?.history.length && <ul>{state.history.map(item => <li key={item.id} data-publication-id={item.id}><span title={versionDetail(item)}>{title(item)} · <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleString()}</time></span>{state.current?.id === item.id ? <span className={styles.current}>当前公开</span> : <button className={styles.secondary} type="button" disabled={busy || disabled || !!pending} onClick={() => void publish(item)}>恢复此公开版本</button>}</li>)}</ul>}
    </div></details>
  </div>;
  return <section className={styles.panel} aria-label="公开发布"><div className={styles.row}>
    <div className={styles.overview}><div className={styles.versions}><strong title={`草稿版本 v${revision}`}>{spaceName(space)}草稿 · {draftStatus ?? (dirty ? "未保存修改" : "已保存")}</strong><span title={state?.current ? versionDetail(state.current) : undefined}>{!state ? "公开状态待确认" : state.current ? `公开：${title(state.current)}` : "暂无公开版本"}</span><span className={synced ? styles.synced : styles.status}>{status}</span></div>
    </div><div className={styles.actions} data-editor-save-actions="true" data-keyboard-open={keyboardOpen || undefined} data-modal-open={modalOpen || undefined} inert={modalOpen || undefined}>
      {draftAction}<button className={styles.primary} type="button" disabled={!state || busy || disabled || !!pending || !dirty && revision === 0} onClick={() => void publish()}>{busy ? "正在处理…" : "保存并发布"}</button>
    </div>
  </div>{compactTools ? <details className={styles.toolDisclosure} open={Boolean(pending || message && (feedbackTone === "pending" || feedbackTone === "error"))}><summary>预览与草稿工具</summary>{toolsContent}</details> : toolsContent}{message && <div className={styles.message} data-tone={feedbackTone} role={feedbackTone === "error" ? "alert" : "status"}><strong>{feedbackTitle}</strong><p>{feedbackMessage}</p></div>}<button className={styles.refresh} type="button" disabled={busy} onClick={() => void refresh()}>{pending ? "只读检查发布结果" : "刷新公开状态"}</button></section>;
}
