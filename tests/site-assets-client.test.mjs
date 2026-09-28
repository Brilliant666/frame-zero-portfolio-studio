import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(file, dependencies = {}) {
  let source = ts.transpileModule(await fs.readFile(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  for (const [name, value] of Object.entries(dependencies)) source = source.replace(`from "${name}"`, `from "${value}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const policy = await load("app/photo-ratio-policy.ts");
const library = await load("app/photo-library.ts", { "./photo-ratio-policy": policy });
const { parsePhotoLibraryManifest } = await import(library);
const { parseSiteAssets, hydrateSiteWorks, hydrateConfirmedSiteWorks } = await import(await load("app/site-editor/assets-client.ts", { "../photo-library": library }));
const { reconcileAdminSave, hasAdminChanges } = await import(await load("app/admin/admin-state.ts"));
const { entryPhotoSource } = await import(await load("app/templates/polaroid-field/entry-photos.ts"));
const endpoint = "/api/sites/owner-a/assets", id = "12345678-1234-4234-8234-123456789abc";
const asset = () => ({ id, aspectRatio: 1.5, orientation: "landscape", variants: Object.fromEntries(["thumbnail", "card", "full"].map((kind, index) => [kind, { src: `${endpoint}/${id}/${kind}`, width: 300 * (index + 1), height: 200 * (index + 1), bytes: 100 }])) });
test("Site DTO accepts only exact endpoint/id/variant paths; legacy parser stays strict", () => {
  const value = { version: 1, assets: [asset()] };
  assert.deepEqual(parseSiteAssets(value, endpoint), value);
  assert.equal(parsePhotoLibraryManifest(value), null);
  for (const src of ["https://example.com/x.webp", "/api/sites/owner-b/assets/" + id + "/card", "/photos/library/private.webp", `${endpoint}/${id}/card?x=1`, `${endpoint}/../card`, `${endpoint}/${id}/original`]) {
    const invalid = structuredClone(value); invalid.assets[0].variants.card.src = src;
    assert.equal(parseSiteAssets(invalid, endpoint), null, src);
  }
  assert.equal(parseSiteAssets({ version: 1, assets: [asset(), asset()] }, endpoint), null);
  const malformed = asset(); malformed.variants.card.width = -1;
  assert.equal(parseSiteAssets({ version: 1, assets: [malformed] }, endpoint), null);
});
test("basic hydration preserves presentation and only resolves owned known resource IDs", () => {
  const content = { works: [{ assetId: id, title: "custom", position: "20% 80%", image: "untrusted", preview: "untrusted", slotIndex: 2 }], templateWorks: { "cinematic-light": [{ assetId: "missing", image: "https://example.com", preview: "file:///private" }] } };
  const result = hydrateSiteWorks(content, [asset()]);
  assert.equal(result.works[0].title, "custom"); assert.equal(result.works[0].position, "20% 80%");
  assert.equal(result.works[0].image, `${endpoint}/${id}/full`);
  assert.equal(result.templateWorks["cinematic-light"][0].image, "");
  assert.equal(content.works[0].image, "untrusted");
});

test("Site metadata preserves only canonical admission time and explicit truncation", () => {
  const value = { version: 1, truncated: false, assets: [{ ...asset(), createdAt: "2026-09-28T08:10:12.123Z", storageKey: "/private/original.jpg", filename: "private.jpg" }] };
  const parsed = parseSiteAssets(value, endpoint);
  assert.equal(parsed.truncated, false);
  assert.equal(parsed.assets[0].createdAt, value.assets[0].createdAt);
  assert.equal("storageKey" in parsed.assets[0], false);
  assert.equal("filename" in parsed.assets[0], false);
  assert.equal(parseSiteAssets({ ...value, truncated: true }, endpoint).truncated, true);
  for (const createdAt of [null, undefined, 0, "", "2026-09-28", "2026-02-30T08:10:12.123Z", "2026-09-28T08:10:12Z", "/private/path", "2026-09-28T08:10:12.123+00:00"]) {
    assert.equal(parseSiteAssets({ ...value, assets: [{ ...asset(), createdAt }] }, endpoint), null, String(createdAt));
  }
  for (const truncated of [null, undefined, 0, "false", {}]) assert.equal(parseSiteAssets({ ...value, truncated }, endpoint), null);
  assert.deepEqual(parseSiteAssets({ version: 1, assets: [asset()] }, endpoint), { version: 1, assets: [asset()] }, "Older responses remain valid without inventing metadata");
});

const authStubUrl = `data:text/javascript;base64,${Buffer.from('let auth; export function setAuth(value) { auth = value; } export async function authorizeEditor() { return auth; }').toString("base64")}`;
const { setAuth } = await import(authStubUrl);
const httpStubUrl = `data:text/javascript;base64,${Buffer.from('export function accountJson(body, status = 200) { return Response.json(body, { status }); }').toString("base64")}`;
const { handleAssetsRequest } = await import(await load("app/site-editor/assets-server.ts", {
  "./server": authStubUrl,
  "../../db/accounts/http.mjs": httpStubUrl,
  "../../db/accounts/assets.mjs": new URL("../db/accounts/assets.mjs", import.meta.url).href,
}));

test("Site list detects the 10001st row without returning it and scopes admission order to the authorized Site", async () => {
  const row = { id, width: 900, height: 600, created_at: new Date("2026-09-28T08:10:12.123Z"), variants: Object.fromEntries(["thumbnail", "card", "full"].map(kind => [kind, { width: 900, height: 600, bytes: 100, key: "/private/path" }])) };
  for (const count of [0, 1, 10000, 10001]) {
    const queries = [];
    setAuth({ account: { site: { id: "authorized-site" } }, runtime: { pool: { async query(sql, params) { queries.push({ sql, params }); return { rows: Array.from({ length: count }, () => row) }; } } } });
    const response = await handleAssetsRequest(new Request(`http://localhost${endpoint}`), "owner-a");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.assets.length, Math.min(count, 10000));
    assert.equal(body.truncated, count > 10000);
    assert.deepEqual(queries[0].params, ["authorized-site"]);
    assert.match(queries[0].sql, /WHERE site_id=\$1 ORDER BY created_at,id LIMIT 10001$/);
    if (count) assert.equal(body.assets[0].createdAt, "2026-09-28T08:10:12.123Z");
    assert.equal(JSON.stringify(body).includes("/private/path"), false);
  }
  setAuth({ denied: 403 });
  assert.equal((await handleAssetsRequest(new Request(`http://localhost${endpoint}`), "owner-a")).status, 403);
});
test("Site entry and enlarged photos stay on authorized variant routes", () => {
  assert.equal(entryPhotoSource(asset(), 600), `${endpoint}/${id}/card`);
  assert.equal(entryPhotoSource(asset(), 2200), `${endpoint}/${id}/full`);
  const legacy = asset(); for (const [kind, variant] of Object.entries(legacy.variants)) variant.src = `/photos/library/${id}-${kind}.webp`;
  assert.match(entryPhotoSource(legacy), /^\/__local-preview-photo\?/);
});

test("confirmed save hydration is network-independent and preserves save reconciliation", (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(null, { status: 503 }); });
  const persisted = { works: [{ assetId: id, title: "saved", image: "", preview: "", position: "20% 80%" }], templateWorks: {} };
  const submitted = hydrateConfirmedSiteWorks(persisted, endpoint);
  const acknowledged = hydrateConfirmedSiteWorks(structuredClone(persisted), endpoint);
  const noNewEdits = reconcileAdminSave(submitted, structuredClone(submitted), acknowledged);
  assert.equal(hasAdminChanges(noNewEdits.draft, noNewEdits.persisted), false);
  assert.equal(noNewEdits.changedWhileSaving, false);
  const edited = structuredClone(submitted); edited.works[0].title = "edited during save";
  const withEdits = reconcileAdminSave(submitted, edited, acknowledged);
  assert.equal(withEdits.draft.works[0].title, "edited during save");
  assert.equal(withEdits.persisted.works[0].title, "saved");
  assert.equal(hasAdminChanges(withEdits.draft, withEdits.persisted), true);
  assert.equal(requests, 0, "An unavailable asset list cannot fail an acknowledged save");
  assert.throws(() => hydrateConfirmedSiteWorks(persisted, "https://example.com/assets"));
});
