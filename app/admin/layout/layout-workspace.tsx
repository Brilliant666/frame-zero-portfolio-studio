"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from the validated local photo manifest. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  assetToWork,
  formatFocusPosition,
  isPhotoAssetCompatibleWithSlot,
  isWorkCompatibleWithSlot,
  parseFocusPosition,
  parsePhotoLibraryManifest,
  type PhotoAsset,
} from "../../photo-library";
import { buildPhotoAssetReferenceMap } from "../../photo-library-references";
import {
  hasSourceOrientationAdaptiveSlots,
  normalizePrimaryAssignmentRatio,
  primaryPhotoRatioForDimensions,
  templateSlotOrientationMode,
} from "../../photo-ratio-policy";
import type { Work } from "../../site-config";
import { getTemplateCatalogItem } from "../../templates/catalog";
import { AdminSection } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";
import { LayoutCompositionPreview } from "../template/template-composition-preview";
import PhotoImportPanel, { type PhotoLibraryStats } from "./photo-import-panel";
import {
  loadLocalPhotoLibrary,
  setLocalPhotoLibraryArchived,
  type LocalPhotoLibraryBatch,
  type LocalPhotoLibraryItem,
  type LocalPhotoLibrarySnapshot,
} from "./photo-library-management-client";

type LibraryFilter = "all" | "landscape" | "portrait" | "square";
type LibraryState = "loading" | "ready" | "empty" | "error";
type LibraryView = "active" | "archived";
type LibrarySort = "recent" | "oldest" | "asset-id";

const manifestUrl = "/photos/library-manifest.json";
const assetPageSize = 48;

function slotIndexOf(work: Work, fallback: number) {
  return Number.isInteger(work.slotIndex) ? work.slotIndex as number : fallback;
}

function orientationLabel(orientation: PhotoAsset["orientation"]) {
  if (orientation === "portrait") return "竖幅";
  if (orientation === "landscape") return "横幅";
  return "方幅";
}

function unmanagedLibraryItem(asset: PhotoAsset): LocalPhotoLibraryItem {
  return {
    asset,
    assetId: asset.id,
    importOrdinal: null,
    batchId: null,
    batchPosition: null,
    sourceKind: "legacy",
    addedAt: null,
    status: "active",
    archivedAt: null,
  };
}

function sourceLabel(item: LocalPhotoLibraryItem) {
  if (item.sourceKind === "photos") return "照片批次";
  if (item.sourceKind === "folder") return "文件夹批次";
  return "既有素材 · 导入时间未知";
}

function batchLabel(batch: LocalPhotoLibraryBatch) {
  return `批次 ${batch.ordinal} · ${batch.sourceKind === "folder" ? "文件夹" : "照片"}`;
}

export default function LayoutWorkspace() {
  const {
    content,
    savedContent,
    localPhotoImportOrigin,
    localPhotoImportState,
    setContent,
  } = useAdmin();
  const [libraryItems, setLibraryItems] = useState<LocalPhotoLibraryItem[]>([]);
  const [libraryBatches, setLibraryBatches] = useState<LocalPhotoLibraryBatch[]>([]);
  const [libraryRevision, setLibraryRevision] = useState<number | null>(null);
  const [libraryState, setLibraryState] = useState<LibraryState>("loading");
  const [libraryMessage, setLibraryMessage] = useState("正在读取本地素材库…");
  const [isImporting, setIsImporting] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [libraryView, setLibraryView] = useState<LibraryView>("active");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("recent");
  const [batchFilter, setBatchFilter] = useState("all");
  const [assetPage, setAssetPage] = useState(0);
  const [archiveCandidate, setArchiveCandidate] = useState<string | null>(null);
  const [mutatingAssetId, setMutatingAssetId] = useState<string | null>(null);
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const libraryRequestRef = useRef(0);
  const activeLibraryViewRef = useRef<HTMLButtonElement | null>(null);
  const archivedLibraryViewRef = useRef<HTMLButtonElement | null>(null);
  const archiveConfirmRef = useRef<HTMLButtonElement | null>(null);
  const archiveTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const templateTransitionRef = useRef<HTMLParagraphElement | null>(null);
  const [activeSlotState, setActiveSlotState] = useState(() => ({
    templateId: content.activeTemplate,
    slotIndex: 0,
  }));

  const template = getTemplateCatalogItem(content.activeTemplate);
  const templateChangedFromSaved = content.activeTemplate !== savedContent.activeTemplate;
  const activeSlot = activeSlotState.templateId === content.activeTemplate
    && activeSlotState.slotIndex < template.photoSlots
    ? activeSlotState.slotIndex
    : 0;
  const selectedWorks = useMemo(
    () => content.templateWorks[content.activeTemplate] ?? [],
    [content.activeTemplate, content.templateWorks],
  );
  const layoutConfigured = Object.prototype.hasOwnProperty.call(content.templateWorks, content.activeTemplate);

  const selectedBySlot = useMemo(() => {
    const map = new Map<number, Work>();
    selectedWorks.forEach((work, index) => {
      const slotIndex = slotIndexOf(work, index);
      if (slotIndex >= 0 && slotIndex < template.photoSlots && !map.has(slotIndex)) map.set(slotIndex, work);
    });
    return map;
  }, [selectedWorks, template.photoSlots]);

  const selectedAssetSlots = useMemo(() => {
    const map = new Map<string, number>();
    for (const [slotIndex, work] of selectedBySlot) {
      if (work.assetId) map.set(work.assetId, slotIndex);
    }
    return map;
  }, [selectedBySlot]);

  const activeWork = selectedBySlot.get(activeSlot);
  const hasAdaptiveGallerySlots = hasSourceOrientationAdaptiveSlots(content.activeTemplate);
  const slotUsesSourceOrientation = (slotIndex: number) => (
    templateSlotOrientationMode(content.activeTemplate, slotIndex) === "source-adaptive"
  );
  const slotPresentationRatio = (slotIndex: number, work: Work | undefined) => (
    slotUsesSourceOrientation(slotIndex)
      ? work
        ? primaryPhotoRatioForDimensions(work.previewWidth, work.previewHeight)
          ?? normalizePrimaryAssignmentRatio(template.slotRatios[slotIndex])
        : normalizePrimaryAssignmentRatio(template.slotRatios[slotIndex])
      : template.slotRatios[slotIndex]
  );
  const activeRatio = slotPresentationRatio(activeSlot, activeWork);
  const activeSlotUsesSourceOrientation = slotUsesSourceOrientation(activeSlot);
  const activeFocus = parseFocusPosition(activeWork?.position ?? "50% 50%");

  const activeItems = useMemo(
    () => libraryItems.filter((item) => item.status === "active"),
    [libraryItems],
  );
  const assets = useMemo(() => activeItems.map((item) => item.asset), [activeItems]);
  const referenceMap = useMemo(
    () => buildPhotoAssetReferenceMap(content, savedContent),
    [content, savedContent],
  );

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = libraryItems.filter((item) => {
      if (item.status !== libraryView) return false;
      const asset = item.asset;
      const matchesFilter = filter === "all" || asset.orientation === filter;
      const matchesBatch = batchFilter === "all"
        || (batchFilter === "legacy" ? item.batchId === null : item.batchId === batchFilter);
      return matchesFilter && matchesBatch && (!needle || asset.id.toLowerCase().includes(needle));
    });
    return [...filtered].sort((left, right) => {
      if (librarySort === "asset-id") return left.assetId.localeCompare(right.assetId);
      const leftOrdinal = left.importOrdinal;
      const rightOrdinal = right.importOrdinal;
      if (leftOrdinal === null && rightOrdinal === null) return left.assetId.localeCompare(right.assetId);
      if (leftOrdinal === null) return 1;
      if (rightOrdinal === null) return -1;
      return librarySort === "recent" ? rightOrdinal - leftOrdinal : leftOrdinal - rightOrdinal;
    });
  }, [batchFilter, filter, libraryItems, librarySort, libraryView, query]);
  const libraryStats = useMemo<PhotoLibraryStats>(() => assets.reduce((stats, asset) => ({
    ...stats,
    [asset.orientation]: stats[asset.orientation] + 1,
  }), {
    total: assets.length,
    landscape: 0,
    portrait: 0,
    square: 0,
  }), [assets]);
  const archivedAssetCount = libraryItems.length - activeItems.length;
  const batchOptions = useMemo(() => [...libraryBatches]
    .sort((left, right) => right.ordinal - left.ordinal)
    .map((batch) => ({
      ...batch,
      count: libraryItems.filter((item) => item.batchId === batch.id).length,
    })), [libraryBatches, libraryItems]);
  const assetPageCount = Math.max(1, Math.ceil(filteredItems.length / assetPageSize));
  const currentAssetPage = Math.min(assetPage, assetPageCount - 1);
  const pagedItems = filteredItems.slice(
    currentAssetPage * assetPageSize,
    (currentAssetPage + 1) * assetPageSize,
  );

  const applyLocalSnapshot = useCallback((snapshot: LocalPhotoLibrarySnapshot) => {
    setLibraryItems([...snapshot.items]);
    setLibraryBatches([...snapshot.batches]);
    setLibraryRevision(snapshot.revision);
    setAssetPage(0);
    setArchiveCandidate(null);
    setLibraryState(snapshot.activeAssets > 0 ? "ready" : "empty");
    setLibraryMessage(
      `可用 ${snapshot.activeAssets} 张 · 回收站 ${snapshot.archivedAssets} 张；素材原图没有复制进项目。`,
    );
    return snapshot.activeAssets;
  }, []);

  const loadLibrary = useCallback(async () => {
    const request = libraryRequestRef.current + 1;
    libraryRequestRef.current = request;
    try {
      if (localPhotoImportState === "configured" && localPhotoImportOrigin) {
        const snapshot = await loadLocalPhotoLibrary(localPhotoImportOrigin);
        if (request !== libraryRequestRef.current) return null;
        return applyLocalSnapshot(snapshot);
      }
      const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: "no-store" });
      if (request !== libraryRequestRef.current) return null;
      if (response.status === 404) {
        setLibraryItems([]);
        setLibraryBatches([]);
        setLibraryRevision(null);
        setAssetPage(0);
        setLibraryState("empty");
        setLibraryMessage("素材库还为空。");
        return 0;
      }
      if (!response.ok) throw new Error(`素材库读取失败（${response.status}）`);

      const manifest = parsePhotoLibraryManifest(await response.json());
      if (!manifest) throw new Error("素材库清单格式无效，请恢复有效清单后刷新素材列表");
      if (request !== libraryRequestRef.current) return null;
      setLibraryItems(manifest.assets.map(unmanagedLibraryItem));
      setLibraryBatches([]);
      setLibraryRevision(null);
      setAssetPage(0);
      setLibraryState(manifest.assets.length > 0 ? "ready" : "empty");
      setLibraryMessage(manifest.assets.length > 0
        ? `已载入 ${manifest.assets.length} 张本地素材；原图没有复制进项目。`
        : "导入已完成，但文件夹中没有可用照片。");
      return manifest.assets.length;
    } catch (error) {
      if (request !== libraryRequestRef.current) return null;
      setLibraryState("error");
      setLibraryMessage(error instanceof Error ? error.message : "素材库读取失败");
      return null;
    }
  }, [applyLocalSnapshot, localPhotoImportOrigin, localPhotoImportState]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary(), 0);
    return () => {
      window.clearTimeout(timer);
      libraryRequestRef.current += 1;
    };
  }, [loadLibrary]);

  const refreshLibrary = useCallback(() => {
    setLibraryState("loading");
    setLibraryMessage("正在刷新素材列表…");
    return loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (!archiveCandidate) return;
    const frame = window.requestAnimationFrame(() => archiveConfirmRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [archiveCandidate]);

  useEffect(() => {
    if (!templateChangedFromSaved) return;
    const frame = window.requestAnimationFrame(() => {
      templateTransitionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [content.activeTemplate, templateChangedFromSaved]);

  const changeArchiveState = async (assetId: string, archived: boolean) => {
    if (!localPhotoImportOrigin || libraryRevision === null || mutatingAssetId) return;
    setMutatingAssetId(assetId);
    setManagementMessage(null);
    try {
      const snapshot = await setLocalPhotoLibraryArchived(
        localPhotoImportOrigin,
        [assetId],
        archived,
        libraryRevision,
      );
      applyLocalSnapshot(snapshot);
      setArchiveCandidate(null);
      setManagementMessage(archived ? "素材已移入回收站；现有排版引用保持可用。" : "素材已恢复到素材库。");
      window.requestAnimationFrame(() => {
        (archived ? activeLibraryViewRef : archivedLibraryViewRef).current?.focus();
      });
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : "素材库更新失败。");
      await loadLibrary();
    } finally {
      setMutatingAssetId(null);
    }
  };

  const cancelArchive = (assetId: string) => {
    setArchiveCandidate(null);
    window.requestAnimationFrame(() => archiveTriggerRefs.current.get(assetId)?.focus());
  };

  const updateTemplateWorks = (updater: (works: Work[]) => Work[]) => {
    const templateId = content.activeTemplate;
    setContent((current) => ({
      ...current,
      templateWorks: {
        ...current.templateWorks,
        [templateId]: updater(current.templateWorks[templateId] ?? []),
      },
    }));
  };

  const updateSlot = (slotIndex: number, patch: Partial<Work>) => {
    updateTemplateWorks((works) => works.map((work, index) => (
      slotIndexOf(work, index) === slotIndex ? { ...work, ...patch, slotIndex } : work
    )));
  };

  const chooseSlot = (slotIndex: number) => {
    setActiveSlotState({ templateId: content.activeTemplate, slotIndex });
  };

  const removeSlot = (slotIndex: number) => {
    updateTemplateWorks((works) => works.filter((work, index) => slotIndexOf(work, index) !== slotIndex));
  };

  const assignAsset = (asset: PhotoAsset) => {
    if (!isPhotoAssetCompatibleWithSlot(asset, activeRatio, activeSlotUsesSourceOrientation)) return;
    updateTemplateWorks((works) => {
      const existing = works.find((work) => work.assetId === asset.id);
      const remaining = works.filter((work, index) => (
        work.assetId !== asset.id && slotIndexOf(work, index) !== activeSlot
      ));
      const next = existing
        ? { ...existing, slotIndex: activeSlot }
        : assetToWork(asset, activeSlot);
      return [...remaining, next].sort((left, right) => slotIndexOf(left, 0) - slotIndexOf(right, 0));
    });
  };

  const canMoveSlot = (slotIndex: number, direction: -1 | 1) => {
    const destination = slotIndex + direction;
    if (destination < 0 || destination >= template.photoSlots) return false;
    const sourceWork = selectedBySlot.get(slotIndex);
    const destinationWork = selectedBySlot.get(destination);
    return Boolean(
      sourceWork
      && isWorkCompatibleWithSlot(sourceWork, template.slotRatios[destination], slotUsesSourceOrientation(destination))
      && (!destinationWork || isWorkCompatibleWithSlot(destinationWork, template.slotRatios[slotIndex], slotUsesSourceOrientation(slotIndex))),
    );
  };

  const moveSlot = (slotIndex: number, direction: -1 | 1) => {
    if (!canMoveSlot(slotIndex, direction)) return;
    const destination = slotIndex + direction;
    updateTemplateWorks((works) => works.map((work, index) => {
      const currentSlot = slotIndexOf(work, index);
      if (currentSlot === slotIndex) return { ...work, slotIndex: destination };
      if (currentSlot === destination) return { ...work, slotIndex };
      return work;
    }).sort((left, right) => slotIndexOf(left, 0) - slotIndexOf(right, 0)));
    chooseSlot(destination);
  };

  const setFocusFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeWork) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    updateSlot(activeSlot, { position: formatFocusPosition(x, y) });
  };

  const resetLayout = () => {
    updateTemplateWorks(() => []);
  };

  return (
    <AdminSection
      eyebrow="LAYOUT"
      title="素材排版"
      description={hasAdaptiveGallerySlots
        ? `为“${template.name}”安排已有本地素材；结构槽位保持设计方向，普通图集槽位按横图 3:2、竖图 2:3 自适应展示。`
        : `为“${template.name}”的固定槽位安排已有本地素材；比例不合适时宁可留白。`}
    >
      {templateChangedFromSaved ? (
        <p
          ref={templateTransitionRef}
          className={styles.layoutTemplateTransition}
          data-template-transition="unsaved"
          role="status"
          aria-atomic="true"
          aria-live="polite"
          tabIndex={-1}
        >
          主页模板已切换为「{template.name}」，尚未保存。现在可为它安排素材；已有模板排版不会被自动覆盖。
        </p>
      ) : null}
      <p className={styles.mobileLayoutNote}>手机可查看并完成基础调整；复杂素材排版建议使用桌面端。</p>

      <PhotoImportPanel
        importing={isImporting}
        libraryMessage={libraryMessage}
        libraryState={libraryState}
        localPhotoImportOrigin={localPhotoImportOrigin}
        localPhotoImportState={localPhotoImportState}
        onImportingChange={setIsImporting}
        onRefresh={refreshLibrary}
        stats={libraryStats}
      />

      <div className={styles.layoutSummary}>
        <div><span>当前模板</span><strong>{template.name}</strong><small>{template.photoRatios}</small></div>
        <div><span>排版状态</span><strong>{layoutConfigured ? `${selectedBySlot.size} / ${template.photoSlots} 已排版` : "沿用旧版作品"}</strong><small>正在编辑槽位 {String(activeSlot + 1).padStart(2, "0")}</small></div>
        <div className={styles.layoutActions}>
          <button type="button" onClick={resetLayout}>清空本模板</button>
        </div>
      </div>

      <LayoutCompositionPreview
        templateId={content.activeTemplate}
        assets={assets}
        libraryState={libraryState}
        libraryMessage={libraryMessage}
        busy={isImporting}
        onRefresh={refreshLibrary}
      />

      <div className={styles.layoutWorkspace}>
        <section className={styles.slotPane} aria-labelledby="slot-list-heading">
          <div className={styles.paneHeading}>
            <div><strong id="slot-list-heading">固定槽位</strong><small>选择一项后在中栏编辑</small></div>
            <span>{template.photoSlots}</span>
          </div>
          <div className={styles.slotList} role="group" aria-label="模板固定照片槽位">
            {template.slotRatios.map((_, slotIndex) => {
              const work = selectedBySlot.get(slotIndex);
              const presentationRatio = slotPresentationRatio(slotIndex, work);
              const active = slotIndex === activeSlot;
              return (
                <button
                  type="button"
                  className={styles.slotListButton}
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => chooseSlot(slotIndex)}
                  key={`${content.activeTemplate}-${slotIndex}`}
                >
                  <span className={styles.slotNumber}>{String(slotIndex + 1).padStart(2, "0")}</span>
                  <span className={styles.slotThumb} data-empty={!work}>
                    {work ? <img src={work.preview} width={work.previewWidth} height={work.previewHeight} alt="" /> : <span>{presentationRatio}</span>}
                  </span>
                  <span className={styles.slotState}>
                    <strong>{presentationRatio}</strong>
                    <small>{active ? "正在编辑" : work?.locked ? "已填 · 已锁定" : work ? "已填" : "空槽位"}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.slotEditor} aria-labelledby="slot-editor-heading">
          <div className={styles.paneHeading}>
            <div><strong id="slot-editor-heading">当前槽位 {String(activeSlot + 1).padStart(2, "0")}</strong><small>{activeRatio} · {activeWork ? "已填入素材" : "等待素材"}</small></div>
            <span>{activeWork?.locked ? "LOCKED" : "EDIT"}</span>
          </div>

          {activeWork ? (
            <div className={styles.slotEditorBody}>
              <div
                className={styles.slotCanvas}
                style={{ aspectRatio: activeRatio.replace(":", " / ") }}
                onPointerDown={setFocusFromPointer}
              >
                <img
                  src={activeWork.preview}
                  width={activeWork.previewWidth}
                  height={activeWork.previewHeight}
                  alt=""
                  style={{ objectPosition: activeWork.position }}
                />
                <span className={styles.focusCrosshair} style={{ left: `${activeFocus.x}%`, top: `${activeFocus.y}%` }} />
                <small>点击画面设置焦点；键盘可使用下方滑块</small>
              </div>

              <div className={styles.slotFields}>
                <label><span>标题</span><input value={activeWork.title} onChange={(event) => updateSlot(activeSlot, { title: event.target.value })} /></label>
                <label><span>描述</span><input value={activeWork.subtitle} onChange={(event) => updateSlot(activeSlot, { subtitle: event.target.value })} /></label>
              </div>

              <div className={styles.focusRanges}>
                <label>
                  <span>水平焦点 {Math.round(activeFocus.x)}%</span>
                  <input aria-label={`槽位 ${activeSlot + 1} 水平焦点`} type="range" min="0" max="100" value={activeFocus.x} onChange={(event) => updateSlot(activeSlot, { position: formatFocusPosition(Number(event.target.value), activeFocus.y) })} />
                </label>
                <label>
                  <span>垂直焦点 {Math.round(activeFocus.y)}%</span>
                  <input aria-label={`槽位 ${activeSlot + 1} 垂直焦点`} type="range" min="0" max="100" value={activeFocus.y} onChange={(event) => updateSlot(activeSlot, { position: formatFocusPosition(activeFocus.x, Number(event.target.value)) })} />
                </label>
              </div>

              <div className={styles.slotControls}>
                <button type="button" onClick={() => moveSlot(activeSlot, -1)} disabled={!canMoveSlot(activeSlot, -1)}>向前交换</button>
                <button type="button" onClick={() => moveSlot(activeSlot, 1)} disabled={!canMoveSlot(activeSlot, 1)}>向后交换</button>
                <label className={styles.slotLock}><input type="checkbox" checked={Boolean(activeWork.locked)} onChange={(event) => updateSlot(activeSlot, { locked: event.target.checked })} /><span>锁定槽位</span></label>
                <button type="button" className={styles.dangerText} onClick={() => removeSlot(activeSlot)}>移除素材</button>
              </div>
            </div>
          ) : (
            <div className={styles.emptyEditor}>
              <span>{activeRatio}</span>
              <strong>此槽位尚未安排素材</strong>
              <p>从右侧素材库选择一张方向兼容的照片，或先生成排版建议并采用到草稿。</p>
            </div>
          )}
        </section>

        <section className={styles.assetPane} aria-labelledby="asset-library-heading">
          <div className={styles.paneHeading}>
            <div><strong id="asset-library-heading">本地素材库</strong><small>{libraryView === "active" ? `选择后放入当前槽位 ${String(activeSlot + 1).padStart(2, "0")}` : "回收站素材仍保留文件与现有排版引用"}</small></div>
            <span>{filteredItems.length} / {libraryView === "active" ? activeItems.length : archivedAssetCount}</span>
          </div>
          {localPhotoImportState === "configured" ? (
            <div className={styles.libraryViews} role="group" aria-label="素材库视图">
              <button ref={activeLibraryViewRef} type="button" aria-pressed={libraryView === "active"} onClick={() => { setLibraryView("active"); setAssetPage(0); setArchiveCandidate(null); }}>在库素材 {activeItems.length}</button>
              <button ref={archivedLibraryViewRef} type="button" aria-pressed={libraryView === "archived"} onClick={() => { setLibraryView("archived"); setAssetPage(0); setArchiveCandidate(null); }}>回收站 {archivedAssetCount}</button>
            </div>
          ) : null}
          <div className={styles.libraryToolbar}>
            <label className={styles.librarySearch}><span className="sr-only">按素材编号搜索</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setAssetPage(0); setArchiveCandidate(null); }} placeholder="搜索素材编号…" /></label>
            <div className={styles.libraryFilters} role="group" aria-label="按画幅筛选">
              {(["all", "landscape", "portrait", "square"] as const).map((value) => (
                <button type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setAssetPage(0); setArchiveCandidate(null); }} key={value}>
                  {value === "all" ? "全部" : value === "landscape" ? "横幅" : value === "portrait" ? "竖幅" : "方幅"}
                </button>
              ))}
            </div>
            <label className={styles.librarySelect}>
              <span>顺序</span>
              <select value={librarySort} onChange={(event) => { setLibrarySort(event.target.value as LibrarySort); setAssetPage(0); setArchiveCandidate(null); }}>
                <option value="recent">最近新增</option>
                <option value="oldest">最早记录</option>
                <option value="asset-id">素材编号</option>
              </select>
            </label>
            <label className={styles.librarySelect}>
              <span>导入批次</span>
              <select value={batchFilter} onChange={(event) => { setBatchFilter(event.target.value); setAssetPage(0); setArchiveCandidate(null); }}>
                <option value="all">全部批次</option>
                <option value="legacy">既有素材（时间未知）</option>
                {batchOptions.map((batch) => <option value={batch.id} key={batch.id}>{batchLabel(batch)} · {batch.count} 张</option>)}
              </select>
            </label>
          </div>
          {managementMessage ? <p className={styles.libraryManagementMessage} role="status">{managementMessage}</p> : null}

          {filteredItems.length > 0 ? (
            <>
              <div className={styles.assetGrid}>
                {pagedItems.map((item) => {
                  const asset = item.asset;
                  const selectedSlot = selectedAssetSlots.get(asset.id);
                  const compatible = libraryView === "active"
                    && isPhotoAssetCompatibleWithSlot(asset, activeRatio, activeSlotUsesSourceOrientation);
                  const references = referenceMap.get(asset.id) ?? { draft: [], saved: [] };
                  const pickHint = libraryView === "archived"
                    ? "素材在回收站中，恢复后可重新使用"
                    : !compatible
                    ? `与槽位 ${activeSlot + 1} 方向不符`
                    : selectedSlot !== undefined
                      ? `当前用于槽位 ${selectedSlot + 1}`
                      : asset.id.slice(0, 12).toUpperCase();
                  return (
                    <article className={styles.assetCard} data-selected={selectedSlot !== undefined} key={asset.id}>
                      <button type="button" className={styles.assetPick} onClick={() => assignAsset(asset)} disabled={!compatible} title={pickHint}>
                        <span className={styles.assetThumb} style={{ aspectRatio: asset.aspectRatio }}>
                          <img src={asset.variants.thumbnail.src} width={asset.variants.thumbnail.width} height={asset.variants.thumbnail.height} alt="" loading="lazy" decoding="async" />
                          {selectedSlot !== undefined ? <b>{String(selectedSlot + 1).padStart(2, "0")}</b> : null}
                        </span>
                        <span className={styles.assetMeta}>
                          <strong>{orientationLabel(asset.orientation)} · {asset.aspectRatio.toFixed(2)}</strong>
                          <small>{sourceLabel(item)}{item.importOrdinal === null ? "" : ` · #${item.importOrdinal}`}</small>
                          <small>{pickHint}</small>
                        </span>
                      </button>
                      {localPhotoImportState === "configured" ? (
                        <div className={styles.assetManagement}>
                          <small>当前草稿 {references.draft.length} 处 · 已保存 {references.saved.length} 处</small>
                          {archiveCandidate === asset.id && item.status === "active" ? (
                            <div role="group" aria-label="确认移入回收站">
                              <span>移入回收站？</span>
                              <button ref={archiveConfirmRef} type="button" onClick={() => void changeArchiveState(asset.id, true)} disabled={mutatingAssetId !== null}>确认</button>
                              <button type="button" onClick={() => cancelArchive(asset.id)} disabled={mutatingAssetId !== null}>取消</button>
                            </div>
                          ) : (
                            <button
                              ref={(node) => {
                                if (node) archiveTriggerRefs.current.set(asset.id, node);
                                else archiveTriggerRefs.current.delete(asset.id);
                              }}
                              data-archive-trigger={item.status === "active" ? asset.id : undefined}
                              type="button"
                              onClick={() => item.status === "active" ? setArchiveCandidate(asset.id) : void changeArchiveState(asset.id, false)}
                              disabled={mutatingAssetId !== null || libraryRevision === null}
                            >
                              {mutatingAssetId === asset.id ? "处理中…" : item.status === "active" ? "移入回收站" : "恢复素材"}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {assetPageCount > 1 ? (
                <nav className={styles.pagination} aria-label="素材库分页">
                  <button type="button" onClick={() => { setAssetPage((page) => Math.max(0, page - 1)); setArchiveCandidate(null); }} disabled={currentAssetPage === 0}>上一页</button>
                  <span>{currentAssetPage + 1} / {assetPageCount}</span>
                  <button type="button" onClick={() => { setAssetPage((page) => Math.min(assetPageCount - 1, page + 1)); setArchiveCandidate(null); }} disabled={currentAssetPage === assetPageCount - 1}>下一页</button>
                </nav>
              ) : null}
            </>
          ) : (
            <div className={styles.libraryEmpty} role="status">
              <strong>{libraryState === "error"
                ? "素材库暂时无法读取"
                : libraryView === "archived"
                  ? archivedAssetCount === 0 ? "回收站还是空的" : "没有符合筛选条件的回收站素材"
                  : activeItems.length === 0 ? "素材库还是空的" : "没有符合筛选条件的素材"}</strong>
              <p>{libraryState === "error"
                ? libraryMessage
                : (libraryView === "active" ? activeItems.length : archivedAssetCount) > 0
                ? "试试清空搜索词，或切换画幅与导入批次。"
                : libraryView === "archived"
                  ? "移入回收站的素材会保留原文件和现有排版引用，并可随时恢复。"
                  : activeItems.length === 0
                ? localPhotoImportState === "configured"
                    ? "使用上方“添加素材”把照片或文件夹加入素材库。"
                    : localPhotoImportState === "missing"
                      ? "本地照片导入服务未启动；请使用 npm run dev 启动完整编辑环境。"
                      : "当前没有可用的素材。"
                : "当前没有可用的素材。"}</p>
            </div>
          )}
        </section>
      </div>
    </AdminSection>
  );
}
