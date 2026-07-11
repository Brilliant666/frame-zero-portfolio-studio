import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("./cloudflare-loader.mjs", import.meta.url));

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://127.0.0.1:3001/", {
      headers: { accept: "text/html", host: "127.0.0.1:3001" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished photography portfolio", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>FRAME\/\/ZERO｜上海 · 杭州可约 Cosplay 摄影师<\/title>/);
  assert.match(html, /id="archive"/);
  assert.match(html, /id="services"/);
  assert.match(html, /id="booking"/);
  assert.match(html, /漫展场照/);
  assert.match(html, /¥399 起/);
  assert.match(html, /FRAMEZERO_DEMO/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("keeps editable content and eleven lazy template choices in one configuration", async () => {
  const [config, catalog, renderer, page, layout, photoFallback, admin, api, schema, hosting] = await Promise.all([
    readFile(new URL("../app/site-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/template-renderer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/photo-fallback-controller.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-editor.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /<TemplateRenderer/);
  assert.match(page, /previewTemplate \?\? content\.activeTemplate/);
  assert.match(page, /fetch\("\/api\/site-content"/);
  assert.match(page, /const selected = content\.templateWorks\[templateId\]/);
  assert.match(page, /buildPhotoSlots\(/);
  assert.match(admin, /摄影主页后台/);
  assert.match(admin, /保存全部修改/);
  assert.match(admin, /moveWork/);
  assert.match(api, /onConflictDoUpdate/);
  assert.match(schema, /site_settings/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /colorScheme: "light"/);
  assert.match(layout, /PhotoFallbackController/);
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

  const [catalog, admin, sharedSlots, libraryEditor, libraryModel, ...templateSources] = await Promise.all([
    readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/shared/photo-slots.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/photo-library-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/photo-library.ts", import.meta.url), "utf8"),
    ...templateIds.map((id) => readFile(new URL(`../app/templates/${id}/template.tsx`, import.meta.url), "utf8")),
  ]);

  assert.equal(catalog.match(/photoSlots: \d+/g)?.length, templateIds.length);
  assert.equal(catalog.match(/photoRatios: "/g)?.length, templateIds.length);
  assert.equal(catalog.match(/slotRatios: \[/g)?.length, templateIds.length);
  assert.match(admin, /template-photo-plan/);
  assert.match(admin, /PhotoLibraryEditor/);
  assert.match(sharedSlots, /export function buildPhotoSlots/);
  assert.match(sharedSlots, /export function PhotoPlaceholder/);
  assert.match(sharedSlots, /Math\.abs\(Math\.log\(actualRatio \/ targetRatio\)\)/);
  assert.match(libraryEditor, /一键智能排版/);
  assert.match(libraryEditor, /重新读取素材库/);
  assert.match(libraryModel, /parsePhotoLibraryManifest/);
  assert.match(libraryModel, /autoComposeTemplateWorks/);

  templateSources.forEach((source, index) => {
    assert.match(source, /buildPhotoSlots\(/, `${templateIds[index]} must use fixed photo slots`);
    assert.match(source, /PhotoPlaceholder/, `${templateIds[index]} must preserve layout when a photo is missing`);
    assert.match(source, /data-photo-ratio/, `${templateIds[index]} must expose its ratio contract for QA`);
  });
});
