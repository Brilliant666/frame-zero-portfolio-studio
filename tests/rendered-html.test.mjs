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
  const [config, catalog, renderer, page, layout, admin, api, schema, hosting] = await Promise.all([
    readFile(new URL("../app/site-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/templates/template-renderer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
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
  assert.match(renderer, /lazy\(loader\)/);
  assert.doesNotMatch(catalog, /scaffold/);
  assert.match(page, /<TemplateRenderer/);
  assert.match(page, /previewTemplate \?\? content\.activeTemplate/);
  assert.match(page, /fetch\("\/api\/site-content"/);
  assert.match(admin, /摄影主页后台/);
  assert.match(admin, /保存全部修改/);
  assert.match(admin, /moveWork/);
  assert.match(api, /onConflictDoUpdate/);
  assert.match(schema, /site_settings/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /colorScheme: "light"/);
});
