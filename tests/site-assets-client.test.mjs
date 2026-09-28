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
