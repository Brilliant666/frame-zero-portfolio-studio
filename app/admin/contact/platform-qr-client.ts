import { normalizePlatformQrAssetId } from "../../platform-qr";

export const platformQrUploadAccept = ".jpg,.jpeg,.png,.webp";
export const platformQrUploadMaximumBytes = 10 * 1024 * 1024;

const supportedExtensions = new Set(platformQrUploadAccept.split(","));
const localOriginPattern = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PlatformQrFile = Blob & Readonly<{ name: string }>;

export class PlatformQrUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformQrUploadError";
  }
}

function extensionFromName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = name.slice(dot).toLowerCase();
  return supportedExtensions.has(extension) ? extension : null;
}

async function readJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(body: Record<string, unknown> | null, status: number) {
  const error = body?.error;
  const code = error && typeof error === "object" && !Array.isArray(error)
    ? (error as Record<string, unknown>).code
    : null;
  switch (code) {
    case "payload-too-large": return "图片超过 10 MiB，请压缩后重试。";
    case "unsupported-extension": return "仅支持 JPG、PNG 或 WebP 图片。";
    case "invalid-image": return "图片无法安全读取，或尺寸不足以扫码。";
    case "forbidden-origin":
    case "missing-import-header": return "二维码上传请求未通过本机安全校验。";
    default: return `二维码上传失败（${status}）。`;
  }
}

export async function uploadPlatformQr(
  origin: string,
  file: PlatformQrFile,
  { fetchImpl = fetch, signal }: { fetchImpl?: FetchLike; signal?: AbortSignal } = {},
) {
  const match = localOriginPattern.exec(origin);
  if (!match || Number(match[1]) > 65_535) {
    throw new PlatformQrUploadError("本地二维码上传服务暂不可用，请确认项目已完整启动。");
  }
  const extension = extensionFromName(file.name);
  if (!extension) throw new PlatformQrUploadError("仅支持 JPG、PNG 或 WebP 图片。");
  if (file.size < 1) throw new PlatformQrUploadError("请选择非空图片。");
  if (file.size > platformQrUploadMaximumBytes) {
    throw new PlatformQrUploadError("图片超过 10 MiB，请压缩后重试。");
  }

  let response;
  try {
    response = await fetchImpl(`${origin}/platform-qr/import`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-frame-zero-local-import": "1",
        "x-frame-zero-photo-extension": extension,
      },
      body: file,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new PlatformQrUploadError("无法连接本地二维码上传服务。");
  }
  const body = await readJson(response);
  const assetId = normalizePlatformQrAssetId(body?.assetId);
  if (
    !response.ok
    || body?.ok !== true
    || !assetId
    || (body.status !== "added" && body.status !== "duplicate")
    || !Number.isInteger(body.width)
    || !Number.isInteger(body.height)
  ) throw new PlatformQrUploadError(errorMessage(body, response.status));

  return {
    assetId,
    height: Number(body.height),
    status: body.status === "duplicate" ? "duplicate" as const : "added" as const,
    width: Number(body.width),
  };
}
