"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./publication-controls.module.css";
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
  const synced = !!state?.current && state.current.draftRevision === revision && !dirty;
  const status = !state ? (message ? "发布状态暂不可用" : "正在读取发布状态…") : dirty ? "有修改待保存" : synced ? "已同步" : state.current ? "有未发布修改" : "尚未发布";
  return <section className={styles.panel} aria-label="公开发布">
    <div className={styles.row}>
      <div className={styles.overview}>
        <div className={styles.versions}>
          <strong>已保存草稿 v{revision}</strong>
          <span className={styles.separator} aria-hidden="true">/</span>
          <span>{state ? state.current ? `公开 v${state.current.draftRevision}` : "暂无公开版本" : "公开版本读取中"}</span>
          <span className={synced ? styles.synced : styles.status}>{status}</span>
        </div>
        <div className={styles.meta}>
          <p className={styles.hint}>{dirty ? "请先保存当前修改，再发布。" : "保存不等于发布，仅发布当前内容空间。"}</p>
          <details className={styles.history}>
            <summary>{state?.history.length ? <>发布历史与回退 <span>{state.history.length}</span></> : "发布操作"}</summary>
            <div className={styles.historyContent}>
              <button className={styles.refresh} type="button" disabled={busy} onClick={() => void reload().catch(error => setMessage(error.message))}>刷新发布状态</button>
              {!!state?.history.length && <ul>{state.history.map(item => <li key={item.id}><span>草稿 v{item.draftRevision} · {new Date(item.publishedAt).toLocaleString()}</span>{state.current?.id === item.id ? <span className={styles.current}>当前公开</span> : <button className={styles.secondary} type="button" disabled={busy || disabled || dirty} onClick={() => void publish(item.id)}>恢复此公开版本</button>}</li>)}</ul>}
            </div>
          </details>
        </div>
      </div>
      <div className={styles.actions}>
        <a className={styles.secondary} href={publicHref} target="_blank" rel="noreferrer">查看公开主页 ↗</a>
        <button className={styles.primary} type="button" disabled={!state || busy || disabled || dirty || revision === 0} onClick={() => void publish()}>{busy ? "正在发布…" : "发布已保存草稿"}</button>
      </div>
    </div>
    {message && <p className={styles.message} role="status">{message}</p>}
  </section>;
}
