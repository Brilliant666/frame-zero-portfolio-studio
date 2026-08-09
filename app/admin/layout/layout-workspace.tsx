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
  autoComposeTemplateWorks,
  formatFocusPosition,
  isPhotoAssetCompatibleWithSlot,
  isWorkCompatibleWithSlot,
  parseFocusPosition,
  parsePhotoLibraryManifest,
  type PhotoAsset,
} from "../../photo-library";
import type { Work } from "../../site-config";
import { getTemplateCatalogItem } from "../../templates/catalog";
import { AdminSection } from "../admin-form";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";
import PhotoImportPanel, { type PhotoLibraryStats } from "./photo-import-panel";

type LibraryFilter = "all" | "landscape" | "portrait" | "square";
type LibraryState = "loading" | "ready" | "empty" | "error";

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

export default function LayoutWorkspace() {
  const {
    content,
    localPhotoImportOrigin,
    localPhotoImportState,
    setContent,
  } = useAdmin();
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryState>("loading");
  const [libraryMessage, setLibraryMessage] = useState("正在读取本地素材库…");
  const [isImporting, setIsImporting] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [assetPage, setAssetPage] = useState(0);
  const libraryRequestRef = useRef(0);
  const [activeSlotState, setActiveSlotState] = useState(() => ({
    templateId: content.activeTemplate,
    slotIndex: 0,
  }));

  const template = getTemplateCatalogItem(content.activeTemplate);
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
  const activeRatio = template.slotRatios[activeSlot];
  const activeFocus = parseFocusPosition(activeWork?.position ?? "50% 50%");

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesFilter = filter === "all" || asset.orientation === filter;
      return matchesFilter && (!needle || asset.id.toLowerCase().includes(needle));
    });
  }, [assets, filter, query]);
  const libraryStats = useMemo<PhotoLibraryStats>(() => assets.reduce((stats, asset) => ({
    ...stats,
    [asset.orientation]: stats[asset.orientation] + 1,
  }), {
    total: assets.length,
    landscape: 0,
    portrait: 0,
    square: 0,
  }), [assets]);
  const assetPageCount = Math.max(1, Math.ceil(filteredAssets.length / assetPageSize));
  const currentAssetPage = Math.min(assetPage, assetPageCount - 1);
  const pagedAssets = filteredAssets.slice(
    currentAssetPage * assetPageSize,
    (currentAssetPage + 1) * assetPageSize,
  );

  const loadLibrary = useCallback(async () => {
    const request = libraryRequestRef.current + 1;
    libraryRequestRef.current = request;
    try {
      const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: "no-store" });
      if (request !== libraryRequestRef.current) return null;
      if (response.status === 404) {
        setAssets([]);
        setAssetPage(0);
        setLibraryState("empty");
        setLibraryMessage("素材库还为空。");
        return 0;
      }
      if (!response.ok) throw new Error(`素材库读取失败（${response.status}）`);

      const manifest = parsePhotoLibraryManifest(await response.json());
      if (!manifest) throw new Error("素材库清单格式无效，请恢复有效清单后重新读取");
      if (request !== libraryRequestRef.current) return null;
      setAssets(manifest.assets);
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
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary(), 0);
    return () => {
      window.clearTimeout(timer);
      libraryRequestRef.current += 1;
    };
  }, [loadLibrary]);

  const refreshLibrary = useCallback(() => {
    setLibraryState("loading");
    setLibraryMessage("正在重新读取本地素材库…");
    return loadLibrary();
  }, [loadLibrary]);

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
    if (!isPhotoAssetCompatibleWithSlot(asset, activeRatio)) return;
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
      && isWorkCompatibleWithSlot(sourceWork, template.slotRatios[destination])
      && (!destinationWork || isWorkCompatibleWithSlot(destinationWork, template.slotRatios[slotIndex])),
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

  const autoCompose = () => {
    updateTemplateWorks((works) => autoComposeTemplateWorks(assets, template.slotRatios, works));
  };

  const resetLayout = () => {
    updateTemplateWorks(() => []);
  };

  return (
    <AdminSection
      eyebrow="LAYOUT"
      title="素材排版"
      description={`为“${template.name}”的固定槽位安排已有本地素材；比例不合适时宁可留白。`}
    >
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
          <button type="button" onClick={autoCompose} disabled={isImporting || assets.length === 0}>一键智能排版</button>
          <button type="button" onClick={resetLayout}>清空本模板</button>
        </div>
      </div>

      <div className={styles.layoutWorkspace}>
        <section className={styles.slotPane} aria-labelledby="slot-list-heading">
          <div className={styles.paneHeading}>
            <div><strong id="slot-list-heading">固定槽位</strong><small>选择一项后在中栏编辑</small></div>
            <span>{template.photoSlots}</span>
          </div>
          <div className={styles.slotList} role="group" aria-label="模板固定照片槽位">
            {template.slotRatios.map((ratio, slotIndex) => {
              const work = selectedBySlot.get(slotIndex);
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
                    {work ? <img src={work.preview} width={work.previewWidth} height={work.previewHeight} alt="" /> : <span>{ratio}</span>}
                  </span>
                  <span className={styles.slotState}>
                    <strong>{ratio}</strong>
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
              <p>从右侧素材库选择一张方向兼容的照片，或使用一键智能排版。</p>
            </div>
          )}
        </section>

        <section className={styles.assetPane} aria-labelledby="asset-library-heading">
          <div className={styles.paneHeading}>
            <div><strong id="asset-library-heading">本地素材库</strong><small>选择后放入当前槽位 {String(activeSlot + 1).padStart(2, "0")}</small></div>
            <span>{filteredAssets.length} / {assets.length}</span>
          </div>
          <div className={styles.libraryToolbar}>
            <label className={styles.librarySearch}><span className="sr-only">按素材编号搜索</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setAssetPage(0); }} placeholder="搜索素材编号…" /></label>
            <div className={styles.libraryFilters} role="group" aria-label="按画幅筛选">
              {(["all", "landscape", "portrait", "square"] as const).map((value) => (
                <button type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setAssetPage(0); }} key={value}>
                  {value === "all" ? "全部" : value === "landscape" ? "横幅" : value === "portrait" ? "竖幅" : "方幅"}
                </button>
              ))}
            </div>
          </div>

          {filteredAssets.length > 0 ? (
            <>
              <div className={styles.assetGrid}>
                {pagedAssets.map((asset) => {
                  const selectedSlot = selectedAssetSlots.get(asset.id);
                  const compatible = isPhotoAssetCompatibleWithSlot(asset, activeRatio);
                  const pickHint = !compatible
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
                        <span className={styles.assetMeta}><strong>{orientationLabel(asset.orientation)} · {asset.aspectRatio.toFixed(2)}</strong><small>{pickHint}</small></span>
                      </button>
                    </article>
                  );
                })}
              </div>
              {assetPageCount > 1 ? (
                <nav className={styles.pagination} aria-label="素材库分页">
                  <button type="button" onClick={() => setAssetPage((page) => Math.max(0, page - 1))} disabled={currentAssetPage === 0}>上一页</button>
                  <span>{currentAssetPage + 1} / {assetPageCount}</span>
                  <button type="button" onClick={() => setAssetPage((page) => Math.min(assetPageCount - 1, page + 1))} disabled={currentAssetPage === assetPageCount - 1}>下一页</button>
                </nav>
              ) : null}
            </>
          ) : (
            <div className={styles.libraryEmpty} role="status">
              <strong>{assets.length === 0 ? "素材库还是空的" : "没有符合筛选条件的素材"}</strong>
              <p>{assets.length === 0
                ? libraryState === "error"
                  ? "未能读取素材库；请先处理上方错误并重新读取。"
                  : localPhotoImportState === "configured"
                    ? "使用上方“添加照片”或“添加文件夹”把作品加入素材库。"
                    : localPhotoImportState === "missing"
                      ? "本地照片导入服务未启动；请使用 npm run dev 启动完整编辑环境。"
                      : "当前没有可用的素材。"
                : "试试切换画幅或清空搜索词。"}</p>
            </div>
          )}
        </section>
      </div>
    </AdminSection>
  );
}
