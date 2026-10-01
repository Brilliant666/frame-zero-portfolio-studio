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
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: createRequire(import.meta.url) });
  const work = { code: "FRAME 01", title: "Fixture title", subtitle: "Fixture caption", image: "/fixture.webp", preview: "/fixture.webp", previewWidth: 640, previewHeight: 480, fullWidth: 1280, enabled: true };
  const props = { work, works: [work], frameRef: { current: null }, closeButtonRef: { current: null }, onMove() {}, onClose() {} };
  const basic = renderToStaticMarkup(createElement(loaded.exports.default, { ...props, appearance: "light", theme: "dark" }));
  assert.match(basic, /lightbox-light/);
  assert.match(basic, /Fixture title/); assert.match(basic, /Fixture caption/);
  assert.match(basic, /aria-label="上一张作品"/); assert.match(basic, /aria-label="下一张作品"/);
  const advanced = renderToStaticMarkup(createElement(loaded.exports.default, { ...props, theme: "light" }));
  assert.match(advanced, /lightbox-light/); assert.match(advanced, /第 1 张照片/);
  assert.doesNotMatch(advanced, /Fixture title|Fixture caption/);
});
