import { useEffect, useMemo, useRef, useState } from "react";
import PreviewPortfolioAdmin from "../../../app/preview-workspace/admin";
import { createEmptyPreviewDocument } from "../../../app/preview-workspace/document";
import PublicationControls from "../../../app/site-editor/publication-controls";
import { SitePortfolioView } from "../../../app/site-editor/premium-view";
import LivePreviewFrame from "../../../app/site-editor/live-preview-frame";
import { LIVE_PREVIEW_EVENT } from "../../../app/admin-kit/live-preview";

// These fixtures exercise the production UI, but every fetch is intercepted.
// Uploads only append a generated anonymous record; file bytes are never stored.
const ASSETS = "/api/sites/continuity-fixture/assets";
const DRAFT = "/api/sites/continuity-fixture/drafts/premium-polaroid";
const PUBLICATION = "/api/sites/continuity-fixture/publications/premium-polaroid";
const SPACE = "premium-polaroid";
const uuid = (kind, number) => `${kind}0000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const manifest = assets => ({ version: 1, assets, truncated: false });
function photo(number) {
  const portrait = [1, 4, 7].includes((number - 1) % 9);
  const width = portrait ? 400 : 600, height = portrait ? 600 : 400;
  const id = uuid(2, number);
  return { id, aspectRatio: width / height, orientation: portrait ? "portrait" : "landscape",
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, number)).toISOString(),
    variants: Object.fromEntries(["thumbnail", "card", "full"].map(kind => [kind, { src: `${ASSETS}/${id}/${kind}`, width, height, bytes: 512 }])) };
}
function album(number, name, ids) {
  return { id: uuid(1, number), name, description: "匿名隔离样本", visible: true,
    assetIds: ids, coverAssetId: ids[0] ?? null, focusAssetId: null,
    coverFit: "natural", coverFocusX: 50, coverFocusY: 50 };
}
function makeDocument(collections) {
  const value = createEmptyPreviewDocument();
  value.profile = { brand: "匿名", mark: "匿", photographer: "匿名", role: "摄影师", city: "测试城市", availability: "", intro: "匿名照片，仅用于隔离验收。" };
  value.hero = { eyebrow: "ANONYMOUS PHOTOS", title: "匿名照片", services: "隔离样本" };
  value.collections = collections;
  return value;
}
const memberSummary = document => document?.collections?.map(item => ({ id: item.id, name: item.name, count: item.assetIds.length, assetIds: item.assetIds })) ?? [];
const scope = { endpoint: DRAFT, adminBasePath: "/demo/admin/premium-polaroid", assetsMode: "site", assetsEndpoint: ASSETS,
  previewHref: "?subject=portfolio&photos=full&host=standalone", publicationEndpoint: PUBLICATION, publicHref: "#fixture-public", spaces: ["basic", SPACE, "premium-flow-gallery"] };
function Controls(props) { return <PublicationControls {...props} space={SPACE} endpoint={PUBLICATION} publicHref="#fixture-public" />; }
function DiagnosticPreview(props) {
  useEffect(() => { window.dispatchEvent(new CustomEvent("fixture:main-members", { detail: memberSummary(props.document) })); }, [props.document]);
  return <SitePortfolioView {...props} />;
}

export function MainAdminProbe() {
  const initialPhotos = useMemo(() => Array.from({ length: 41 }, (_, index) => photo(index + 1)), []);
  const document = useMemo(() => makeDocument([
    album(1, "正片创作", initialPhotos.slice(0, 11).map(item => item.id)),
    album(2, "漫展场照", initialPhotos.slice(11, 24).map(item => item.id)),
    album(3, "糖水日记", initialPhotos.slice(24, 25).map(item => item.id)),
  ]), [initialPhotos]);
  const [ready, setReady] = useState(false), [requests, setRequests] = useState([]);
  const [members, setMembers] = useState(() => memberSummary(document));
  useEffect(() => {
    const previousFetch = window.fetch;
    const preferences = ["frame-zero:admin-autosave", "frame-zero:admin-live-preview"].map(key => [key, localStorage.getItem(key)]);
    localStorage.setItem("frame-zero:admin-autosave", "off");
    localStorage.setItem("frame-zero:admin-live-preview", "closed");
    let active = true, photos = [...initialPhotos];
    const current = { id: uuid(3, 19), space: "premium-flow-gallery", templateId: "premium-flow-gallery", draftRevision: 19, publishedAt: "2026-01-01T00:00:00.000Z" };
    const onMembers = event => setMembers(event.detail);
    window.addEventListener("fixture:main-members", onMembers);
    const transport = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const local = url.origin === location.origin && !url.search;
      const read = local && method === "GET" && [ASSETS, DRAFT, PUBLICATION].includes(url.pathname);
      const upload = local && method === "POST" && url.pathname === ASSETS;
      if (active) setRequests(previous => [...previous, { method, path: url.pathname, result: read ? "anonymous read" : upload ? "memory upload" : "blocked 403" }].slice(-30));
      if (upload) {
        if (photos.length >= 96) return json({ error: "匿名照片上限" }, 413);
        const asset = photo(photos.length + 1); photos.push(asset);
        return json({ asset, deduplicated: false }, 201);
      }
      if (!read) {
        if (url.pathname === DRAFT && typeof init?.body === "string") {
          try { const body = JSON.parse(init.body); if (body.content) setMembers(memberSummary(body.content)); } catch { /* Invalid writes are still rejected. */ }
        }
        return json({ error: "隔离夹具禁止保存、发布及其他请求。" }, 403);
      }
      if (url.pathname === ASSETS) return json(manifest(photos));
      if (url.pathname === PUBLICATION) return json({ current, history: [current] });
      return json({ content: document, revision: 3, updatedAt: "2026-01-01T00:00:00.000Z" });
    };
    window.fetch = transport;
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => {
      active = false; clearTimeout(timer); window.removeEventListener("fixture:main-members", onMembers);
      if (window.fetch === transport) window.fetch = previousFetch;
      preferences.forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
    };
  }, [document, initialPhotos]);
  return <>
    {ready && <PreviewPortfolioAdmin siteScope={scope} PublicationControls={Controls} SitePreview={DiagnosticPreview} />}
    <details className="main-fixes-tools"><summary>诊断</summary>
      <p>41 张匿名照片，图集 11 / 13 / 1。上传仅产生匿名内存记录；保存与发布一律 403，刷新重置。无顶部夹具栏。</p>
      <p>成员清单在打开产品“预览效果”时从其 document 属性读取；也记录被拒绝的保存内容。</p>
      <pre data-main-members>{JSON.stringify(members, null, 2)}</pre>
      <pre data-main-requests>{JSON.stringify(requests, null, 2)}</pre>
    </details>
  </>;
}

export function MainPreviewProbe({ mode = "race" }) {
  const photos = useMemo(() => [photo(1), photo(2)], []);
  const initial = useMemo(() => makeDocument([album(1, "匿名图集", [photos[0].id])]), [photos]);
  const [ready, setReady] = useState(false), [requests, setRequests] = useState([]), [added, setAdded] = useState(false);
  const held = useRef(null), sequence = useRef(0), latest = useRef(initial);
  useEffect(() => {
    const priorChannel = window.__frameZeroLivePreview, previousFetch = window.fetch;
    let active = true;
    latest.current = initial; sequence.current = 0;
    window.__frameZeroLivePreview = { [SPACE]: { content: initial, at: Date.now() } };
    const log = entry => { if (active) setRequests(previous => [...previous, entry]); };
    const transport = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method !== "GET" || url.origin !== location.origin || url.pathname !== ASSETS || url.search) {
        log({ method, path: url.pathname, status: 403 }); return json({ error: "Fixture request blocked" }, 403);
      }
      const request = ++sequence.current;
      if (mode === "race" && request === 2) {
        log({ request, status: "held", assets: ["A"] });
        return new Promise(resolve => { held.current = () => { log({ request, status: 200, released: true, assets: ["A"] }); resolve(json(manifest([photos[0]]))); held.current = null; }; });
      }
      const fail = mode === "failure" && request === 3 || mode === "initial-failure" && request === 1;
      const withB = latest.current.collections[0].coverAssetId === photos[1].id;
      log({ request, status: fail ? 503 : 200, assets: withB ? ["A", "B"] : ["A"] });
      return fail ? json({ error: "匿名素材读取失败" }, 503) : json(manifest(withB ? photos : [photos[0]]));
    };
    window.__mainPreviewTransport = transport;
    window.fetch = transport;
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => { active = false; clearTimeout(timer); held.current?.(); delete window.__mainPreviewTransport; window.__frameZeroLivePreview = priorChannel; if (window.fetch === transport) window.fetch = previousFetch; };
  }, [initial, mode, photos]);
  const addPhoto = () => {
    latest.current = makeDocument([album(1, "匿名图集", [photos[1].id, photos[0].id])]);
    window.__frameZeroLivePreview[SPACE] = { content: latest.current, at: Date.now() };
    window.dispatchEvent(new Event(LIVE_PREVIEW_EVENT)); setAdded(true);
  };
  const url = new URL(location.href); url.searchParams.set("subject", "main-preview-frame"); url.hash = "";
  return <main className="main-preview-probe">
    <header><strong>真实实时预览 · {mode}</strong><span> A = 照片 1；B = 照片 2。只读匿名响应，按钮不访问业务接口。</span>
      <button type="button" disabled={!ready || !requests.some(entry => entry.request >= 2) || added} onClick={addPhoto}>新增照片 B 并设为封面</button>
      <button type="button" disabled={!requests.some(entry => entry.status === "held") || requests.some(entry => entry.released) || !added} onClick={() => held.current?.()}>释放较早响应 A</button>
      <details><summary>请求记录</summary><pre data-preview-requests>{JSON.stringify(requests, null, 2)}</pre></details>
    </header>
    {ready && <iframe title="真实星轨实时预览" src={url.href} />}
  </main>;
}

export function MainPreviewFrameProbe() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const previousFetch = window.fetch;
    const transport = (input, init) => {
      const request = input instanceof Request ? input.url : String(input);
      // Parent and child must be same-origin and explicitly use this fixture.
      try { if (window.parent !== window && window.parent.__mainPreviewTransport) return window.parent.__mainPreviewTransport(request, init); } catch { /* denied below */ }
      return Promise.resolve(json({ error: "Isolated parent missing" }, 403));
    };
    window.fetch = transport;
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => { clearTimeout(timer); if (window.fetch === transport) window.fetch = previousFetch; };
  }, []);
  return ready ? <LivePreviewFrame space={SPACE} assetsEndpoint={ASSETS} /> : null;
}
