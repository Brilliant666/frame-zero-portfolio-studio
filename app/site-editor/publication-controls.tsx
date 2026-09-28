"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "../preview-workspace/admin.module.css";
type Publication = { id: string; space: string; draftRevision: number; publishedAt: string };
export default function PublicationControls({ endpoint, publicHref, revision, dirty, disabled }: { endpoint: string; publicHref: string; revision: number; dirty: boolean; disabled: boolean }) {
  const [state, setState] = useState<{ current: Publication | null; history: Publication[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const read = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("发布状态读取失败，请重试。");
    return response.json();
  }, [endpoint]);
  const reload = async () => { setState(await read()); };
  useEffect(() => { let active = true; void read().then(value => { if (active) setState(value); }, error => { if (active) setMessage(error.message); }); return () => { active = false; }; }, [read]);
  async function publish(revisionId?: string) {
    if (!state || busy || disabled || dirty) return;
    if (!confirm(revisionId ? "将公开主页切换到这个历史发布版本？当前草稿不会改变。" : `将已保存的草稿版本 ${revision} 发布到公开主页？访客无需登录即可查看已发布照片和联系方式。`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(revisionId ? { action: "rollback", revisionId, expectedPublicationId: state.current?.id ?? null } : { action: "publish", expectedDraftRevision: revision, expectedPublicationId: state.current?.id ?? null }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "发布失败，当前草稿和公开版本未改变。");
      await reload(); setMessage(revisionId ? "已切换公开版本；草稿保留不变。" : "发布成功。之后保存草稿不会自动更新公开主页。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "发布失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label="公开发布"><div className={styles.row}>
    <strong>{state?.current ? `公开版本 · 草稿 ${state.current.draftRevision}` : "尚未发布"}</strong>
    <button type="button" disabled={!state || busy || disabled || dirty || revision === 0} onClick={() => void publish()}>发布已保存草稿</button>
    <a href={publicHref} target="_blank" rel="noreferrer">查看公开主页 ↗</a>
    <button type="button" disabled={busy} onClick={() => void reload().catch(error => setMessage(error.message))}>刷新发布状态</button>
  </div><p className={styles.hint}>{dirty ? "请先保存当前修改，再发布。" : "保存与发布独立；仅发布此内容空间，不修改另一套草稿。"}</p>
    <p role="status">{message}</p>
    {!!state?.history.length && <details><summary>发布历史与回退</summary><ul>{state.history.map(item => <li key={item.id}>草稿 {item.draftRevision} · {new Date(item.publishedAt).toLocaleString()} {state.current?.id === item.id ? "（当前公开）" : <button type="button" disabled={busy || disabled || dirty} onClick={() => void publish(item.id)}>恢复此公开版本</button>}</li>)}</ul></details>}
  </section>;
}
