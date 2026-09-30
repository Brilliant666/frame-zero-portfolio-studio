import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const runtimeEnv = {};
globalThis.__CLOUDFLARE_TEST_ENV__ = runtimeEnv;
register(new URL("./cloudflare-loader.mjs", import.meta.url));

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("site-content-api-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const SYNTHETIC_QR_ASSET_ID = "a".repeat(64);

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

class MemoryD1 {
  constructor(row = null, failure = null) {
    this.row = row;
    this.failure = failure;
    this.prepareCalls = [];
  }

  prepare(sql) {
    if (this.failure) throw this.failure;
    this.prepareCalls.push(sql);
    return new MemoryD1Statement(this, sql);
  }
}

class MemoryD1Statement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new MemoryD1Statement(this.database, this.sql, params);
  }

  async run() {
    const normalizedSql = this.sql.trim().toLowerCase();
    if (normalizedSql.startsWith("create table")) {
      return { success: true, meta: { changes: 0 } };
    }

    if (normalizedSql.startsWith("insert into")) {
      const [id, content] = this.params;
      this.database.row = {
        id,
        content,
        updatedAt: "2026-07-11 15:00:00",
      };
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error(`Unexpected D1 run query: ${this.sql}`);
  }

  async raw() {
    if (!this.sql.trim().toLowerCase().startsWith("select")) {
      throw new Error(`Unexpected D1 raw query: ${this.sql}`);
    }

    const row = this.database.row;
    return row ? [[row.id, row.content, row.updatedAt]] : [];
  }
}

async function requestSiteContent(url, init = {}, database) {
  runtimeEnv.DB = database;
  return worker.fetch(
    new Request(url, init),
    {
      DB: database,
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    executionContext,
  );
}

test("GET returns normalized content stored in D1", async () => {
  const storedContent = JSON.stringify({
    activeTemplate: "film-rail",
    profile: { brand: "API TEST" },
  });
  const database = new MemoryD1({
    id: 1,
    content: storedContent,
    updatedAt: "2026-07-11 14:00:00",
  });

  const response = await requestSiteContent(
    "http://127.0.0.1:3001/api/site-content",
    undefined,
    database,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.content.activeTemplate, "film-rail");
  assert.equal(payload.content.profile.brand, "API TEST");
  assert.equal(payload.updatedAt, "2026-07-11 14:00:00");
  assert.equal(database.row.content, storedContent, "GET must not rewrite legacy D1 content");
  assert.equal(
    database.prepareCalls.some((sql) => /^\s*(insert|update)\b/i.test(sql)),
    false,
    "GET must not prepare a legacy data write",
  );
});

test("GET falls back to demo content when D1 throws", async () => {
  const response = await requestSiteContent(
    "http://127.0.0.1:3001/api/site-content",
    undefined,
    new MemoryD1(null, new Error("D1 unavailable")),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.content.profile.brand, "FRAME//ZERO");
  assert.equal(payload.updatedAt, null);
  assert.equal(payload.warning, "D1 unavailable");
});

test("GET normalizes the complete legacy SiteContent shape without rewriting its source", async () => {
  const work = {
    assetId: "asset_demo_01",
    slotIndex: 0,
    locked: true,
    code: "FULL-01",
    title: "FULL WORK",
    subtitle: "Complete compatibility sentinel",
    image: "/photos/full-01.webp",
    preview: "/photos/card-01.webp",
    position: "45% 55%",
    previewWidth: 1200,
    previewHeight: 800,
    fullWidth: 2400,
    enabled: true,
    ignoredWorkField: "drop me",
  };
  const content = {
    activeTemplate: "film-rail",
    profile: {
      brand: "FULL BRAND",
      mark: "FB",
      photographer: "FULL PHOTOGRAPHER",
      role: "FULL ROLE",
      city: "FULL CITY",
      availability: "FULL AVAILABILITY",
      intro: "FULL INTRO",
      ignoredProfileField: "drop me",
    },
    hero: { eyebrow: "FULL EYEBROW", title: "FULL TITLE", services: "FULL SERVICES" },
    trustItems: [{ label: "FULL TRUST", value: "FULL VALUE", ignored: "drop me" }],
    works: [work],
    templateWorks: { "film-rail": [work], unknownTemplate: [work] },
    packages: [{
      number: "99",
      english: "FULL PACKAGE",
      name: "完整套餐",
      description: "完整说明",
      price: "示例价格",
      duration: "FULL DURATION",
      deliverables: ["FULL DELIVERY"],
      enabled: false,
      ignoredPackageField: "drop me",
    }],
    contact: { wechat: "FULL_WECHAT", email: "full@framezero.example", note: "FULL NOTE" },
    social: [{
      label: "FULL SOCIAL",
      handle: "FULL HANDLE",
      qrAssetId: SYNTHETIC_QR_ASSET_ID,
      ignored: "drop me",
    }],
    bookingFields: ["FULL BOOKING FIELD"],
    statement: { eyebrow: "FULL STATEMENT", lineOne: "FULL LINE ONE", lineTwo: "FULL LINE TWO" },
    ignoredRootField: "drop me",
  };

  const storedContent = JSON.stringify(content);
  const database = new MemoryD1({ id: 1, content: storedContent, updatedAt: "2026-07-11 14:00:00" });
  const response = await requestSiteContent("http://127.0.0.1:3001/api/site-content", undefined, database);
  const payload = await response.json();
  const persisted = payload.content;

  assert.equal(response.status, 200);
  assert.equal(database.row.id, 1);
  assert.equal(database.row.content, storedContent);
  assert.equal(database.prepareCalls.some((query) => /^\s*(insert|update)\b/i.test(query)), false);
  assert.deepEqual(Object.keys(persisted).sort(), [
    "activeTemplate",
    "bookingFields",
    "contact",
    "hero",
    "packages",
    "profile",
    "social",
    "statement",
    "templateWorks",
    "trustItems",
    "works",
  ]);
  assert.deepEqual(Object.keys(persisted.profile).sort(), [
    "availability", "brand", "city", "intro", "mark", "photographer", "role",
  ]);
  assert.deepEqual(Object.keys(persisted.packages[0]).sort(), [
    "deliverables", "description", "duration", "enabled", "english", "name", "number", "price",
  ]);
  assert.deepEqual(Object.keys(persisted.works[0]).sort(), [
    "assetId", "code", "enabled", "fullWidth", "image", "locked", "position", "preview",
    "previewHeight", "previewWidth", "slotIndex", "subtitle", "title",
  ]);
  assert.deepEqual(Object.keys(persisted.social[0]).sort(), ["handle", "label", "qrAssetId"]);
  assert.equal(persisted.social[0].qrAssetId, SYNTHETIC_QR_ASSET_ID);
  assert.deepEqual(Object.keys(persisted.templateWorks), ["film-rail"]);
  assert.equal(persisted.profile.brand, "FULL BRAND");
  assert.equal(persisted.works[0].image, "/photos/full-01.webp");
  assert.equal(persisted.works[0].preview, "/photos/card-01.webp");
  assert.equal(payload.updatedAt, "2026-07-11 14:00:00");
});

test("GET normalizes legacy QR IDs without modifying stored source values", async () => {
  const storedContent = JSON.stringify({
    social: [
      { label: "VALID", handle: "@valid", qrAssetId: SYNTHETIC_QR_ASSET_ID.toUpperCase() },
      { label: "SHORT", handle: "@short", qrAssetId: "b".repeat(63) },
      { label: "DATA", handle: "@data", qrAssetId: ["data", "image/png;base64,c3ludGhldGlj"].join(":") },
      { label: "POSIX PATH", handle: "@path", qrAssetId: ["", "private", "not-an-id.png"].join("/") },
      { label: "WINDOWS PATH", handle: "@path", qrAssetId: ["C", "\\private\\not-an-id.png"].join(":") },
    ],
  });
  const database = new MemoryD1({ id: 1, content: storedContent, updatedAt: "2026-07-11 14:00:00" });
  const response = await requestSiteContent("http://127.0.0.1:3001/api/site-content", undefined, database);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.content.social[0].qrAssetId, SYNTHETIC_QR_ASSET_ID);
  for (const entry of payload.content.social.slice(1)) assert.equal("qrAssetId" in entry, false);
  assert.equal(database.row.content, storedContent);
  assert.equal(database.prepareCalls.some((query) => /^\s*(insert|update)\b/i.test(query)), false);
});

const writeAttempts = [
  { name: "loopback URL", url: "http://127.0.0.1:3001/api/site-content" },
  { name: "localhost URL", url: "http://localhost:3001/api/site-content" },
  { name: "IPv6 loopback URL", url: "http://[::1]:3001/api/site-content" },
  { name: "remote URL", url: "https://portfolio.example/api/site-content" },
  { name: "forged Host", headers: { Host: "127.0.0.1:3001" } },
  { name: "forged Forwarded", headers: { Forwarded: "for=127.0.0.1;host=localhost;proto=http" } },
  { name: "forged X-Forwarded headers", headers: { "X-Forwarded-Host": "127.0.0.1", "X-Forwarded-For": "127.0.0.1", "X-Forwarded-Proto": "http" } },
  { name: "forged ChatGPT identity", headers: { "oai-authenticated-user-email": "forged@framezero.example", "oai-authenticated-user-full-name": "Forged", "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8" } },
  { name: "forged local proofs", headers: { "x-frame-zero-preview-proof": "forged-local-development-proof", "x-frame-zero-local-proof": "forged" } },
  { name: "oversized body", body: JSON.stringify({ content: { profile: { intro: "x".repeat(256_000) } } }) },
  { name: "invalid JSON", body: "{not-json" },
];

for (const attempt of writeAttempts) {
  test(`PUT refuses ${attempt.name} before touching D1`, async () => {
    const originalRow = { id: 1, content: JSON.stringify({ profile: { brand: "LEGACY SOURCE" } }), updatedAt: "2026-07-11 14:00:00" };
    const database = new MemoryD1({ ...originalRow });
    const response = await requestSiteContent(
      attempt.url ?? "https://portfolio.example/api/site-content",
      { method: "PUT", headers: { "content-type": "application/json", ...attempt.headers }, body: attempt.body ?? JSON.stringify({ content: { profile: { brand: "FORGED SAVE" } } }) },
      database,
    );
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.json();
    assert.deepEqual(payload, { code: "LEGACY_WRITE_DISABLED", error: "旧版全局内容写入已停用，请使用本站后台保存。" });
    assert.deepEqual(database.row, originalRow);
    assert.deepEqual(database.prepareCalls, [], "Refusal must happen before even CREATE TABLE or a database read");
  });
}
