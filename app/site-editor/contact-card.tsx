"use client";

/* eslint-disable @next/next/no-img-element -- Site-owned validated image variants. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SiteAssetUpload from "./asset-upload";
import { loadSiteAssets, type SiteAssetManifest } from "./assets-client";
import { compareSiteAssetTimes } from "./asset-metadata";
import styles from "./contact-card.module.css";

type Props = {
  assetsEndpoint: string;
  assetId?: string;
  /** Use the entry object as identity when the document has no persistent row ID. */
  targetKey: object | string;
  /** Synchronous explicit selection only; caller must match the captured entry identity. */
  onChange: (assetId: string | undefined) => void;
};
const PAGE_SIZE = 12;

export default function SiteContactCard({ assetsEndpoint, assetId, targetKey, onChange }: Props) {
  const scope = useMemo(() => ({ assetsEndpoint, targetKey }), [assetsEndpoint, targetKey]);
  const identity = useRef<typeof scope | null>(scope);
  const active = useRef(true);
  const request = useRef(0);
  const [panel, setPanel] = useState<typeof scope | null>(null);
  const [manifest, setManifest] = useState<SiteAssetManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  const opened = panel === scope;
  const validId = assetId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId) ? assetId : null;
  const src = validId ? `${assetsEndpoint}/${validId}/full` : null;

  useLayoutEffect(() => { identity.current = scope; return () => { identity.current = null; }; }, [scope]);
  useEffect(() => { active.current = true; request.current++; return () => { active.current = false; }; }, []);

  async function reload() {
    if (!active.current || identity.current !== scope) return;
    const token = ++request.current;
    setLoading(true); setMessage("");
    try {
      const next = await loadSiteAssets(assetsEndpoint);
      if (!active.current || token !== request.current || identity.current !== scope) return;
      setManifest(next);
    } catch (error) {
      if (active.current && token === request.current && identity.current === scope) setMessage(error instanceof Error ? error.message : "本站素材读取失败，原卡片引用保留。");
    } finally {
      if (active.current && token === request.current && identity.current === scope) setLoading(false);
    }
  }

  function open() {
    setPanel(scope); setManifest(null); setQuery(""); setPage(0); void reload();
  }
  function close() { request.current++; setPanel(null); setLoading(false); }
  const filtered = (manifest?.assets ?? []).filter(asset => asset.id.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => compareSiteAssetTimes(a, b, "recent"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  return <section className={styles.editor} aria-label="可选联系卡">
    <p>联系卡可留空，文字账号和网址可独立使用。选用只修改当前空间草稿，保存与发布另行操作。</p>
    {src && failedPreview !== src && <a className={styles.preview} href={src} target="_blank" rel="noopener noreferrer" aria-label="查看联系卡大图"><img src={src} alt="当前联系卡" onError={() => setFailedPreview(src)} /></a>}
    {src && failedPreview === src && <p role="status">卡片暂不可用；原引用、文字账号和网址已保留。</p>}
    <div className={styles.actions}>
      <button type="button" onClick={open}>{assetId ? "替换联系卡" : "选择或上传联系卡"}</button>
      {assetId && <button type="button" onClick={() => { close(); onChange(undefined); }}>移除卡片引用</button>}
    </div>
    {assetId && <small>移除或替换只改变当前草稿引用，原资源保留。</small>}
    {opened && <div className={styles.picker}>
      <h4>从本站素材选用联系卡</h4>
      <p>上传成功只表示资源已入库。请在列表中点击“选用此卡片”确认，不会自动替换原卡片。</p>
      <SiteAssetUpload endpoint={assetsEndpoint} onUploaded={reload} />
      <div className={styles.actions}>
        <label>按素材编号查找<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <button type="button" disabled={loading} onClick={() => void reload()}>刷新素材</button>
        <button type="button" onClick={close}>取消选卡</button>
      </div>
      {manifest?.truncated && <p role="status">当前仅载入前 {manifest.assets.length} 张资源；查找和选择仅限已载入部分。</p>}
      {loading && <p role="status">正在读取本站素材…</p>}
      {message && <p role="alert">{message} 原卡片引用未改变。</p>}
      {!loading && !message && manifest && filtered.length === 0 && <p>没有符合条件的素材。</p>}
      <div className={styles.grid}>{filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(asset => <article key={asset.id}>
        <a href={asset.variants.full.src} target="_blank" rel="noopener noreferrer" aria-label={`查看素材 ${asset.id} 大图`}><img src={asset.variants.card.src} alt="候选联系卡" loading="lazy" /></a>
        <code>{asset.id}</code>
        <button type="button" disabled={loading || Boolean(message)} onClick={() => { if (identity.current !== scope || !active.current) return; close(); onChange(asset.id); }}>{asset.id === assetId ? "保留此卡片" : "选用此卡片"}</button>
      </article>)}</div>
      {pageCount > 1 && <div className={styles.actions}>
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pageCount}</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </div>}
    </div>}
  </section>;
}
