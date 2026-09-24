"use client";

import { useEffect, useState } from "react";
import type { PreviewPortfolioDocumentV1 } from "./document";
import { PreviewPortfolioView } from "./portfolio-view";

export default function PreviewPublicPage() {
  const [content, setContent] = useState<PreviewPortfolioDocumentV1 | null>(null);
  const [status, setStatus] = useState("正在读取新版作品集…");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/preview/site-content", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "读取失败，请稍后重试。");
      setContent(result.content);
      setStatus(result.content ? "" : "新版作品集尚未配置。");
    }).catch(error => { if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : "读取失败，请稍后重试。"); });
    return () => controller.abort();
  }, []);
  if (content) return <PreviewPortfolioView document={content} />;
  return <main style={{ maxWidth: 800, margin: "15vh auto", padding: 24 }}>
    <h1>新版摄影作品集</h1><p role="status">{status}</p>
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a href="/preview/admin">进入新版后台</a> · <a href="/">查看旧版主页</a>
  </main>;
}
