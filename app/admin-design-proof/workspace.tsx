"use client";

/* eslint-disable @next/next/no-img-element -- Anonymous loopback variants and browser-local upload previews. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import CollectionMemberEditor from "../preview-workspace/collection-member-editor";
import type { Collection } from "../templates/polaroid-field/collection-model";
import { SiteFlowGalleryView } from "../site-editor/flow-gallery-view";
import type { FlowGalleryDocumentV1 } from "../site-editor/flow-gallery-document";
import { addProofMembers, filterProofAssets, newProofGroup, proofAssets, proofGroups, proofHome, proofDocument, proofSnapshot, removeProofMember, validateProofUpload, type ProofAsset, type ProofGroup, type ProofHome } from "./state";
import styles from "./workspace.module.css";

type Screen = "library" | "albums" | "editor" | "home";
type Step = "photos" | "details" | "effect";
type UploadResult = { name: string; error?: string };
function Icon({ name }: { name: "library" | "albums" | "plus" | "search" | "arrow" | "check" | "close" | "upload" | "eye" }) {
  const paths = { library: "M3 4h18v16H3z M3 15l5-5 5 5 3-3 5 5 M16 8h.01", albums: "M4 7h16v14H4z M7 3h10 M2 5h20", plus: "M12 5v14 M5 12h14", search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", arrow: "M4 12h16 M14 6l6 6-6 6", check: "M5 12l4 4L19 6", close: "M6 6l12 12 M18 6L6 18", upload: "M12 16V3 M6 9l6-6 6 6 M4 15v6h16v-6", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0" };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
function Dialog({ title, children, onDismiss, wide = false }: { title: string; children: ReactNode; onDismiss: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return <dialog ref={dialog} className={styles.dialog} data-wide={wide || undefined} aria-label={title} onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <header className={styles.dialogHeading}><h2>{title}</h2><button type="button" className={styles.iconButton} aria-label={`关闭${title}`} onClick={onDismiss}><Icon name="close" /></button></header>
    {children}
  </dialog>;
}
function PhotoGrid({ assets, selected, onToggle, onView, existing = [] }: { assets: readonly ProofAsset[]; selected: readonly string[]; existing?: readonly string[]; onToggle: (id: string) => void; onView: (asset: ProofAsset) => void }) {
  return <ul className={styles.photoGrid}>{assets.map(asset => {
    const included = existing.includes(asset.id);
    const selectedIndex = selected.indexOf(asset.id);
    return <li key={asset.id} className={styles.photoCard} data-selected={selectedIndex >= 0 || undefined}>
      <div className={styles.photoFrame}>
        <button type="button" className={styles.photoSelect} disabled={included} aria-label={`${included ? "已在作品分类：" : "选择照片："}${asset.name}`} aria-pressed={selectedIndex >= 0} onClick={() => onToggle(asset.id)}>
          <img src={asset.variants.card.src} alt={asset.name} loading="lazy" draggable={false} />
          <span className={styles.checkMark}>{included ? <Icon name="check" /> : selectedIndex >= 0 ? selectedIndex + 1 : ""}</span>
          {included && <span className={styles.included}>已在作品分类</span>}
        </button>
        <button type="button" className={styles.zoom} aria-label={`查看大图：${asset.name}`} onClick={() => onView(asset)}><Icon name="eye" /></button>
      </div>
      <div className={styles.photoMeta}><span>{asset.name}</span><small>{asset.orientation === "portrait" ? "竖图" : asset.orientation === "square" ? "方图" : "横图"}</small></div>
    </li>;
  })}</ul>;
}
function Filters({ query, setQuery, orientation, setOrientation }: { query: string; setQuery: (value: string) => void; orientation: string; setOrientation: (value: string) => void }) {
  return <div className={styles.filters}>
    <label className={styles.search}><Icon name="search" /><input type="search" placeholder="搜索照片名称" aria-label="搜索照片名称" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className={styles.filterTabs} role="group" aria-label="照片方向筛选">{[["all", "全部"], ["landscape", "横图"], ["portrait", "竖图"], ["square", "方图"]].map(([value, label]) => <button type="button" key={value} aria-pressed={orientation === value} onClick={() => setOrientation(value)}>{label}</button>)}</div>
  </div>;
}

// Only the shared sorter adapter uses Polaroid's Collection shape; these fields
// never enter the Flow proof document or its simulated save/publish snapshot.
function sortableGroup(group: ProofGroup): Collection {
  return { ...group, description: "", coverAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50, focusAssetId: null };
}
function FlowMemberEditor({ group, assets, onChange, onView }: { group: ProofGroup; assets: ProofAsset[]; onChange: (group: ProofGroup) => void; onView: (asset: ProofAsset) => void }) {
  const [previous, setPrevious] = useState(group);
  const [collection, setCollection] = useState(() => sortableGroup(group));
  if (previous !== group) {
    setPrevious(group);
    // Keep the sorter's exact result so its undo guard can recognize it.
    // External membership or metadata changes invalidate that result.
    if (collection.assetIds !== group.assetIds || collection.name !== group.name || collection.visible !== group.visible || previous.captions !== group.captions) {
      setCollection(sortableGroup(group));
    }
  }
  return <CollectionMemberEditor collection={collection} assets={assets} onChange={next => { setCollection(next); onChange({ ...group, assetIds: next.assetIds }); }} onView={asset => onView(assets.find(item => item.id === asset.id)!)} />;
}
function FlowPreview({ document, assets, scene, onDismiss }: { document: FlowGalleryDocumentV1; assets: readonly ProofAsset[]; scene: "gallery" | "works"; onDismiss: () => void }) {
  useLayoutEffect(() => {
    const hash = window.location.hash;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${scene}`);
    return () => window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  }, [scene]);
  return <Dialog title="流影视廊 · 当前编辑效果" onDismiss={onDismiss} wide>
    <div className={styles.flowPreview} data-flow-scrollport><SiteFlowGalleryView document={document} assets={assets} /></div>
    <footer className={styles.dialogFooter}><span>真实展示组件 · 当前编辑 · 未保存或发布</span><button type="button" className={styles.secondary} onClick={onDismiss}>返回编辑</button></footer>
  </Dialog>;
}

function HomeWorkspace({ home, onChange, groups, assets, onPreview }: { home: ProofHome; onChange: (next: ProofHome) => void; groups: readonly ProofGroup[]; assets: readonly ProofAsset[]; onPreview: () => void }) {
  const background = assets.find(asset => asset.id === home.background.assetId);
  const width = home.rails.leftWidthPercent;
  const setWidth = (value?: number) => {
    const rails = { ...home.rails };
    if (value === undefined) delete rails.leftWidthPercent; else rails.leftWidthPercent = value;
    onChange({ ...home, rails });
  };
  return <div className={styles.homeWorkspace}>
    <section className={styles.homeFields}><h2>首页身份与背景</h2><p>品牌名在顶部导航，标题与介绍在首页左侧。</p>{(["brand", "title", "intro"] as const).map(key => <label className={styles.field} key={key}>{key === "brand" ? "导航品牌名" : key === "title" ? "首页标题" : "首页介绍"}<textarea rows={key === "intro" ? 3 : 1} maxLength={key === "brand" ? 120 : key === "title" ? 500 : 2000} value={home.profile[key]} onChange={event => onChange({ ...home, profile: { ...home.profile, [key]: event.target.value } })} /></label>)}<label className={styles.field}>全屏背景<select aria-label="全屏背景" value={home.background.assetId ?? ""} onChange={event => onChange({ ...home, background: { ...home.background, assetId: event.target.value || null } })}><option value="">深绿色底色</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><div className={styles.backgroundPreview}>{background ? <img src={background.variants.card.src} alt="当前首页背景" style={{ objectPosition: `${home.background.focalPoint.x}% ${home.background.focalPoint.y}%` }} /> : <span>未选择背景 · 使用深绿色底色</span>}</div><div className={styles.focalControls}>{(["x", "y"] as const).map(axis => <label key={axis}>背景{axis === "x" ? "左右" : "上下"}焦点 · {home.background.focalPoint[axis]}%<input type="range" min={0} max={100} value={home.background.focalPoint[axis]} onChange={event => onChange({ ...home, background: { ...home.background, focalPoint: { ...home.background.focalPoint, [axis]: Number(event.target.value) } } })} /></label>)}</div></section>
    <section className={styles.railSettings}><div className={styles.sectionHeading}><h2>首页作品速览</h2><span>引用分类 · 不复制照片</span></div><p>轨道使用分类中确认的照片顺序。隐藏分类后，对应轨道也不展示。</p><div className={styles.railAssignments}>{(["leftGroupId", "rightGroupId"] as const).map((key, index) => {
      const group = groups.find(value => value.id === home.rails[key]);
      return <div key={key}><label className={styles.field}>{index ? "右侧轨道" : "左侧轨道"}<select aria-label={index ? "右侧轨道" : "左侧轨道"} value={home.rails[key] ?? ""} onChange={event => onChange({ ...home, rails: { ...home.rails, [key]: event.target.value || null } })}><option value="">暂不展示</option>{groups.map(item => <option value={item.id} key={item.id}>{item.name}{!item.visible && "（隐藏）"}</option>)}</select></label><div className={styles.railSample}>{group?.visible ? group.assetIds.slice(0, 3).map(id => { const asset = assets.find(a => a.id === id); return asset && <img key={id} src={asset.variants.thumbnail.src} alt={asset.name} />; }) : <span>{group ? "分类已隐藏" : "未指定分类"}</span>}</div></div>;
    })}</div><div className={styles.ratioControls}><h3>左右轨道宽度比例</h3><div className={styles.filterTabs} role="group" aria-label="轨道宽度比例">{[[undefined, "原比例 2∶1"], [70, "7∶3"], [50, "5∶5"]].map(([value, label]) => <button type="button" key={String(label)} aria-pressed={width === value} onClick={() => setWidth(value as number | undefined)}>{label}</button>)}</div><label>左轨 {width ?? 67}% / 右轨 {100 - (width ?? 67)}%<input type="range" aria-label="左轨宽度" min={30} max={70} value={width ?? 67} onChange={event => setWidth(Number(event.target.value))} /></label></div><button type="button" className={styles.primary} onClick={onPreview}><Icon name="eye" />查看首页效果</button></section>
  </div>;
}

export default function AdminDesignProof() {
  const [assets, setAssets] = useState<ProofAsset[]>(() => proofAssets());
  const [collections, setCollections] = useState<ProofGroup[]>(() => proofGroups(proofAssets()));
  const [home, setHome] = useState(proofHome);
  const [saved, setSaved] = useState(() => proofSnapshot(proofGroups(proofAssets())));
  const [published, setPublished] = useState(() => proofSnapshot(proofGroups(proofAssets())));
  const [revision, setRevision] = useState(1);
  const [publishedRevision, setPublishedRevision] = useState(1);
  const [screen, setScreen] = useState<Screen>("library");
  const [activeId, setActiveId] = useState("afternoon");
  const [step, setStep] = useState<Step>("photos");
  const [query, setQuery] = useState("");
  const [orientation, setOrientation] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerOrientation, setPickerOrientation] = useState("all");
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [createError, setCreateError] = useState("");
  const [view, setView] = useState<ProofAsset | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [removeUndo, setRemoveUndo] = useState<{ before: ProofGroup; after: ProofGroup } | null>(null);
  const [previewScene, setPreviewScene] = useState<"gallery" | "works" | null>(null);
  const [captionId, setCaptionId] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const mounted = useRef(true);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const current = collections.find(c => c.id === activeId) ?? collections[0];
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const snapshot = proofSnapshot(collections, home);
  const dirty = snapshot !== saved;
  const publicDifferent = snapshot !== published;
  const visibleAssets = filterProofAssets(assets, query, orientation);
  const pickerAssets = filterProofAssets(assets, pickerQuery, pickerOrientation);
  const captionAsset = current && assetMap.get(captionId && current.assetIds.includes(captionId) ? captionId : current.assetIds[0]);
  const previewDocument = proofDocument(previewScene === "gallery" && screen === "editor" && current ? [{ ...current, visible: true }] : collections, home);

  useEffect(() => {
    mounted.current = true;
    const urls = objectUrls.current;
    return () => { mounted.current = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let baseline = window.innerHeight, width = window.innerWidth;
    const measure = () => {
      if (width !== window.innerWidth) { width = window.innerWidth; baseline = window.innerHeight; }
      baseline = Math.max(baseline, window.innerHeight);
      const editing = document.activeElement?.matches("input:not([type=checkbox]), textarea");
      setKeyboardOpen(Boolean(editing && baseline - viewport.height > 120));
    };
    viewport.addEventListener("resize", measure);
    window.addEventListener("focusin", measure); window.addEventListener("focusout", measure);
    return () => { viewport.removeEventListener("resize", measure); window.removeEventListener("focusin", measure); window.removeEventListener("focusout", measure); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  function changeCollection(next: ProofGroup) {
    setCollections(previous => previous.map(c => c.id === next.id ? next : c));
  }
  function navigate(next: Screen) {
    setScreen(next);
    setSelected([]);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function openCollection(id: string) {
    setActiveId(id); setStep("photos"); navigate("editor");
  }
  function openPicker() {
    setPendingPhotos([]); setPickerQuery(""); setPickerOrientation("all"); setPicker(true);
  }
  function createCollection() {
    const trimmed = name.trim();
    if (!trimmed) { setCreateError("请填写作品分类名称。"); return; }
    if (trimmed.length > 120) { setCreateError("分类名称最多 120 个字。"); return; }
    const next = newProofGroup(`proof-group-${crypto.randomUUID()}`, trimmed);
    // Creating from the library carries its explicitly selected photos into the picker.
    setCollections(previous => [...previous, next]); setActiveId(next.id); setCreate(false); setScreen("editor"); setStep("photos");
    setPendingPhotos([...selected]); setSelected([]); setPickerQuery(""); setPickerOrientation("all"); setPicker(true);
    setNotice(`“${trimmed}”已新建，请选择照片。`);
  }
  function confirmPicker() {
    if (!current) return;
    const next = addProofMembers(current, pendingPhotos, assets);
    changeCollection(next); setNotice(`已加入 ${next.assetIds.length - current.assetIds.length} 张照片。接下来调整顺序。`); setPicker(false); setPendingPhotos([]);
  }
  const save = useCallback(async (publish: boolean) => {
    if (busy || !dirty && !publish) return;
    if (collections.some(collection => !collection.name.trim())) {
      setNotice("请先填写作品分类名称，再保存这次编辑。"); return;
    }
    const captured = snapshot;
    const nextRevision = dirty ? revision + 1 : revision;
    setBusy(publish ? "publish" : "save"); setNotice("");
    await new Promise(resolve => setTimeout(resolve, 400));
    if (simulateFailure) { setNotice("模拟保存失败：编辑保留，可关闭失败模拟后重试。公开版本未改变。"); setBusy(null); return; }
    setSaved(captured); setRevision(nextRevision);
    if (publish) { setPublished(captured); setPublishedRevision(nextRevision); }
    setNotice(publish ? `演示版本 ${nextRevision} 已保存并发布，仅在本页生效。` : `演示草稿 ${nextRevision} 已保存，仅在本页生效。`);
    setBusy(null);
  }, [busy, collections, dirty, revision, simulateFailure, snapshot]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault(); void save(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [save]);
  async function upload(files: FileList | null) {
    if (!files?.length || uploadBusy) return;
    if (files.length > 8) { setUploadResults([{ name: "本次选择", error: "每次最多添加 8 张，请重新选择。" }]); return; }
    setUploadBusy(true); setUploadResults([]);
    const results: UploadResult[] = [], added: ProofAsset[] = [];
    for (const file of Array.from(files)) {
      const error = validateProofUpload(file);
      if (error) { results.push({ name: file.name, error }); continue; }
      const url = URL.createObjectURL(file);
      try {
        const image = new Image(); image.src = url; await image.decode();
        if (!mounted.current) { URL.revokeObjectURL(url); return; }
        const width = image.naturalWidth, height = image.naturalHeight;
        if (!width || !height) throw new Error("decode");
        const variant = { src: url, width, height, bytes: file.size };
        added.push({ id: `local-${crypto.randomUUID()}`, name: file.name, aspectRatio: width / height, orientation: width > height ? "landscape" : width < height ? "portrait" : "square", variants: { thumbnail: variant, card: variant, full: variant }, createdAt: new Date().toISOString() });
        objectUrls.current.add(url); results.push({ name: file.name });
      } catch { URL.revokeObjectURL(url); results.push({ name: file.name, error: "浏览器无法读取此图片，请检查文件。" }); }
    }
    setAssets(previous => [...added, ...previous]); setUploadResults(results); setUploadBusy(false);
    if (added.length) { setQuery(""); setOrientation("all"); setNotice(`已添加 ${added.length} 张到候选图库。文件留在浏览器内，刷新后清除。`); }
    if (fileInput.current) fileInput.current.value = "";
  }
  function removeMember(id: string) {
    if (!current) return;
    const after = removeProofMember(current, id);
    setRemoveUndo({ before: current, after }); changeCollection(after); setNotice("照片已移出作品分类，图库仍保留。可以撤销。");
  }
  const openCreate = () => { setName(""); setCreateError(""); setCreate(true); };
  const saveButtons = <><button type="button" className={styles.secondary} disabled={!dirty || !!busy} onClick={() => void save(false)}>{busy === "save" ? "正在保存…" : "仅保存草稿"}</button><button type="button" className={styles.primary} disabled={!!busy || !publicDifferent && !dirty} onClick={() => void save(true)}>{busy === "publish" ? "正在保存并发布…" : "保存并发布"}</button></>;

  return <div className={styles.root} data-keyboard-open={keyboardOpen || undefined}>
    <div className={styles.proofBanner}><span className={styles.proofDot} />后台设计候选 · 匿名素材 · 保存与发布为本页模拟，刷新后清除</div>
    <aside className={styles.sidebar} aria-label="后台模块">
      <div className={styles.brand}><span>光</span><div><strong>摄影工作室</strong><small>流影视廊</small></div></div>
      <div className={styles.navCaption}>作品管理</div>
      <nav><button type="button" aria-current={screen === "library" ? "page" : undefined} onClick={() => navigate("library")}><Icon name="library" />图库<span>{assets.length}</span></button><button type="button" aria-current={screen === "albums" || screen === "editor" ? "page" : undefined} onClick={() => navigate("albums")}><Icon name="albums" />作品分类<span>{collections.length}</span></button><button type="button" aria-current={screen === "home" ? "page" : undefined} onClick={() => navigate("home")}><Icon name="eye" />首页速览</button></nav>
      <div className={styles.sidebarFoot}><span className={styles.availableDot} />独立内容空间<small>图库供本站模板共享</small></div>
    </aside>
    <div className={styles.main}>
      <header className={styles.topbar}><div className={styles.breadcrumb}>流影视廊 <span>/</span> {screen === "library" ? "图库" : screen === "albums" ? "作品分类" : screen === "home" ? "首页速览" : <button type="button" onClick={() => navigate("albums")}>作品分类</button>}{screen === "editor" && <> <span>/</span> {current?.name}</>}</div><div className={styles.desktopSave}>{saveButtons}</div></header>
      <div className={styles.statusLine}><span><i data-dirty={dirty || undefined} />{dirty ? "有未保存编辑" : `草稿 v${revision} 已保存`}</span><span>公开 v{publishedRevision} · {publicDifferent ? "当前编辑尚未公开" : "与当前编辑一致"}</span></div>
      <main className={styles.content}>
        <header className={styles.pageHeading}><div><p className={styles.eyebrow}>{screen === "library" ? "YOUR PHOTO LIBRARY" : screen === "albums" ? "YOUR WORK GROUPS" : screen === "home" ? "HOMEPAGE PREVIEW" : "GROUP EDITOR"}</p><h1 ref={titleRef} tabIndex={-1}>{screen === "library" ? "图库" : screen === "albums" ? "作品分类" : screen === "home" ? "首页速览" : current?.name}</h1><p>{screen === "library" ? "把照片放进图库，再用作品分类组织你想展示的作品。" : screen === "albums" ? "作品按分类在完整作品页展示；首页轨道引用你选择的分类。" : screen === "home" ? "让首页轨道与完整作品分类建立清楚的关系。" : `${current?.assetIds.length ?? 0} 张照片 · ${current?.visible ? "在完整作品页展示" : "暂不在完整作品页展示"}`}</p></div><div className={styles.headingAction}>{screen === "library" ? <button type="button" className={styles.primary} disabled={uploadBusy} onClick={() => fileInput.current?.click()}><Icon name="upload" />{uploadBusy ? "正在读取图片…" : "添加照片"}</button> : screen === "albums" ? <button type="button" className={styles.primary} onClick={openCreate}><Icon name="plus" />新建作品分类</button> : screen === "home" ? <button type="button" className={styles.secondary} onClick={() => setPreviewScene("works")}><Icon name="eye" />查看首页效果</button> : <button type="button" className={styles.secondary} onClick={openPicker}><Icon name="plus" />从图库选片</button>}</div></header>
        <div className={styles.notice} role="status" aria-live="polite" data-empty={!notice || undefined}>{notice}</div>
        <fieldset className={styles.editScope} disabled={!!busy}>
        {screen === "home" && <HomeWorkspace home={home} onChange={setHome} groups={collections} assets={assets} onPreview={() => setPreviewScene("works")} />}
        {screen === "library" && <>
          <input ref={fileInput} className={styles.hidden} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="添加本地照片" onChange={event => void upload(event.target.files)} />
          <section className={styles.libraryIntro}><p>JPG、PNG、WebP · 每次最多 8 张 · 单张不超过 20 MB</p><button type="button" className={styles.textButton} onClick={() => navigate("albums")}>进入作品分类 <Icon name="arrow" /></button></section>
          {!!uploadResults.length && <section className={styles.uploadResults} aria-label="图片添加结果"><strong>本次添加结果</strong><ul>{uploadResults.map((result, i) => <li key={`${result.name}-${i}`} data-error={!!result.error || undefined}><Icon name={result.error ? "close" : "check"} /><span>{result.name}：{result.error ?? "已加入候选图库"}</span></li>)}</ul></section>}
          <Filters query={query} setQuery={setQuery} orientation={orientation} setOrientation={setOrientation} />
          <div className={styles.gridSummary}><span>{visibleAssets.length} 张照片{visibleAssets.length !== assets.length && ` / 共 ${assets.length} 张`}</span><button type="button" className={styles.textButton} disabled={!visibleAssets.length} onClick={() => setSelected(previous => [...new Set([...previous, ...visibleAssets.map(a => a.id)])])}>选择当前结果</button></div>
          <PhotoGrid assets={visibleAssets} selected={selected} onToggle={id => setSelected(toggle(selected, id))} onView={setView} />
          {!visibleAssets.length && <div className={styles.empty}><Icon name="search" /><h2>没有找到照片</h2><p>试试其他名称，或切换到全部照片。</p><button type="button" className={styles.secondary} onClick={() => { setQuery(""); setOrientation("all"); }}>清除筛选</button></div>}
          {!!selected.length && <div className={styles.selectionBar}><div><strong>已选 {selected.length} 张</strong><button type="button" className={styles.textButton} onClick={() => setSelected([])}>取消选择</button></div><label className={styles.hiddenLabel}>目标作品分类<select aria-label="目标作品分类" value={target} onChange={event => setTarget(event.target.value)}><option value="">选择已有作品分类</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button type="button" className={styles.secondary} disabled={!target} onClick={() => { const c = collections.find(value => value.id === target); if (c) { changeCollection(addProofMembers(c, selected, assets)); setSelected([]); openCollection(c.id); setNotice("照片已加入，接下来确认顺序与说明。"); } }}>加入作品分类</button><button type="button" className={styles.primary} onClick={openCreate}>用所选照片新建</button></div>}
        </>}
        {screen === "albums" && <>
          <div className={styles.journey}><span>新建作品分类</span><Icon name="arrow" /><span>图库选片</span><Icon name="arrow" /><span>顺序与说明</span><Icon name="arrow" /><span>查看效果</span><Icon name="arrow" /><span>保存并发布</span></div>
          <ul className={styles.albumGrid}>{collections.map((collection, index) => {
            const image = assetMap.get(collection.assetIds[0]);
            return <li key={collection.id}><button type="button" className={styles.albumCard} onClick={() => openCollection(collection.id)}><div className={styles.albumImage}>{image ? <img src={image.variants.card.src} alt="" loading="lazy" /> : <span><Icon name="plus" />加入第一张照片</span>}<span className={styles.albumVisibility} data-visible={collection.visible || undefined}>{collection.visible ? "主页展示" : "隐藏"}</span></div><div className={styles.albumCaption}><div><small>{String(index + 1).padStart(2, "0")} / GROUP</small><h2>{collection.name}</h2><p>{collection.assetIds.length} 张照片</p></div><span className={styles.roundArrow}><Icon name="arrow" /></span></div></button></li>;
          })}<li><button type="button" className={styles.newAlbumCard} onClick={openCreate}><Icon name="plus" /><strong>创建下一组作品</strong><span>命名后直接从图库选片</span></button></li></ul>
        </>}
        {screen === "editor" && current && <>
          <nav className={styles.steps} aria-label="作品分类编辑步骤">{([["photos", "照片顺序"], ["details", "分类与说明"], ["effect", "查看效果"]] as const).map(([value, label], index) => <button type="button" key={value} aria-current={step === value ? "step" : undefined} onClick={() => setStep(value)}><span>{String(index + 1).padStart(2, "0")}</span>{label}{value === "photos" && <small>{current.assetIds.length}</small>}</button>)}</nav>
          {step === "photos" && <section className={styles.sortWorkspace}><div className={styles.sectionHeading}><h2>让照片按你的节奏展开</h2><span>整卡拖动 · 手机长按 · 键盘方向键排序</span></div><FlowMemberEditor key={current.id} group={current} assets={assets} onChange={changeCollection} onView={asset => setView(asset)} /><div className={styles.nextStep}><p>顺序决定观众浏览作品的节奏。</p><button type="button" className={styles.secondary} onClick={() => setStep("details")}>下一步：分类与说明 <Icon name="arrow" /></button></div></section>}
          {step === "details" && <section className={styles.groupDetails}>
            <div className={styles.groupFields}><h2>分类信息</h2><p>分类名称出现在完整作品页；每张照片的说明用于大图浏览。</p><label className={styles.field}>分类名称<input value={current.name} maxLength={120} onChange={event => changeCollection({ ...current, name: event.target.value })} /></label><label className={styles.switchRow}><input type="checkbox" checked={current.visible} onChange={event => changeCollection({ ...current, visible: event.target.checked })} /><span><strong>展示此作品分类</strong><small>隐藏后，完整作品页和引用它的首页轨道均不展示</small></span></label><div className={styles.linkedRails}><strong>首页关联</strong><p>{home.rails.leftGroupId === current.id || home.rails.rightGroupId === current.id ? '首页轨道正在引用此分类' : '此分类尚未用于首页速览'}</p><button type="button" className={styles.textButton} onClick={() => navigate("home")}>配置首页轨道 <Icon name="arrow" /></button></div></div>
            <div className={styles.captionWorkspace}><div className={styles.sectionHeading}><h2>照片说明与成员管理</h2><span>移出仅改变分类，图库仍保留</span></div><ul className={styles.captionChoices}>{current.assetIds.map((id, index) => { const asset = assetMap.get(id); return asset && <li key={id}><button type="button" aria-label={`编辑第 ${index + 1} 张照片说明`} aria-pressed={captionAsset?.id === id} onClick={() => setCaptionId(id)}><img src={asset.variants.thumbnail.src} alt={asset.name} /><span>{index + 1}</span></button></li>; })}</ul>{captionAsset ? <div className={styles.captionEditor}><button type="button" className={styles.captionImage} aria-label={`查看大图：${captionAsset.name}`} onClick={() => setView(captionAsset)}><img src={captionAsset.variants.card.src} alt={captionAsset.name} /></button><div><label className={styles.field}>照片说明 <span>可选</span><textarea rows={3} maxLength={2000} value={current.captions[captionAsset.id] ?? ""} placeholder="描述这张照片" onChange={event => changeCollection({ ...current, captions: { ...current.captions, [captionAsset.id]: event.target.value } })} /></label><button type="button" className={styles.removeButton} onClick={() => removeMember(captionAsset.id)}>将此照片移出分类</button></div></div> : <p>从图库选片后，可逐张填写说明。</p>}{removeUndo && removeUndo.after === current && <div className={styles.undo}><span>已移出照片</span><button type="button" className={styles.textButton} onClick={() => { changeCollection(removeUndo.before); setRemoveUndo(null); setNotice("已撤销移出。"); }}>撤销移出</button></div>}<div className={styles.nextStep}><p>照片说明会出现在大图浏览中。</p><button type="button" className={styles.secondary} onClick={() => setStep("effect")}>下一步：查看效果 <Icon name="arrow" /></button></div></div>
          </section>}
          {step === "effect" && <section className={styles.effectWorkspace}><div className={styles.sectionHeading}><h2>分类会这样呈现</h2><span>完整作品页 · 当前编辑</span></div><div className={styles.effectTeaser}><div><p className={styles.eyebrow}>WORK GROUP</p><h2>{current.name}</h2><p>{current.assetIds.length} 张 · 按你确认的顺序展示</p><button type="button" className={styles.primary} onClick={() => setPreviewScene("gallery")}><Icon name="eye" />查看当前分类效果</button>{!current.visible && <small>此分类已隐藏；预览临时展示，编辑设置保持。</small>}</div><div>{current.assetIds.slice(0, 3).map(id => { const photo = assetMap.get(id); return photo && <img key={id} src={photo.variants.card.src} alt={photo.name} />; })}</div></div><div className={styles.nextStep}><p>完整作品分类与首页轨道分别设置。</p><button type="button" className={styles.secondary} onClick={() => navigate("home")}>下一步：配置首页轨道 <Icon name="arrow" /></button></div></section>}
        </>}
        </fieldset>
        <footer className={styles.proofTools}><span>设计验收工具</span><label><input type="checkbox" checked={simulateFailure} onChange={event => setSimulateFailure(event.target.checked)} />模拟保存失败</label><button type="button" className={styles.textButton} disabled={!!busy} onClick={() => { const more = proofAssets(48).map((a, i) => ({ ...a, id: `long-photo-${i}`, name: `${a.name} · 长作品分类` })); setAssets(previous => [...previous.filter(a => !a.id.startsWith("long-photo-")), ...more]); const next = { ...newProofGroup("long-test", "长分类 · 48 张"), assetIds: more.map(a => a.id) }; setCollections(previous => [...previous.filter(c => c.id !== next.id), next]); openCollection(next.id); }}>体验 48 张排序</button></footer>
      </main>
      <div className={styles.mobileSave}>{saveButtons}</div>
    </div>
    {create && <Dialog title="新建作品分类" onDismiss={() => setCreate(false)}><form onSubmit={event => { event.preventDefault(); createCollection(); }}><div className={styles.dialogBody}><p className={styles.dialogIntro}>先给这组作品起个名字，接下来从图库选片。</p><label className={styles.field}>作品分类名称<input autoFocus value={name} maxLength={120} placeholder="例如：午后的光" onChange={event => { setName(event.target.value); setCreateError(""); }} aria-invalid={!!createError} aria-describedby={createError ? "create-error" : undefined} /></label>{createError && <p id="create-error" className={styles.error} role="alert">{createError}</p>}{!!selected.length && <p className={styles.dialogIntro}>已选的 {selected.length} 张照片将在选片步骤中保留。</p>}</div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} onClick={() => setCreate(false)}>取消</button><button type="submit" className={styles.primary}>创建并选片 <Icon name="arrow" /></button></footer></form></Dialog>}
    {picker && current && <Dialog title={`为“${current.name}”选片`} onDismiss={() => { setPicker(false); setPendingPhotos([]); }} wide><div className={styles.pickerBody}><p className={styles.dialogIntro}>按点选顺序追加到作品分类；已有照片的位置保持。</p><Filters query={pickerQuery} setQuery={setPickerQuery} orientation={pickerOrientation} setOrientation={setPickerOrientation} /><div className={styles.gridSummary}><span>{pickerAssets.length} 张可浏览 · 作品分类已有 {current.assetIds.length} 张</span><button type="button" className={styles.textButton} onClick={() => setPendingPhotos(previous => [...new Set([...previous, ...pickerAssets.filter(a => !current.assetIds.includes(a.id)).map(a => a.id)])])}>选择当前结果</button></div><PhotoGrid assets={pickerAssets} selected={pendingPhotos} existing={current.assetIds} onToggle={id => setPendingPhotos(toggle(pendingPhotos, id))} onView={setView} />{!pickerAssets.length && <div className={styles.empty}><h3>没有找到照片</h3><button type="button" className={styles.secondary} onClick={() => { setPickerQuery(""); setPickerOrientation("all"); }}>清除筛选</button></div>}</div><footer className={styles.dialogFooter}><div><strong>已选 {pendingPhotos.length} 张</strong><button type="button" className={styles.textButton} disabled={!pendingPhotos.length} onClick={() => setPendingPhotos([])}>清空</button></div><button type="button" className={styles.secondary} onClick={() => { setPicker(false); setPendingPhotos([]); }}>取消</button><button type="button" className={styles.primary} disabled={!pendingPhotos.length} onClick={confirmPicker}>加入作品分类 <Icon name="arrow" /></button></footer></Dialog>}
    {previewScene && <FlowPreview document={previewDocument} assets={assets} scene={previewScene} onDismiss={() => setPreviewScene(null)} />}
    {view && <Dialog title={view.name} onDismiss={() => setView(null)} wide><div className={styles.lightbox}><img src={view.variants.full.src} alt={view.name} /></div><footer className={styles.dialogFooter}><span>完整照片 · {view.variants.full.width} × {view.variants.full.height}</span><button type="button" className={styles.secondary} onClick={() => setView(null)}>返回编辑</button></footer></Dialog>}
  </div>;
}
