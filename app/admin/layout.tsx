import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";
import { AdminProvider } from "./admin-provider";
import AdminShell from "./admin-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "内容管理后台",
  description: "管理摄影主页内容、模板、套餐与素材排版。",
  openGraph: {
    title: "内容管理后台",
    description: "管理摄影主页内容、模板、套餐与素材排版。",
    siteName: "内容管理后台",
  },
  twitter: {
    card: "summary",
    title: "内容管理后台",
    description: "管理摄影主页内容、模板、套餐与素材排版。",
  },
};

function isLocalHost(host: string | null) {
  if (!host) return false;
  const match = /^(127\.0\.0\.1|localhost|\[::1\])(?::([1-9][0-9]{0,4}))?$/i.exec(host);
  if (!match || match[0] !== host) return false;
  return match[2] === undefined || Number(match[2]) <= 65_535;
}

function localPhotoImportOriginFromEnvironment() {
  const value = process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  if (!value) return null;

  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(value);
  if (!match || match[0] !== value || Number(match[1]) > 65_535) return null;

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "http:"
      || parsed.hostname !== "127.0.0.1"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
    ) return null;
  } catch {
    return null;
  }
  return value;
}

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const local = isLocalHost(requestHeaders.get("host"));
  const user = local ? null : await getChatGPTUser();
  const localPhotoImportOrigin = local ? localPhotoImportOriginFromEnvironment() : null;
  const localPhotoImportState = local
    ? localPhotoImportOrigin ? "configured" : "missing"
    : "hosted";

  if (!local && !user) {
    return (
      <main className="admin-gate">
        <div>
          <span className="admin-kicker">CONTENT ADMIN</span>
          <h1>摄影主页后台</h1>
          <p>后台内容只允许站点所有者修改。登录后可编辑资料、套餐、作品顺序和页面模板。</p>
          <a href={chatGPTSignInPath("/admin/template")}>使用 ChatGPT 登录</a>
          <Link className="admin-gate-home" href="/">返回摄影主页</Link>
        </div>
      </main>
    );
  }

  return (
    <AdminProvider
      editorLabel={local ? "本地编辑模式" : user?.displayName ?? "已登录"}
      localPhotoImportOrigin={localPhotoImportOrigin}
      localPhotoImportState={localPhotoImportState}
    >
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
