"use client";

import { useRef, useState, type ChangeEvent } from "react";
import styles from "../admin-v2.module.css";
import {
  localPhotoImportAccept,
  runLocalPhotoImport,
  selectLocalPhotoImportFiles,
  type PhotoImportProgress,
  type PhotoImportResult,
} from "./photo-import-client";

type PhotoLibraryState = "loading" | "ready" | "empty" | "error";

export type PhotoLibraryStats = Readonly<{
  total: number;
  landscape: number;
  portrait: number;
  square: number;
}>;

type PhotoImportPanelProps = Readonly<{
  enabled: boolean;
  importing: boolean;
  libraryMessage: string;
  libraryState: PhotoLibraryState;
  onImportingChange: (importing: boolean) => void;
  onRefresh: () => Promise<number | null>;
  stats: PhotoLibraryStats;
}>;

const directoryInputAttributes = { webkitdirectory: "" };

export default function PhotoImportPanel({
  enabled,
  importing,
  libraryMessage,
  libraryState,
  onImportingChange,
  onRefresh,
  stats,
}: PhotoImportPanelProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const batchActiveRef = useRef(false);
  const [progress, setProgress] = useState<PhotoImportProgress | null>(null);
  const [result, setResult] = useState<PhotoImportResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [ignoredFiles, setIgnoredFiles] = useState(0);

  const beginImport = async (files: ArrayLike<File> | null) => {
    if (!enabled || batchActiveRef.current || !files) return;
    const selection = selectLocalPhotoImportFiles(files);
    if (selection.accepted.length === 0) {
      setProgress(null);
      setResult(null);
      setIgnoredFiles(selection.ignored);
      setBatchError("所选内容中没有受支持的照片。");
      return;
    }

    batchActiveRef.current = true;
    onImportingChange(true);
    setProgress(null);
    setResult(null);
    setBatchError(null);
    setIgnoredFiles(selection.ignored);

    try {
      const nextResult = await runLocalPhotoImport(selection.accepted, {
        onProgress: setProgress,
        refreshLibrary: onRefresh,
      });
      setResult(nextResult);
    } catch {
      setBatchError("本地照片导入服务暂时不可用，请确认 npm run dev 正在运行。");
    } finally {
      batchActiveRef.current = false;
      onImportingChange(false);
    }
  };

  const handleSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : null;
    event.currentTarget.value = "";
    void beginImport(files);
  };

  const refreshDisabled = importing || libraryState === "loading";
  const processingLabel = progress && progress.processed === progress.total
    ? "正在刷新素材列表…"
    : "正在添加素材";

  return (
    <section
      className={styles.libraryImportCard}
      data-local-photo-import={enabled ? "enabled" : "disabled"}
      data-state={libraryState}
      aria-labelledby="local-photo-library-heading"
    >
      <div className={styles.libraryImportHeader}>
        <div className={styles.libraryImportCopy}>
          <strong id="local-photo-library-heading">本地素材库</strong>
          <p>{libraryMessage}</p>
          <small>自动生成网页版本；原图、文件夹路径和文件名不会写入项目数据或 Git。</small>
        </div>
        <button type="button" onClick={() => void onRefresh()} disabled={refreshDisabled}>
          {libraryState === "loading" ? "读取中…" : "重新读取"}
        </button>
      </div>

      <dl className={styles.libraryStats} aria-label="素材库画幅统计">
        <div><dt>总数</dt><dd>{stats.total}</dd></div>
        <div><dt>横图</dt><dd>{stats.landscape}</dd></div>
        <div><dt>竖图</dt><dd>{stats.portrait}</dd></div>
        <div><dt>方图</dt><dd>{stats.square}</dd></div>
      </dl>

      {enabled ? (
        <div className={styles.photoImportControls}>
          <div className={styles.photoImportActions}>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={importing}
            >
              + 添加照片
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={importing}
            >
              + 添加文件夹
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
            onChange={handleSelection}
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
            onChange={handleSelection}
            {...directoryInputAttributes}
          />
          <p className={styles.photoImportHint}>
            支持 JPG、JPEG、PNG、WebP、AVIF、HEIC、HEIF、TIFF；暂不支持相机 RAW。照片会立即加入本地素材库，不会自动修改或保存主页排版。
          </p>
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
            <span>{progress ? `${progress.processed} / ${progress.total}` : "正在连接本地服务…"}</span>
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
        <div className={styles.photoImportResult} data-partial={result.failed > 0 || result.refreshFailed} role="status" aria-live="polite">
          <strong>{result.added + result.alreadyExists === 0 && result.failed > 0
            ? "未能添加照片"
            : result.failed > 0
              ? "添加完成，部分照片未处理"
              : "添加完成"}</strong>
          <p>
            新增 {result.added} · 已存在 {result.alreadyExists} · 失败 {result.failed}
            {result.libraryTotal === null ? "" : ` · 素材库现有 ${result.libraryTotal} 张`}
          </p>
          {ignoredFiles > 0 ? <small>另有 {ignoredFiles} 个非照片文件已忽略。</small> : null}
          {result.refreshFailed ? <small>照片处理已完成，但素材列表刷新失败；请稍后重新读取。</small> : null}
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
          <strong>未能开始添加</strong>
          <p>{batchError}</p>
          {ignoredFiles > 0 ? <small>已忽略 {ignoredFiles} 个不受支持的文件。</small> : null}
        </div>
      ) : null}

      <details className={styles.photoImportCli}>
        <summary>高级 / 命令行导入</summary>
        <code>npm run photos:import -- --source &quot;&lt;照片文件夹&gt;&quot;</code>
      </details>
    </section>
  );
}
