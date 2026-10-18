import { useEffect, useMemo, useRef, useState } from "react";
import PreviewPortfolioAdmin from "../../../app/preview-workspace/admin";
import PhotoLibrary from "../../../app/admin-kit/photo-library";
import { createEmptyPreviewDocument } from "../../../app/preview-workspace/document";
import { parseSitePremiumDocument } from "../../../app/site-editor/content-schema";
import adminStyles from "../../../app/preview-workspace/admin.module.css";

// These probes mount production components. All records and IDs are anonymous,
// edits live only in React state, and the admin transport never reaches a server.
const scope = Object.freeze({
  endpoint: "/api/sites/continuity-fixture/drafts/premium-polaroid",
  adminBasePath: "/continuity-fixture/admin/premium-polaroid",
  previewHref: "/continuity-fixture/preview",
  assetsMode: "site",
  assetsEndpoint: "/api/sites/continuity-fixture/assets",
});

export function LibraryContinuityProbe({ assets }) {
  const photos = useMemo(() => assets.length ? Array.from({ length: 96 }, (_, index) => ({
    ...assets[index % assets.length],
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  })) : [], [assets]);
  if (!photos.length) return <p>图库探针需要匿名照片。请使用 photos=full 打开此夹具。</p>;
  return <main className={adminStyles.workspace} data-continuity-probe="library">
    <section className={adminStyles.panel}>
      <p>隔离图库探针：96 张匿名记录；只观察批次、选择与焦点，不连接数据库。</p>
      <PhotoLibrary noun="图集" assets={photos} albums={[]} ready truncated={false}
        state="已载入 96 张匿名照片" onReload={async () => {}}
        onAdd={() => { throw new Error("此探针不允许写入图集。"); }} />
    </section>
  </main>;
}

const EMPTY_ASSETS = [];

// Keep the production Site validator intact: the fixture server serves these
// exact anonymous UUID paths as geometric SVGs; no real asset endpoint is used.
function siteFixturePhotos(assets) {
  return assets.length ? Array.from({ length: 96 }, (_, index) => {
    const asset = assets[index % assets.length];
    const id = `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    return {
      ...asset, id,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      variants: Object.fromEntries(["thumbnail", "card", "full"].map(kind => [kind, {
        ...asset.variants[kind], bytes: 512,
        src: `${scope.assetsEndpoint}/${id}/${kind}`,
      }])),
    };
  }) : [];
}

export function PackageAdminContinuityProbe({ portfolioDocument, assets = EMPTY_ASSETS }) {
  const photos = useMemo(() => siteFixturePhotos(assets), [assets]);
  const document = useMemo(() => parseSitePremiumDocument({
    ...structuredClone(portfolioDocument ?? createEmptyPreviewDocument()),
    collections: [0, 1].map(index => {
      const members = photos.slice(index * 6, index * 6 + 6).map(asset => asset.id);
      return {
        ...(portfolioDocument?.collections?.[0] ?? {}),
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: `匿名图集 ${index === 0 ? "A" : "B"}`,
        description: "内存验收样本：排序、封面、预览与返回。",
        visible: true, assetIds: members, coverAssetId: members[0] ?? null,
        focusAssetId: null, coverFit: "natural", coverFocusX: 50, coverFocusY: 50,
      };
    }), social: [],
    contact: { wechat: "", email: "", note: "匿名内存样本" },
    packages: [
      { number: "01", english: "FIRST", name: "匿名套餐 A", description: "第一项，用于检查展开状态是否跟随套餐。", price: "¥100", duration: "1 小时", deliverables: ["匿名交付 A"], enabled: true },
      { number: "02", english: "SECOND", name: "匿名套餐 B", description: "第二项，用于检查上移后的展开状态与焦点。", price: "¥200", duration: "2 小时", deliverables: ["匿名交付 B"], enabled: true },
    ],
  }), [portfolioDocument, photos]);
  const [ready, setReady] = useState(false);
  const [requests, setRequests] = useState([]);
  const failNextAssets = useRef(false);
  const [failureState, setFailureState] = useState("");
  useEffect(() => {
    const previousFetch = window.fetch;
    let active = true;
    const response = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });
    const fixtureFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const permitted = method === "GET" && url.origin === window.location.origin
        && !url.search && [scope.endpoint, scope.assetsEndpoint].includes(url.pathname);
      if (active) setRequests(previous => [...previous, { method, path: url.pathname, blocked: !permitted }].slice(-20));
      if (!permitted) return response({ error: "隔离探针已拦截请求：禁止写入或读取真实服务。" }, 403);
      if (url.pathname === scope.assetsEndpoint) {
        if (failNextAssets.current) {
          failNextAssets.current = false;
          if (active) setFailureState("本次图库读取已模拟失败；再次点击重新读取素材即可恢复。");
          return response({ error: "匿名夹具：模拟一次素材读取失败。" }, 503);
        }
        return response({ version: 1, assets: photos, truncated: false });
      }
      return response({ content: document, revision: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
    };
    window.fetch = fixtureFetch;
    // Mount the actual admin only after the deny-by-default transport is active.
    const timer = setTimeout(() => setReady(true), 0);
    return () => {
      active = false;
      clearTimeout(timer);
      if (window.fetch === fixtureFetch) window.fetch = previousFetch;
    };
  }, [document, photos]);
  return <section data-continuity-probe="package-admin" data-transport="fixture-only">
    <p>隔离后台全链样本：96 张匿名照片、2 个图集（各 6 张）、2 个套餐。可筛选、跨页选择、加入图集、整理封面、预览返回及排序套餐。改动仅存浏览器内存，刷新重置；全部保存、发布、上传请求被拦截。</p>
    <details><summary>隔离故障与样本说明</summary>
      <p>照片使用九张匿名几何图重复生成，验证资源身份与操作连续性；请使用 photos=full。素材 ID 尾号 1–6 在图集 A，7–12 在图集 B。</p>
      <button type="button" disabled={failureState.startsWith("已安排")} onClick={() => {
        failNextAssets.current = true;
        setFailureState("已安排下一次图库读取失败：请点击后台的重新读取素材，随后再点一次验证恢复。");
      }}>让下一次图库读取失败一次</button>
      <p role="status">{failureState}</p>
    </details>
    <details><summary>隔离请求记录（最近 20 条）</summary><ol>{requests.map((request, index) => <li key={index}>{request.method} {request.path} · {request.blocked ? "已拦截" : "匿名夹具响应"}</li>)}</ol></details>
    {ready ? <PreviewPortfolioAdmin siteScope={scope} /> : <p role="status">正在准备隔离请求层…</p>}
  </section>;
}
