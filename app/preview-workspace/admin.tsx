"use client";

/* eslint-disable @next/next/no-img-element -- Shared local library variants and local-only platform cards. */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { parsePhotoLibraryManifest, type PhotoAsset } from "../photo-library";
import { getPlatformQrAssetPath } from "../platform-qr";
import type { SiteContent } from "../site-config";
import { moveItem, type Collection } from "../templates/polaroid-field/collection-model";
import { isAdminSaveShortcut } from "../admin/admin-state";
import { createEmptyPreviewDocument, copyLegacyBasics, parsePreviewDocument, type PreviewPortfolioDocumentV1 } from "./document";
import { importPrototypeCollections, previewIsDirty, reconcilePreviewSave } from "./admin-state";
import { PreviewPortfolioView } from "./portfolio-view";
import type { SiteEditorScope } from "../site-editor/scope";
import styles from "./admin.module.css";

type Envelope = { content: PreviewPortfolioDocumentV1 | null; revision: number; updatedAt: string | null };
const names: Record<string, string> = { brand: "品牌名称", mark: "简写标识", photographer: "摄影师名称", role: "身份介绍", city: "服务城市", availability: "可约时间", intro: "个人简介", eyebrow: "上方短文案", title: "首页标题", services: "拍摄服务", wechat: "微信号", email: "邮箱", note: "联系区说明", lineOne: "第一行", lineTwo: "第二行", label: "名称", value: "内容", number: "编号", english: "英文标题", name: "名称", description: "介绍", price: "价格", duration: "拍摄时长", handle: "账号或主页链接" };
function Field({ label, value, onChange, multiline = false, maxLength = 2000 }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; maxLength?: number }) {
  return <label className={styles.field}><span>{label}</span>{multiline ? <textarea value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /> : <input value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}</label>;
}
function TextFields<T extends Record<string, string>>({ value, onChange, prefix }: { value: T; onChange: (value: T) => void; prefix: string }) {
  return <div className={styles.grid}>{Object.entries(value).map(([key, text]) => <Field key={key} label={`${prefix}${names[key] ?? key}`} value={text} onChange={(next) => onChange({ ...value, [key]: next })} multiline={["intro", "note", "description"].includes(key)} />)}</div>;
}
function readEnvelope(value: unknown): Envelope {
  if (!value || typeof value !== "object") throw new Error("新版数据响应格式错误，草稿未改变。");
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || !(raw.updatedAt === null || typeof raw.updatedAt === "string")) throw new Error("新版版本信息无效，草稿未改变。");
  return { content: raw.content === null ? null : parsePreviewDocument(raw.content), revision: raw.revision as number, updatedAt: raw.updatedAt };
}

export default function PreviewPortfolioAdmin(props?: { siteScope?: SiteEditorScope; SitePreview?: ComponentType<{ document: PreviewPortfolioDocumentV1; embedded?: boolean; initialCollectionId?: string }> }) {
  // Site routes exist only in Standard Next Node; omit their adapter from rollback builds.
  const siteScope = process.env.NEXT_PUBLIC_FRAME_ZERO_SITE_EDITOR === "1" ? props?.siteScope : undefined;
  const endpoint = siteScope?.endpoint ?? "/api/preview/site-content";
  const siteMode = Boolean(siteScope);
  const PortfolioView = process.env.NEXT_PUBLIC_FRAME_ZERO_SITE_EDITOR === "1" ? props?.SitePreview ?? PreviewPortfolioView : PreviewPortfolioView;
  const [draft, setDraft] = useState(createEmptyPreviewDocument);
  const [saved, setSaved] = useState<PreviewPortfolioDocumentV1 | null>(null);
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("正在读取新版工作区…");
  const [section, setSection] = useState("profile");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPortfolioDocumentV1 | null>(null);
  const [previewCollectionId, setPreviewCollectionId] = useState<string | undefined>();
  const previewRef = useRef<HTMLElement | null>(null);
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [libraryState, setLibraryState] = useState("素材库读取中…");
  const [libraryReady, setLibraryReady] = useState(false);
  const current = useRef(draft);
  const savingLock = useRef(false);
  const readingLock = useRef(false);
  const draftVersion = useRef(0);
  const requestNumber = useRef(0);
  const dirty = saved === null ? previewIsDirty(draft, createEmptyPreviewDocument()) : previewIsDirty(draft, saved);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selected = draft.collections.find((collection) => collection.id === selectedId) ?? draft.collections[0] ?? null;
  const edit = useCallback((transform: (value: PreviewPortfolioDocumentV1) => PreviewPortfolioDocumentV1) => {
    const next = transform(current.current);
    current.current = next; draftVersion.current += 1; setDraft(next);
  }, []);

  const reload = useCallback(async () => {
    if (savingLock.current || readingLock.current) return;
    readingLock.current = true;
    const request = ++requestNumber.current;
    const startVersion = draftVersion.current;
    setLoadState("loading"); setMessage("正在读取新版保存内容…");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("新版内容读取失败；没有载入默认数据，也不会覆盖草稿。");
      const result = readEnvelope(await response.json());
      if (request !== requestNumber.current) return;
      if (draftVersion.current !== startVersion) throw new Error("读取期间草稿发生变化，未覆盖。请再次明确重新读取。");
      const next = result.content ?? createEmptyPreviewDocument();
      current.current = next; draftVersion.current += 1; setDraft(next); setSaved(result.content); setRevision(result.revision); setUpdatedAt(result.updatedAt);
      setConflict(false); setLoadState("ready"); setMessage(siteMode ? "本站高级拍立得草稿已读取。保存不发布，也不改变基础版内容。" : result.content ? "新版内容已读取。保存只影响 /preview。" : "尚未配置新版。请填写资料、新建图集后保存；不会自动复制旧站。");
    } catch (error) { if (request === requestNumber.current) { setLoadState("error"); setMessage(error instanceof Error ? error.message : "读取失败；草稿保留。"); } }
    finally { readingLock.current = false; }
  }, [endpoint, siteMode]);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => { clearTimeout(timer); requestNumber.current += 1; }; }, [reload]);
  const loadLibrary = useCallback(async () => {
    if (siteMode) { setAssets([]); setLibraryReady(false); setLibraryState("本站素材尚未接入。可以编辑空图集与资料；不会读取本机共享图库。"); return; }
    setLibraryState("素材库读取中…");
    try {
      const response = await fetch("/photos/library-manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const manifest = parsePhotoLibraryManifest(await response.json());
      if (!manifest) throw new Error("invalid");
      setAssets(manifest.assets); setLibraryReady(true); setLibraryState(`可用素材 ${manifest.assets.length} 张。已回收素材不在选片列表；已保存引用会保留。`);
    } catch { setLibraryReady(false); setLibraryState("素材库读取失败。已有引用全部保留，不会因读取失败清空成员；请重新读取素材。"); }
  }, [siteMode]);
  useEffect(() => { const timer = setTimeout(() => void loadLibrary(), 0); return () => clearTimeout(timer); }, [loadLibrary]);

  const save = useCallback(async () => {
    if (savingLock.current || loadState !== "ready" || !dirty || conflict) return;
    let submitted: PreviewPortfolioDocumentV1;
    try { submitted = parsePreviewDocument(current.current); }
    catch (error) { setMessage(error instanceof Error ? error.message : "内容校验失败，草稿保留。"); return; }
    savingLock.current = true; setSaving(true); setMessage("正在保存新版修改…");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: submitted, expectedRevision: revision }) });
      if (response.status === 409) { setConflict(true); throw new Error("版本冲突：其他标签页已保存新版本。当前草稿已保留；请先导出草稿，再重新读取并人工合并。不会自动覆盖。"); }
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "保存失败；草稿保留。");
      const result = readEnvelope(body);
      if (!result.content || result.revision <= revision) throw new Error("未收到有效保存确认，草稿保留；请核对重新读取。");
      const reconciled = reconcilePreviewSave(submitted, current.current, result.content);
      current.current = reconciled.draft; draftVersion.current += 1; setDraft(reconciled.draft); setSaved(reconciled.saved); setRevision(result.revision); setUpdatedAt(result.updatedAt);
      setMessage(reconciled.changedWhileSaving ? "提交的版本已保存；保存期间的新编辑仍保留为未保存修改。" : siteMode ? "本站高级拍立得草稿已保存。基础版内容和公开页面未改变。" : "新版保存成功。/preview 刷新后读取此版本；旧站内容未改变。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败；草稿保留。"); }
    finally { savingLock.current = false; setSaving(false); }
  }, [conflict, dirty, endpoint, loadState, revision, siteMode]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (!isAdminSaveShortcut(event)) return; event.preventDefault(); void save(); };
    const leave = (event: BeforeUnloadEvent) => { if (!dirty && !saving) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("keydown", shortcut); window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("keydown", shortcut); window.removeEventListener("beforeunload", leave); };
  }, [dirty, saving, save]);
  useEffect(() => {
    if (!preview) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    previewRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      const frame = previewRef.current;
      // The nested Lightbox owns its own keyboard scope while open.
      if (!frame || frame.querySelector(".lightbox")) return;
      if (event.key === "Escape") { event.preventDefault(); setPreview(null); return; }
      if (event.key !== "Tab") return;
      const focusable = [...frame.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !frame.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !frame.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll: true }); };
  }, [preview]);
  const updateCollection = (transform: (item: Collection) => Collection) => { if (selected) edit((doc) => ({ ...doc, collections: doc.collections.map((item) => item.id === selected.id ? transform(item) : item) })); };
  const copyBasics = async () => {
    if (siteMode) return;
    if (!confirm("仅将原站基础资料、套餐与联系信息复制到当前新版草稿；会替换草稿中的这些字段，图集不变。仍需手动保存。继续？")) return;
    const version = draftVersion.current;
    try {
      const response = await fetch("/api/site-content", { cache: "no-store" });
      const body = await response.json() as { content?: SiteContent; warning?: string };
      if (!response.ok || !body.content || body.warning) throw new Error("旧站读取失败或正在使用降级数据，未复制。");
      const copied = copyLegacyBasics(body.content);
      if (draftVersion.current !== version) throw new Error("读取期间你继续编辑了草稿，未覆盖；请重新执行复制。");
      edit((doc) => ({ ...copied, collections: doc.collections })); setMessage("原站白名单基础资料已复制到新版草稿，尚未保存；之后不会自动同步。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "复制失败，原草稿未改变。"); }
  };
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "preview-workspace-draft.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importCollections = async (file?: File) => {
    if (siteMode) return;
    if (!file) return;
    if (file.size > 512 * 1024) { setMessage("导入文件不得超过 512 KB。"); return; }
    if (!confirm("导入将替换当前草稿的图集列表（不改资料），并为图集生成新的稳定 ID。不会自动保存。继续？")) return;
    const version = draftVersion.current;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (version !== draftVersion.current) throw new Error("导入期间草稿已修改，取消导入以保护新编辑。");
      const next = parsePreviewDocument(importPrototypeCollections(value, current.current, () => crypto.randomUUID()));
      edit(() => next); setSelectedId(next.collections[0]?.id ?? null); setMessage("图集已导入新版草稿。请检查封面与成员后手动保存。无法恢复已经丢失的浏览器内存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "导入格式无效，草稿未改变。"); }
  };
  const memberLabel = (id: string) => { const index = assets.findIndex((asset) => asset.id === id); return index >= 0 ? `素材 ${String(index + 1).padStart(2, "0")} · ${assets[index].orientation === "portrait" ? "竖图" : assets[index].orientation === "landscape" ? "横图" : "方图"}` : `缺失或已回收 · ${id.slice(0, 12)}`; };

  return <main className={styles.workspace}>
    <header className={styles.topbar}><div><h1>新版摄影作品集后台</h1><p>{siteMode ? "本站高级拍立得草稿" : "独立本地工作区"} · {dirty ? "有未保存修改" : saved ? `已保存 · 版本 ${revision}` : "尚未配置"}{saving ? " · 保存中" : ""}</p></div><div className={styles.actions}>
      <a href={siteScope?.previewHref ?? "/preview"} target="_blank" rel="noreferrer">{siteMode ? "查看受保护草稿 ↗" : "查看已保存主页 ↗"}</a>
      <button type="button" disabled={loadState !== "ready"} onClick={() => { setPreviewCollectionId(undefined); setPreview(structuredClone(draft)); }}>查看草稿效果</button>
      <button type="button" disabled={saving || loadState === "loading"} onClick={() => { if ((!dirty && !conflict) || confirm("重新读取将替换当前未保存草稿。若有冲突，请先导出留存，确认继续？")) void reload(); }}>重新读取</button>
      <button className={styles.primary} type="button" onClick={() => void save()} disabled={loadState !== "ready" || saving || !dirty || conflict}>保存新版修改</button>
    </div></header>
    <div className={styles.body}>
      <p className={styles.notice} role="status">{message}{updatedAt && <><br /><small>服务端更新时间：{updatedAt}</small></>}</p>
      <div className={styles.row}>{siteMode ? <><a href={siteScope?.adminBasePath.replace(/\/premium-polaroid$/, "")} onClick={(event) => { if (dirty && !window.confirm("当前草稿尚未保存，确认返回内容空间选择？")) event.preventDefault(); }}>返回本站后台</a><span className={styles.hint}>两套内容独立保存；本站素材接入尚未开放。</span></> : <><a href="/admin" target="_blank" rel="noreferrer">原版后台 ↗</a><a href="/" target="_blank" rel="noreferrer">原版十一模板主页 ↗</a><span className={styles.hint}>新旧内容独立保存，素材库共用。</span></>}<button type="button" onClick={exportDraft}>导出当前草稿</button></div>
      <nav className={styles.nav} aria-label="新版编辑分区">{[["profile", "主页资料"], ["collections", "图集管理"], ["contact", "套餐与联系"]].map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</nav>
      <fieldset disabled={loadState !== "ready"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {section === "profile" && <>
          <section className={styles.panel}><h2>摄影师资料</h2><TextFields value={draft.profile} prefix="" onChange={(profile) => edit((doc) => ({ ...doc, profile }))} /></section>
          <section className={styles.panel}><h2>首页文案</h2><TextFields value={draft.hero} prefix="" onChange={(hero) => edit((doc) => ({ ...doc, hero }))} /></section>
          <section className={styles.panel}><h2>关键信息</h2>{draft.trustItems.map((item, index) => <div key={index} className={styles.panel}><TextFields value={item} prefix={`信息 ${index + 1} · `} onChange={(next) => edit((doc) => ({ ...doc, trustItems: doc.trustItems.map((entry, i) => i === index ? next : entry) }))} /><div className={styles.row}><button type="button" disabled={index === 0} onClick={() => edit((doc) => ({ ...doc, trustItems: moveItem(doc.trustItems, index, index - 1) }))}>上移</button><button type="button" onClick={() => edit((doc) => ({ ...doc, trustItems: doc.trustItems.filter((_, i) => i !== index) }))}>移除信息</button></div></div>)}<button type="button" disabled={draft.trustItems.length >= 8} onClick={() => edit((doc) => ({ ...doc, trustItems: [...doc.trustItems, { label: "", value: "" }] }))}>添加关键信息</button></section>
          {!siteMode && <section className={styles.panel}><h2>一次性复制原站资料</h2><p className={styles.hint}>只复制白名单基础资料、套餐和联系方式，不复制模板作品，不猜测图集分类。复制结果先进入草稿。</p><button type="button" onClick={() => void copyBasics()}>从原站复制基础资料到当前草稿</button></section>}
        </>}
        {section === "collections" && <>
          <div className={styles.row}><button type="button" disabled={draft.collections.length >= 30} onClick={() => { const id = crypto.randomUUID(); edit((doc) => ({ ...doc, collections: [...doc.collections, { id, name: "新图集", description: "", visible: true, coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, assetIds: [], focusAssetId: null }] })); setSelectedId(id); }}>新建图集</button><span className={styles.hint}>最多 30 个图集，每个图集最多 500 张；移除关系不会删除素材。</span></div>
          <div className={styles.collections}><aside className={styles.list} aria-label="图集列表">{draft.collections.map((item, index) => <button key={item.id} type="button" aria-current={selected?.id === item.id} onClick={() => setSelectedId(item.id)}>{index + 1}. {item.name || "未命名"} · {item.assetIds.length} 张{!item.visible && " · 隐藏"}</button>)}</aside>
            {selected ? <section className={styles.panel}><h2>编辑图集</h2><div className={styles.grid}><Field label="图集名称" maxLength={120} value={selected.name} onChange={(name) => updateCollection((item) => ({ ...item, name }))} /><Field label="图集简介" value={selected.description} onChange={(description) => updateCollection((item) => ({ ...item, description }))} /></div>
              <div className={styles.row}><label><input type="checkbox" checked={selected.visible} onChange={(event) => updateCollection((item) => ({ ...item, visible: event.target.checked }))} /> 显示此图集</label><button type="button" disabled={draft.collections.indexOf(selected) === 0} onClick={() => edit((doc) => ({ ...doc, collections: moveItem(doc.collections, doc.collections.indexOf(selected), doc.collections.indexOf(selected) - 1) }))}>图集上移</button><button type="button" disabled={draft.collections.indexOf(selected) === draft.collections.length - 1} onClick={() => edit((doc) => ({ ...doc, collections: moveItem(doc.collections, doc.collections.indexOf(selected), doc.collections.indexOf(selected) + 1) }))}>图集下移</button><button type="button" onClick={() => { if (confirm(`移除图集“${selected.name}”？只解除新版关系，不删除照片文件。`)) edit((doc) => ({ ...doc, collections: doc.collections.filter((item) => item.id !== selected.id) })); }}>移除图集</button></div>
              <div className={styles.grid}><label className={styles.field}>独立封面<select value={selected.coverAssetId ?? ""} onChange={(event) => updateCollection((item) => ({ ...item, coverAssetId: event.target.value || null }))}><option value="">使用首张可用成员</option>{selected.coverAssetId && !assetMap.has(selected.coverAssetId) && <option value={selected.coverAssetId}>{memberLabel(selected.coverAssetId)}（保留引用）</option>}{assets.map((asset) => <option key={asset.id} value={asset.id}>{memberLabel(asset.id)}</option>)}</select></label><label className={styles.field}>封面显示<select value={selected.coverFit} onChange={(event) => updateCollection((item) => ({ ...item, coverFit: event.target.value as Collection["coverFit"] }))}><option value="natural">完整原比例</option><option value="fill">填充裁切</option></select></label></div>
              {selected.coverAssetId && assetMap.has(selected.coverAssetId) && <img alt="当前封面" className={styles.cover} src={assetMap.get(selected.coverAssetId)!.variants.card.src} style={selected.coverFit === "fill" ? { aspectRatio: "4 / 3", width: 320, objectFit: "cover", objectPosition: `${selected.coverFocusX}% ${selected.coverFocusY}%` } : undefined} />}
              {selected.coverAssetId && !assetMap.has(selected.coverAssetId) && <p className={styles.warning}>封面暂不可用或素材库未成功读取。引用保留，展示端不会请求断图。</p>}
              <div className={styles.grid}>{(["X", "Y"] as const).map((axis) => { const key = axis === "X" ? "coverFocusX" : "coverFocusY"; return <label className={styles.field} key={axis}>封面焦点 {axis}：{selected[key]}%<input type="range" min="0" max="100" value={selected[key]} onChange={(event) => updateCollection((item) => ({ ...item, [key]: Number(event.target.value) }))} /></label>; })}</div>
              <label className={styles.field}>星图重点照片<select value={selected.focusAssetId ?? ""} onChange={(event) => updateCollection((item) => ({ ...item, focusAssetId: event.target.value || null }))}><option value="">默认第一张可用成员</option>{selected.assetIds.map((id) => <option key={id} value={id}>{memberLabel(id)}</option>)}</select></label>
              <h3 style={{ marginTop: 24 }}>成员与顺序 · {selected.assetIds.length} 张</h3><ol className={styles.memberList}>{selected.assetIds.map((id, index) => <li className={styles.member} key={id}>{assetMap.has(id) && <img alt="" src={assetMap.get(id)!.variants.thumbnail.src} />}<span>{index + 1}. {memberLabel(id)}{!assetMap.has(id) && " · 引用保留"}</span><button type="button" aria-label={`成员 ${index + 1} 上移`} disabled={index === 0} onClick={() => updateCollection((item) => ({ ...item, assetIds: moveItem(item.assetIds, index, index - 1) }))}>↑</button><button type="button" aria-label={`成员 ${index + 1} 下移`} disabled={index === selected.assetIds.length - 1} onClick={() => updateCollection((item) => ({ ...item, assetIds: moveItem(item.assetIds, index, index + 1) }))}>↓</button><button type="button" onClick={() => updateCollection((item) => ({ ...item, assetIds: item.assetIds.filter((entry) => entry !== id), focusAssetId: item.focusAssetId === id ? null : item.focusAssetId }))}>移出</button></li>)}</ol>
              <div className={styles.row}><button type="button" disabled={!selected.assetIds.length} onClick={() => { if (confirm("移出此图集的全部成员？仅解除关系，素材文件及独立封面不变。")) updateCollection((item) => ({ ...item, assetIds: [], focusAssetId: null })); }}>移出全部成员</button><button type="button" onClick={() => { setPreviewCollectionId(selected.id); setPreview(structuredClone({ ...draft, collections: [{ ...selected, visible: true }] })); }}>查看图集草稿效果</button></div>
              {siteMode ? <p className={styles.hint}>{libraryState}</p> : <details><summary>从共享素材库添加照片</summary><p className={styles.hint}>{libraryState}</p><div className={styles.row}><button type="button" onClick={() => void loadLibrary()}>重新读取素材</button><a href="/admin/layout" target="_blank" rel="noreferrer">打开原版共享素材库管理 ↗</a></div><p className={styles.hint}>这是共用素材库；导入和回收会影响两边素材可用性。此处只选择可用图片。</p><div className={styles.library}>{assets.map((asset) => <div className={styles.asset} key={asset.id}><img alt={memberLabel(asset.id)} src={asset.variants.thumbnail.src} loading="lazy" /><span>{memberLabel(asset.id)}</span><button type="button" disabled={!libraryReady || selected.assetIds.includes(asset.id) || selected.assetIds.length >= 500} onClick={() => updateCollection((item) => ({ ...item, assetIds: [...item.assetIds, asset.id] }))}>{selected.assetIds.includes(asset.id) ? "已在图集" : "加入图集"}</button><button type="button" disabled={!libraryReady} onClick={() => updateCollection((item) => ({ ...item, coverAssetId: asset.id }))}>设为封面</button></div>)}</div></details>}
            </section> : <p className={styles.notice}>还没有图集，点击“新建图集”开始。</p>}
          </div>
          {!siteMode && <section className={styles.panel}><h2>显式导入旧原型图集</h2><p className={styles.hint}>选择之前导出的 JSON。仅导入图集到当前草稿，不自动保存；不会猜测分类或恢复已丢失的内存。</p><label className={styles.field}>导入图集 JSON<input type="file" accept="application/json,.json" onChange={(event) => { void importCollections(event.target.files?.[0]); event.target.value = ""; }} /></label></section>}
        </>}
        {section === "contact" && <>
          <section className={styles.panel}><h2>拍摄套餐</h2>{draft.packages.map((item, index) => <div className={styles.panel} key={index}><TextFields prefix={`套餐 ${index + 1} · `} value={{ number: item.number, english: item.english, name: item.name, description: item.description, price: item.price, duration: item.duration }} onChange={(next) => edit((doc) => ({ ...doc, packages: doc.packages.map((entry, i) => i === index ? { ...entry, ...next } : entry) }))} /><Field label="交付内容（每行一条）" multiline value={item.deliverables.join("\n")} onChange={(text) => edit((doc) => ({ ...doc, packages: doc.packages.map((entry, i) => i === index ? { ...entry, deliverables: text === "" ? [] : text.split("\n") } : entry) }))} /><div className={styles.row}><label><input type="checkbox" checked={item.enabled} onChange={(event) => edit((doc) => ({ ...doc, packages: doc.packages.map((entry, i) => i === index ? { ...entry, enabled: event.target.checked } : entry) }))} /> 显示套餐</label><button type="button" disabled={index === 0} onClick={() => edit((doc) => ({ ...doc, packages: moveItem(doc.packages, index, index - 1) }))}>上移</button><button type="button" onClick={() => { if (confirm("从新版草稿移除此套餐？")) edit((doc) => ({ ...doc, packages: doc.packages.filter((_, i) => i !== index) })); }}>移除套餐</button></div></div>)}<button type="button" disabled={draft.packages.length >= 12} onClick={() => edit((doc) => ({ ...doc, packages: [...doc.packages, { number: String(doc.packages.length + 1), english: "", name: "新套餐", description: "", price: "", duration: "", deliverables: [], enabled: true }] }))}>添加套餐</button></section>
          <section className={styles.panel}><h2>联系方式</h2><TextFields value={draft.contact} prefix="" onChange={(contact) => edit((doc) => ({ ...doc, contact }))} /></section>
          <section className={styles.panel}><h2>平台账号与分享卡</h2><p className={styles.hint}>{siteMode ? "可编辑平台名称与账号；本站分享卡素材上传尚未接入。" : "分享卡可通过一次性复制原站资料复用现有引用；文件保持 local-only。此处不另建上传系统。"}</p>{draft.social.map((item, index) => <div className={styles.panel} key={index}><TextFields value={{ label: item.label, handle: item.handle }} prefix={`平台 ${index + 1} · `} onChange={(next) => edit((doc) => ({ ...doc, social: doc.social.map((entry, i) => i === index ? { ...entry, ...next } : entry) }))} />{!siteMode && getPlatformQrAssetPath(item.qrAssetId) && <img className={styles.qr} alt={`${item.label}分享卡`} src={getPlatformQrAssetPath(item.qrAssetId)!} />}<div className={styles.row}><button type="button" disabled={index === 0} onClick={() => edit((doc) => ({ ...doc, social: moveItem(doc.social, index, index - 1) }))}>上移</button>{item.qrAssetId && <button type="button" onClick={() => edit((doc) => ({ ...doc, social: doc.social.map((entry, i) => i === index ? { label: entry.label, handle: entry.handle } : entry) }))}>移除分享卡引用</button>}<button type="button" onClick={() => edit((doc) => ({ ...doc, social: doc.social.filter((_, i) => i !== index) }))}>移除平台</button></div></div>)}<button type="button" disabled={draft.social.length >= 8} onClick={() => edit((doc) => ({ ...doc, social: [...doc.social, { label: "", handle: "" }] }))}>添加平台账号</button></section>
          <section className={styles.panel}><h2>约拍清单</h2><Field label="清单字段（每行一条，顺序即展示顺序）" multiline value={draft.bookingFields.join("\n")} onChange={(text) => edit((doc) => ({ ...doc, bookingFields: text === "" ? [] : text.split("\n") }))} /></section>
          <section className={styles.panel}><h2>约拍标题</h2><TextFields value={draft.statement} prefix="" onChange={(statement) => edit((doc) => ({ ...doc, statement }))} /></section>
        </>}
      </fieldset>
    </div>
    {preview && createPortal(<section ref={previewRef} className={styles.preview} role="dialog" aria-modal="true" aria-label="新版未保存草稿效果"><div className={styles.previewBar}><p>草稿快照 · 尚未保存到主页</p><button type="button" onClick={() => setPreview(null)}>关闭草稿效果</button></div><PortfolioView document={preview} embedded initialCollectionId={previewCollectionId} /></section>, document.body)}
  </main>;
}
