"use client";
import { useRef, useState } from "react";

export default function SiteAssetUpload({ endpoint, onUploaded }: { endpoint: string; onUploaded: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function upload(files: File[]) {
    if (lock.current || !files.length) return;
    if (files.length > 8 || files.some(file => file.size > 20 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setMessage("每批最多 8 张 JPEG、PNG 或 WebP，每张最多 20 MB。"); return;
    }
    lock.current = true; setBusy(true);
    let completed = 0;
    try {
      for (const file of files) {
        setMessage(`正在上传 ${completed + 1}/${files.length}…`);
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file });
        if (!response.ok) throw new Error(`上传未完成（${response.status}），已成功 ${completed} 张；已有照片和草稿保留。`);
        completed += 1;
      }
      setMessage(`已上传 ${completed} 张；本站两套后台可引用同一资源，无需重复上传。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "上传失败，已有照片保留。"); }
    finally { await onUploaded(); lock.current = false; setBusy(false); }
  }
  return <section aria-label="本站照片上传"><label>上传本站照片<input aria-label="上传本站照片" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} /></label><p role="status">{message || "仅上传到当前 Site；原图保留，移出图集不会删除照片。"}</p></section>;
}
