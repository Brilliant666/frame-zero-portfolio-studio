import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourceModules = [
  ["app/templates/catalog.ts", "catalog.mjs"],
  ["app/photo-ratio-policy.ts", "photo-ratio-policy.mjs"],
  ["app/templates/shared/source-orientation-layout.ts", "source-orientation-layout.mjs"],
  ["app/templates/shared/photo-slots.tsx", "photo-slots.mjs"],
  ["app/templates/shared/template-work-fallback.ts", "template-work-fallback.mjs"],
];

function rewriteImports(output) {
  return output
    .replaceAll('from "../catalog"', 'from "./catalog.mjs"')
    .replaceAll('from "../../photo-ratio-policy"', 'from "./photo-ratio-policy.mjs"')
    .replaceAll('from "./source-orientation-layout"', 'from "./source-orientation-layout.mjs"')
    .replaceAll('from "./photo-slots"', 'from "./photo-slots.mjs"')
    .replaceAll('from "./photo-slots.module.css"', 'from "./styles.mjs"');
}

async function importFallbackModule(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-template-fallback-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const reactStub = path.join(directory, "node_modules", "react");
  await fs.mkdir(reactStub, { recursive: true });
  await fs.writeFile(
    path.join(reactStub, "package.json"),
    JSON.stringify({ type: "module", exports: { "./jsx-runtime": "./jsx-runtime.mjs" } }),
    "utf8",
  );
  await fs.writeFile(
    path.join(reactStub, "jsx-runtime.mjs"),
    "export const Fragment = Symbol('Fragment'); export const jsx = () => null; export const jsxs = jsx;\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(directory, "styles.mjs"),
    "export default new Proxy({}, { get: (_, key) => String(key) });\n",
    "utf8",
  );

  for (const [relativePath, outputName] of sourceModules) {
    const source = await fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: path.basename(relativePath),
    }).outputText;
    await fs.writeFile(path.join(directory, outputName), rewriteImports(output), "utf8");
  }

  return import(`${pathToFileURL(path.join(directory, "template-work-fallback.mjs")).href}?test=${Date.now()}`);
}

function work(index, orientation = "landscape") {
  const portrait = orientation === "portrait";
  return {
    code: `P-${index}`,
    title: `PHOTO ${index}`,
    subtitle: "SYNTHETIC FIXTURE",
    image: `/photos/library/synthetic-${index}-full.webp`,
    preview: `/photos/library/synthetic-${index}-card.webp`,
    position: "50% 50%",
    previewWidth: portrait ? 800 : 1200,
    previewHeight: portrait ? 1200 : 800,
    fullWidth: portrait ? 1600 : 2400,
    enabled: true,
  };
}

function content(works, templateWorks = {}) {
  return { works, templateWorks };
}

test("explicit templateWorks own-keys, including an empty layout, never use legacy media", async (t) => {
  const { getImmediateTemplateWorks, resolveTemplateWorkFallback } = await importFallbackModule(t);
  const legacy = work(1);
  const explicit = { ...work(2), slotIndex: 0 };
  let probes = 0;
  const probe = async () => {
    probes += 1;
    return false;
  };

  const selected = await resolveTemplateWorkFallback(
    content([legacy], { "cinematic-light": [explicit] }),
    "cinematic-light",
    probe,
  );
  assert.equal(selected.status, "explicit");
  assert.deepEqual(selected.works, [explicit]);

  const empty = await resolveTemplateWorkFallback(
    content([legacy], { "cinematic-light": [] }),
    "cinematic-light",
    probe,
  );
  assert.deepEqual(empty, { status: "explicit", works: [] });
  assert.equal(probes, 0);
  assert.deepEqual(
    getImmediateTemplateWorks(content([legacy]), "cinematic-light"),
    { status: "layout-required", works: [] },
    "unverified legacy media must not enter the initial renderer DOM",
  );
});

test("available legacy media retains the compatibility fallback", async (t) => {
  const { resolveTemplateWorkFallback } = await importFallbackModule(t);
  const legacyWorks = [work(1), work(2, "portrait")];
  const probed = new Set();

  const result = await resolveTemplateWorkFallback(
    content(legacyWorks),
    "character-select",
    async (source) => {
      probed.add(source);
      return true;
    },
  );

  assert.equal(result.status, "valid-legacy");
  assert.equal(result.works.length, 2);
  assert.deepEqual(result.works.map((item) => item.code), ["P-1", "P-2"]);
  assert.equal(probed.size, 4, "both preview and full sources must be verified");
});

test("partial stale legacy media is removed before rendering and requests layout repair", async (t) => {
  const { resolveTemplateWorkFallback } = await importFallbackModule(t);
  const available = work(1);
  const stale = work(2, "portrait");

  const result = await resolveTemplateWorkFallback(
    content([available, stale]),
    "character-select",
    async (source) => !source.includes("synthetic-2"),
  );

  assert.equal(result.status, "layout-required");
  assert.deepEqual(result.works.map((item) => item.code), [available.code]);
  assert.equal(result.works.some((item) => item.code === stale.code), false);
});

test("the four saved templates without explicit layouts fail safe when legacy paths are stale", async (t) => {
  const { resolveTemplateWorkFallback } = await importFallbackModule(t);
  const legacyWorks = [
    ...Array.from({ length: 8 }, (_, index) => work(index + 1, "landscape")),
    work(9, "portrait"),
  ];

  for (const templateId of ["orbital-portal", "archive-os", "editorial-duet", "museum-depth"]) {
    const result = await resolveTemplateWorkFallback(
      content(legacyWorks),
      templateId,
      async () => false,
    );
    assert.deepEqual(
      result,
      { status: "layout-required", works: [] },
      `${templateId} must expose only renderer placeholders for stale legacy media`,
    );
  }
});

test("public and draft previews share the read-only fallback gate", async () => {
  const [page, draftPreview, hook] = await Promise.all([
    fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/admin/draft-preview-dialog.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/shared/use-template-works.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /useTemplateWorks\(content, templateId\)/);
  assert.match(draftPreview, /useTemplateWorks\(content, templateId\)/);
  assert.match(hook, /resolveTemplateWorkFallback\(content, templateId, probeImageSource\)/);
  assert.doesNotMatch(hook, /setContent|templateWorks\s*:/);
});
