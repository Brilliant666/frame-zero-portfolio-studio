export const localPhotoImportOrigin = "http://127.0.0.1:3002";
export const localPhotoImportMaximumBytes = 200 * 1024 * 1024;
export const localPhotoImportExtensions = Object.freeze([
  ".avif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
] as const);
export const localPhotoImportAccept = localPhotoImportExtensions.join(",");

const supportedExtensions = new Set<string>(localPhotoImportExtensions);

export type LocalPhotoImportFile = Blob & Readonly<{ name: string }>;

export type PhotoImportFailure = Readonly<{
  index: number;
  reason: string;
}>;

export type PhotoImportProgress = Readonly<{
  total: number;
  processed: number;
  added: number;
  alreadyExists: number;
  failed: number;
  failures: readonly PhotoImportFailure[];
}>;

export type PhotoImportResult = PhotoImportProgress & Readonly<{
  libraryTotal: number | null;
  refreshFailed: boolean;
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type RunPhotoImportOptions = Readonly<{
  fetchImpl?: FetchLike;
  onProgress?: (progress: PhotoImportProgress) => void;
  refreshLibrary: () => Promise<number | null>;
}>;

export class LocalPhotoImportUnavailableError extends Error {
  constructor() {
    super("本地照片导入服务暂时不可用，请确认 npm run dev 正在运行。");
    this.name = "LocalPhotoImportUnavailableError";
  }
}

export function getLocalPhotoImportExtension(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = name.slice(dot).toLowerCase();
  return supportedExtensions.has(extension) ? extension : null;
}

export function selectLocalPhotoImportFiles(files: ArrayLike<LocalPhotoImportFile>) {
  const accepted: LocalPhotoImportFile[] = [];
  let ignored = 0;

  for (const file of Array.from(files)) {
    if (getLocalPhotoImportExtension(file.name)) accepted.push(file);
    else ignored += 1;
  }

  return { accepted, ignored };
}

function emptyProgress(total: number): PhotoImportProgress {
  return {
    total,
    processed: 0,
    added: 0,
    alreadyExists: 0,
    failed: 0,
    failures: [],
  };
}

function withFailure(
  progress: PhotoImportProgress,
  index: number,
  reason: string,
): PhotoImportProgress {
  const failures = [...progress.failures, { index, reason }];
  return {
    ...progress,
    processed: progress.processed + 1,
    failed: failures.length,
    failures,
  };
}

function failureReason(code: unknown, status: number) {
  switch (code) {
    case "payload-too-large": return "文件超过 200 MiB 上限";
    case "unsupported-extension": return "文件扩展名不受支持";
    case "unsupported-media-type": return "请求格式不受支持";
    case "empty-body": return "文件内容为空";
    case "request-aborted": return "文件传输中断";
    case "invalid-image": return "照片无法解码或格式暂不受支持";
    case "library-full": return "素材库已达到 10,000 张上限";
    case "forbidden-origin":
    case "missing-import-header": return "本地导入请求未通过安全校验";
    case "import-failed": return "照片处理失败";
    case "internal-error": return "本地导入服务处理失败";
    default: return `照片处理失败（${status}）`;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function responseErrorCode(value: unknown) {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  return value.error.code;
}

export async function checkLocalPhotoImportHealth(fetchImpl: FetchLike = fetch) {
  try {
    const response = await fetchImpl(`${localPhotoImportOrigin}/health`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return false;
    const body = await readJson(response);
    return isRecord(body) && body.ok === true;
  } catch {
    return false;
  }
}

export async function runLocalPhotoImport(
  files: readonly LocalPhotoImportFile[],
  {
    fetchImpl = fetch,
    onProgress = () => undefined,
    refreshLibrary,
  }: RunPhotoImportOptions,
): Promise<PhotoImportResult> {
  if (files.length === 0) throw new TypeError("At least one photo is required");
  if (!await checkLocalPhotoImportHealth(fetchImpl)) {
    throw new LocalPhotoImportUnavailableError();
  }

  let progress = emptyProgress(files.length);
  let serviceTotal: number | null = null;
  onProgress(progress);

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const extension = getLocalPhotoImportExtension(file.name);

    if (!extension) {
      progress = withFailure(progress, index, "文件扩展名不受支持");
      onProgress(progress);
      continue;
    }

    if (file.size > localPhotoImportMaximumBytes) {
      progress = withFailure(progress, index, "文件超过 200 MiB 上限");
      onProgress(progress);
      continue;
    }

    try {
      const response = await fetchImpl(`${localPhotoImportOrigin}/import`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-frame-zero-local-import": "1",
          "x-frame-zero-photo-extension": extension,
        },
        body: file,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const body = await readJson(response);

      if (
        response.ok
        && isRecord(body)
        && body.ok === true
        && (body.status === "added" || body.status === "already-exists")
      ) {
        if (Number.isInteger(body.totalAssets) && Number(body.totalAssets) >= 0) {
          serviceTotal = Number(body.totalAssets);
        }
        progress = {
          ...progress,
          processed: progress.processed + 1,
          added: progress.added + (body.status === "added" ? 1 : 0),
          alreadyExists: progress.alreadyExists + (body.status === "already-exists" ? 1 : 0),
        };
      } else {
        progress = withFailure(progress, index, failureReason(responseErrorCode(body), response.status));
      }
    } catch {
      progress = withFailure(progress, index, "无法连接本地照片导入服务");
    }

    onProgress(progress);
  }

  let refreshedTotal: number | null = null;
  let refreshFailed = false;
  try {
    refreshedTotal = await refreshLibrary();
    refreshFailed = refreshedTotal === null;
  } catch {
    refreshFailed = true;
  }

  return {
    ...progress,
    libraryTotal: refreshedTotal ?? serviceTotal,
    refreshFailed,
  };
}
