import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const styles = {
  polaroid: new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url),
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

test("high-priority paged templates keep one canvas tone and localize inverse surfaces", async () => {
  const [polaroid, film, prism, editorial, orbital] = await Promise.all(
    Object.values(styles).map((path) => fs.readFile(path, "utf8")),
  );

  const polaroidContact = rule(polaroid, ".bookingSection", "background", "color");
  assert.match(declaration(polaroidContact, "background"), /var\(--cream\)/u);
  assert.doesNotMatch(declaration(polaroidContact, "background"), /var\(--ink\)/u);
  assert.equal(declaration(polaroidContact, "color"), "var(--ink)");
  assert.equal(declaration(rule(polaroid, ".bookingIntro", "background"), "background"), "var(--ink)");

  const filmContact = rule(film, ".booking", "background", "color");
  assert.equal(declaration(filmContact, "background"), "var(--paper)");
  assert.equal(declaration(filmContact, "color"), "var(--ink)");
  assert.equal(declaration(rule(film, ".bookingIntro", "background"), "background"), "var(--film)");

  const prismPackages = rule(prism, ".services", "background", "color");
  assert.equal(declaration(prismPackages, "background"), "var(--paper-soft)");
  assert.equal(declaration(prismPackages, "color"), "var(--ink)");
  assert.match(declaration(rule(prism, ".packageGrid article", "background"), "background"), /var\(--inverse\)/u);

  const editorialPackages = rule(editorial, ".rates", "background", "color");
  assert.equal(declaration(editorialPackages, "background"), "var(--paper)");
  assert.equal(declaration(editorialPackages, "color"), "var(--ink)");
  assert.match(editorial, /\.rateList article:hover,\s*\.rateList article:focus-within\s*\{[^}]*background:\s*var\(--ink\);[^}]*color:\s*var\(--paper\);/su);

  const orbitalPackages = rule(orbital, ".missions", "background", "color");
  assert.match(declaration(orbitalPackages, "background"), /#05070b/u);
  assert.equal(declaration(orbitalPackages, "color"), "#f7f3ed");
  assert.equal(declaration(rule(orbital, ".missionGrid article", "background"), "background"), "#eef3f3");
});
