/** Upload queue rules and transport for the library. Files still go one request each; the queue has no 8-photo limit. */
export const LIBRARY_UPLOAD_LIMITS = { files: 200, bytes: 20 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] } as const;

export type UploadFileLike = { name: string; size: number; type: string };
export type UploadOutcome =
  | { status: "uploaded" | "duplicate"; id: string }
  | { status: "rejected" | "uncertain"; message: string };

export function uploadProblem(file: UploadFileLike) {
  if (!(LIBRARY_UPLOAD_LIMITS.types as readonly string[]).includes(file.type)) return "只支持 JPEG、PNG 或 WebP";
  if (file.size > LIBRARY_UPLOAD_LIMITS.bytes) return "超过 20 MB";
  return null;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One file, with a short retry while the server is busy (429: another upload is still being processed).
 * A lost connection or a 5xx is "uncertain": the photo may already be in the library.
 */
export async function uploadLibraryFile(endpoint: string, file: UploadFileLike & Blob, transport: typeof fetch = fetch, pause: (ms: number) => Promise<unknown> = wait): Promise<UploadOutcome> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try { response = await transport(endpoint, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file }); }
    catch { return { status: "uncertain", message: "连接中断，结果待核对" }; }
    if (response.status === 429 && attempt < 3) { await pause(1200 * (attempt + 1)); continue; }
    if (!response.ok) return response.status >= 500 ? { status: "uncertain", message: `服务暂不可用（${response.status}），结果待核对` } : { status: "rejected", message: `未完成（${response.status}）` };
    let body: unknown;
    try { body = await response.json(); } catch { return { status: "uncertain", message: "回复无法识别，结果待核对" }; }
    const asset = (body as { asset?: { id?: unknown }; deduplicated?: unknown } | null)?.asset;
    if (!asset || typeof asset.id !== "string") return { status: "uncertain", message: "回复无法识别，结果待核对" };
    return { status: (body as { deduplicated?: unknown }).deduplicated === true ? "duplicate" : "uploaded", id: asset.id };
  }
}
