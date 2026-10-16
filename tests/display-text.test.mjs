import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();

// Render the real templates and their local dependencies. Only CSS class names
// are substituted: this is an SSR content/markup check, not a layout test.
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
    if (!specifier.startsWith(".")) return require(specifier);
    const base = path.resolve(path.dirname(filename), specifier);
    const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    assert.ok(resolved, `Unresolved template dependency ${specifier}`);
    return load(resolved);
  };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: localRequire }, { filename });
  return loaded.exports;
}

const { hasCjkText } = load("app/templates/shared/display-text.ts");
const { siteConfig } = load("app/site-config.ts");
const templates = ["cinematic-light", "neon-hud", "film-rail", "editorial-duet", "museum-depth"];
const components = Object.fromEntries(templates.map(id => [id, load(`app/templates/${id}/template.tsx`).default]));
const escaped = text => renderToStaticMarkup(createElement("span", null, text)).replace(/^<span>|<\/span>$/gu, "");

function render(id, title, lineOne, lineTwo) {
  const content = structuredClone(siteConfig);
  content.hero.title = title;
  content.statement = { ...content.statement, lineOne, lineTwo };
  return renderToStaticMarkup(createElement(components[id], {
    templateId: id, content, works: [], packages: content.packages,
    bookingTemplate: "Fixture booking", booted: true, isPreview: true,
    copiedKey: null, onCopy() {}, onOpenWork() {},
  }));
}

test("display text detects CJK scripts without treating Latin, emoji, or punctuation alone as CJK", () => {
  for (const value of ["留住光经过的片刻", "光", "Portrait · 光与影 2026", "「光」& <影>", "ひかり", "ヒカリ", "빛", "𠀀"]) {
    assert.equal(hasCjkText(value), true, value);
  }
  for (const value of ["", "  ", "BREAK THE FRAME", "Éclat 2026", "Light & Shadow", "「」——，。", "📷✨"]) {
    assert.equal(hasCjkText(value), false, value);
  }
});

const samples = [
  { name: "Chinese", title: "留住光经过的片刻", one: "让画面安静下来", two: "让真实的神态留在光里", titleCjk: true, statementCjk: true },
  { name: "mixed text, punctuation, and whitespace", title: "  光 & Light：<未完> 2026  ", one: "Quiet & Light", two: "「片刻」——继续。", titleCjk: true, statementCjk: true },
  { name: "short Chinese title with Latin statement", title: "光", one: "ONE MOMENT", two: "STAYS WITH YOU", titleCjk: true, statementCjk: false },
  { name: "Latin title with Chinese first statement line", title: "BREAK THE FRAME", one: "光与影", two: "STAY CLOSE", titleCjk: false, statementCjk: true },
  { name: "pure Latin", title: "BREAK THE FRAME", one: "LIGHT & SHADOW", two: "Stay <close>.", titleCjk: false, statementCjk: false },
  { name: "punctuation only", title: "「」——，。", one: "…", two: "📷✨", titleCjk: false, statementCjk: false },
];

for (const id of templates) {
  test(`${id} preserves editable display text and confines CJK treatment to the authorized heading nodes`, () => {
    for (const sample of samples) {
      const html = render(id, sample.title, sample.one, sample.two);
      const heading = html.match(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/u);
      assert.ok(heading, `${sample.name}: hero heading exists`);
      const marker = sample.titleCjk ? ' data-cjk="true"' : "";
      if (id === "film-rail") {
        assert.equal(heading[1], "", "Film's outer h1 must not restyle its English decoration");
        assert.equal(heading[2], `<span${marker}>${escaped(sample.title)}</span><em>ONE FRAME<br/>AT A TIME.</em>`);
      } else if (id === "cinematic-light") {
        assert.equal(heading[1].includes('data-cjk="true"'), sample.titleCjk);
        if (sample.titleCjk) {
          assert.equal(heading[2], escaped(sample.title), "Chinese/mixed title keeps its exact text without an inserted break");
        } else {
          const [first, ...remaining] = sample.title.trim().split(/\s+/u);
          assert.equal(heading[2], `${escaped(first)}<br/>${escaped(remaining.join(" "))}`, "Existing Latin title composition is retained");
        }
      } else {
        assert.equal(heading[2], escaped(sample.title));
        assert.equal(heading[1].includes('data-cjk="true"'), id !== "museum-depth" && sample.titleCjk,
          "Museum's already readable hero is outside this change");
      }

      const statementMarker = id !== "cinematic-light" && sample.statementCjk ? ' data-cjk="true"' : "";
      const second = escaped(sample.two);
      const styledSecond = id === "neon-hud" ? `<span>${second}</span>`
        : ["film-rail", "editorial-duet"].includes(id) ? `<em>${second}</em>` : second;
      assert.ok(html.includes(`<h2${statementMarker}>${escaped(sample.one)}<br/>${styledSecond}</h2>`),
        `${sample.name}: both original statement lines and their emphasis survive rendering`);
      const expectedMarkers = Number(id !== "museum-depth" && sample.titleCjk)
        + Number(id !== "cinematic-light" && sample.statementCjk);
      assert.equal((html.match(/data-cjk="true"/gu) ?? []).length, expectedMarkers,
        `${sample.name}: no CJK treatment leaks into other titles, body text, or English decoration`);
    }
  });
}
