import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const styles = {
  polaroid: new URL("../app/templates/polaroid-field/field.module.css", import.meta.url),
  film: new URL("../app/templates/film-rail/film-rail.module.css", import.meta.url),
  prism: new URL("../app/templates/prism-liquid/template.module.css", import.meta.url),
  editorial: new URL("../app/templates/editorial-duet/template.module.css", import.meta.url),
  orbital: new URL("../app/templates/orbital-portal/template.module.css", import.meta.url),
};

function rule(css, selector, ...properties) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "gsu"))];
  const match = matches.find((candidate) => properties.every((property) => (
    new RegExp(`${property}:`, "u").test(candidate[1])
  ))) ?? matches[0];
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

function declaration(cssRule, property) {
  const match = cssRule.match(new RegExp(`${property}:\\s*([^;]+);`, "su"));
  assert.ok(match, `missing ${property} declaration`);
  return match[1].replace(/\s+/gu, " ").trim();
}

test("basic business panels keep their template's canvas tone", async () => {
  const [polaroid, film, prism, editorial, orbital] = await Promise.all(
    Object.values(styles).map((path) => fs.readFile(path, "utf8")),
  );

  const polaroidContact = rule(polaroid, ".bookingSection", "background", "color");
  assert.match(declaration(polaroidContact, "background"), /var\(--cream\)/u);
  assert.doesNotMatch(declaration(polaroidContact, "background"), /var\(--ink\)/u);
  assert.equal(declaration(polaroidContact, "color"), "var(--ink)");
  assert.equal(declaration(rule(polaroid, ".shell[data-basic-template] .footer", "background"), "background"), "var(--paper)");
  assert.match(polaroid, /\.shell\[data-basic-template\] \.bookingIntro,\s*\.shell\[data-basic-template\] \.footer\s*\{[^}]*color: var\(--ink\)/su);

  const filmContact = rule(film, ".booking", "background", "color");
  assert.equal(declaration(filmContact, "background"), "var(--paper)");
  assert.equal(declaration(filmContact, "color"), "var(--ink)");
  assert.equal(declaration(rule(film, ".bookingIntro", "background"), "background"), "var(--paper)");

  const prismPackages = rule(prism, ".services", "background", "color");
  assert.equal(declaration(prismPackages, "background"), "var(--paper-soft)");
  assert.equal(declaration(prismPackages, "color"), "var(--ink)");
  assert.doesNotMatch(declaration(rule(prism, ".packageGrid article", "background"), "background"), /var\(--inverse\)/u);
  assert.equal(declaration(rule(prism, ".packageGrid article", "color"), "color"), "var(--ink)");

  const editorialPackages = rule(editorial, ".rates", "background", "color");
  assert.equal(declaration(editorialPackages, "background"), "var(--paper)");
  assert.equal(declaration(editorialPackages, "color"), "var(--ink)");
  assert.match(editorial, /\.rateList article:hover,\s*\.rateList article:focus-within\s*\{[^}]*background:\s*var\(--paper-deep\);[^}]*color:\s*var\(--ink\);/su);

  const orbitalPackages = rule(orbital, ".missions", "background", "color");
  assert.match(declaration(orbitalPackages, "background"), /#05070b/u);
  assert.equal(declaration(orbitalPackages, "color"), "#f7f3ed");
  assert.equal(declaration(rule(orbital, ".missionGrid article", "background"), "background"), "#0d121b");
});

test("light basic viewer appearance retains the existing work information and navigation", async () => {
  const filename = new URL("../app/templates/shared/lightbox.tsx", import.meta.url);
  const source = await fs.readFile(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  const require = createRequire(import.meta.url);
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: (id) => id.endsWith(".module.css") ? { default: { basic: "basic-material" } } : require(id) });
  const work = { code: "FRAME 01", title: "Fixture title", subtitle: "Fixture caption", image: "/fixture.webp", preview: "/fixture.webp", previewWidth: 640, previewHeight: 480, fullWidth: 1280, enabled: true };
  const props = { work, works: [work], frameRef: { current: null }, closeButtonRef: { current: null }, onMove() {}, onClose() {} };
  const basic = renderToStaticMarkup(createElement(loaded.exports.default, { ...props, appearance: "light", theme: "dark" }));
  assert.match(basic, /lightbox-light/);
  assert.match(basic, /Fixture title/); assert.match(basic, /Fixture caption/);
  assert.match(basic, /aria-label="上一张作品"/); assert.match(basic, /aria-label="下一张作品"/);
  const advanced = renderToStaticMarkup(createElement(loaded.exports.default, { ...props, theme: "light" }));
  assert.match(advanced, /lightbox-light/); assert.match(advanced, /第 1 张照片/);
  assert.doesNotMatch(advanced, /Fixture title|Fixture caption/);
  assert.doesNotMatch(advanced, /data-basic-template|basic-material/);
  const palette = renderToStaticMarkup(createElement(loaded.exports.default, { ...props, appearance: "light", basicTemplate: "prism-liquid" }));
  assert.match(palette, /data-basic-template="prism-liquid"/);
  assert.match(palette, /basic-material/);
  assert.match(palette, /Fixture title/); assert.match(palette, /Fixture caption/);
  assert.match(palette, /aria-label="上一张作品"/);
});

test("public basic viewer and current-edit preview carry the selected template into the same lightbox", async () => {
  const require = createRequire(import.meta.url);
  const work = { code: "FRAME 01", title: "Fixture title", image: "/fixture.webp", enabled: true };
  const content = { activeTemplate: "prism-liquid", social: [], packages: [], bookingFields: [], templateWorks: {} };
  const interactions = { activeWork: work, lightboxWorks: [work], lightboxRef: { current: null }, closeButtonRef: { current: null }, setActiveWork() {}, moveActiveWork() {} };
  const appearanceSource = await fs.readFile(new URL("../app/templates/appearance.ts", import.meta.url), "utf8");
  const appearanceModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(appearanceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: appearanceModule, exports: appearanceModule.exports });
  const appearances = appearanceModule.exports;
  const lightbox = (props) => createElement("div", { "data-viewer-template": props.basicTemplate, "data-viewer-tone": props.appearance });
  async function load(relativePath) {
    const source = await fs.readFile(new URL(relativePath, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const loaded = { exports: {} };
    const mocks = (id) => {
      if (id === "react-dom") return { createPortal: (child) => child };
      if (id.endsWith(".module.css")) return { default: {} };
      if (id.endsWith("/appearance")) return appearances;
      if (id.endsWith("/lightbox")) return { default: lightbox };
      if (id.endsWith("/template-renderer")) return { default: () => null };
      if (id.endsWith("/assets-client")) return { hydrateSiteWorks: (value) => value };
      if (id.endsWith("/asset-context")) return { PlatformAssetContext: { Provider: ({ children }) => children } };
      if (id.endsWith("/use-template-works")) return { useTemplateWorks: () => ({ works: [work] }) };
      if (id.endsWith("/use-template-interactions")) return { useTemplateInteractions: () => interactions };
      if (id.endsWith("/admin-provider")) return { useAdmin: () => ({ content }) };
      return require(id);
    };
    vm.runInNewContext(output, { module: loaded, exports: loaded.exports, require: mocks, document: { body: {} } });
    return loaded.exports;
  }
  const basic = (await load("../app/site-editor/basic-view.tsx")).SiteBasicView;
  const preview = (await load("../app/admin/template-preview-dialog.tsx")).default;
  for (const [templateId, appearance] of Object.entries(appearances.templateAppearances)) {
    content.activeTemplate = templateId;
    const publicHtml = renderToStaticMarkup(createElement(basic, { content, assets: [] }));
    // A recommendation can preview another template without changing the saved active one.
    content.activeTemplate = templateId === "neon-hud" ? "archive-os" : "neon-hud";
    const previewHtml = renderToStaticMarkup(createElement(preview, { templateId, works: [work], title: "预览", description: "测试", previewSource: "recommendation", onRequestClose() {} }));
    for (const html of [publicHtml, previewHtml]) {
      assert.match(html, new RegExp(`data-viewer-template="${templateId}"`));
      assert.match(html, new RegExp(`data-viewer-tone="${appearance.tone}"`));
    }
  }
});
