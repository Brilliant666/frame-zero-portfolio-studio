import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const runtimeEnv = {};
globalThis.__CLOUDFLARE_TEST_ENV__ = runtimeEnv;
register(new URL("./cloudflare-loader.mjs", import.meta.url));

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("site-content-api-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

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

test("PUT allows a loopback request and persists normalized content", async () => {
  const database = new MemoryD1();
  const response = await requestSiteContent(
    "http://127.0.0.1:3001/api/site-content",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: {
          profile: { brand: "LOCAL SAVE" },
          works: [{
            code: "LEGACY-01",
            title: "LEGACY WORK",
            subtitle: "Compatibility canary",
            image: "/photos/legacy-full.webp",
            preview: "/photos/legacy-card.webp",
            position: "50% 50%",
            previewWidth: 1100,
            previewHeight: 733,
            fullWidth: 2200,
            enabled: true,
          }],
        },
      }),
    },
    database,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.content.profile.brand, "LOCAL SAVE");
  assert.equal(payload.content.works[0].image, "/photos/legacy-full.webp");
  assert.equal(payload.content.works[0].preview, "/photos/legacy-card.webp");
  const persisted = JSON.parse(database.row.content);
  assert.equal(persisted.profile.brand, "LOCAL SAVE");
  assert.equal(persisted.works[0].image, "/photos/legacy-full.webp");
  assert.equal(persisted.works[0].preview, "/photos/legacy-card.webp");
  assert.equal(payload.updatedAt, "2026-07-11 15:00:00");
});

test("PUT rejects an unauthenticated remote request", async () => {
  const database = new MemoryD1();
  const response = await requestSiteContent(
    "https://portfolio.example/api/site-content",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: { profile: { brand: "REMOTE SAVE" } } }),
    },
    database,
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error, "请先登录后再保存后台内容。");
  assert.equal(database.row, null);
  assert.equal(database.prepareCalls.length, 0);
});

test("PUT rejects a request body larger than 256 KB", async () => {
  const database = new MemoryD1();
  const response = await requestSiteContent(
    "http://127.0.0.1:3001/api/site-content",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: { profile: { intro: "x".repeat(256_000) } } }),
    },
    database,
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error, "内容超过 256 KB 限制。");
  assert.equal(database.row, null);
  assert.equal(database.prepareCalls.length, 0);
});

test("PUT returns 400 for invalid JSON", async () => {
  const database = new MemoryD1();
  const response = await requestSiteContent(
    "http://127.0.0.1:3001/api/site-content",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    },
    database,
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(typeof payload.error, "string");
  assert.ok(payload.error.length > 0);
  assert.equal(database.row, null);
  assert.equal(database.prepareCalls.length, 0);
});
