import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";
import { AdminProvider } from "./admin-provider";
import AdminShell from "./admin-shell";

export const dynamic = "force-dynamic";

function isLocalHost(host: string | null) {
  const hostname = (host ?? "").split(":")[0];
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const local = isLocalHost(requestHeaders.get("host"));
  const user = local ? null : await getChatGPTUser();

  if (!local && !user) {
    return (
      <main className="admin-gate">
        <div>
          <span className="admin-kicker">FRAME//ZERO · CONTENT SYSTEM</span>
          <h1>摄影主页后台</h1>
          <p>后台内容只允许站点所有者修改。登录后可编辑资料、套餐、作品顺序和页面模板。</p>
          <a href={chatGPTSignInPath("/admin/template")}>使用 ChatGPT 登录</a>
          <Link className="admin-gate-home" href="/">返回摄影主页</Link>
        </div>
      </main>
    );
  }

  return (
    <AdminProvider editorLabel={local ? "本地编辑模式" : user?.displayName ?? "已登录"}>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
