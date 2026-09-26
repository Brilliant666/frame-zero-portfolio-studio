import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "摄影作品集平台",
  description: "为摄影师建立独立的作品集与服务展示空间。",
  openGraph: { title: "摄影作品集平台", description: "为摄影师建立独立的作品集与服务展示空间。", siteName: "摄影作品集平台" },
  twitter: { title: "摄影作品集平台", description: "为摄影师建立独立的作品集与服务展示空间。" },
};

export default function PlatformHome() {
  return (
    <main style={{ maxWidth: 760, margin: "80px auto", padding: 24 }}>
      <p>摄影作品集平台</p>
      <h1>让作品拥有自己的空间</h1>
      <p>建立摄影师主页，展示作品、拍摄套餐与联系方式。账号与独立站点基础正在本地验证。</p>
      <nav aria-label="平台入口" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 32 }}>
        <Link href="/login">账号登录</Link>
        <Link href="/test">内部模板测试区</Link>
        <Link href="/preview">新版摄影作品集预览</Link>
      </nav>
      <p>测试与预览入口仅供本地内部验证，不代表已上线的用户服务。</p>
    </main>
  );
}
