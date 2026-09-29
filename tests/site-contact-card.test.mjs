import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const assetId = "12345678-1234-4234-8234-123456789abc";
const nextAssetId = "12345678-1234-4234-8234-123456789def";

function modules(adminContext) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = name => {
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.endsWith("/admin-provider")) return { useAdmin: () => adminContext };
      if (!name.startsWith(".")) return require(name);
      const base = path.resolve(path.dirname(filename), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      assert.ok(resolved, `${name} from ${filename}`);
      return load(resolved);
    };
    vm.runInNewContext(compiled, { module: loadedModule, exports: loadedModule.exports, require: localRequire, URL, TextEncoder, structuredClone }, { filename });
    return loadedModule.exports;
  }
  return relative => load(path.resolve(relative));
}

test("contact card replacement and removal retain independent text, links, original entries and the other space", () => {
  const { setContactCardReference } = modules()("app/site-editor/contact-card-state.ts");
  for (const handle of ["", "photographer-account", "https://example.com/profile"]) {
    const basic = [{ label: "Contact", handle, qrAssetId: assetId }];
    const premium = [{ label: "Other space", handle, qrAssetId: assetId }];
    Object.freeze(basic[0]); Object.freeze(basic); Object.freeze(premium[0]); Object.freeze(premium);
    const replaced = setContactCardReference(basic, basic[0], nextAssetId);
    assert.equal(replaced[0].handle, handle);
    assert.equal(replaced[0].qrAssetId, nextAssetId);
    assert.equal(basic[0].qrAssetId, assetId);
    assert.equal(premium[0].qrAssetId, assetId);
    const cleared = setContactCardReference(replaced, replaced[0], undefined);
    assert.equal(cleared[0].handle, handle);
    assert.equal(Object.hasOwn(cleared[0], "qrAssetId"), false);
    assert.equal(replaced[0].qrAssetId, nextAssetId);
  }
});

test("contact card selection follows the exact entry after reorder and never attaches to removed, edited or same-value replacement entries", () => {
  const { setContactCardReference } = modules()("app/site-editor/contact-card-state.ts");
  const selected = { label: "Same", handle: "account", qrAssetId: assetId };
  const other = { ...selected };
  const reordered = [other, selected];
  const result = setContactCardReference(reordered, selected, nextAssetId);
  assert.equal(result[0], other);
  assert.equal(result[0].qrAssetId, assetId);
  assert.equal(result[1].qrAssetId, nextAssetId);
  for (const latest of [[other], [{ ...selected }], [{ ...selected, handle: "edited" }], [selected, selected]]) {
    assert.equal(setContactCardReference(latest, selected, nextAssetId), latest);
  }
  for (const invalid of ["", "https://external.example/card.png", "../../private", "0".repeat(64)]) {
    assert.equal(setContactCardReference(reordered, selected, invalid), reordered);
  }
});

test("Site contact editor renders empty, text-only, URL-only, card-only and combined entries without a mandatory image", () => {
  for (const entry of [
    { label: "", handle: "" },
    { label: "Account", handle: "photographer" },
    { label: "Website", handle: "https://example.com/profile" },
    { label: "Card", handle: "", qrAssetId: assetId },
    { label: "Combined", handle: "https://example.com/profile", qrAssetId: assetId },
  ]) {
    let updates = 0;
    const context = {
      busy: false, loadState: "ready", localPhotoImportState: "hosted", localPhotoImportOrigin: null,
      siteScope: { assetsEndpoint: "/api/sites/owner-a/assets" },
      content: { contact: { wechat: "", email: "", note: "" }, bookingFields: [], social: [entry] },
      setContent: () => { updates++; },
    };
    const ContactEditor = modules(context)("app/admin/contact/contact-editor.tsx").default;
    const html = renderToStaticMarkup(createElement(ContactEditor));
    assert.match(html, /文字账号和网址可独立使用/);
    assert.doesNotMatch(html, /\/api\/platform-qr\/|必须上传|全局平台卡/);
    if (entry.qrAssetId) {
      assert.match(html, new RegExp(`/api/sites/owner-a/assets/${assetId}/full`));
      assert.match(html, /替换联系卡/);
      assert.match(html, /移除卡片引用/);
    } else {
      assert.doesNotMatch(html, /<img|platformQrPreview/);
      assert.match(html, /选择或上传联系卡/);
    }
    assert.equal(updates, 0, "Rendering a card must not mutate or save any draft");
  }
});

test("Site contact card does not turn a malformed existing reference into a global or external URL", () => {
  const Card = modules()("app/site-editor/contact-card.tsx").default;
  const html = renderToStaticMarkup(createElement(Card, {
    assetsEndpoint: "/api/sites/owner-a/assets", assetId: "https://example.com/card.png", targetKey: {}, onChange: () => assert.fail("render mutated draft"),
  }));
  assert.doesNotMatch(html, /<img|https:\/\/example.com/);
  assert.match(html, /移除卡片引用/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<details[^>]*open=""/);
  assert.ok(html.indexOf('role="alert"') < html.indexOf("<details"), "Invalid-reference warning remains outside disclosure and recovery tools open");
});

test("Site library uses registration timestamps, stable same-time IDs and unknown times last without changing input order", () => {
  const { compareSiteAssetTimes, siteAssetTimeLabel } = modules()("app/site-editor/asset-metadata.ts");
  const assets = Object.freeze([
    Object.freeze({ id: "z" }), Object.freeze({ id: "b", createdAt: "2026-09-28T00:00:00.000Z" }),
    Object.freeze({ id: "c", createdAt: "2026-09-27T00:00:00.000Z" }), Object.freeze({ id: "a", createdAt: "2026-09-28T00:00:00.000Z" }), Object.freeze({ id: "x", createdAt: null }),
  ]);
  const sorted = order => [...assets].sort((a, b) => compareSiteAssetTimes(a, b, order)).map(asset => asset.id);
  assert.deepEqual(sorted("recent"), ["a", "b", "c", "x", "z"]);
  assert.deepEqual(sorted("oldest"), ["c", "a", "b", "x", "z"]);
  assert.deepEqual(sorted("asset-id"), ["a", "b", "c", "x", "z"]);
  assert.deepEqual(assets.map(asset => asset.id), ["z", "b", "c", "a", "x"]);
  assert.equal(siteAssetTimeLabel(null), "加入本站时间未知");
  assert.match(siteAssetTimeLabel("2026-09-28T00:00:00.000Z"), /^加入本站：/);
});
