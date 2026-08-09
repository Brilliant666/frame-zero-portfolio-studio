import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const TEMPLATE_IDS = [
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

async function source(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

async function importBrandIdentity(t) {
  const input = await source("app/brand-identity.ts");
  const output = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "brand-identity.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-brand-identity-"));
  const modulePath = path.join(directory, "brand-identity.mjs");
  await fs.writeFile(modulePath, output, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

test("brand identity uses the two persisted fields without inventing a system default", async (t) => {
  const { resolveBrandIdentity } = await importBrandIdentity(t);
  const configured = Object.freeze({ brand: "  PERSONAL/HANDLE  ", mark: "  P/H  " });

  assert.deepEqual(resolveBrandIdentity(configured), {
    name: "PERSONAL/HANDLE",
    mark: "P/H",
    hasIdentity: true,
    hasDistinctMark: true,
  });
  assert.deepEqual(configured, { brand: "  PERSONAL/HANDLE  ", mark: "  P/H  " });
  assert.deepEqual(resolveBrandIdentity({ brand: "PERSONAL/HANDLE", mark: "   " }), {
    name: "PERSONAL/HANDLE",
    mark: "PERSONAL/HANDLE",
    hasIdentity: true,
    hasDistinctMark: false,
  });
  assert.deepEqual(resolveBrandIdentity({ brand: "", mark: "P/H" }), {
    name: "P/H",
    mark: "P/H",
    hasIdentity: true,
    hasDistinctMark: false,
  });
  assert.deepEqual(resolveBrandIdentity({ brand: "  ", mark: "" }), {
    name: "",
    mark: "",
    hasIdentity: false,
    hasDistinctMark: false,
  });
});

test("template vocabulary never leaves orphan punctuation when identity is empty", async (t) => {
  const { withBrandPrefix } = await importBrandIdentity(t);

  assert.equal(withBrandPrefix("PERSONAL/HANDLE", "ARCHIVE OS", " / "), "PERSONAL/HANDLE / ARCHIVE OS");
  assert.equal(withBrandPrefix("", "ARCHIVE OS", " / "), "ARCHIVE OS");
  assert.equal(withBrandPrefix("PERSONAL/HANDLE", ""), "PERSONAL/HANDLE");
  assert.equal(withBrandPrefix("", ""), "");
});

test("templates consume resolved identity and reject embedded demo branding", async () => {
  const forbiddenDemoBrand = /FRAME\s*(?:\/\/\s*)?ZERO|F\s*\/\/\s*0/i;

  for (const templateId of TEMPLATE_IDS) {
    const directoryUrl = new URL(`../app/templates/${templateId}/`, import.meta.url);
    const entries = await fs.readdir(directoryUrl);
    const presentationFiles = entries.filter((entry) => entry === "template.tsx" || entry.endsWith(".css"));
    const contents = await Promise.all(presentationFiles.map((entry) => fs.readFile(new URL(entry, directoryUrl), "utf8")));
    const combined = contents.join("\n");
    const normalizedPresentation = combined.replace(/<[^>]+>/g, " ");

    assert.match(combined, /resolveBrandIdentity/, `${templateId} must consume the shared brand identity resolver`);
    assert.doesNotMatch(normalizedPresentation, forbiddenDemoBrand, `${templateId} must not embed the demo brand`);
  }

  const [sharedSlots, renderer, placeholder, globals, profileEditor] = await Promise.all([
    source("app/templates/shared/photo-slots.tsx"),
    source("app/templates/template-renderer.tsx"),
    source("app/templates/placeholder/placeholder-template.tsx"),
    source("app/globals.css"),
    source("app/admin/profile/profile-editor.tsx"),
  ]);

  for (const [name, contents] of Object.entries({ sharedSlots, renderer, placeholder })) {
    assert.doesNotMatch(contents.replace(/<[^>]+>/g, " "), forbiddenDemoBrand, `${name} must not embed the demo brand`);
  }
  assert.match(sharedSlots, /className=\{styles\.corner\}>PHOTO<\/span>/);
  assert.match(renderer, /resolveBrandIdentity/);
  assert.match(placeholder, /resolveBrandIdentity/);
  assert.match(globals, /\.template-swatch::before\s*\{\s*content:\s*"LIGHT";/s);
  assert.doesNotMatch(globals, /content:\s*"F\/\/0"/i);
  assert.match(profileEditor, /所有主页模板和网站标题统一读取这里的展示名称/);
  assert.match(profileEditor, /留空时网站标题使用摄影师名称/);
  assert.match(profileEditor, /短标 \/ 缩写（可留空）/);
  assert.match(profileEditor, /留空时使用展示名称，不会生成或恢复示例字样/);
});
