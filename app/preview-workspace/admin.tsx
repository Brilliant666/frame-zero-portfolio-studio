"use client";

/* eslint-disable @next/next/no-img-element -- Shared local library variants and local-only platform cards. */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parsePhotoLibraryManifest, type PhotoAsset } from "../photo-library";
import { getPlatformQrAssetPath } from "../platform-qr";
import type { SiteContent } from "../site-config";
import { collectionCover, moveItem, type Collection } from "../templates/polaroid-field/collection-model";
import { isAdminSaveShortcut } from "../admin/admin-state";
import { createEmptyPreviewDocument, copyLegacyBasics, parsePreviewDocument, type PreviewPortfolioDocumentV1 } from "./document";
import { importPrototypeCollections, previewIsDirty, reconcilePreviewSave } from "./admin-state";
import { PreviewPortfolioView } from "./portfolio-view";
import { loadSiteAssets, type SiteAsset } from "../site-editor/assets-client";
import SitePhotoPicker from "./site-photo-picker";
import { appendPickedPhotos } from "./photo-picker-state";
import { parseSitePremiumDocument } from "../site-editor/content-schema";
import SiteAssetUpload from "../site-editor/asset-upload";
import SiteContactCard from "../site-editor/contact-card";
import { setContactCardReference } from "../site-editor/contact-card-state";
import type { SiteEditorScope } from "../site-editor/scope";
import type { PublicationEditorProps } from "../site-editor/publication-controls";
import { confirmDraftSave, DraftSaveRejected, DraftSaveUncertain, writeSiteDraft, type DraftSaveOptions, type DraftSaveReceipt, type PendingDraftSave } from "../site-editor/draft-save";
import CollectionMemberEditor from "./collection-member-editor";
import CollectionLivePreview from "./collection-live-preview";
import SitePhotoLibrary from "./site-photo-library";
import styles from "./admin.module.css";

type Envelope = { content: PreviewPortfolioDocumentV1 | null; revision: number; updatedAt: string | null };
const names: Record<string, string> = { brand: "品牌名称", mark: "简写标识", photographer: "摄影师名称", role: "身份介绍", city: "服务城市", availability: "可约时间", intro: "个人简介", eyebrow: "上方短文案", title: "首页标题", services: "拍摄服务", wechat: "微信号", email: "邮箱", note: "联系区说明", lineOne: "第一行", lineTwo: "第二行", label: "名称", value: "内容", number: "编号", english: "英文标题", name: "名称", description: "介绍", price: "价格", duration: "拍摄时长", handle: "账号或主页链接" };
function Field({ label, value, onChange, multiline = false, maxLength = 2000 }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; maxLength?: number }) {
  return <label className={styles.field}><span>{label}</span>{multiline ? <textarea value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /> : <input value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}</label>;
}
function TextFields<T extends Record<string, string>>({ value, onChange, prefix }: { value: T; onChange: (value: T) => void; prefix: string }) {
  return <div className={styles.grid}>{Object.entries(value).map(([key, text]) => <Field key={key} label={`${prefix}${names[key] ?? key}`} value={text} onChange={(next) => onChange({ ...value, [key]: next })} multiline={["intro", "note", "description"].includes(key)} />)}</div>;
}
function readEnvelope(value: unknown, siteMode = false): Envelope {
  if (!value || typeof value !== "object") throw new Error("新版数据响应格式错误，草稿未改变。");
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || !(raw.updatedAt === null || typeof raw.updatedAt === "string")) throw new Error("新版版本信息无效，草稿未改变。");
  return { content: raw.content === null ? null : siteMode ? parseSitePremiumDocument(raw.content) : parsePreviewDocument(raw.content), revision: raw.revision as number, updatedAt: raw.updatedAt };
}

function MemberPhoto({ asset, onClose }: { asset: SiteAsset; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={styles.memberDialog} aria-label="成员照片大图" onCancel={event => { event.preventDefault(); onClose(); }}><button type="button" autoFocus onClick={onClose}>关闭大图</button><img src={asset.variants.full.src} alt={`素材 ${asset.id}`} /><p>素材 ID {asset.id}</p></dialog>;
}

function CoverSettings({ siteMode, children }: { siteMode: boolean; children: ReactNode }) {
  return siteMode ? <section className={styles.coverSettings}><h3>封面与重点照片</h3><p className={styles.hint}>封面用于首页图集入口；重点照片影响星座展示。切换“展示效果”可查看当前编辑。</p><div>{children}</div></section> : <>{children}</>;
}

export default function PreviewPortfolioAdmin(props?: { siteScope?: SiteEditorScope; PublicationControls?: ComponentType<PublicationEditorProps>; SitePreview?: ComponentType<{ document: PreviewPortfolioDocumentV1; embedded?: boolean; initialCollectionId?: string; assets?: readonly PhotoAsset[] }> }) {
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
  const sections = siteMode ? [["albums", "图集库"], ["library", "本站图库"], ["profile", "主页资料"], ["packages", "拍摄套餐"], ["contact", "联系约拍"]] : [["profile", "主页资料"], ["collections", "图集管理"], ["contact", "套餐与联系"]];
  const siteName = siteScope?.adminBasePath.split("/")[1] ?? "";
  const changeSection = (value: string) => {
    setSection(value);
    if (siteMode) { const url = new URL(window.location.href); url.hash = `edit-${value}`; window.history.replaceState(null, "", url); }
  };
  useEffect(() => {
    if (!siteMode) return;
    const sync = () => { const value = window.location.hash.replace(/^#edit-/, ""); if (["profile", "collections", "albums", "library", "packages", "contact"].includes(value)) setSection(value); };
    const timer = setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", sync); };
  }, [siteMode]);
  const [collectionTab, setCollectionTab] = useState<"photos" | "settings" | "effect">("photos");
  const [compareEffect, setCompareEffect] = useState(false);
  const photoScroll = useRef(0);
  const changeCollectionTab = (value: "photos" | "settings" | "effect") => {
    if (collectionTab === "photos") photoScroll.current = window.scrollY;
    setCollectionTab(value);
    requestAnimationFrame(() => window.scrollTo({ top: value === "photos" ? photoScroll.current : 0, behavior: "instant" }));
  };
  const [operationMember, setOperationMember] = useState<string | null>(null);
  const [enlargedMember, setEnlargedMember] = useState<SiteAsset | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPortfolioDocumentV1 | null>(null);
  const [previewCollectionId, setPreviewCollectionId] = useState<string | undefined>();
  const previewRef = useRef<HTMLElement | null>(null);
  const [assets, setAssets] = useState<SiteAsset[]>([]);
  const [pickerCollectionId, setPickerCollectionId] = useState<string | null>(null);
  const [recentAdditions, setRecentAdditions] = useState<string[]>([]);
  const [libraryTruncated, setLibraryTruncated] = useState(false);
  const libraryRequest = useRef(0);
  const [libraryState, setLibraryState] = useState("素材库读取中…");
  const [libraryReady, setLibraryReady] = useState(false);
  const current = useRef(draft);
  const savingLock = useRef(false);
  const readingLock = useRef(false);
  const draftVersion = useRef(0);
  const requestNumber = useRef(0);
  const lifetime = useRef(new AbortController());
  const pendingRef = useRef<PendingDraftSave | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [endpoint]);
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
      const result = readEnvelope(await response.json(), siteMode);
      if (request !== requestNumber.current) return;
      if (draftVersion.current !== startVersion) throw new Error("读取期间草稿发生变化，未覆盖。请再次明确重新读取。");
      const next = result.content ?? createEmptyPreviewDocument();
      current.current = next; draftVersion.current += 1; setDraft(next); setSaved(result.content); setRevision(result.revision); setUpdatedAt(result.updatedAt);
      pendingRef.current = null; setPendingSave(false);
      setConflict(false); setLoadState("ready"); setMessage(siteMode ? "" : result.content ? "新版内容已读取。保存只影响 /preview。" : "尚未配置新版。请填写资料、新建图集后保存；不会自动复制旧站。");
    } catch (error) { if (request === requestNumber.current) { setLoadState("error"); setMessage(error instanceof Error ? error.message : "读取失败；草稿保留。"); } }
    finally { readingLock.current = false; }
  }, [endpoint, siteMode]);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => { clearTimeout(timer); requestNumber.current += 1; }; }, [reload]);
  const loadLibrary = useCallback(async () => {
    const request = ++libraryRequest.current;
    setLibraryReady(false);
    setLibraryState("素材库读取中…");
    try {
      if (siteScope) {
        const manifest = await loadSiteAssets(siteScope.assetsEndpoint);
        if (request !== libraryRequest.current) return;
        setLibraryTruncated(Boolean(manifest.truncated));
        setAssets(manifest.assets); setLibraryReady(true); setLibraryState(`已载入本站素材 ${manifest.assets.length} 张；两套内容独立引用。`); return;
      }
      const response = await fetch("/photos/library-manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const manifest = parsePhotoLibraryManifest(await response.json());
      if (!manifest) throw new Error("invalid");
      setAssets(manifest.assets); setLibraryReady(true); setLibraryState(`可用素材 ${manifest.assets.length} 张。已回收素材不在选片列表；已保存引用会保留。`);
    } catch { if (request === libraryRequest.current) { setLibraryReady(false); setLibraryState("素材库读取失败。已有引用全部保留，不会因读取失败清空成员；请重新读取素材。"); } }
  }, [siteScope]);
  useEffect(() => { const timer = setTimeout(() => void loadLibrary(), 0); return () => clearTimeout(timer); }, [loadLibrary]);

  const save = useCallback(async (options?: DraftSaveOptions): Promise<DraftSaveReceipt | null> => {
    const signal = options?.signal ? AbortSignal.any([options.signal, lifetime.current.signal]) : lifetime.current.signal;
    if (savingLock.current || loadState !== "ready" || conflict || pendingRef.current || signal.aborted) return null;
    if (!dirty) return saved && revision > 0 ? { content: saved, revision, updatedAt } : null;
    let submitted: PreviewPortfolioDocumentV1;
    try { submitted = siteMode ? parseSitePremiumDocument(current.current) : parsePreviewDocument(current.current); }
    catch (error) { setMessage(error instanceof Error ? error.message : "内容校验失败，草稿保留。"); return null; }
    savingLock.current = true; setSaving(true); setMessage("正在保存新版修改…");
    try {
      const receipt = siteMode ? await writeSiteDraft(endpoint, "premium-polaroid", { content: submitted, expectedRevision: revision }, signal) : null;
      const response = receipt ? null : await fetch(endpoint, { method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: submitted, expectedRevision: revision }) });
      if (response?.status === 409) { setConflict(true); throw new Error("版本冲突：其他标签页已保存新版本。当前草稿已保留；请先导出草稿，再重新读取并人工合并。不会自动覆盖。"); }
      const body: unknown = receipt ?? await response!.json();
      if (signal.aborted) return null;
      if (response && !response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "保存失败；草稿保留。");
      const result = readEnvelope(body, siteMode);
      if (!result.content || result.revision <= revision) throw new Error("未收到有效保存确认，草稿保留；请核对重新读取。");
      const reconciled = reconcilePreviewSave(submitted, current.current, result.content);
      current.current = reconciled.draft; draftVersion.current += 1; setDraft(reconciled.draft); setSaved(reconciled.saved); setRevision(result.revision); setUpdatedAt(result.updatedAt);
      setMessage(reconciled.changedWhileSaving ? "提交的版本已保存；保存期间的新编辑仍保留为未保存修改。" : siteMode ? "本站高级拍立得草稿已保存。基础版内容和公开页面未改变。" : "新版保存成功。/preview 刷新后读取此版本；旧站内容未改变。");
      return { content: result.content, revision: result.revision, updatedAt: result.updatedAt };
    } catch (error) {
      if (signal.aborted) return null;
      if (error instanceof DraftSaveRejected && error.status === 409) setConflict(true);
      if (error instanceof DraftSaveUncertain) { pendingRef.current = error.pending; setPendingSave(true); }
      setMessage(error instanceof Error ? error.message : "保存失败；草稿保留。"); return null;
    }
    finally { savingLock.current = false; if (!signal.aborted) setSaving(false); }
  }, [conflict, dirty, endpoint, loadState, revision, saved, siteMode, updatedAt]);
  const checkSave = async () => {
    const pending = pendingRef.current;
    if (!pending || savingLock.current) return;
    savingLock.current = true;
    try {
      const receipt = await confirmDraftSave(endpoint, "premium-polaroid", pending, lifetime.current.signal);
      if (lifetime.current.signal.aborted) return;
      const reconciled = reconcilePreviewSave(pending.content as PreviewPortfolioDocumentV1, current.current, receipt.content as PreviewPortfolioDocumentV1);
      current.current = reconciled.draft; draftVersion.current += 1; setDraft(reconciled.draft); setSaved(reconciled.saved); setRevision(receipt.revision); setUpdatedAt(receipt.updatedAt);
      pendingRef.current = null; setPendingSave(false); setMessage("已确认原提交的草稿保存成功；未自动发布。后续编辑仍保留。");
    } catch { if (!lifetime.current.signal.aborted) setMessage("保存结果仍待确认，未再次写入。请保留当前编辑，检查其他标签页；必要时导出后明确重新读取。"); }
    finally { savingLock.current = false; }
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (!isAdminSaveShortcut(event)) return; event.preventDefault(); if (!pickerCollectionId && !enlargedMember && !preview) void save(); };
    const leave = (event: BeforeUnloadEvent) => { if (!dirty && !saving && !pickerCollectionId) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("keydown", shortcut); window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("keydown", shortcut); window.removeEventListener("beforeunload", leave); };
  }, [dirty, saving, save, pickerCollectionId, enlargedMember, preview]);
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
  const pickerTarget = draft.collections.find(item => item.id === pickerCollectionId);
  const addPickedPhotos = (ids: readonly string[]) => {
    if (!libraryReady || !pickerCollectionId) throw new Error("请先成功读取本站素材。");
    const result = appendPickedPhotos(current.current, pickerCollectionId, ids, new Set(assets.map(asset => asset.id)), revision);
    edit(() => result.document); setRecentAdditions(result.additions); setPickerCollectionId(null);
    setMessage(`已加入 ${result.additions.length} 张，请确认成员顺序后保存修改；尚未发布。`);
  };
  const addLibraryPhotos = (collectionId: string, ids: readonly string[]) => {
    if (!libraryReady) throw new Error("请先成功读取本站素材。");
    const result = appendPickedPhotos(current.current, collectionId, ids, new Set(assets.map(asset => asset.id)), revision);
    edit(() => result.document); setRecentAdditions(result.additions);
    setMessage(`已向图集加入 ${result.additions.length} 张；尚未保存或发布。`);
  };
  const openCollection = (id: string) => {
    setSelectedId(id); setCollectionTab("photos"); setOperationMember(null); photoScroll.current = 0;
    changeSection("collections");
  };
  const createCollection = () => {
    const id = crypto.randomUUID();
    edit(doc => ({ ...doc, collections: [...doc.collections, { id, name: "新图集", description: "", visible: true, coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, assetIds: [], focusAssetId: null }] }));
    openCollection(id);
  };
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

  return <main className={styles.workspace} data-site-editor={siteMode ? "premium" : undefined}>
    {siteMode ? <header className={styles.topbar}>
      <div><p className={styles.breadcrumb}>{siteName} <span>/</span> 高级拍立得</p><h1>{section === "collections" ? "图集编辑" : sections.find(([id]) => id === section)?.[1]}</h1></div>

    </header> : <>
    <header className={styles.topbar}><div><h1>新版摄影作品集后台</h1><p>{siteMode ? "本站高级拍立得草稿" : "独立本地工作区"} · {dirty ? "有未保存修改" : saved ? `已保存 · 版本 ${revision}` : "尚未配置"}{saving ? " · 保存中" : ""}</p></div><div className={styles.actions}>
      <a href={siteScope?.previewHref ?? "/preview"} target="_blank" rel="noreferrer">{siteMode ? "查看受保护草稿 ↗" : "查看已保存主页 ↗"}</a>
      <button type="button" disabled={loadState !== "ready"} onClick={() => { setPreviewCollectionId(undefined); setPreview(structuredClone(draft)); }}>查看草稿效果</button>
      <button type="button" disabled={saving || loadState === "loading"} onClick={() => { if ((!dirty && !conflict) || confirm("重新读取将替换当前未保存草稿。若有冲突，请先导出留存，确认继续？")) void reload(); }}>重新读取</button>
      <button className={styles.primary} type="button" onClick={() => void save()} disabled={loadState !== "ready" || saving || !dirty || conflict}>保存新版修改</button>
    </div></header></>}
    <div className={styles.workArea}>
    {siteMode && <aside className={styles.sidebar}><a className={styles.siteBack} href={siteScope?.adminBasePath.replace(/\/premium-polaroid$/, "")} onClick={(event) => { if (dirty && !window.confirm("当前草稿尚未保存，确认返回内容空间选择？")) event.preventDefault(); }}>← 站点工作台</a><nav aria-label="高级拍立得编辑分区">{sections.map(([id, label], index) => <button key={id} type="button" aria-pressed={section === id || (id === "albums" && section === "collections")} onClick={() => changeSection(id)}><span aria-hidden="true">0{index + 1}</span>{label}</button>)}</nav><p>高级拍立得<br /><small>独立内容 · 本站照片共享</small></p></aside>}
    <div className={styles.body}>
      {siteMode && props?.PublicationControls && <props.PublicationControls revision={revision} dirty={dirty} disabled={loadState !== "ready" || saving || conflict || pendingSave || !!pickerCollectionId} templateId="premium-polaroid" saveDraft={save}
        draftStatus={saving ? "保存中…" : dirty ? "未保存修改" : saved ? "已保存" : "尚未配置"}
        draftAction={<button type="button" onClick={() => void save()} disabled={loadState !== "ready" || saving || !dirty || conflict || pendingSave || !!pickerCollectionId}>仅保存草稿</button>}
        tools={<>
          <button type="button" disabled={loadState !== "ready"} onClick={() => { setPreviewCollectionId(undefined); setPreview(structuredClone(draft)); }}>预览当前编辑</button>
          <a href={siteScope?.previewHref} target="_blank" rel="noreferrer">预览已保存草稿 ↗</a>
          <details><summary>更多</summary><div><button type="button" onClick={exportDraft}>导出当前草稿</button><button type="button" disabled={saving || loadState === "loading"} onClick={() => { if ((!dirty && !conflict && !pendingSave) || confirm("重新读取将替换当前未保存草稿。若有冲突，请先导出留存，确认继续？")) void reload(); }}>重新读取</button>{updatedAt && <small>上次保存 {new Date(updatedAt).toLocaleString()}</small>}</div></details>
        </>} />}
      {pendingSave && <button type="button" onClick={() => void checkSave()}>检查保存结果</button>}
      {siteMode && (pendingSave || conflict || loadState === "error") && <div className={styles.row}><button type="button" onClick={exportDraft}>导出当前草稿</button><button type="button" disabled={saving} onClick={() => { if (confirm("重新读取会替换当前编辑。请先导出留存，确认继续？")) void reload(); }}>重新读取草稿</button></div>}
      {(message || !siteMode) && <p className={styles.notice} data-problem={loadState === "error" || conflict || undefined} role="status">{message}{!siteMode && updatedAt && <><br /><small>服务端更新时间：{updatedAt}</small></>}</p>}
      {!siteMode && <>
      <div className={styles.row}>{siteMode ? <><a href={siteScope?.adminBasePath.replace(/\/premium-polaroid$/, "")} onClick={(event) => { if (dirty && !window.confirm("当前草稿尚未保存，确认返回内容空间选择？")) event.preventDefault(); }}>返回本站后台</a><span className={styles.hint}>两套内容独立保存；本站素材共享引用。</span></> : <><a href="/admin" target="_blank" rel="noreferrer">原版后台 ↗</a><a href="/" target="_blank" rel="noreferrer">原版十一模板主页 ↗</a><span className={styles.hint}>新旧内容独立保存，素材库共用。</span></>}<button type="button" onClick={exportDraft}>导出当前草稿</button></div>
      <nav className={styles.nav} aria-label="新版编辑分区">{sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => changeSection(id)}>{label}</button>)}</nav></>}
      <fieldset disabled={loadState !== "ready"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {siteScope && <section className={styles.panel} hidden={section !== "library"}>
          <SiteAssetUpload endpoint={siteScope.assetsEndpoint} onUploaded={loadLibrary} />
          <SitePhotoLibrary assets={assets} collections={draft.collections} ready={libraryReady} truncated={libraryTruncated} state={libraryState} onReload={loadLibrary} onAdd={addLibraryPhotos} onView={setEnlargedMember} />
        </section>}
        {siteMode && section === "albums" && <section className={styles.panel}>
          <div className={styles.collectionHeading}><div><h2>图集库</h2><p>高级图集 · {draft.collections.length} / 30</p></div><button type="button" disabled={draft.collections.length >= 30} onClick={createCollection}>新建图集</button></div>
          <div className={styles.albumGrid}>{draft.collections.map((item, index) => { const cover = collectionCover(item, assetMap); return <button type="button" className={styles.albumCard} key={item.id} onClick={() => openCollection(item.id)}>{cover ? <img src={cover.variants.thumbnail.src} alt="" /> : <span className={styles.albumPlaceholder}>暂无封面</span>}<strong>{index + 1}. {item.name || "未命名图集"}</strong><span>{item.assetIds.length} 张 · {item.visible ? "显示" : "隐藏"}</span><span>进入图集 →</span></button>; })}</div>
          {!draft.collections.length && <p>先新建图集，再从本站图库选片。</p>}
        </section>}
        {section === "profile" && <>
          <section className={styles.panel}><h2>摄影师资料</h2><TextFields value={draft.profile} prefix="" onChange={(profile) => edit((doc) => ({ ...doc, profile }))} /></section>
          <section className={styles.panel}><h2>首页文案</h2><TextFields value={draft.hero} prefix="" onChange={(hero) => edit((doc) => ({ ...doc, hero }))} /></section>
          <section className={styles.panel}><h2>关键信息</h2>{draft.trustItems.map((item, index) => <div key={index} className={styles.panel}><TextFields value={item} prefix={`信息 ${index + 1} · `} onChange={(next) => edit((doc) => ({ ...doc, trustItems: doc.trustItems.map((entry, i) => i === index ? next : entry) }))} /><div className={styles.row}><button type="button" disabled={index === 0} onClick={() => edit((doc) => ({ ...doc, trustItems: moveItem(doc.trustItems, index, index - 1) }))}>上移</button><button type="button" onClick={() => edit((doc) => ({ ...doc, trustItems: doc.trustItems.filter((_, i) => i !== index) }))}>移除信息</button></div></div>)}<button type="button" disabled={draft.trustItems.length >= 8} onClick={() => edit((doc) => ({ ...doc, trustItems: [...doc.trustItems, { label: "", value: "" }] }))}>添加关键信息</button></section>
          {!siteMode && <section className={styles.panel}><h2>一次性复制原站资料</h2><p className={styles.hint}>只复制白名单基础资料、套餐和联系方式，不复制模板作品，不猜测图集分类。复制结果先进入草稿。</p><button type="button" onClick={() => void copyBasics()}>从原站复制基础资料到当前草稿</button></section>}
        </>}
        {section === "collections" && <>
          {siteMode && <div className={styles.row}><button type="button" onClick={() => changeSection("albums")}>← 图集库</button><button type="button" onClick={() => changeSection("library")}>打开本站图库 / 上传照片</button></div>}

          <div className={styles.collections}><aside className={styles.collectionNavigation}><div className={styles.collectionChooser}><button type="button" disabled={draft.collections.length >= 30} onClick={createCollection}>新建图集</button><label className={styles.collectionSelect}>当前图集<select value={selected?.id ?? ""} onChange={event => openCollection(event.target.value)}>{draft.collections.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.name || "未命名"} · {item.assetIds.length} 张{!item.visible && " · 隐藏"}</option>)}</select></label></div><div className={styles.list} aria-label="图集列表">{draft.collections.map((item, index) => { const cover = collectionCover(item, assetMap); return <button key={item.id} type="button" aria-current={selected?.id === item.id} onClick={() => openCollection(item.id)}>{cover && <img src={cover.variants.thumbnail.src} alt="" />}<span>{index + 1}. {item.name || "未命名"}<small>{item.assetIds.length} 张 · {item.visible ? "显示" : "隐藏"}</small></span></button>; })}</div></aside>
            {selected ? <div className={siteMode ? styles.collectionWorkbench : undefined}><section className={styles.panel}><div className={styles.collectionHeading}><div><h2>{selected.name || "未命名图集"}</h2><p>{selected.assetIds.length} 张 · {selected.visible ? "显示此图集" : "此图集已隐藏"}</p></div>{siteScope && <div className={styles.row}><button type="button" className={styles.primary} disabled={!libraryReady || saving} onClick={() => { setCollectionTab("photos"); setPickerCollectionId(selected.id); }}>从本站图库选片</button><button type="button" onClick={() => { setPreviewCollectionId(selected.id); setPreview(structuredClone({ ...draft, collections: [{ ...selected, visible: true }] })); }}>完整图集预览</button></div>}</div>
              {siteScope && <>{(!libraryReady || libraryTruncated) && <p className={styles.warning} role="status">{libraryState}<button type="button" onClick={() => void loadLibrary()}>重新读取素材</button></p>}</>}
              {selected.coverAssetId && !assetMap.has(selected.coverAssetId) && <p className={styles.warning}>独立封面暂不可用，保留引用；当前预览使用首张可用成员。</p>}
              {siteMode && <nav className={styles.collectionTabs} aria-label="图集编辑内容"><button type="button" aria-pressed={collectionTab === "photos"} onClick={() => changeCollectionTab("photos")}>照片排序</button><button type="button" aria-pressed={collectionTab === "settings"} onClick={() => changeCollectionTab("settings")}>图集设置</button><button type="button" aria-pressed={collectionTab === "effect"} onClick={() => changeCollectionTab("effect")}>展示效果</button></nav>}
              {siteMode && collectionTab === "photos" && <button type="button" aria-pressed={compareEffect} onClick={() => setCompareEffect(value => !value)}>{compareEffect ? "关闭上下对照" : "开启上下对照"}</button>}
              <div hidden={siteMode && collectionTab !== "photos"}>
              {siteMode ? <><h3 className={styles.membersHeading}>成员与顺序 · {selected.assetIds.length} 张</h3><CollectionMemberEditor key={selected.id} collection={selected} assets={assets} onChange={next => updateCollection(() => next)} onView={setEnlargedMember} /></> : <>              <h3 className={styles.membersHeading}>成员与顺序 · {selected.assetIds.length} 张</h3><ol className={styles.memberList}>{selected.assetIds.map((id, index) => <li className={styles.member} key={id} data-new={siteMode && recentAdditions.includes(id)}><button type="button" className={styles.memberImage} disabled={!assetMap.has(id)} aria-label={`查看成员 ${index + 1} 大图`} onClick={() => setEnlargedMember(assetMap.get(id)!)}>{assetMap.has(id) && <img alt="" src={assetMap.get(id)!.variants.thumbnail.src} />}<span>查看大图</span></button><span>{index + 1}. {memberLabel(id)}{siteMode && recentAdditions.includes(id) && " · 本次加入"}{!assetMap.has(id) && " · 引用保留"}</span><button type="button" className={styles.memberSelect} aria-label={`成员 ${index + 1} 选择操作`} aria-expanded={operationMember === id} onClick={() => setOperationMember(operationMember === id ? null : id)}>选择操作</button>{operationMember === id && <div className={styles.memberActions}><button type="button" disabled={!assetMap.has(id)} onClick={() => updateCollection(item => ({ ...item, coverAssetId: id }))}>设为封面</button><button type="button" aria-label={`成员 ${index + 1} 上移`} disabled={index === 0} onClick={() => updateCollection((item) => ({ ...item, assetIds: moveItem(item.assetIds, index, index - 1) }))}>↑</button><button type="button" aria-label={`成员 ${index + 1} 下移`} disabled={index === selected.assetIds.length - 1} onClick={() => updateCollection((item) => ({ ...item, assetIds: moveItem(item.assetIds, index, index + 1) }))}>↓</button><button type="button" onClick={() => updateCollection((item) => ({ ...item, assetIds: item.assetIds.filter((entry) => entry !== id), focusAssetId: item.focusAssetId === id ? null : item.focusAssetId }))}>移出</button>{siteMode && <button type="button" className={styles.movePosition} aria-label={`成员 ${index + 1} 移到指定位置`} onClick={() => {
                const value = window.prompt(`移到第几位？请输入 1–${selected.assetIds.length}`, String(index + 1));
                if (value === null) return;
                const position = Number(value);
                if (!Number.isInteger(position) || position < 1 || position > selected.assetIds.length) { setMessage("位置无效，成员顺序未改变。"); return; }
                updateCollection(item => ({ ...item, assetIds: moveItem(item.assetIds, index, position - 1) }));
              }}>移到第…位</button>}</div>}</li>)}</ol></>}
              </div>
              <div hidden={siteMode && collectionTab !== "settings"} data-collection-settings>

              <div className={styles.row}><button type="button" disabled={!selected.assetIds.length} onClick={() => { if (confirm("移出此图集的全部成员？仅解除关系，素材文件及独立封面不变。")) updateCollection((item) => ({ ...item, assetIds: [], focusAssetId: null })); }}>移出全部成员</button><button type="button" onClick={() => { setPreviewCollectionId(selected.id); setPreview(structuredClone({ ...draft, collections: [{ ...selected, visible: true }] })); }}>查看图集草稿效果</button></div>

              <div className={styles.collectionTools} key={selected.id}><h3>图集名称、简介与显示顺序</h3><div className={styles.grid}><Field label="图集名称" maxLength={120} value={selected.name} onChange={(name) => updateCollection((item) => ({ ...item, name }))} /><Field label="图集简介" value={selected.description} onChange={(description) => updateCollection((item) => ({ ...item, description }))} /></div>
              <div className={styles.row}><label><input type="checkbox" checked={selected.visible} onChange={(event) => updateCollection((item) => ({ ...item, visible: event.target.checked }))} /> 显示此图集</label><button type="button" disabled={draft.collections.indexOf(selected) === 0} onClick={() => edit((doc) => ({ ...doc, collections: moveItem(doc.collections, doc.collections.indexOf(selected), doc.collections.indexOf(selected) - 1) }))}>图集上移</button><button type="button" disabled={draft.collections.indexOf(selected) === draft.collections.length - 1} onClick={() => edit((doc) => ({ ...doc, collections: moveItem(doc.collections, doc.collections.indexOf(selected), doc.collections.indexOf(selected) + 1) }))}>图集下移</button><button type="button" onClick={() => { if (confirm(`移除图集“${selected.name}”？只解除新版关系，不删除照片文件。`)) edit((doc) => ({ ...doc, collections: doc.collections.filter((item) => item.id !== selected.id) })); }}>移除图集</button></div>
              </div>
              <div className={styles.coverSummary}>{(() => { const cover = collectionCover(selected, assetMap); return cover ? <img src={cover.variants.thumbnail.src} alt="图集封面预览" /> : <span>暂无可用封面</span>; })()}<span>{selected.coverAssetId ? "独立封面" : "封面随首张可用成员"} · {selected.coverFit === "fill" ? "填充裁切" : "完整原比例"}</span></div>

              <CoverSettings siteMode={siteMode}><div className={styles.grid}><label className={styles.field}>独立封面<select value={selected.coverAssetId ?? ""} onChange={(event) => updateCollection((item) => ({ ...item, coverAssetId: event.target.value || null }))}><option value="">使用首张可用成员</option>{selected.coverAssetId && !assetMap.has(selected.coverAssetId) && <option value={selected.coverAssetId}>{memberLabel(selected.coverAssetId)}（保留引用）</option>}{assets.map((asset) => <option key={asset.id} value={asset.id}>{memberLabel(asset.id)}</option>)}</select></label><label className={styles.field}>封面显示<select value={selected.coverFit} onChange={(event) => updateCollection((item) => ({ ...item, coverFit: event.target.value as Collection["coverFit"] }))}><option value="natural">完整原比例</option><option value="fill">填充裁切</option></select></label></div>
              {selected.coverAssetId && assetMap.has(selected.coverAssetId) && <img alt="当前封面" className={styles.cover} src={assetMap.get(selected.coverAssetId)!.variants.card.src} style={selected.coverFit === "fill" ? { aspectRatio: "4 / 3", width: 320, objectFit: "cover", objectPosition: `${selected.coverFocusX}% ${selected.coverFocusY}%` } : undefined} />}
              {selected.coverAssetId && !assetMap.has(selected.coverAssetId) && <p className={styles.warning}>封面暂不可用或素材库未成功读取。引用保留，展示端不会请求断图。</p>}
              {selected.coverFit === "fill" && <div className={styles.grid}>{(["X", "Y"] as const).map((axis) => { const key = axis === "X" ? "coverFocusX" : "coverFocusY"; return <label className={styles.field} key={axis}>封面焦点 {axis}：{selected[key]}%<input type="range" min="0" max="100" value={selected[key]} onChange={(event) => updateCollection((item) => ({ ...item, [key]: Number(event.target.value) }))} /></label>; })}</div>}
              <label className={styles.field}>星图重点照片<select value={selected.focusAssetId ?? ""} onChange={(event) => updateCollection((item) => ({ ...item, focusAssetId: event.target.value || null }))}><option value="">默认第一张可用成员</option>{selected.assetIds.map((id) => <option key={id} value={id}>{memberLabel(id)}</option>)}</select></label></CoverSettings>
              {siteMode && <CollectionMemberEditor key={`manage-${selected.id}`} mode="manage" collection={selected} assets={assets} onChange={next => updateCollection(() => next)} onView={setEnlargedMember} />}
              <p className={styles.hint}>最多 30 个图集，每个图集最多 500 张；移除关系不会删除素材。</p></div>
              {siteScope ? null : <details><summary>从共享素材库添加照片</summary><p className={styles.hint}>{libraryState}</p><div className={styles.row}><button type="button" onClick={() => void loadLibrary()}>重新读取素材</button>{!siteMode && <a href="/admin/layout" target="_blank" rel="noreferrer">打开原版共享素材库管理 ↗</a>}</div><p className={styles.hint}>这是共用素材库；导入和回收会影响两边素材可用性。此处只选择可用图片。</p><div className={styles.library}>{assets.map((asset) => <div className={styles.asset} key={asset.id}><img alt={memberLabel(asset.id)} src={asset.variants.thumbnail.src} loading="lazy" /><span>{memberLabel(asset.id)}</span><button type="button" disabled={!libraryReady || selected.assetIds.includes(asset.id) || selected.assetIds.length >= 500} onClick={() => updateCollection((item) => ({ ...item, assetIds: [...item.assetIds, asset.id] }))}>{selected.assetIds.includes(asset.id) ? "已在图集" : "加入图集"}</button><button type="button" disabled={!libraryReady} onClick={() => updateCollection((item) => ({ ...item, coverAssetId: asset.id }))}>设为封面</button></div>)}</div></details>}
            {siteMode && <aside className={styles.liveEffect} hidden={collectionTab !== "effect" && !(collectionTab === "photos" && compareEffect)}><CollectionLivePreview key={selected.id} collection={selected} assets={assets} onView={setEnlargedMember} active={(collectionTab === "effect" || (collectionTab === "photos" && compareEffect)) && !pickerCollectionId && !preview && !enlargedMember} /></aside>}</section></div> : <p className={styles.notice}>还没有图集，点击“新建图集”开始。</p>}
          </div>
          {!siteMode && <section className={styles.panel}><h2>显式导入旧原型图集</h2><p className={styles.hint}>选择之前导出的 JSON。仅导入图集到当前草稿，不自动保存；不会猜测分类或恢复已丢失的内存。</p><label className={styles.field}>导入图集 JSON<input type="file" accept="application/json,.json" onChange={(event) => { void importCollections(event.target.files?.[0]); event.target.value = ""; }} /></label></section>}
        </>}
        {(section === "packages" || (!siteMode && section === "contact")) && <>
          <section className={styles.panel}><h2>拍摄套餐</h2>{draft.packages.map((item, index) => <details className={styles.lowFrequency} key={index}><summary><strong>{item.name || `套餐 ${index + 1}`}</strong><span>{item.price || "未填价格"} · {item.duration || "未填时长"} · {item.enabled ? "显示" : "隐藏"}</span><small>编辑套餐详情</small></summary><div><TextFields prefix={`套餐 ${index + 1} · `} value={{ number: item.number, english: item.english, name: item.name, description: item.description, price: item.price, duration: item.duration }} onChange={(next) => edit((doc) => ({ ...doc, packages: doc.packages.map((entry, i) => i === index ? { ...entry, ...next } : entry) }))} /><Field label="交付内容（每行一条）" multiline value={item.deliverables.join("\n")} onChange={(text) => edit((doc) => ({ ...doc, packages: doc.packages.map((entry, i) => i === index ? { ...entry, deliverables: text === "" ? [] : text.split("\n") } : entry) }))} /><div className={styles.row}><label><input type="checkbox" checked={item.enabled} onChange={(event) => edit((doc) => ({ ...doc, packages: doc.packages.map((entry, i) => i === index ? { ...entry, enabled: event.target.checked } : entry) }))} /> 显示套餐</label><button type="button" disabled={index === 0} onClick={() => edit((doc) => ({ ...doc, packages: moveItem(doc.packages, index, index - 1) }))}>上移</button><button type="button" onClick={() => { if (confirm("从新版草稿移除此套餐？")) edit((doc) => ({ ...doc, packages: doc.packages.filter((_, i) => i !== index) })); }}>移除套餐</button></div></div></details>)}<button type="button" disabled={draft.packages.length >= 12} onClick={() => edit((doc) => ({ ...doc, packages: [...doc.packages, { number: String(doc.packages.length + 1), english: "", name: "新套餐", description: "", price: "", duration: "", deliverables: [], enabled: true }] }))}>添加套餐</button></section>
        </>}
        {section === "contact" && <>
          <section className={styles.panel}><h2>联系方式</h2><TextFields value={draft.contact} prefix="" onChange={(contact) => edit((doc) => ({ ...doc, contact }))} /></section>
          <section className={styles.panel}><h2>平台账号与可选联系卡</h2><p className={styles.hint}>{siteMode ? "文字账号、合法主页网址和图片卡均可独立使用。选用或移除卡片仅修改本空间草稿。" : "分享卡可通过一次性复制原站资料复用现有引用；文件保持 local-only。此处不另建上传系统。"}</p>{draft.social.map((item, index) => <div className={styles.panel} key={index}><details className={styles.lowFrequency}><summary><strong>{item.label || `平台 ${index + 1}`}</strong><span>{item.handle || "未填写账号或网址"}</span><small>编辑账号</small></summary><div><TextFields value={{ label: item.label, handle: item.handle }} prefix={`平台 ${index + 1} · `} onChange={(next) => edit((doc) => ({ ...doc, social: doc.social.map((entry, i) => i === index ? { ...entry, ...next } : entry) }))} /></div></details>{siteScope ? <SiteContactCard assetsEndpoint={siteScope.assetsEndpoint} assetId={item.qrAssetId} targetKey={item} onChange={(id) => edit((doc) => { const social = setContactCardReference(doc.social, item, id); return social === doc.social ? doc : { ...doc, social }; })} /> : getPlatformQrAssetPath(item.qrAssetId) && <img className={styles.qr} alt={`${item.label}分享卡`} src={(siteMode ? assetMap.get(item.qrAssetId ?? "")?.variants.full.src : getPlatformQrAssetPath(item.qrAssetId))!} />}<div className={styles.row}><button type="button" disabled={index === 0} onClick={() => edit((doc) => ({ ...doc, social: moveItem(doc.social, index, index - 1) }))}>上移</button>{!siteMode && item.qrAssetId && <button type="button" onClick={() => edit((doc) => ({ ...doc, social: doc.social.map((entry, i) => i === index ? { label: entry.label, handle: entry.handle } : entry) }))}>移除分享卡引用</button>}<button type="button" onClick={() => edit((doc) => ({ ...doc, social: doc.social.filter((_, i) => i !== index) }))}>移除平台</button></div></div>)}<button type="button" disabled={draft.social.length >= 8} onClick={() => edit((doc) => ({ ...doc, social: [...doc.social, { label: "", handle: "" }] }))}>添加平台账号</button></section>
          <section className={styles.panel}><h2>约拍清单</h2><Field label="清单字段（每行一条，顺序即展示顺序）" multiline value={draft.bookingFields.join("\n")} onChange={(text) => edit((doc) => ({ ...doc, bookingFields: text === "" ? [] : text.split("\n") }))} /></section>
          <section className={styles.panel}><h2>约拍标题</h2><TextFields value={draft.statement} prefix="" onChange={(statement) => edit((doc) => ({ ...doc, statement }))} /></section>
        </>}
      </fieldset>
    </div></div>
    {enlargedMember && <MemberPhoto asset={enlargedMember} onClose={() => setEnlargedMember(null)} />}
    {siteMode && pickerTarget && <SitePhotoPicker key={pickerTarget.id} collectionName={pickerTarget.name || "未命名图集"} members={pickerTarget.assetIds} assets={assets} ready={libraryReady} truncated={libraryTruncated} state={libraryState} onReload={loadLibrary} onClose={() => setPickerCollectionId(null)} onAdd={addPickedPhotos} />}
    {preview && createPortal(<section ref={previewRef} className={styles.preview} role="dialog" aria-modal="true" aria-label="新版未保存草稿效果"><div className={styles.previewBar}><p>{siteMode ? "当前编辑快照 · 预览不会保存或发布" : "草稿快照 · 尚未保存到主页"}</p><button type="button" onClick={() => setPreview(null)}>关闭草稿效果</button></div><PortfolioView document={preview} embedded initialCollectionId={previewCollectionId} {...(siteMode ? { assets } : {})} /></section>, document.body)}
  </main>;
}
