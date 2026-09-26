import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

async function modules(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "preview-storage-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const name of ["document", "storage"]) {
    const src = await fs.readFile(new URL(`../app/preview-workspace/${name}.ts`, import.meta.url), "utf8");
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace('"./document"', '"./document.mjs"');
    await fs.writeFile(path.join(dir, `${name}.mjs`), js);
  }
  return { dir, ...await import(pathToFileURL(path.join(dir, "document.mjs"))), ...await import(pathToFileURL(path.join(dir, "storage.mjs"))) };
}
function adapter(sqlite, beforeWrite = () => {}) {
  return { prepare(sql) {
    let values = [];
    return { bind(...args) { values = args; return this; }, async first() { if (/^(INSERT|UPDATE)/.test(sql)) beforeWrite(); return sqlite.prepare(sql).get(...values) ?? null; }, async run() { return sqlite.prepare(sql).run(...values); } };
  } };
}
function collection() { return { id: "11111111-1111-4111-8111-111111111111", name: "测试图集", description: "", visible: true, coverAssetId: "independent-cover", coverFit: "natural", coverFocusX: 50, coverFocusY: 50, assetIds: Array.from({ length: 40 }, (_, i) => `photo-${i}`), focusAssetId: "photo-3" }; }

test("strict preview document keeps 40 members, rejects unknown/invalid/oversized relationships", async (t) => {
  const m = await modules(t); const d = m.createEmptyPreviewDocument(); d.collections = [collection()];
  d.social = [{ label: "平台", handle: "https://example.test/profile" }];
  assert.deepEqual(m.parsePreviewDocument(d), d);
  for (const change of [x => x.schemaVersion = 2, x => x.recordId = 1, x => x.collections[0].focusAssetId = "outside", x => x.collections[0].assetIds.push("photo-1"), x => x.collections[0].coverAssetId = ["Z:", "synthetic.jpg"].join("/"), x => x.collections[0].name = "x".repeat(121), x => x.collections[0].assetIds = Array(501).fill("x"), x => x.collections[0].id = "name-based"]) {
    const copy = structuredClone(d); change(copy); assert.throws(() => m.parsePreviewDocument(copy));
  }
});

test("real SQLite independent rows survive close/reopen and bidirectional writes", async (t) => {
  const m = await modules(t); const file = path.join(m.dir, "isolated.sqlite"); let sqlite = new DatabaseSync(file);
  assert.deepEqual(await m.readPreviewDocument(adapter(sqlite)), { content: null, revision: 0, updatedAt: null });
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='site_settings'").get().n, 0);
  sqlite.exec("CREATE TABLE site_settings(id INTEGER PRIMARY KEY,content TEXT NOT NULL,updated_at TEXT NOT NULL);INSERT INTO site_settings VALUES(1,'legacy-A','old-time')");
  const d = m.createEmptyPreviewDocument(); d.collections = [collection()];
  const saved = await m.savePreviewDocument(adapter(sqlite), d, 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM site_settings WHERE id=1").get() }, { id: 1, content: "legacy-A", updated_at: "old-time" });
  sqlite.prepare("UPDATE site_settings SET content=?,updated_at=? WHERE id=1").run("legacy-A2", "new-time");
  assert.deepEqual(await m.readPreviewDocument(adapter(sqlite)), saved);
  sqlite.close(); sqlite = new DatabaseSync(file);
  assert.deepEqual(await m.readPreviewDocument(adapter(sqlite)), saved);
  const modified = structuredClone(d); modified.collections[0].name = "第二版";
  assert.equal((await m.savePreviewDocument(adapter(sqlite), modified, 1)).revision, 2);
  await assert.rejects(m.savePreviewDocument(adapter(sqlite), d, 1), e => e.code === "conflict");
  assert.equal((await m.readPreviewDocument(adapter(sqlite))).content.collections[0].name, "第二版");
  const raw = sqlite.prepare("SELECT content FROM site_settings WHERE id=?").get(m.PREVIEW_SETTINGS_ID).content;
  sqlite.prepare("UPDATE site_settings SET content=? WHERE id=?").run(JSON.stringify(JSON.parse(raw), null, 2), m.PREVIEW_SETTINGS_ID);
  assert.equal((await m.savePreviewDocument(adapter(sqlite), modified, 2)).revision, 3);
  sqlite.close();
});

test("API enforces provenance, origin, JSON, bounded body, fixed target and conflict contract", async (t) => {
  const m = await modules(t); const sqlite = new DatabaseSync(":memory:"); t.after(() => sqlite.close());
  globalThis.__previewTestDb = adapter(sqlite); t.after(() => delete globalThis.__previewTestDb);
  await fs.writeFile(path.join(m.dir, "server.mjs"), `export const PREVIEW_ORIGIN_HEADER='x-frame-zero-preview-origin';export const previewDatabase=()=>globalThis.__previewTestDb;export const requirePreviewWorkspace=async(r)=>r.headers.get('x-test-provenance')==='trusted';export const validateNewPreviewAssetReferences=async()=>{};`);
  const source = await fs.readFile(new URL("../app/api/preview/site-content/route.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll("../../../preview-workspace/", "./").replace(/from "\.\/(document|server|storage)"/g, 'from "./$1.mjs"');
  await fs.writeFile(path.join(m.dir, "route.mjs"), js);
  const api = await import(pathToFileURL(path.join(m.dir, "route.mjs")));
  const origin = "http://127.0.0.1:3001";
  const trusted = { "x-test-provenance": "trusted", "x-frame-zero-preview-origin": origin, origin, "content-type": "application/json" };
  const req = (body, headers = trusted) => new Request(`${origin}/api/preview/site-content`, { method: "PUT", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  const payload = { content: m.createEmptyPreviewDocument(), expectedRevision: 0 };
  assert.equal((await api.GET(new Request(origin))).status, 404);
  assert.equal((await api.PUT(req(payload, {}))).status, 404);
  assert.equal((await api.PUT(req(payload, { ...trusted, origin: "https://foreign.test" }))).status, 403);
  assert.equal((await api.PUT(req(payload, { ...trusted, "content-type": "text/plain" }))).status, 415);
  assert.equal((await api.PUT(req("x".repeat(m.PREVIEW_LIMITS.bytes + 1)))).status, 413);
  assert.equal((await api.PUT(req("{"))).status, 400);
  assert.equal((await api.PUT(req({ ...payload, id: 1 }))).status, 400);
  assert.equal((await api.PUT(req({ ...payload, content: { ...payload.content, schemaVersion: 9 } }))).status, 400);
  const saved = await api.PUT(req(payload)); assert.equal(saved.status, 200); assert.equal((await saved.json()).revision, 1);
  assert.equal((await api.PUT(req(payload))).status, 409);
  const read = await api.GET(new Request(origin, { headers: trusted })); assert.match(read.headers.get("cache-control"), /no-store/); assert.equal((await read.json()).configured, true);
  assert.equal(sqlite.prepare("SELECT count(*) as n FROM site_settings WHERE id=1").get().n, 0);
});

test("atomic CAS defeats mutation between read and write; corruption and failures never overwrite", async (t) => {
  const m = await modules(t); const sqlite = new DatabaseSync(":memory:"); t.after(() => sqlite.close());
  const d = m.createEmptyPreviewDocument(); await m.savePreviewDocument(adapter(sqlite), d, 0);
  let changed = false;
  const racing = adapter(sqlite, () => { if (!changed) { changed = true; sqlite.prepare("UPDATE site_settings SET content=? WHERE id=?").run(JSON.stringify({ content: { ...d, hero: { ...d.hero, title: "winner" } }, revision: 2 }), m.PREVIEW_SETTINGS_ID); } });
  await assert.rejects(m.savePreviewDocument(racing, d, 1), e => e.code === "conflict");
  assert.equal((await m.readPreviewDocument(adapter(sqlite))).content.hero.title, "winner");
  sqlite.prepare("UPDATE site_settings SET content='broken' WHERE id=?").run(m.PREVIEW_SETTINGS_ID);
  await assert.rejects(m.readPreviewDocument(adapter(sqlite)), e => e.code === "corrupt");
  await assert.rejects(m.savePreviewDocument(adapter(sqlite), d, 0), e => e.code === "corrupt");
  assert.equal(sqlite.prepare("SELECT content FROM site_settings WHERE id=?").get(m.PREVIEW_SETTINGS_ID).content, "broken");
  await assert.rejects(m.readPreviewDocument({ prepare() { throw new Error("private path SQL"); } }), e => e.code === "unavailable" && !e.message.includes("SQL"));
});
