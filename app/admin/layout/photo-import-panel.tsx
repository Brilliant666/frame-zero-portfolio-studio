"use client";

import { useRef, useState, type ChangeEvent } from "react";
import styles from "../admin-v2.module.css";
import {
  LocalPhotoImportUnavailableError,
  localPhotoImportAccept,
  runLocalPhotoImport,
  selectLocalPhotoImportFiles,
  type PhotoImportProgress,
  type PhotoImportResult,
} from "./photo-import-client";

type PhotoLibraryState = "loading" | "ready" | "empty" | "error";
type PhotoImportSelectionMode = "photos" | "folder";

export type PhotoLibraryStats = Readonly<{
  total: number;
  landscape: number;
  portrait: number;
  square: number;
}>;

type PhotoImportPanelProps = Readonly<{
  importing: boolean;
  libraryMessage: string;
  libraryState: PhotoLibraryState;
  localPhotoImportOrigin: string | null;
  localPhotoImportState: "configured" | "missing" | "hosted";
  onImportingChange: (importing: boolean) => void;
  onRefresh: () => Promise<number | null>;
  stats: PhotoLibraryStats;
}>;

const directoryInputAttributes = { webkitdirectory: "" };

export default function PhotoImportPanel({
  importing,
  libraryMessage,
  libraryState,
  localPhotoImportOrigin,
  localPhotoImportState,
  onImportingChange,
  onRefresh,
  stats,
}: PhotoImportPanelProps) {
  const addMaterialsTriggerRef = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const batchActiveRef = useRef(false);
  const [addMaterialsOpen, setAddMaterialsOpen] = useState(false);
  const [progress, setProgress] = useState<PhotoImportProgress | null>(null);
  const [result, setResult] = useState<PhotoImportResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [ignoredFiles, setIgnoredFiles] = useState(0);
  const [selectionMode, setSelectionMode] = useState<PhotoImportSelectionMode>("photos");

  const beginImport = async (
    files: ArrayLike<File> | null,
    mode: PhotoImportSelectionMode,
  ) => {
    if (
      localPhotoImportState !== "configured"
      || !localPhotoImportOrigin
      || batchActiveRef.current
      || !files
    ) return;
    setSelectionMode(mode);
    const selection = selectLocalPhotoImportFiles(files);
    if (selection.accepted.length === 0) {
      setProgress(null);
      setResult(null);
      setHealthError(null);
      setIgnoredFiles(selection.ignored);
      setBatchError("所选内容中没有受支持的照片。");
      return;
    }

    batchActiveRef.current = true;
    onImportingChange(true);
    setProgress(null);
    setResult(null);
    setBatchError(null);
    setHealthError(null);
    setIgnoredFiles(selection.ignored);

    try {
      const nextResult = await runLocalPhotoImport(localPhotoImportOrigin, selection.accepted, {
        onProgress: setProgress,
        refreshLibrary: onRefresh,
      });
      setResult(nextResult);
    } catch (error) {
      if (error instanceof LocalPhotoImportUnavailableError) {
        setHealthError("导入地址已配置，但当前无法连接本地照片导入服务。请确认 npm run dev 正在运行。");
      } else {
        setBatchError("素材添加未能完成，请重试。");
      }
    } finally {
      batchActiveRef.current = false;
      onImportingChange(false);
    }
  };

  const handleSelection = (
    event: ChangeEvent<HTMLInputElement>,
    mode: PhotoImportSelectionMode,
  ) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : null;
    event.currentTarget.value = "";
    setAddMaterialsOpen(false);
    requestAnimationFrame(() => addMaterialsTriggerRef.current?.focus());
    void beginImport(files, mode);
  };

  const refreshDisabled = importing || libraryState === "loading";
  const processingLabel = progress && progress.processed === progress.total
    ? "正在刷新素材列表…"
    : selectionMode === "folder"
      ? "正在读取素材文件夹"
      : "正在添加照片";
  const progressPosition = progress
    ? progress.processed === progress.total
      ? `已处理 ${progress.total} 张，正在刷新素材列表`
      : `正在处理第 ${Math.min(progress.processed + 1, progress.total)} 张，共 ${progress.total} 张`
    : "正在连接本地服务…";
  const selectionLabel = selectionMode === "folder"
    ? "素材文件夹（一次性快照，不会持续同步）"
    : "照片选择（单张或多张）";

  return (
    <section
      className={styles.libraryImportCard}
      data-local-photo-import={localPhotoImportState}
      data-state={libraryState}
      aria-labelledby="local-photo-library-heading"
    >
      <div className={styles.libraryImportHeader}>
        <div className={styles.libraryImportCopy}>
          <strong id="local-photo-library-heading">本地素材库</strong>
          <p>{libraryMessage}</p>
          <small>自动生成网页版本；原图、文件夹路径和文件名不会写入项目数据或 Git。刷新素材列表只会重新读取素材清单，不会扫描电脑文件夹。</small>
        </div>
        <button
          type="button"
          aria-label="刷新素材列表（不重新扫描文件夹）"
          title="只重新读取素材清单，不会重新扫描电脑文件夹"
          onClick={() => void onRefresh()}
          disabled={refreshDisabled}
        >
          {libraryState === "loading" ? "刷新中…" : "刷新素材列表"}
        </button>
      </div>

      <dl className={styles.libraryStats} aria-label="素材库画幅统计">
        <div><dt>总数</dt><dd>{stats.total}</dd></div>
        <div><dt>横图</dt><dd>{stats.landscape}</dd></div>
        <div><dt>竖图</dt><dd>{stats.portrait}</dd></div>
        <div><dt>方图</dt><dd>{stats.square}</dd></div>
      </dl>

      {localPhotoImportState === "configured" && localPhotoImportOrigin ? (
        <div className={styles.photoImportControls}>
          <div className={styles.photoImportActions}>
            <button
              ref={addMaterialsTriggerRef}
              type="button"
              data-add-materials-trigger="true"
              aria-controls="local-photo-import-choices"
              aria-expanded={addMaterialsOpen}
              onClick={() => setAddMaterialsOpen((open) => !open)}
              disabled={importing}
            >
              添加素材
            </button>
          </div>
          <div
            id="local-photo-import-choices"
            className={styles.photoImportChoiceNotes}
            role="group"
            aria-label="选择素材添加方式"
            hidden={!addMaterialsOpen}
          >
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={importing}
            >
              <strong>选择照片</strong>
              <small>默认方式 · 可选择一张或多张</small>
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={importing}
            >
              <strong>选择文件夹</strong>
              <small>一次性读取文件夹及子文件夹</small>
            </button>
          </div>
          <input
            ref={photoInputRef}
            className="sr-only"
            data-photo-picker="files"
            type="file"
            aria-hidden="true"
            tabIndex={-1}
            accept={localPhotoImportAccept}
            multiple
            disabled={importing}
            onChange={(event) => handleSelection(event, "photos")}
          />
          <input
            ref={folderInputRef}
            className="sr-only"
            data-photo-picker="folder"
            type="file"
            aria-hidden="true"
            tabIndex={-1}
            accept={localPhotoImportAccept}
            multiple
            disabled={importing}
            onChange={(event) => handleSelection(event, "folder")}
            {...directoryInputAttributes}
          />
          <p className={styles.photoImportHint}>
            默认可添加一张或多张照片；文件夹按当前内容一次性读取，后续增删需再次选择。支持 JPG、JPEG、PNG、WebP、AVIF、HEIC、HEIF、TIFF；暂不支持相机 RAW。添加素材不会自动修改或保存主页排版。
          </p>
        </div>
      ) : localPhotoImportState === "missing" ? (
        <div className={styles.hostedImportNotice} role="note">
          <strong>本地照片导入服务未启动。</strong>
          <p>请使用 npm run dev 启动完整编辑环境。</p>
        </div>
      ) : (
        <div className={styles.hostedImportNotice} role="note">
          <strong>本地照片导入仅在本机编辑模式可用。</strong>
          <p>远程素材存储将在后续存储阶段提供。</p>
        </div>
      )}

      {importing ? (
        <div className={styles.photoImportProgress} role="status" aria-live="polite">
          <div>
            <strong>{processingLabel}</strong>
            <span>{progressPosition}</span>
          </div>
          <progress
            aria-label="照片导入进度"
            value={progress?.processed ?? 0}
            max={progress?.total ?? 1}
          />
          {progress ? (
            <dl>
              <div><dt>新增</dt><dd>{progress.added}</dd></div>
              <div><dt>已存在</dt><dd>{progress.alreadyExists}</dd></div>
              <div><dt>失败</dt><dd>{progress.failed}</dd></div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div
          className={styles.photoImportResult}
          data-partial={result.failed > 0 || result.refreshFailed}
          data-photo-import-selection={selectionMode}
          role="status"
          aria-live="polite"
        >
          <strong>{result.added + result.alreadyExists === 0 && result.failed > 0
            ? "未能读取素材"
            : result.failed > 0
              ? "读取完成，部分照片未处理"
              : "素材读取完成"}</strong>
          <p>
            新增 {result.added} · 已存在 {result.alreadyExists} · 失败 {result.failed}
            {result.libraryTotal === null ? "" : ` · 素材库现有 ${result.libraryTotal} 张`}
          </p>
          <small>本次来源：{selectionLabel}</small>
          {ignoredFiles > 0 ? <small>另有 {ignoredFiles} 个非照片文件已忽略。</small> : null}
          {result.refreshFailed ? <small>照片处理已完成，但素材列表刷新失败；请稍后刷新素材列表。</small> : null}
          {result.failures.length > 0 ? (
            <details>
              <summary>查看失败详情</summary>
              <ul>
                {result.failures.map((failure) => (
                  <li key={failure.index}>第 {failure.index + 1} 张：{failure.reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {batchError ? (
        <div className={styles.photoImportError} role="alert">
          <strong>未能开始读取</strong>
          <p>{batchError}</p>
          {ignoredFiles > 0 ? <small>已忽略 {ignoredFiles} 个不受支持的文件。</small> : null}
        </div>
      ) : null}

      {healthError ? (
        <div className={styles.photoImportError} data-photo-import-health="unavailable" role="alert">
          <strong>本地照片导入服务暂时不可用</strong>
          <p>{healthError}</p>
        </div>
      ) : null}
    </section>
  );
}
