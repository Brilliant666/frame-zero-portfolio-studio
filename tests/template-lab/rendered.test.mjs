import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("../cloudflare-loader.mjs", import.meta.url));

const catalogSource = await readFile(
  new URL("../../app/template-lab/_lib/prototype-catalog.ts", import.meta.url),
  "utf8",
);
const prototypes = [...catalogSource.matchAll(
  /\{\s*id:\s*"(?<id>[^"]+)",\s*name:\s*"(?<name>[^"]+)",[\s\S]*?slotRatios:\s*\[(?<ratios>[^\]]+)\],[\s\S]*?browsingModel:/gu,
)].map((match) => ({
  id: match.groups.id,
  name: match.groups.name,
  placeholderCount: [...match.groups.ratios.matchAll(/"[^"]+"/gu)].length,
}));

let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    const workerUrl = new URL("../../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("template-lab-test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then((module) => module.default);
  }
  return workerPromise;
}

async function render(pathname) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://127.0.0.1:3001${pathname}`, {
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

function assertExperimentBoundary(html) {
  assert.match(html, /EXPERIMENTAL/);
  assert.match(html, /NOT REGISTERED/);
  assert.match(html, /NOT SITE_DOCUMENT_V1 COMPATIBLE/);
  assert.match(html, /DO NOT PERSIST/);
  assert.doesNotMatch(html, /\/api\/site-content/);
  assert.doesNotMatch(html, /<img\b/i);
}

test("server-renders the isolated Template Lab index", async () => {
  assert.equal(prototypes.length, 5, "SSR coverage must derive from every lab-only catalog entry");

  const response = await render("/template-lab");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>FRAME\/\/ZERO Template Lab<\/title>/);
  assert.match(html, /name="robots" content="noindex, nofollow, nocache"/);
  assert.match(html, /data-template-lab="index"/);
  assert.match(html, /data-template-lab-style="shell"/);
  assert.match(html, /data-template-lab-style="chrome"/);
  assertExperimentBoundary(html);

  for (const prototype of prototypes) {
    assert.match(html, new RegExp(`href="/template-lab/${prototype.id}"`));
    assert.match(html, new RegExp(prototype.name));
  }
});

for (const prototype of prototypes) {
  test(`server-renders ${prototype.id} directly with a complete placeholder composition`, async () => {
    const response = await render(`/template-lab/${prototype.id}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, new RegExp(`data-lab-prototype="${prototype.id}"`));
    assert.match(html, new RegExp(`data-template-lab-style="${prototype.id}"`));
    assert.match(html, new RegExp(prototype.name));
    assert.match(html, /data-browsing-model=/);
    assert.match(html, /data-lab-placeholder="true"/);
    assert.match(html, /Prototype design brief/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.equal(
      html.match(/data-lab-placeholder="true"/g)?.length,
      prototype.placeholderCount,
      `${prototype.id} must render every declared placeholder exactly once`,
    );

    if (prototype.id === "poster-chapters") {
      assert.match(html, /aria-label="Poster chapter navigation"/);
      assert.equal(
        html.match(/<article id="poster-chapter-\d{2}"[^>]*aria-labelledby="poster-chapter-\d{2}-title"/g)?.length,
        6,
        "Poster Chapters must render six heading-labelled semantic chapters",
      );
    }

    if (prototype.id === "axis-atlas") {
      assert.equal(
        html.match(/aria-label="Y\d{2} [^"]+: horizontal strip, three frames/g)?.length,
        3,
        "Axis Atlas must render three labelled horizontal strips",
      );
      assert.ok(
        (html.match(/tabindex="0"/g)?.length ?? 0) >= 3,
        "Axis Atlas must render at least three keyboard-focusable strips",
      );
    }

    if (prototype.id === "stacked-scenes") {
      assert.match(html, /aria-label="Stacked scene navigation"/);
      assert.equal(
        html.match(/id="stacked-scene-\d{2}"/g)?.length,
        5,
        "Stacked Scenes must render five ordered scene cards",
      );
      assert.ok(
        (html.match(/tabindex="0"/g)?.length ?? 0) >= 5,
        "Stacked Scenes must render five keyboard-focusable cards",
      );
    }
    assertExperimentBoundary(html);
  });
}

test("keeps Template Lab code out of the production homepage client graph", async () => {
  const homepageResponse = await render("/");
  assert.equal(homepageResponse.status, 200);
  const homepageHtml = await homepageResponse.text();
  assert.doesNotMatch(homepageHtml, /data-template-lab-style|--lab-paper|--quiet-canvas|--stack-shell/u);

  const manifest = JSON.parse(
    await readFile(new URL("../../dist/client/.vite/manifest.json", import.meta.url), "utf8"),
  );
  const visited = new Set();

  function visit(source) {
    if (visited.has(source)) return;
    visited.add(source);
    const entry = manifest[source];
    if (!entry) return;
    for (const dependency of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      visit(dependency);
    }
  }

  visit("app/page.tsx");
  assert.ok(visited.has("app/page.tsx"));
  assert.deepEqual(
    [...visited].filter((source) => source.includes("template-lab")),
    [],
    "production homepage imports must not contain Template Lab sources",
  );

  const assetsManifestUrl = new URL("../../dist/server/__vite_rsc_assets_manifest.js", import.meta.url);
  assetsManifestUrl.searchParams.set("template-lab-css-test", `${process.pid}-${Date.now()}`);
  const assetsManifest = (await import(assetsManifestUrl.href)).default;
  const homepageCss = assetsManifest.serverResources["app/layout.tsx"]?.css ?? [];
  assert.ok(homepageCss.length > 0, "the production root layout must expose its CSS assets");
  for (const assetPath of homepageCss) {
    const css = await readFile(new URL(`../../dist/client${assetPath}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      css,
      /--lab-paper|--quiet-canvas|--poster-paper|--ocean-raised|--stack-shell/u,
      `${assetPath} must not contain route-local Template Lab CSS`,
    );
  }
});
