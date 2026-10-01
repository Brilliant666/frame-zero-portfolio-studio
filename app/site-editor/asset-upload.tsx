"use client";
import { useId, useRef, useState } from "react";

type UploadStatus = "queued" | "uploading" | "uploaded" | "rejected" | "uncertain";
type UploadResult = { name: string; status: UploadStatus };
const labels: Record<UploadStatus, string> = { queued: "未上传", uploading: "上传中", uploaded: "已入库", rejected: "未完成，请核对提示", uncertain: "结果待核对，请先检查图库" };

export default function SiteAssetUpload({ endpoint, onUploaded }: { endpoint: string; onUploaded: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const lock = useRef(false);
  const hintId = useId();
  async function upload(files: File[]) {
    if (lock.current || !files.length) return;
    setFailed(false); setResults(files.map(file => ({ name: file.name, status: "queued" })));
    if (files.length > 8 || files.some(file => file.size > 20 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setFailed(true); setMessage("本批未上传：请每批选择最多 8 张 JPEG、PNG 或 WebP，每张最多 20 MB。"); return;
    }
    lock.current = true; setBusy(true);
    let completed = 0;
    const mark = (index: number, status: UploadStatus) => setResults(current => current.map((item, i) => i === index ? { ...item, status } : item));
    try {
      for (const [index, file] of files.entries()) {
        mark(index, "uploading"); setMessage(`正在上传 ${index + 1}/${files.length}…`);
        let response: Response;
        try { response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file }); }
        catch { mark(index, "uncertain"); throw new Error(`连接中断，已有 ${completed} 张确认入库；当前照片结果待核对，请先查看图库，其余照片未上传。`); }
        if (!response.ok) {
          mark(index, response.status >= 500 ? "uncertain" : "rejected");
          throw new Error(`上传未完成（${response.status}），已确认 ${completed} 张入库；请核对图库后处理其余照片。`);
        }
        mark(index, "uploaded"); completed += 1;
      }
      setMessage(`已上传 ${completed} 张；本站各内容空间可引用同一资源，无需重复上传。`);
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "上传失败，已有照片保留。"); }
    finally {
      try { await onUploaded(); }
      catch { setFailed(true); setMessage(`已确认 ${completed} 张上传；图库刷新失败，请重新读取图库后核对结果，避免重复上传。`); }
      finally { lock.current = false; setBusy(false); }
    }
  }
  return <section aria-label="本站照片上传" data-site-upload>
    <label>上传本站照片<input aria-label="上传本站照片" aria-describedby={hintId} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} /></label>
    <p id={hintId}>每批最多 8 张 · 每张最多 20 MB · JPEG / PNG / WebP。原图保留，移出图集不会删除图库照片。</p>
    <p role={failed ? "alert" : "status"}>{message || "上传到本站图库后，各内容空间可分别选片；上传本身不会发布。"}</p>
    {!!results.length && <ul aria-label="本批上传结果">{results.map((item, index) => <li key={index}>{index + 1}. {item.name} — {labels[item.status]}</li>)}</ul>}
  </section>;
}
