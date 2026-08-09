import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

const runtimeEnv = {};
globalThis.__CLOUDFLARE_TEST_ENV__ = runtimeEnv;
register(new URL("./cloudflare-loader.mjs", import.meta.url));

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
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
    if (this.sql.trim().toLowerCase().startsWith("create table")) {
      return { success: true, meta: { changes: 0 } };
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

function persistedContent(profile = {}) {
  return {
    activeTemplate: "cinematic-light",
    profile: {
      brand: "SAVED BRAND",
      mark: "SB",
      photographer: "SAVED PHOTOGRAPHER",
      role: "SAVED ROLE",
      city: "SAVED CITY",
      availability: "SAVED AVAILABILITY",
      intro: "SAVED INTRO",
      ...profile,
    },
    hero: {
      eyebrow: "SAVED EYEBROW",
      title: "SAVED HERO",
      services: "SAVED SERVICES",
    },
    trustItems: [
      { label: "SAVED TRUST ONE", value: "SAVED VALUE ONE" },
      { label: "SAVED TRUST TWO", value: "SAVED VALUE TWO" },
    ],
    works: [],
    templateWorks: {},
    packages: [],
    contact: {
      wechat: "SAVED_WECHAT",
      email: "saved@portfolio.example",
      note: "SAVED NOTE",
    },
    social: [],
    bookingFields: [],
    statement: {
      eyebrow: "SAVED STATEMENT",
      lineOne: "SAVED LINE ONE",
      lineTwo: "SAVED LINE TWO",
    },
  };
}

function metaContent(html, attribute, value) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = (html.match(/<meta\b[^>]*>/gi) ?? [])
    .find((candidate) => new RegExp(`${attribute}="${escapedValue}"`, "i").test(candidate));

  return tag?.match(/\bcontent="([^"]*)"/i)?.[1] ?? null;
}

async function renderWithDatabase(database) {
  runtimeEnv.DB = database;

  return worker.fetch(
    new Request("http://127.0.0.1:3001/", {
      headers: { accept: "text/html", host: "127.0.0.1:3001" },
    }),
    {
      DB: database,
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    executionContext,
  );
}

async function render(content) {
  return renderWithDatabase(new MemoryD1({
    id: 1,
    content: JSON.stringify(content),
    updatedAt: "2026-08-09 12:00:00",
  }));
}

test("server-renders persisted content and metadata without leaking demo identity", async () => {
  const response = await render(persistedContent());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const title = "SAVED BRAND｜SAVED CITY SAVED ROLE";
  const description = "SAVED SERVICES。SAVED VALUE TWO。SAVED INTRO。";

  assert.match(html, new RegExp(`<title>${title}</title>`));
  assert.equal(metaContent(html, "name", "description"), description);
  assert.equal(metaContent(html, "property", "og:title"), title);
  assert.equal(metaContent(html, "property", "og:site_name"), "SAVED BRAND");
  assert.equal(metaContent(html, "property", "og:description"), description);
  assert.equal(metaContent(html, "name", "twitter:title"), title);
  assert.equal(metaContent(html, "name", "twitter:description"), description);
  assert.match(html, /id="archive"/);
  assert.match(html, /id="services"/);
  assert.match(html, /id="booking"/);
  assert.match(html, /SAVED BRAND/);
  assert.match(html, /SAVED_WECHAT/);
  assert.doesNotMatch(html, /FRAME\/\/ZERO|F\/\/0|FRAMEZERO_DEMO|booking@framezero\.example|@FRAMEZERO_/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("public title falls back to photographer instead of the compact mark", async () => {
  const response = await render(persistedContent({
    brand: "   ",
    mark: "SHORT",
    photographer: "SAVED PHOTOGRAPHER",
  }));
  const html = await response.text();
  const title = "SAVED PHOTOGRAPHER｜SAVED CITY SAVED ROLE";

  assert.match(html, new RegExp(`<title>${title}</title>`));
  assert.equal(metaContent(html, "property", "og:site_name"), "SAVED PHOTOGRAPHER");
  assert.notEqual(metaContent(html, "property", "og:site_name"), "SHORT");
});

test("public title uses a neutral fallback when brand and photographer are empty", async () => {
  const response = await render(persistedContent({
    brand: "",
    mark: "SHORT",
    photographer: " ",
  }));
  const html = await response.text();
  const title = "摄影作品集｜SAVED CITY SAVED ROLE";

  assert.match(html, new RegExp(`<title>${title}</title>`));
  assert.equal(metaContent(html, "property", "og:site_name"), "摄影作品集");
});

test("public title uses the editable role and omits blank context without stray separators", async () => {
  const roleOnlyHtml = await (await render(persistedContent({
    city: " ",
    role: "CUSTOM ROLE",
  }))).text();
  assert.match(roleOnlyHtml, /<title>SAVED BRAND｜CUSTOM ROLE<\/title>/);
  assert.equal(metaContent(roleOnlyHtml, "property", "og:title"), "SAVED BRAND｜CUSTOM ROLE");

  const cityOnlyHtml = await (await render(persistedContent({
    city: "CUSTOM CITY",
    role: "  ",
  }))).text();
  assert.match(cityOnlyHtml, /<title>SAVED BRAND｜CUSTOM CITY<\/title>/);
  assert.equal(metaContent(cityOnlyHtml, "name", "twitter:title"), "SAVED BRAND｜CUSTOM CITY");

  const noContextHtml = await (await render(persistedContent({
    city: "",
    role: " ",
  }))).text();
  assert.match(noContextHtml, /<title>SAVED BRAND<\/title>/);
  assert.doesNotMatch(noContextHtml, /SAVED BRAND｜|Cosplay 摄影师/);
});

test("public SSR preserves the legacy demo fallback when D1 is unavailable", async () => {
  const response = await renderWithDatabase(new MemoryD1(null, new Error("D1 unavailable")));
  const html = await response.text();
  const fallbackTitle = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";

  assert.equal(response.status, 200);
  assert.match(fallbackTitle, /^FRAME\/\/ZERO(?:｜.+)?$/);
  assert.equal(metaContent(html, "property", "og:title"), fallbackTitle);
  assert.equal(metaContent(html, "name", "twitter:title"), fallbackTitle);
  assert.doesNotMatch(fallbackTitle, /undefined|null|｜\s*$/);
  assert.match(html, /FRAMEZERO_DEMO/);
  assert.doesNotMatch(html, /Internal Server Error|Application error/i);
});

test("keeps editable content and eleven lazy template choices in one configuration", async () => {
  const [config, catalog, renderer, page, homeClient, layout, metadata, contentRead, photoFallback, adminShell, api, schema, hosting] = await Promise.all([
    readFile(new URL("../app/site-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/template-renderer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/home-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/site-metadata.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/site-content-read.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/photo-fallback-controller.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/site-content/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(config, /templateCatalog/);
  for (const templateId of [
    "cinematic-light",
    "neon-hud",
    "film-rail",
    "manga-panels",
    "prism-liquid",
    "orbital-portal",
    "archive-os",
    "editorial-duet",
    "polaroid-field",
    "character-select",
    "museum-depth",
  ]) {
    assert.match(catalog, new RegExp(`id: "${templateId}"`));
    assert.match(renderer, new RegExp(`"${templateId}": \\(\\) => import`));
  }
  assert.match(config, /deliverables/);
  assert.match(config, /bookingFields/);
  assert.match(config, /templateWorks/);
  assert.match(renderer, /lazy\(loader\)/);
  assert.doesNotMatch(catalog, /scaffold/);
  assert.match(page, /generateMetadata/);
  assert.match(page, /readSiteContent\(\)/);
  assert.match(page, /<HomeClient initialContent=\{content\}/);
  assert.match(homeClient, /<TemplateRenderer/);
  assert.match(homeClient, /previewTemplate \?\? content\.activeTemplate/);
  assert.doesNotMatch(homeClient, /fetch\("\/api\/site-content"/);
  assert.match(homeClient, /const selected = content\.templateWorks\[templateId\]/);
  assert.match(homeClient, /buildPhotoSlots\(/);
  assert.match(adminShell, /data-admin-title="true"/);
  assert.match(adminShell, /<strong>ADMIN<\/strong>/);
  assert.doesNotMatch(adminShell, /FRAME\/\/ZERO/);
  assert.match(adminShell, /预览当前主页/);
  assert.match(adminShell, /ADMIN_SECTIONS\.map/);
  assert.match(api, /onConflictDoUpdate/);
  assert.match(api, /readSiteContent/);
  assert.match(schema, /site_settings/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(layout, /generateMetadata/);
  assert.match(layout, /colorScheme: "light"/);
  assert.match(layout, /icons: \{ icon: "\/favicon\.svg" \}/);
  assert.doesNotMatch(layout, /PhotoFallbackController/);
  assert.match(metadata, /content\.profile\.brand\.trim\(\)/);
  assert.match(metadata, /content\.profile\.photographer\.trim\(\)/);
  assert.match(metadata, /content\.profile\.role\.trim\(\)/);
  assert.match(metadata, /\[city, role\]\.filter\(Boolean\)/);
  assert.match(metadata, /摄影作品集/);
  assert.doesNotMatch(metadata, /Cosplay 摄影师/);
  assert.match(contentRead, /SITE_SETTINGS_ID = 1/);
  assert.match(contentRead, /normalizeSiteContent/);
  assert.match(renderer, /PhotoFallbackController/);
  assert.ok(
    renderer.indexOf("<Template key=") < renderer.indexOf("<PhotoFallbackController"),
    "the missing-photo controller must mount inside Suspense after the hydrated template",
  );
  assert.doesNotMatch(layout, /\/og\.png/);
  assert.match(photoFallback, /IMAGE PENDING/);
  assert.match(photoFallback, /addEventListener\("error"/);
});

test("keeps every template on a fixed photo-slot contract with missing-image placeholders", async () => {
  const templateIds = [
    "cinematic-light",
    "neon-hud",
    "film-rail",
    "manga-panels",
    "prism-liquid",
    "orbital-portal",
    "archive-os",
    "editorial-duet",
    "polaroid-field",
    "character-select",
    "museum-depth",
  ];

  const [catalog, templateEditor, sharedSlots, layoutWorkspace, libraryModel, ...templateSources] = await Promise.all([
    readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/template/template-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/shared/photo-slots.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/layout/layout-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/photo-library.ts", import.meta.url), "utf8"),
    ...templateIds.map((id) => readFile(new URL(`../app/templates/${id}/template.tsx`, import.meta.url), "utf8")),
  ]);

  assert.equal(catalog.match(/photoSlots: \d+/g)?.length, templateIds.length);
  assert.equal(catalog.match(/photoRatios: "/g)?.length, templateIds.length);
  assert.equal(catalog.match(/slotRatios: \[/g)?.length, templateIds.length);
  assert.match(templateEditor, /photoSlots/);
  assert.match(templateEditor, /photoRatios/);
  assert.match(sharedSlots, /export function buildPhotoSlots/);
  assert.match(sharedSlots, /export function PhotoPlaceholder/);
  assert.match(sharedSlots, /Math\.abs\(Math\.log\(actualRatio \/ targetRatio\)\)/);
  assert.match(layoutWorkspace, /一键智能排版/);
  assert.match(layoutWorkspace, /重新读取/);
  assert.match(libraryModel, /parsePhotoLibraryManifest/);
  assert.match(libraryModel, /autoComposeTemplateWorks/);

  templateSources.forEach((source, index) => {
    assert.match(source, /buildPhotoSlots\(/, `${templateIds[index]} must use fixed photo slots`);
    assert.match(source, /PhotoPlaceholder/, `${templateIds[index]} must preserve layout when a photo is missing`);
    assert.match(source, /data-photo-ratio/, `${templateIds[index]} must expose its ratio contract for QA`);
  });
});
