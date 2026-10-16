"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site-owned image variants. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteEditorScope } from "./scope";
import { createEmptyFlowGalleryDocument, parseFlowGalleryDocument, FLOW_GALLERY_LIMITS, type FlowGalleryDocumentV1 } from "./flow-gallery-document";
import { loadSiteAssets, SiteAssetRequestError, type SiteAsset, type SiteAssetManifest } from "./assets-client";
import { confirmDraftSave, DraftSaveRejected, DraftSaveUncertain, editorJson, readSaveReceipt, writeSiteDraft, type DraftSaveOptions, type DraftSaveReceipt, type PendingDraftSave } from "./draft-save";
import PublicationControls from "./publication-controls";
import SiteAssetUpload from "./asset-upload";
import { FlowPricingEditor, FlowContactEditor } from "./flow-commercial-editor";
import SitePhotoPicker from "../preview-workspace/site-photo-picker";
import CollectionMemberEditor from "../preview-workspace/collection-member-editor";
import type { Collection } from "../templates/polaroid-field/collection-model";
import { SiteFlowGalleryView } from "./flow-gallery-view";
import { lockGalleryBodyScroll } from "../premium-gallery-proof/body-scroll-lock";
import { addFlowMembers, flowGalleryFingerprint, removeFlowGroup, removeFlowMember, restoreFlowRemoval, type FlowRemoval, type FlowGroup } from "./flow-gallery-state";
import { FLOW_EDITOR_MODULES, flowModulePreview, flowSectionFromHash, type FlowEditorSection as Section, type FlowPreviewScene } from "./flow-gallery-admin-ui";
import { PhotoFilters, PhotoMetadata, PhotoCaptionEditor, filterFlowPhotos, focusFlowEntry, type PhotoOrientation, type PhotoOrder } from "./flow-gallery-admin-tools";
import { resolveFlowGroupPreview } from "./flow-gallery-preview";
import { flowAssetName, flowPhotoName } from "./flow-gallery-photo-names";
import styles from "./flow-gallery-admin.module.css";

const SPACE = "premium-flow-gallery";
const emptyManifest: SiteAssetManifest = { version: 1, assets: [] };

// The shared sorter needs a Collection shape. None of its Polaroid fields are persisted here.
function sortableGroup(group: FlowGroup): Collection {
  return { id: group.id, name: group.name, assetIds: group.assetIds, visible: group.visible, description: "", coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, focusAssetId: null };
}

function FlowMemberEditor({ group, assets, onChange, onView }: { group: FlowGroup; assets: SiteAsset[]; onChange: (ids: string[]) => void; onView: (id: string) => void }) {
  const [previous, setPrevious] = useState(group);
  const [collection, setCollection] = useState(() => sortableGroup(group));
  if (previous !== group) {
    setPrevious(group);
    // Retain the exact controlled result for the shared sorter's guarded undo.
    if (collection.assetIds !== group.assetIds || collection.name !== group.name || collection.visible !== group.visible || previous.captions !== group.captions) setCollection(sortableGroup(group));
  }
  return <CollectionMemberEditor collection={collection} assets={assets} onChange={next => { setCollection(next); onChange(next.assetIds); }} onView={asset => onView(asset.id)} />;
}

function BackgroundPicker({ manifest, ready, state, reload, select, close }: { manifest: SiteAssetManifest; ready: boolean; state: string; reload: () => Promise<void>; select: (id: string) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [orientation, setOrientation] = useState<PhotoOrientation>("all");
  const [order, setOrder] = useState<PhotoOrder>("recent");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current; node?.showModal();
    return () => { node?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  const photos = filterFlowPhotos(manifest.assets, query, orientation, order);
  const pages = Math.max(1, Math.ceil(photos.length / 48)), currentPage = Math.min(page, pages - 1);
  return <dialog ref={dialog} className={styles.backgroundPicker} aria-labelledby="background-picker-title" onCancel={event => { event.preventDefault(); close(); }}><header className={styles.actions}><h2 id="background-picker-title">从图库选择一张背景</h2><button type="button" onClick={close}>取消</button></header><p role="status">{state}</p><p>点击照片确认背景；确认后可调整焦点，仍需保存草稿。</p>{manifest.truncated && <p role="alert">当前仅载入部分照片，查找覆盖已载入素材。</p>}<PhotoFilters query={query} orientation={orientation} order={order} onQuery={value => { setQuery(value); setPage(0); }} onOrientation={value => { setOrientation(value); setPage(0); }} onOrder={value => { setOrder(value); setPage(0); }} /><button type="button" onClick={() => void reload()}>重新读取图库</button><div className={styles.library}>{photos.slice(currentPage * 48, (currentPage + 1) * 48).map((asset, index) => <article key={asset.id} data-flow-asset-id={asset.id}><button type="button" disabled={!ready} aria-label={`选择背景：${flowAssetName(asset, currentPage * 48 + index)}`} onClick={() => select(asset.id)}><img src={asset.variants.thumbnail.src} alt="" loading="lazy" /></button><PhotoMetadata asset={asset} /></article>)}</div>{ready && !photos.length && <p>暂无匹配照片。请在图库上传照片后重新读取。</p>}<footer className={styles.actions}><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></footer></dialog>;
}

function RailWidthControls({ rails, onChange }: { rails: FlowGalleryDocumentV1["rails"]; onChange: (rails: FlowGalleryDocumentV1["rails"]) => void }) {
  const width = rails.leftWidthPercent;
  const setWidth = (nextWidth?: number) => {
    const next = { ...rails };
    if (nextWidth === undefined) delete next.leftWidthPercent;
    else next.leftWidthPercent = nextWidth;
    onChange(next);
  };
  return <fieldset className={styles.railRatio}>
    <legend>左右轨道宽度比例</legend>
    <div className={styles.actions}>
      <button type="button" aria-pressed={width === undefined} onClick={() => setWidth()}>原比例 2∶1</button>
      <button type="button" aria-pressed={width === 70} onClick={() => setWidth(70)}>7∶3</button>
      <button type="button" aria-pressed={width === 50} onClick={() => setWidth(50)}>5∶5</button>
    </div>
    <label>左轨宽度 · {width === undefined ? "约 67%（原比例）" : `${width}%`}<input type="range" min="30" max="70" step="1" value={width ?? 67} aria-label="左轨宽度" aria-valuetext={width === undefined ? "原比例 2 比 1，左轨约 67%" : `左轨 ${width}%，右轨 ${100 - width}%`} onChange={event => setWidth(Number(event.target.value))} /></label>
    <p aria-live="polite">{width === undefined ? "当前：左∶右 = 2∶1" : `当前：左 ${width}% / 右 ${100 - width}%`}。比例用于桌面和手机首页速览，照片保持原始宽高比。</p>
    <p>调整后点击“查看首页效果”预览；保存草稿后保留，保存并发布后应用到公开主页。</p>
  </fieldset>;
}

export default function FlowGalleryAdmin({ siteScope }: { siteScope: SiteEditorScope }) {
  return <FlowGallerySession key={siteScope.endpoint} siteScope={siteScope} />;
}

function FlowGallerySession({ siteScope }: { siteScope: SiteEditorScope }) {
  const [draft, setDraft] = useState<FlowGalleryDocumentV1>(createEmptyFlowGalleryDocument);
  const current = useRef(draft);
  const [saved, setSaved] = useState(flowGalleryFingerprint(draft));
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const lifetime = useRef(new AbortController());
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingDraftSave | null>(null);
  const [conflict, setConflict] = useState(false);
  const [manifest, setManifest] = useState(emptyManifest);
  const [assetsReady, setAssetsReady] = useState(false);
  const [assetState, setAssetState] = useState("正在读取本站素材…");
  const assetToken = useRef(0);
  const [section, setSection] = useState<Section>("library");
  const moduleHeading = useRef<HTMLHeadingElement>(null);
  const [undoRemoval, setUndoRemoval] = useState<FlowRemoval | null>(null);
  const [restoredItemId, setRestoredItemId] = useState<string>();
  const consumeRestoredItemFocus = useCallback((id: string) => setRestoredItemId(current => current === id ? undefined : current), [setRestoredItemId]);
  const [orientation, setOrientation] = useState<PhotoOrientation>("all");
  const [order, setOrder] = useState<PhotoOrder>("recent");
  function changeSection(next: Section) {
    setRestoredItemId(undefined);
    setSection(next);
    const hash = `#edit-${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    requestAnimationFrame(() => { moduleHeading.current?.scrollIntoView({ block: "start", behavior: "auto" }); moduleHeading.current?.focus({ preventScroll: true }); });
  }
  useEffect(() => {
    const restore = () => {
      const next = flowSectionFromHash(window.location.hash);
      if (!next) return;
      setRestoredItemId(undefined);
      setSection(next);
      requestAnimationFrame(() => { moduleHeading.current?.scrollIntoView({ block: "start", behavior: "auto" }); moduleHeading.current?.focus({ preventScroll: true }); });
    };
    // Preview scenes use other hashes and remain local to their modal.
    const frame = requestAnimationFrame(restore);
    window.addEventListener("popstate", restore); window.addEventListener("hashchange", restore);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, []);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [groupStep, setGroupStep] = useState<"photos" | "settings" | "effect">("photos");
  const uploadRegion = useRef<HTMLDivElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const createDialog = useRef<HTMLDialogElement>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewModule, setPreviewModule] = useState<Section | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const previewHash = useRef("");
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const previewOpening = useRef(false);
  const previewReturnScroll = useRef({ x: 0, y: 0 });
  const [previewGroupId, setPreviewGroupId] = useState<string>();
  const [previewGroupName, setPreviewGroupName] = useState("");
  const [query, setQuery] = useState("");
  const [libraryPage, setLibraryPage] = useState(0);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const [enlargedName, setEnlargedName] = useState("");
  const openAsset = (id: string, name: string) => { setEnlargedName(name); setEnlarged(id); };
  const largeDialog = useRef<HTMLDialogElement>(null);
  const dirty = flowGalleryFingerprint(draft) !== saved;
  const group = draft.groups.find(item => item.id === activeGroup) ?? draft.groups[0] ?? null;

  const update = (next: FlowGalleryDocumentV1) => { current.current = next; setDraft(next); };
  const changeGroup = (id: string, change: (group: FlowGroup) => FlowGroup) => update({ ...current.current, groups: current.current.groups.map(item => item.id === id ? change(item) : item) });
  const clearPrivateLookup = useCallback(() => {
    ++assetToken.current;
    setQuery(""); setOrientation("all"); setOrder("recent"); setLibraryPage(0);
    setPicker(null); setEnlarged(null); setPreview(false); setManifest(emptyManifest); setAssetsReady(false);
  }, [setPicker, setEnlarged]);
  const reloadAssets = useCallback(async () => {
    const token = ++assetToken.current;
    setAssetsReady(false); setAssetState("正在读取本站素材…");
    try {
      const next = await loadSiteAssets(siteScope.assetsEndpoint);
      if (lifetime.current.signal.aborted || token !== assetToken.current) return;
      setManifest(next); setAssetsReady(true); setAssetState(`本站图库 ${next.assets.length} 张`);
    } catch (cause) { if (!lifetime.current.signal.aborted && token === assetToken.current) {
      if (cause instanceof SiteAssetRequestError && (cause.status === 401 || cause.status === 403)) clearPrivateLookup();
      setAssetState(cause instanceof Error ? cause.message : "素材读取失败，请重试。");
    } }
  }, [siteScope.assetsEndpoint, clearPrivateLookup]);
  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    try {
      const { response, body } = await editorJson(siteScope.endpoint, { cache: "no-store" }, signal);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) clearPrivateLookup();
        throw new Error(`草稿读取失败（${response.status}），请确认权限后重试。`);
      }
      const receipt = readSaveReceipt(body, SPACE);
      const content = parseFlowGalleryDocument(receipt.content);
      if (signal?.aborted) return;
      current.current = content; setDraft(content); setSaved(flowGalleryFingerprint(content)); setRevision(receipt.revision); setUpdatedAt(receipt.updatedAt);
      setPending(null); setConflict(false); setUndoRemoval(null); setLoadState("ready"); setMessage("");
    } catch (cause) { if (!signal?.aborted) { setLoadState("error"); setMessage(cause instanceof Error ? cause.message : "草稿读取失败，请重试。"); } }
  }, [siteScope.endpoint, setUndoRemoval, clearPrivateLookup]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { void reload(controller.signal); void reloadAssets(); } });
    return () => controller.abort();
  }, [reload, reloadAssets]);

  async function save(options: DraftSaveOptions = {}): Promise<DraftSaveReceipt | null> {
    if (lock.current || loadState !== "ready" || conflict || pending || picker || preview || enlarged || creatingGroup) return null;
    let snapshot: FlowGalleryDocumentV1;
    try { snapshot = parseFlowGalleryDocument(current.current); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "请核对内容。"); return null; }
    lock.current = true; setSaving(true); setMessage("正在保存本次草稿…");
    const signal = options.signal ?? lifetime.current.signal;
    try {
      const receipt = await writeSiteDraft(siteScope.endpoint, SPACE, { content: snapshot, expectedRevision: revision }, signal);
      if (signal.aborted || lifetime.current.signal.aborted) return null;
      setSaved(flowGalleryFingerprint(receipt.content)); setRevision(receipt.revision); setUpdatedAt(receipt.updatedAt);
      setMessage(`已保存流影视廊草稿 v${receipt.revision}。${receipt.confirmedAfterLoss ? "保存结果已通过只读核对确认。" : ""}`);
      return receipt;
    } catch (cause) {
      if (signal.aborted || lifetime.current.signal.aborted) return null;
      if (cause instanceof DraftSaveUncertain) setPending(cause.pending);
      if (cause instanceof DraftSaveRejected && cause.status === 409) setConflict(true);
      if (cause instanceof DraftSaveRejected && (cause.status === 401 || cause.status === 403)) clearPrivateLookup();
      setMessage(cause instanceof Error ? cause.message : "保存失败，当前编辑保留。"); return null;
    } finally { lock.current = false; if (!lifetime.current.signal.aborted) setSaving(false); }
  }
  async function checkSave() {
    if (!pending || lock.current) return;
    lock.current = true; setSaving(true);
    try {
      const receipt = await confirmDraftSave(siteScope.endpoint, SPACE, pending, lifetime.current.signal);
      if (lifetime.current.signal.aborted) return;
      setSaved(flowGalleryFingerprint(receipt.content)); setRevision(receipt.revision); setUpdatedAt(receipt.updatedAt); setPending(null); setMessage("已确认草稿保存结果；没有重新写入或发布。");
    } catch { if (!lifetime.current.signal.aborted) setMessage("结果仍待确认。请先导出当前编辑，再重新读取核对；不会自动重试保存。"); }
    finally { lock.current = false; if (!lifetime.current.signal.aborted) setSaving(false); }
  }
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty || pending || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, pending, saving]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (!preview) return;
    const releaseScroll = lockGalleryBodyScroll(document.body);
    previewDialog.current?.showModal();
    return releaseScroll;
  }, [preview]);
  useEffect(() => { if (enlarged) largeDialog.current?.showModal(); }, [enlarged]);
  useEffect(() => {
    if (!creatingGroup) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = createDialog.current;
    const releaseScroll = lockGalleryBodyScroll(document.body);
    node?.showModal(); node?.querySelector("input")?.focus();
    return () => { node?.close(); releaseScroll(); if (previous?.isConnected) previous.focus(); };
  }, [creatingGroup]);
  function closePreview() {
    const scroll = previewReturnScroll.current;
    const trigger = previewTrigger.current;
    previewDialog.current?.close(); setPreview(false);
    previewOpening.current = false;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${previewHash.current}`);
    requestAnimationFrame(() => {
      if (previewOpening.current) return;
      window.scrollTo({ left: scroll.x, top: scroll.y, behavior: "instant" });
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }
  function openPreview(scene: FlowPreviewScene, trigger: HTMLButtonElement, moduleId: Section | null = null) {
    if (previewOpening.current) return;
    let targetId: string | undefined;
    let targetName = "";
    if (moduleId === "groups") {
      const target = resolveFlowGroupPreview(current.current, manifest.assets, activeGroup ?? group?.id ?? null);
      if (target.status !== "ready") { setMessage(target.message); return; }
      targetId = target.groupId; targetName = target.name;
    }
    previewOpening.current = true;
    previewReturnScroll.current = { x: window.scrollX, y: window.scrollY };
    setPreviewGroupId(targetId); setPreviewGroupName(targetName);
    previewHash.current = window.location.hash;
    previewTrigger.current = trigger;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${scene}`);
    setPreviewModule(moduleId); setPreview(true);
  }
  function exportDraft() {
    const href = URL.createObjectURL(new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = href; a.download = "flow-gallery-draft.json"; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  function reloadExplicitly() { if ((!dirty && !pending && !conflict) || confirm("重新读取将替换当前未保存编辑。请先导出留存，再核对并人工合并。继续？")) void reload(lifetime.current.signal); }
  function createGroup() {
    const name = newName.trim();
    if (!name) { setMessage("请先填写作品分类名称。"); return; }
    const id = crypto.randomUUID();
    update({ ...current.current, groups: [...current.current.groups, { id, name, visible: true, assetIds: [], captions: {} }] });
    setNewName(""); setActiveGroup(id); setGroupStep("photos"); setCreatingGroup(false); setPicker(id); setMessage("已建立分类，接着从本站图库选片。选片确认后仍需保存。");
  }
  const blocked = loadState !== "ready" || saving || conflict || Boolean(pending) || Boolean(picker) || preview || Boolean(enlarged) || creatingGroup;
  const workbenchHref = siteScope.adminBasePath.replace(/\/premium-flow-gallery\/?$/, "");
  const assetMap = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const filtered = filterFlowPhotos(manifest.assets, query, orientation, order);
  const pages = Math.max(1, Math.ceil(filtered.length / 48)), page = Math.min(libraryPage, pages - 1);
  const large = enlarged ? assetMap.get(enlarged) : null;
  const activeModule = FLOW_EDITOR_MODULES.find(item => item.id === section)!;
  const previewDocument = previewModule ? flowModulePreview(draft, previewModule) : draft;
  const previewOnlyScene = previewModule === "pricing" && !draft.pricing.enabled || previewModule === "contact" && !draft.contact.enabled;

  return <div className={styles.root} data-flow-editor-section={section} data-flow-dirty={dirty}>
    <aside className={styles.sidebar}>
      <a className={styles.backLink} href={workbenchHref} onClick={event => { if (dirty && !confirm("当前有未保存修改，确认离开？")) event.preventDefault(); }}>← 站点工作台</a>
      <div className={styles.brand}><span aria-hidden="true">流</span><div><strong>流影视廊</strong><small>作品与内容管理</small></div></div>
      <p className={styles.navLabel}>内容工作区</p>
      <nav aria-label="流影视廊后台模块">{FLOW_EDITOR_MODULES.map(({ id, label }, index) => <button type="button" key={id} data-flow-section={id} aria-current={section === id ? "page" : undefined} onClick={() => changeSection(id)}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{label}</button>)}</nav>
      <small className={styles.spaceNote}>独立内容空间<br />图库供本站模板共享</small>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}><span>流影视廊 <span aria-hidden="true">/</span> {activeModule.label}</span><small>当前编辑 · {loadState === "loading" ? "正在读取" : loadState === "error" ? "读取失败" : pending ? "保存结果待确认" : conflict ? "版本冲突" : dirty ? "尚未保存" : "已保存草稿"}</small></header>
      <div className={styles.publicationShell}>
        {siteScope.publicationEndpoint && siteScope.publicHref && <PublicationControls compactTools space={SPACE} endpoint={siteScope.publicationEndpoint} publicHref={siteScope.publicHref} revision={revision} dirty={dirty} disabled={blocked} templateId={SPACE} saveDraft={save}
          draftStatus={loadState === "loading" ? "正在读取" : loadState === "error" ? "读取失败" : pending ? "保存结果待确认" : conflict ? "版本冲突" : dirty ? "未保存修改" : "已保存"}
          draftAction={<button type="button" disabled={blocked || !dirty} onClick={() => void save()}>仅保存草稿</button>}
          tools={<><button type="button" disabled={loadState !== "ready" || !assetsReady || Boolean(picker)} onClick={event => openPreview("works", event.currentTarget)}>预览当前编辑</button><a href={siteScope.previewHref} target="_blank" rel="noreferrer">预览已保存草稿 ↗</a><button type="button" onClick={exportDraft}>导出当前草稿</button><button type="button" disabled={saving || loadState === "loading"} onClick={reloadExplicitly}>重新读取草稿</button></>} />}
      </div>
      {section !== "library" && <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{section === "groups" ? "WORK COLLECTIONS" : section === "home" ? "HOMEPAGE" : section === "pricing" ? "PRICING & EVENTS" : "CONTACT"}</p><h1 ref={moduleHeading} tabIndex={-1}>{activeModule.label}</h1></div>{section === "home" ? <button type="button" data-flow-module-preview="home" disabled={!assetsReady || Boolean(picker)} onClick={event => openPreview("works", event.currentTarget, "home")}>查看首页效果 <span aria-hidden="true">↗</span></button> : <span className={styles.moduleNumber}>{String(FLOW_EDITOR_MODULES.findIndex(item => item.id === section) + 1).padStart(2, "0")} / 05</span>}</div>}
      <p role="status" className={styles.status} data-feedback={message ? "active" : undefined}>{message}{updatedAt && <small>上次保存 {new Date(updatedAt).toLocaleString()}</small>}</p>
      {undoRemoval && <div className={styles.undoRemoval} role="status"><span>{undoRemoval.kind === "photo" ? "照片已移出当前分类，图库原片保留。" : undoRemoval.kind === "price" ? "价格项目已从当前草稿移除。" : "联系方式已从当前草稿移除。"}</span><button type="button" disabled={loadState !== "ready" || saving || Boolean(picker) || preview || Boolean(enlarged)} onClick={() => { try { const removal = undoRemoval; update(restoreFlowRemoval(current.current, removal)); setUndoRemoval(null); setMessage("已恢复最近移除的内容，其他编辑保留；仍需保存。"); if (removal.kind === "photo") { setActiveGroup(removal.groupId); setGroupStep("settings"); changeSection("groups"); requestAnimationFrame(() => focusFlowEntry(`flow-caption-${removal.groupId}`)); } else { changeSection(removal.kind === "price" ? "pricing" : "contact"); setRestoredItemId(removal.item.id); } } catch (cause) { setMessage(cause instanceof Error ? cause.message : "暂时无法恢复。"); } }}>撤销最近移除</button></div>}
      {pending && <button type="button" disabled={saving} onClick={() => void checkSave()}>检查保存结果</button>}
      {(pending || conflict || loadState === "error") && <div className={styles.recovery}><strong>请先核对当前版本</strong><p>当前编辑保留。导出留存后再读取核对，系统不会自动重试写入。</p><button type="button" onClick={exportDraft}>导出当前编辑</button><button type="button" disabled={saving} onClick={reloadExplicitly}>重新读取并核对</button></div>}
      <fieldset className={styles.editor} disabled={loadState !== "ready" || saving}>
        {(section === "home" || section === "groups") && <p className={styles.moduleContext}>{section === "home" ? "首页展示身份文字、背景与左右作品轨道。" : "分类、照片顺序和逐张说明用于完整作品页；首页轨道可引用分类。"}</p>}
        {section === "library" && <section className={`${styles.panel} ${styles.libraryPanel}`} aria-labelledby="flow-library-heading">
          <header className={styles.libraryTaskHeader}><div className={styles.libraryTaskTitle}><h1 id="flow-library-heading" ref={moduleHeading} tabIndex={-1}>图库</h1><span role="status">{assetState}</span></div><div className={styles.libraryTaskActions}><button type="button" className={styles.primary} aria-label="添加照片" aria-describedby="flow-upload-rules" aria-expanded={uploadOpen || !manifest.assets.length} aria-controls="flow-site-upload" onClick={() => { setUploadOpen(true); uploadRegion.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click(); }}><span aria-hidden="true">＋ </span>添加照片</button><button type="button" aria-label="进入完整作品：新建分类并选片" onClick={() => changeSection("groups")}>完整作品 <span aria-hidden="true">→</span></button></div></header>
          <p className={styles.libraryPurpose}>本站模板共享图库；上传不会发布。效果预览仅展示已加入完整作品分类的照片。</p>
          <div className={styles.libraryUtilities}><p id="flow-upload-rules">JPEG / PNG / WebP · 每批最多 8 张 · 每张最多 20 MB</p><div><button type="button" className={styles.textButton} onClick={() => void reloadAssets()}>重新读取图库</button><button type="button" className={styles.textButton} data-flow-module-preview="library" disabled={!assetsReady || Boolean(picker)} onClick={event => openPreview(activeModule.scene, event.currentTarget, "library")}>完整作品效果 <span aria-hidden="true">↗</span></button></div></div>
          <div id="flow-site-upload" ref={uploadRegion} className={styles.uploadRegion} hidden={!uploadOpen && Boolean(manifest.assets.length)} onChangeCapture={() => setUploadOpen(true)}><SiteAssetUpload endpoint={siteScope.assetsEndpoint} onUploaded={reloadAssets} /></div>
          {manifest.truncated && <p role="alert">超过 10,000 张，当前筛选只覆盖已载入素材。</p>}
          <PhotoFilters compactId query={query} orientation={orientation} order={order} onQuery={value => { setQuery(value); setLibraryPage(0); }} onOrientation={value => { setOrientation(value); setLibraryPage(0); }} onOrder={value => { setOrder(value); setLibraryPage(0); }} />
          <div className={styles.library}>{filtered.slice(page * 48, (page + 1) * 48).map((asset, index) => <article key={asset.id} data-flow-asset-id={asset.id}><button type="button" aria-label={`放大照片：${flowAssetName(asset, page * 48 + index)}`} onClick={() => openAsset(asset.id, flowAssetName(asset, page * 48 + index))}><img src={asset.variants.thumbnail.src} alt="" loading="lazy" /><span aria-hidden="true">↗</span></button><PhotoMetadata asset={asset} /></article>)}</div>
          {assetsReady && !filtered.length && <div className={styles.emptyState}><h3>还没有符合条件的素材</h3><p>可以添加照片，或调整画幅与素材 ID 查找条件。</p></div>}
          <nav className={styles.pagination} aria-label="图库分页"><span>{filtered.length} 张匹配 · 每页最多 48 张</span><div><button disabled={!page} type="button" onClick={() => setLibraryPage(page - 1)}>上一页</button><span>{page + 1} / {pages}</span><button disabled={page + 1 >= pages} type="button" onClick={() => setLibraryPage(page + 1)}>下一页</button></div></nav>
        </section>}
        {section === "groups" && <>
          <div className={styles.groupToolbar}><span>{draft.groups.length} 个作品分类</span><button type="button" className={styles.primary} disabled={draft.groups.length >= FLOW_GALLERY_LIMITS.groups} onClick={() => setCreatingGroup(true)}><span aria-hidden="true">＋ </span>新建分类</button></div>
          <div className={styles.groupWorkspace}>
            <nav className={styles.groupList} aria-label="作品分类">{draft.groups.map((item, index) => { const cover = assetMap.get(item.assetIds[0]); return <button type="button" key={item.id} aria-current={group?.id === item.id ? "page" : undefined} onClick={() => { setActiveGroup(item.id); setGroupStep("photos"); }}>{cover ? <img src={cover.variants.thumbnail.src} alt="" /> : <span className={styles.groupPlaceholder} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}<span><strong>{index + 1}. {item.name}</strong><small>{item.assetIds.length} 张 · {item.visible ? "展示" : "隐藏"}</small></span></button>; })}</nav>
            {group ? <section className={styles.panel}>
              <div className={styles.sectionHeading}><div><h2>{group.name}</h2><p>{group.assetIds.length} 张照片 · {group.visible ? "在完整作品页展示" : "分类已隐藏，首页引用也不展示"}</p></div><div className={styles.actions}><button type="button" className={styles.primary} onClick={() => { setGroupStep("photos"); setPicker(group.id); }}>从图库选片</button><button type="button" data-flow-module-preview="groups" data-flow-group-preview={group.id} disabled={!assetsReady || Boolean(picker)} onClick={event => openPreview("gallery", event.currentTarget, "groups")}>当前分类效果 <span aria-hidden="true">↗</span></button></div></div>
              <nav className={styles.stepTabs} aria-label="分类编辑步骤">{([["photos", "照片顺序"], ["settings", "分类与说明"], ["effect", "查看效果"]] as const).map(([id, label], index) => <button type="button" key={id} aria-current={groupStep === id ? "step" : undefined} onClick={() => setGroupStep(id)}><span aria-hidden="true">0{index + 1}</span>{label}</button>)}</nav>
              {groupStep === "photos" && <div className={styles.sortWorkspace}><FlowMemberEditor key={group.id} group={group} assets={manifest.assets} onChange={ids => changeGroup(group.id, value => ({ ...value, assetIds: ids }))} onView={id => openAsset(id, flowPhotoName(group.name, group.assetIds.indexOf(id), group.captions[id]))} /><div className={styles.nextStep}><p>顺序决定完整作品的浏览节奏，也用于首页轨道。</p><button type="button" onClick={() => setGroupStep("settings")}>下一步：分类与说明 →</button></div></div>}
              {groupStep === "settings" && <><div className={styles.groupSettings}>
                <section><h3>分类信息</h3><label>名称<input value={group.name} maxLength={120} onChange={event => changeGroup(group.id, value => ({ ...value, name: event.target.value }))} /></label><label className={styles.checkbox}><input type="checkbox" checked={group.visible} onChange={event => changeGroup(group.id, value => ({ ...value, visible: event.target.checked }))} />在完整作品页展示此分类</label><p>隐藏分类后，引用它的首页轨道也不展示；照片和说明保留。</p><div className={styles.groupOrder}><span>分类位置 {draft.groups.indexOf(group) + 1} / {draft.groups.length}</span><div>{[-1, 1].map(direction => <button type="button" key={direction} disabled={draft.groups.indexOf(group) + direction < 0 || draft.groups.indexOf(group) + direction >= draft.groups.length} onClick={() => { const items = [...current.current.groups], index = items.findIndex(item => item.id === group.id); [items[index], items[index + direction]] = [items[index + direction], items[index]]; update({ ...current.current, groups: items }); }}>{direction < 0 ? "分类上移" : "分类下移"}</button>)}</div></div><button type="button" className={styles.dangerButton} onClick={() => { if (confirm(`删除分类「${group.name}」？仅移除本草稿的分类与引用，图库照片保留。`)) { update(removeFlowGroup(current.current, group.id)); setActiveGroup(null); } }}>删除此分类</button></section>
                <PhotoCaptionEditor key={group.id} group={group} assets={assetMap} onView={id => openAsset(id, flowPhotoName(group.name, group.assetIds.indexOf(id), group.captions[id]))} onCaption={(id, caption) => changeGroup(group.id, value => ({ ...value, captions: { ...value.captions, [id]: caption } }))} onRemove={id => { const latest = current.current.groups.find(value => value.id === group.id); if (!latest || !latest.assetIds.includes(id)) return; setUndoRemoval({ kind: "photo", groupId: group.id, id, caption: latest.captions[id], index: latest.assetIds.indexOf(id) }); changeGroup(group.id, value => removeFlowMember(value, id)); }} />
              </div><div className={styles.nextStep}><p>逐张说明显示在大图浏览中，未填写时不强制展示。</p><button type="button" onClick={() => setGroupStep("effect")}>下一步：查看效果 →</button></div></>}
              {groupStep === "effect" && <><div className={styles.effectTeaser}><div><p className={styles.eyebrow}>CURRENT EDIT</p><h3>完整作品的真实效果</h3><p>直接使用当前分类、照片顺序和说明。预览不会保存或发布。</p><small>{group.visible ? "当前分类将在完整作品页展示。" : "当前分类已隐藏；可以在分类与说明中开启。"}</small></div><div>{group.assetIds.slice(0, 3).map((id, index) => { const asset = assetMap.get(id); return asset ? <img key={id} src={asset.variants.card.src} alt={flowPhotoName(group.name, index, group.captions[id])} /> : null; })}</div></div><div className={styles.nextStep}><p>首页左右轨道可分别引用作品分类。</p><button type="button" onClick={() => changeSection("home")}>下一步：配置首页轨道 →</button></div></>}
            </section> : <section className={styles.panel}><div className={styles.emptyState}><h2>建立第一个作品分类</h2><p>为分类命名，从本站图库选片，再确认照片顺序与展示效果。</p><button type="button" data-flow-module-preview="groups" disabled={!assetsReady} onClick={event => openPreview("gallery", event.currentTarget, "groups")}>当前分类效果 <span aria-hidden="true">↗</span></button></div></section>}
          </div>
        </>}
        {section === "home" && <div className={styles.homeWorkspace}>
          <div><section className={styles.panel}><h2>首页身份与文字</h2><p>品牌显示在顶部导航，标题与介绍在首页左侧。</p>{(["brand", "title", "intro"] as const).map(key => <label key={key}>{key === "brand" ? "导航品牌名" : key === "title" ? "首页标题" : "首页介绍"}<textarea rows={key === "intro" ? 3 : 1} maxLength={key === "brand" ? 120 : key === "title" ? 500 : 2000} value={draft.profile[key]} onChange={event => update({ ...current.current, profile: { ...current.current.profile, [key]: event.target.value } })} /></label>)}</section>
          <section className={styles.panel}><div className={styles.sectionHeading}><h2>全屏背景</h2><button type="button" onClick={() => setPicker("background")}>从图库选择背景</button></div><p>背景用于首页及其它前台栏目，焦点决定裁切时优先保留的位置。</p><div className={styles.background}>{draft.background.assetId && assetMap.get(draft.background.assetId) ? <img src={assetMap.get(draft.background.assetId)!.variants.card.src} alt="当前首页背景" style={{ objectPosition: `${draft.background.focalPoint.x}% ${draft.background.focalPoint.y}%` }} /> : <p>未选择背景，使用深绿色底色。</p>}</div><div className={styles.columns}>{(["x", "y"] as const).map(axis => <label key={axis}>背景焦点 {axis.toUpperCase()} · {draft.background.focalPoint[axis]}%<input type="range" min="0" max="100" value={draft.background.focalPoint[axis]} onChange={event => update({ ...current.current, background: { ...current.current.background, focalPoint: { ...current.current.background.focalPoint, [axis]: Number(event.target.value) } } })} /></label>)}</div>{draft.background.assetId && <button type="button" className={styles.textButton} onClick={() => update({ ...current.current, background: { ...current.current.background, assetId: null } })}>移除背景引用</button>}</section></div>
          <section className={`${styles.panel} ${styles.railPanel}`}><h2>首页作品速览</h2><p>左右轨道引用分类中已确认的照片顺序，不复制图库资源。</p><div className={styles.columns}>{(["leftGroupId", "rightGroupId"] as const).map(key => { const featured = draft.groups.find(item => item.id === draft.rails[key]); return <div key={key}><label>{key === "leftGroupId" ? "左侧轨道" : "右侧轨道"}<select value={draft.rails[key] ?? ""} onChange={event => update({ ...current.current, rails: { ...current.current.rails, [key]: event.target.value || null } })}><option value="">暂不展示此轨道</option>{draft.groups.map(item => <option key={item.id} value={item.id}>{item.name}{item.visible ? "" : "（隐藏，首页也不展示）"}</option>)}</select></label><div className={styles.railSample}>{featured?.visible ? featured.assetIds.slice(0, 3).map((id, index) => { const asset = assetMap.get(id); return asset && <img key={id} src={asset.variants.thumbnail.src} alt={flowPhotoName(featured.name, index, featured.captions[id])} />; }) : <p>{featured ? "分类已隐藏" : "未指定分类"}</p>}</div></div>; })}</div><RailWidthControls rails={draft.rails} onChange={rails => update({ ...current.current, rails })} /><div className={styles.actions}><button type="button" onClick={() => changeSection("groups")}>管理完整作品分类</button></div></section>
        </div>}
        {section === "pricing" && <FlowPricingEditor value={draft.pricing} restoredItemId={restoredItemId} onRestoredItemFocus={consumeRestoredItemFocus} onPageChange={patch => update({ ...current.current, pricing: { ...current.current.pricing, ...patch } })} onItemChange={(id, patch) => update({ ...current.current, pricing: { ...current.current.pricing, packages: current.current.pricing.packages.map(item => item.id === id ? { ...item, ...patch } : item) } })} onAdd={() => { const id = crypto.randomUUID(); update({ ...current.current, pricing: { ...current.current.pricing, packages: [...current.current.pricing.packages, { id, name: "", price: "", description: "", details: [], enabled: true }] } }); return id; }} onRemove={id => { const index = current.current.pricing.packages.findIndex(item => item.id === id); if (index < 0) return; setRestoredItemId(undefined); setUndoRemoval({ kind: "price", item: current.current.pricing.packages[index], index }); update({ ...current.current, pricing: { ...current.current.pricing, packages: current.current.pricing.packages.filter(item => item.id !== id) } }); }} onPreview={trigger => openPreview("pricing", trigger, "pricing")} previewDisabled={!assetsReady} />}
        {section === "contact" && <FlowContactEditor value={draft.contact} restoredItemId={restoredItemId} onRestoredItemFocus={consumeRestoredItemFocus} assetsEndpoint={siteScope.assetsEndpoint} onPageChange={patch => update({ ...current.current, contact: { ...current.current.contact, ...patch } })} onItemChange={(id, patch) => update({ ...current.current, contact: { ...current.current.contact, items: current.current.contact.items.map(item => item.id === id ? { ...item, ...patch } : item) } })} onQrChange={(id, assetId) => { update({ ...current.current, contact: { ...current.current.contact, items: current.current.contact.items.map(item => { if (item.id !== id) return item; const next = { ...item }; delete next.qrAssetId; return assetId ? { ...next, qrAssetId: assetId } : next; }) } }); void reloadAssets(); }} onAdd={() => { const id = crypto.randomUUID(); update({ ...current.current, contact: { ...current.current.contact, items: [...current.current.contact.items, { id, label: "", value: "", href: "" }] } }); return id; }} onRemove={id => { const index = current.current.contact.items.findIndex(item => item.id === id); if (index < 0) return; setRestoredItemId(undefined); setUndoRemoval({ kind: "contact", item: current.current.contact.items[index], index }); update({ ...current.current, contact: { ...current.current.contact, items: current.current.contact.items.filter(item => item.id !== id) } }); }} onPreview={trigger => openPreview("contact", trigger, "contact")} previewDisabled={!assetsReady} />}
      </fieldset>
    </div>
    {creatingGroup && <dialog ref={createDialog} className={styles.newGroupDialog} aria-labelledby="new-flow-group-title" onCancel={event => { event.preventDefault(); setCreatingGroup(false); }}><form onSubmit={event => { event.preventDefault(); createGroup(); }}><h2 id="new-flow-group-title">新建作品分类</h2><p>填写名称后直接从本站图库选片，再确认顺序与说明。创建本身不会保存或发布。</p><label>分类名称<input autoComplete="off" maxLength={120} value={newName} placeholder="例如：人物、城市、旅行" onChange={event => setNewName(event.target.value)} /></label><footer><button type="button" onClick={() => setCreatingGroup(false)}>取消</button><button type="submit" className={styles.primary} disabled={!newName.trim() || draft.groups.length >= FLOW_GALLERY_LIMITS.groups}>新建并从图库选片</button></footer></form></dialog>}
    {picker === "background" && <BackgroundPicker manifest={manifest} ready={assetsReady} state={assetState} reload={reloadAssets} close={() => setPicker(null)} select={id => { if (!assetMap.has(id)) return; update({ ...current.current, background: { ...current.current.background, assetId: id } }); setPicker(null); }} />}
    {picker && picker !== "background" && <SitePhotoPicker key={`${siteScope.assetsEndpoint}:${picker}`} appearance="flow" siteScopeKey={siteScope.assetsEndpoint} flowLibraryLookup={{ siteScopeKey: siteScope.assetsEndpoint, query, orientation, order }} collectionName={draft.groups.find(item => item.id === picker)?.name ?? "作品分类"} members={draft.groups.find(item => item.id === picker)?.assetIds ?? []} assets={manifest.assets} ready={assetsReady} truncated={Boolean(manifest.truncated)} state={assetState} onReload={reloadAssets} onClose={() => setPicker(null)} onAdd={ids => {
      if (!current.current.groups.some(item => item.id === picker)) throw new Error("分类已变化，请重新选择。");
      changeGroup(picker, value => addFlowMembers(value, ids, new Set(assetMap.keys())));
      setPicker(null);
    }} />}
    {preview && <dialog ref={previewDialog} data-flow-preview={previewModule ?? "all"} className={styles.preview} aria-label="当前编辑即时预览" onCancel={event => { event.preventDefault(); closePreview(); }}>{previewOnlyScene && <p className={styles.previewNote} data-flow-preview-temporary>{FLOW_EDITOR_MODULES.find(item => item.id === previewModule)?.label}尚未启用；仅本次预览临时显示，草稿设置保持不变。</p>}{previewModule === "groups" && <div className={styles.previewTarget}><span role="status">{previewGroupId ? `当前编辑：${previewGroupName}` : "完整作品 · 从头浏览"}</span><button type="button" disabled={!previewGroupId} onClick={() => { setPreviewGroupId(undefined); setPreviewGroupName(""); }}>从头看完整作品</button></div>}<button className={styles.closePreview} data-flow-close-preview type="button" onClick={closePreview}>关闭当前编辑预览</button><div className={styles.previewScrollport} data-flow-scrollport><SiteFlowGalleryView key={previewGroupId ?? "all"} document={previewDocument} assets={manifest.assets} previewGroupId={previewGroupId} /></div></dialog>}
    {enlarged && <dialog ref={largeDialog} className={styles.large} aria-label={`照片大图：${enlargedName}`} onCancel={() => setEnlarged(null)}><button type="button" autoFocus onClick={() => { largeDialog.current?.close(); setEnlarged(null); }}>关闭大图</button>{large ? <img src={large.variants.full.src} alt={enlargedName} /> : <p>素材暂不可用，请重新读取图库。</p>}</dialog>}
  </div>;
}
