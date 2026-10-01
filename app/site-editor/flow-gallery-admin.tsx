"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site-owned image variants. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteEditorScope } from "./scope";
import { createEmptyFlowGalleryDocument, parseFlowGalleryDocument, FLOW_GALLERY_LIMITS, type FlowGalleryDocumentV1 } from "./flow-gallery-document";
import { loadSiteAssets, type SiteAssetManifest } from "./assets-client";
import { confirmDraftSave, DraftSaveRejected, DraftSaveUncertain, editorJson, readSaveReceipt, writeSiteDraft, type DraftSaveOptions, type DraftSaveReceipt, type PendingDraftSave } from "./draft-save";
import PublicationControls from "./publication-controls";
import SiteAssetUpload from "./asset-upload";
import SiteContactCard from "./contact-card";
import SitePhotoPicker from "../preview-workspace/site-photo-picker";
import CollectionMemberEditor from "../preview-workspace/collection-member-editor";
import type { Collection } from "../templates/polaroid-field/collection-model";
import { SiteFlowGalleryView } from "./flow-gallery-view";
import { lockGalleryBodyScroll } from "../premium-gallery-proof/body-scroll-lock";
import { addFlowMembers, flowGalleryFingerprint, removeFlowGroup, removeFlowMember, restoreFlowRemoval, type FlowRemoval, type FlowGroup } from "./flow-gallery-state";
import { FLOW_EDITOR_MODULES, flowModulePreview, flowSectionFromHash, type FlowEditorSection as Section, type FlowPreviewScene } from "./flow-gallery-admin-ui";
import { PhotoFilters, PhotoMetadata, PhotoCaptionEditor, filterFlowPhotos, focusFlowEntry, type PhotoOrientation, type PhotoOrder } from "./flow-gallery-admin-tools";
import styles from "./flow-gallery-admin.module.css";

const SPACE = "premium-flow-gallery";
const emptyManifest: SiteAssetManifest = { version: 1, assets: [] };

// The shared sorter needs a Collection shape. None of its Polaroid fields are persisted here.
function sortableGroup(group: FlowGroup): Collection {
  return { id: group.id, name: group.name, assetIds: group.assetIds, visible: group.visible, description: "", coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, focusAssetId: null };
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
  return <dialog ref={dialog} className={styles.backgroundPicker} aria-labelledby="background-picker-title" onCancel={event => { event.preventDefault(); close(); }}><header className={styles.actions}><h2 id="background-picker-title">从图库选择一张背景</h2><button type="button" onClick={close}>取消</button></header><p role="status">{state}</p><p>点击照片确认背景；确认后可调整焦点，仍需保存草稿。</p>{manifest.truncated && <p role="alert">当前仅载入部分照片，查找覆盖已载入素材。</p>}<PhotoFilters query={query} orientation={orientation} order={order} onQuery={value => { setQuery(value); setPage(0); }} onOrientation={value => { setOrientation(value); setPage(0); }} onOrder={value => { setOrder(value); setPage(0); }} /><button type="button" onClick={() => void reload()}>重新读取图库</button><div className={styles.library}>{photos.slice(currentPage * 48, (currentPage + 1) * 48).map(asset => <article key={asset.id}><button type="button" disabled={!ready} aria-label={`选择背景 ${asset.id}`} onClick={() => select(asset.id)}><img src={asset.variants.thumbnail.src} alt="" loading="lazy" /></button><PhotoMetadata asset={asset} /></article>)}</div>{ready && !photos.length && <p>暂无匹配照片。请在图库上传照片后重新读取。</p>}<footer className={styles.actions}><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></footer></dialog>;
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
  const [orientation, setOrientation] = useState<PhotoOrientation>("all");
  const [order, setOrder] = useState<PhotoOrder>("recent");
  function changeSection(next: Section) {
    setSection(next);
    const hash = `#edit-${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    requestAnimationFrame(() => { moduleHeading.current?.scrollIntoView({ block: "start", behavior: "auto" }); moduleHeading.current?.focus({ preventScroll: true }); });
  }
  useEffect(() => {
    const restore = () => {
      const next = flowSectionFromHash(window.location.hash);
      if (!next) return;
      setSection(next);
      requestAnimationFrame(() => { moduleHeading.current?.scrollIntoView({ block: "start", behavior: "auto" }); moduleHeading.current?.focus({ preventScroll: true }); });
    };
    // Preview scenes use other hashes and remain local to their modal.
    const frame = requestAnimationFrame(restore);
    window.addEventListener("popstate", restore); window.addEventListener("hashchange", restore);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, []);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewModule, setPreviewModule] = useState<Section | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const previewHash = useRef("");
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [libraryPage, setLibraryPage] = useState(0);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const largeDialog = useRef<HTMLDialogElement>(null);
  const dirty = flowGalleryFingerprint(draft) !== saved;
  const group = draft.groups.find(item => item.id === activeGroup) ?? draft.groups[0] ?? null;

  const update = (next: FlowGalleryDocumentV1) => { current.current = next; setDraft(next); };
  const changeGroup = (id: string, change: (group: FlowGroup) => FlowGroup) => update({ ...current.current, groups: current.current.groups.map(item => item.id === id ? change(item) : item) });
  const reloadAssets = useCallback(async () => {
    const token = ++assetToken.current;
    setAssetsReady(false); setAssetState("正在读取本站素材…");
    try {
      const next = await loadSiteAssets(siteScope.assetsEndpoint);
      if (lifetime.current.signal.aborted || token !== assetToken.current) return;
      setManifest(next); setAssetsReady(true); setAssetState(`本站图库 ${next.assets.length} 张`);
    } catch (cause) { if (!lifetime.current.signal.aborted && token === assetToken.current) setAssetState(cause instanceof Error ? cause.message : "素材读取失败，请重试。"); }
  }, [siteScope.assetsEndpoint]);
  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    try {
      const { response, body } = await editorJson(siteScope.endpoint, { cache: "no-store" }, signal);
      if (!response.ok) throw new Error(`草稿读取失败（${response.status}），请确认权限后重试。`);
      const receipt = readSaveReceipt(body, SPACE);
      const content = parseFlowGalleryDocument(receipt.content);
      if (signal?.aborted) return;
      current.current = content; setDraft(content); setSaved(flowGalleryFingerprint(content)); setRevision(receipt.revision); setUpdatedAt(receipt.updatedAt);
      setPending(null); setConflict(false); setUndoRemoval(null); setLoadState("ready"); setMessage("");
    } catch (cause) { if (!signal?.aborted) { setLoadState("error"); setMessage(cause instanceof Error ? cause.message : "草稿读取失败，请重试。"); } }
  }, [siteScope.endpoint, setUndoRemoval]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { void reload(controller.signal); void reloadAssets(); } });
    return () => controller.abort();
  }, [reload, reloadAssets]);

  async function save(options: DraftSaveOptions = {}): Promise<DraftSaveReceipt | null> {
    if (lock.current || loadState !== "ready" || conflict || pending || picker || preview || enlarged) return null;
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
  function closePreview() {
    previewDialog.current?.close(); setPreview(false);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${previewHash.current}`);
    requestAnimationFrame(() => previewTrigger.current?.focus());
  }
  function openPreview(scene: FlowPreviewScene, trigger: HTMLButtonElement, moduleId: Section | null = null) {
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
    setNewName(""); setActiveGroup(id); setPicker(id); setMessage("已建立分类，接着从本站图库选片。选片确认后仍需保存。");
  }
  const blocked = loadState !== "ready" || saving || conflict || Boolean(pending) || Boolean(picker) || preview || Boolean(enlarged);
  const workbenchHref = siteScope.adminBasePath.replace(/\/premium-flow-gallery\/?$/, "");
  const assetMap = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const filtered = filterFlowPhotos(manifest.assets, query, orientation, order);
  const pages = Math.max(1, Math.ceil(filtered.length / 48)), page = Math.min(libraryPage, pages - 1);
  const large = enlarged ? assetMap.get(enlarged) : null;
  const activeModule = FLOW_EDITOR_MODULES.find(item => item.id === section)!;
  const previewDocument = previewModule ? flowModulePreview(draft, previewModule) : draft;
  const previewOnlyScene = previewModule === "pricing" && !draft.pricing.enabled || previewModule === "contact" && !draft.contact.enabled;

  return <div className={styles.root} data-flow-editor-section={section} data-flow-dirty={dirty}>
    <aside className={styles.sidebar}><a href={workbenchHref} onClick={event => { if (dirty && !confirm("当前有未保存修改，确认离开？")) event.preventDefault(); }}>← 站点工作台</a><strong>流影视廊</strong><nav aria-label="流影视廊后台模块">{FLOW_EDITOR_MODULES.map(({ id, label }, index) => <button key={id} data-flow-section={id} aria-current={section === id ? "page" : undefined} onClick={() => changeSection(id)}>{`0${index + 1}`}　{label}</button>)}</nav><small>独立内容 · 本站素材共享</small></aside>
    <div className={styles.workspace}>
      <h1 ref={moduleHeading} tabIndex={-1}>{activeModule.label}</h1>
      {siteScope.publicationEndpoint && siteScope.publicHref && <PublicationControls space={SPACE} endpoint={siteScope.publicationEndpoint} publicHref={siteScope.publicHref} revision={revision} dirty={dirty} disabled={blocked} templateId={SPACE} saveDraft={save}
        draftStatus={loadState === "loading" ? "正在读取" : loadState === "error" ? "读取失败" : pending ? "保存结果待确认" : conflict ? "版本冲突" : dirty ? "未保存修改" : "已保存"}
        draftAction={<button type="button" disabled={blocked || !dirty} onClick={() => void save()}>仅保存草稿</button>}
        tools={<><button type="button" disabled={loadState !== "ready" || !assetsReady || Boolean(picker)} onClick={event => openPreview("works", event.currentTarget)}>预览当前编辑</button><a href={siteScope.previewHref} target="_blank" rel="noreferrer">预览已保存草稿 ↗</a><button type="button" onClick={exportDraft}>导出当前草稿</button><button type="button" disabled={saving || loadState === "loading"} onClick={reloadExplicitly}>重新读取草稿</button></>} />}
      <p role="status" className={styles.status}>{message || "编辑当前独立草稿；只有保存并发布会切换本站公开主页。"}{updatedAt && <small>上次保存 {new Date(updatedAt).toLocaleString()}</small>}</p>
      {undoRemoval && <div className={styles.undoRemoval} role="status"><span>{undoRemoval.kind === "photo" ? "照片已移出当前分类，图库原片保留。" : undoRemoval.kind === "price" ? "价格项目已从当前草稿移除。" : "联系方式已从当前草稿移除。"}</span><button type="button" disabled={loadState !== "ready" || saving || Boolean(picker) || preview || Boolean(enlarged)} onClick={() => { try { const removal = undoRemoval; update(restoreFlowRemoval(current.current, removal)); setUndoRemoval(null); setMessage("已恢复最近移除的内容，其他编辑保留；仍需保存。"); if (removal.kind === "photo") { setActiveGroup(removal.groupId); changeSection("groups"); requestAnimationFrame(() => focusFlowEntry(`flow-caption-${removal.groupId}`)); } else { changeSection(removal.kind === "price" ? "pricing" : "contact"); requestAnimationFrame(() => focusFlowEntry(`flow-${removal.kind}-${removal.item.id}`)); } } catch (cause) { setMessage(cause instanceof Error ? cause.message : "暂时无法恢复。"); } }}>撤销最近移除</button></div>}
      {pending && <button type="button" disabled={saving} onClick={() => void checkSave()}>检查保存结果</button>}
      {(pending || conflict || loadState === "error") && <div className={styles.actions}><button type="button" onClick={exportDraft}>导出当前编辑</button><button type="button" disabled={saving} onClick={reloadExplicitly}>重新读取并核对</button></div>}
      <fieldset className={styles.editor} disabled={loadState !== "ready" || saving}>
        <section className={styles.moduleGuide} aria-label={`${activeModule.label}用途与效果`}>
          <div><p className={styles.position}>显示位置 · {activeModule.position}</p><p>{activeModule.purpose}</p></div>
          <button type="button" data-flow-module-preview={section} disabled={!assetsReady || Boolean(picker)} onClick={event => openPreview(activeModule.scene, event.currentTarget, section)}>查看本模块效果</button>
        </section>
        {section === "library" && <section className={styles.panel}><h2>本站图库</h2><p>先把照片加入本站图库，再进入作品分类建立展示内容。图库资源与基础版、高级拍立得共享。</p><SiteAssetUpload endpoint={siteScope.assetsEndpoint} onUploaded={reloadAssets} /><div className={styles.actions}><span role="status">{assetState}</span><button type="button" onClick={() => void reloadAssets()}>重新读取图库</button><button type="button" onClick={() => changeSection("groups")}>进入完整作品：新建分类并选片</button></div>{manifest.truncated && <p role="alert">超过 10,000 张，当前筛选只覆盖已载入素材。</p>}<PhotoFilters query={query} orientation={orientation} order={order} onQuery={value => { setQuery(value); setLibraryPage(0); }} onOrientation={value => { setOrientation(value); setLibraryPage(0); }} onOrder={value => { setOrder(value); setLibraryPage(0); }} /><div className={styles.library}>{filtered.slice(page * 48, (page + 1) * 48).map(asset => <article key={asset.id}><button type="button" aria-label={`放大素材 ${asset.id}`} onClick={() => setEnlarged(asset.id)}><img src={asset.variants.thumbnail.src} alt="" loading="lazy" /></button><PhotoMetadata asset={asset} /></article>)}</div>{assetsReady && !filtered.length && <p>还没有符合条件的素材。可上传照片或调整查找条件。</p>}<div className={styles.actions}><button disabled={!page} type="button" onClick={() => setLibraryPage(page - 1)}>上一页</button><span>{page + 1} / {pages}</span><button disabled={page + 1 >= pages} type="button" onClick={() => setLibraryPage(page + 1)}>下一页</button></div></section>}
        {section === "groups" && <><section className={styles.panel}><h2>新建作品分类</h2><p>填写名称 → 从图库选片 → 拖动确认顺序 → 查看完整作品效果 → 保存并发布。</p><div className={styles.actions}><label>分类名称<input value={newName} maxLength={120} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); createGroup(); } }} /></label><button type="button" disabled={!newName.trim() || draft.groups.length >= FLOW_GALLERY_LIMITS.groups} onClick={createGroup}>新建并从图库选片</button></div></section><div className={styles.groupWorkspace}><nav className={styles.groupList} aria-label="作品分类">{draft.groups.map((item, index) => <button type="button" key={item.id} aria-current={group?.id === item.id ? "page" : undefined} onClick={() => setActiveGroup(item.id)}>{index + 1}. {item.name}<small>{item.assetIds.length} 张 · {item.visible ? "展示" : "隐藏"}</small></button>)}</nav>{group ? <section className={styles.panel}><div className={styles.actions}><h2>{group.name}</h2><button type="button" onClick={() => setPicker(group.id)}>从图库选片</button></div><label>名称<input value={group.name} maxLength={120} onChange={event => changeGroup(group.id, value => ({ ...value, name: event.target.value }))} /></label><label className={styles.checkbox}><input type="checkbox" checked={group.visible} onChange={event => changeGroup(group.id, value => ({ ...value, visible: event.target.checked }))} />在完整作品页展示此分类</label><div className={styles.actions}>{[-1, 1].map(direction => <button type="button" key={direction} disabled={draft.groups.indexOf(group) + direction < 0 || draft.groups.indexOf(group) + direction >= draft.groups.length} onClick={() => { const items = [...current.current.groups], index = items.findIndex(item => item.id === group.id); [items[index], items[index + direction]] = [items[index + direction], items[index]]; update({ ...current.current, groups: items }); }}>{direction < 0 ? "分类上移" : "分类下移"}</button>)}<button type="button" onClick={() => { if (confirm(`删除分类「${group.name}」？仅移除本草稿的分类与引用，图库照片保留。`)) { update(removeFlowGroup(current.current, group.id)); setActiveGroup(null); } }}>删除此分类</button></div><h3>照片顺序 · {group.assetIds.length} 张</h3><CollectionMemberEditor collection={sortableGroup(group)} assets={manifest.assets} onChange={next => changeGroup(group.id, value => ({ ...value, assetIds: next.assetIds }))} onView={asset => setEnlarged(asset.id)} /><PhotoCaptionEditor key={group.id} group={group} assets={assetMap} onView={setEnlarged} onCaption={(id, caption) => changeGroup(group.id, value => ({ ...value, captions: { ...value.captions, [id]: caption } }))} onRemove={id => { const latest = current.current.groups.find(value => value.id === group.id); if (!latest || !latest.assetIds.includes(id)) return; setUndoRemoval({ kind: "photo", groupId: group.id, id, caption: latest.captions[id], index: latest.assetIds.indexOf(id) }); changeGroup(group.id, value => removeFlowMember(value, id)); }} /><div className={styles.actions}><button type="button" onClick={() => changeSection("home")}>下一步：配置首页轨道</button></div></section> : <section className={styles.panel}><p>新建或选择一个作品分类，开始选片与排序。</p></section>}</div></>}
        {section === "home" && <><section className={styles.panel}><h2>首页身份与文字</h2><p>导航名称显示在顶部；标题与介绍显示在首页左侧。手机首屏保留标题与展开作品入口。</p>{(["brand", "title", "intro"] as const).map(key => <label key={key}>{key === "brand" ? "导航品牌名" : key === "title" ? "首页标题" : "首页介绍"}<textarea rows={key === "intro" ? 3 : 1} maxLength={key === "brand" ? 120 : key === "title" ? 500 : 2000} value={draft.profile[key]} onChange={event => update({ ...current.current, profile: { ...current.current.profile, [key]: event.target.value } })} /></label>)}</section><section className={styles.panel}><h2>全屏背景</h2><p>背景铺满首页、完整作品、价格和联系页面。焦点决定裁切时优先保留的位置。</p><div className={styles.background}>{draft.background.assetId && assetMap.get(draft.background.assetId) ? <img src={assetMap.get(draft.background.assetId)!.variants.card.src} alt="当前首页背景" /> : <p>未选择背景，使用深绿色底色。</p>}<button type="button" onClick={() => setPicker("background")}>从图库选择背景</button>{draft.background.assetId && <button type="button" onClick={() => update({ ...current.current, background: { ...current.current.background, assetId: null } })}>移除背景引用</button>}</div><div className={styles.columns}>{(["x", "y"] as const).map(axis => <label key={axis}>背景焦点 {axis.toUpperCase()} · {draft.background.focalPoint[axis]}%<input type="range" min="0" max="100" value={draft.background.focalPoint[axis]} onChange={event => update({ ...current.current, background: { ...current.current.background, focalPoint: { ...current.current.background.focalPoint, [axis]: Number(event.target.value) } } })} /></label>)}</div></section><section className={styles.panel}><h2>首页作品速览</h2><p>左右轨道按完整作品中已确认的照片顺序播放；宽度比例可以调整，选择分类不会复制照片。</p><RailWidthControls rails={draft.rails} onChange={rails => update({ ...current.current, rails })} /><div className={styles.columns}>{(["leftGroupId", "rightGroupId"] as const).map(key => <label key={key}>{key === "leftGroupId" ? "左侧轨道" : "右侧轨道"}<select value={draft.rails[key] ?? ""} onChange={event => update({ ...current.current, rails: { ...current.current.rails, [key]: event.target.value || null } })}><option value="">暂不展示此轨道</option>{draft.groups.map(item => <option key={item.id} value={item.id}>{item.name}{item.visible ? "" : "（隐藏，首页也不展示）"}</option>)}</select></label>)}</div><div className={styles.actions}><button type="button" onClick={() => changeSection("groups")}>管理完整作品分类</button><button type="button" disabled={!assetsReady} onClick={event => openPreview("works", event.currentTarget, "home")}>查看首页效果</button></div></section></>}
        {section === "pricing" && <section className={styles.panel}><h2>价格与活动</h2><label className={styles.checkbox}><input type="checkbox" checked={draft.pricing.enabled} onChange={event => update({ ...current.current, pricing: { ...current.current.pricing, enabled: event.target.checked } })} />展示价格与活动页面</label><label>页面标题<input maxLength={500} value={draft.pricing.heading} onChange={event => update({ ...current.current, pricing: { ...current.current.pricing, heading: event.target.value } })} /></label><label>介绍<textarea maxLength={2000} value={draft.pricing.introduction} onChange={event => update({ ...current.current, pricing: { ...current.current.pricing, introduction: event.target.value } })} /></label><nav className={styles.entryNavigation} aria-label="价格项目定位">{draft.pricing.packages.map((item, index) => <button type="button" key={item.id} onClick={() => focusFlowEntry(`flow-price-${item.id}`)}>{index + 1}. {item.name || "未命名价格项目"}</button>)}</nav>{draft.pricing.packages.map((item, index) => <article key={item.id} id={`flow-price-${item.id}`} tabIndex={-1} className={styles.entry}><details open={index === 0}><summary>{index + 1}. {item.name || "未命名价格项目"} · {item.enabled ? "展示" : "隐藏"}{item.price ? ` · ${item.price}` : ""}</summary><label className={styles.checkbox}><input type="checkbox" checked={item.enabled} onChange={event => update({ ...current.current, pricing: { ...current.current.pricing, packages: current.current.pricing.packages.map(value => value.id === item.id ? { ...value, enabled: event.target.checked } : value) } })} />展示此项目</label>{(["name", "price", "description"] as const).map(key => <label key={key}>{key === "name" ? "名称" : key === "price" ? "价格说明" : "内容说明"}<input maxLength={key === "name" ? 120 : key === "price" ? 200 : 2000} value={item[key]} onChange={event => update({ ...current.current, pricing: { ...current.current.pricing, packages: current.current.pricing.packages.map(value => value.id === item.id ? { ...value, [key]: event.target.value } : value) } })} /></label>)}<label>细则（每行一条，最多 30 条）<textarea value={item.details.join("\n")} onChange={event => update({ ...current.current, pricing: { ...current.current.pricing, packages: current.current.pricing.packages.map(value => value.id === item.id ? { ...value, details: event.target.value.split("\n") } : value) } })} /></label><button type="button" onClick={() => { const index = current.current.pricing.packages.findIndex(value => value.id === item.id); if (index < 0) return; setUndoRemoval({ kind: "price", item: current.current.pricing.packages[index], index }); update({ ...current.current, pricing: { ...current.current.pricing, packages: current.current.pricing.packages.filter(value => value.id !== item.id) } }); }}>移除此项目</button></details></article>)}<button type="button" disabled={draft.pricing.packages.length >= FLOW_GALLERY_LIMITS.packages} onClick={() => { const id = crypto.randomUUID(); update({ ...current.current, pricing: { ...current.current.pricing, packages: [...current.current.pricing.packages, { id, name: "", price: "", description: "", details: [], enabled: true }] } }); requestAnimationFrame(() => focusFlowEntry(`flow-price-${id}`)); }}>新增价格项目</button></section>}
        {section === "contact" && <section className={styles.panel}><h2>联系</h2><label className={styles.checkbox}><input type="checkbox" checked={draft.contact.enabled} onChange={event => update({ ...current.current, contact: { ...current.current.contact, enabled: event.target.checked } })} />展示联系页面</label><label>页面标题<input maxLength={500} value={draft.contact.heading} onChange={event => update({ ...current.current, contact: { ...current.current.contact, heading: event.target.value } })} /></label><label>介绍<textarea maxLength={2000} value={draft.contact.intro} onChange={event => update({ ...current.current, contact: { ...current.current.contact, intro: event.target.value } })} /></label><nav className={styles.entryNavigation} aria-label="联系方式定位">{draft.contact.items.map((item, index) => <button type="button" key={item.id} onClick={() => focusFlowEntry(`flow-contact-${item.id}`)}>{index + 1}. {item.label || "未命名联系方式"}</button>)}</nav>{draft.contact.items.map((item, index) => <article key={item.id} id={`flow-contact-${item.id}`} tabIndex={-1} className={styles.entry}><details open={index === 0}><summary>{index + 1}. {item.label || "未命名联系方式"}{item.value ? ` · ${item.value.slice(0, 50)}` : ""}</summary>{(["label", "value", "href"] as const).map(key => <label key={key}>{key === "label" ? "联系名称" : key === "value" ? "账号或说明" : "链接（可选，http / https / mailto）"}<input maxLength={key === "label" ? 100 : 2000} value={item[key]} onChange={event => update({ ...current.current, contact: { ...current.current.contact, items: current.current.contact.items.map(value => value.id === item.id ? { ...value, [key]: event.target.value } : value) } })} /></label>)}<SiteContactCard assetsEndpoint={siteScope.assetsEndpoint} targetKey={item.id} assetId={item.qrAssetId} onChange={id => { update({ ...current.current, contact: { ...current.current.contact, items: current.current.contact.items.map(value => { if (value.id !== item.id) return value; const next = { ...value }; delete next.qrAssetId; return id ? { ...next, qrAssetId: id } : next; }) } }); void reloadAssets(); }} /><button type="button" onClick={() => { const index = current.current.contact.items.findIndex(value => value.id === item.id); if (index < 0) return; setUndoRemoval({ kind: "contact", item: current.current.contact.items[index], index }); update({ ...current.current, contact: { ...current.current.contact, items: current.current.contact.items.filter(value => value.id !== item.id) } }); }}>移除此联系方式</button></details></article>)}<button type="button" disabled={draft.contact.items.length >= FLOW_GALLERY_LIMITS.contacts} onClick={() => { const id = crypto.randomUUID(); update({ ...current.current, contact: { ...current.current.contact, items: [...current.current.contact.items, { id, label: "", value: "", href: "" }] } }); requestAnimationFrame(() => focusFlowEntry(`flow-contact-${id}`)); }}>新增联系方式</button></section>}
      </fieldset>
    </div>
    {picker === "background" && <BackgroundPicker manifest={manifest} ready={assetsReady} state={assetState} reload={reloadAssets} close={() => setPicker(null)} select={id => { if (!assetMap.has(id)) return; update({ ...current.current, background: { ...current.current.background, assetId: id } }); setPicker(null); }} />}
    {picker && picker !== "background" && <SitePhotoPicker collectionName={draft.groups.find(item => item.id === picker)?.name ?? "作品分类"} members={draft.groups.find(item => item.id === picker)?.assetIds ?? []} assets={manifest.assets} ready={assetsReady} truncated={Boolean(manifest.truncated)} state={assetState} onReload={reloadAssets} onClose={() => setPicker(null)} onAdd={ids => {
      if (!current.current.groups.some(item => item.id === picker)) throw new Error("分类已变化，请重新选择。");
      changeGroup(picker, value => addFlowMembers(value, ids, new Set(assetMap.keys())));
      setPicker(null);
    }} />}
    {preview && <dialog ref={previewDialog} data-flow-preview={previewModule ?? "all"} className={styles.preview} aria-label="当前编辑即时预览" onCancel={event => { event.preventDefault(); closePreview(); }}>{previewOnlyScene && <p className={styles.previewNote} data-flow-preview-temporary>{FLOW_EDITOR_MODULES.find(item => item.id === previewModule)?.label}尚未启用；仅本次预览临时显示，草稿设置保持不变。</p>}<button className={styles.closePreview} data-flow-close-preview type="button" onClick={closePreview}>关闭当前编辑预览</button><div className={styles.previewScrollport} data-flow-scrollport><SiteFlowGalleryView document={previewDocument} assets={manifest.assets} /></div></dialog>}
    {enlarged && <dialog ref={largeDialog} className={styles.large} aria-label="素材大图" onCancel={() => setEnlarged(null)}><button type="button" autoFocus onClick={() => { largeDialog.current?.close(); setEnlarged(null); }}>关闭大图</button>{large ? <img src={large.variants.full.src} alt="本站素材大图" /> : <p>素材暂不可用，请重新读取图库。</p>}</dialog>}
  </div>;
}
