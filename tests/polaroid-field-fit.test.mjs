import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importTypescriptModule(t, relativePath, fileName) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-polaroid-fit-test-"));
  const modulePath = path.join(directory, `${path.parse(fileName).name}.mjs`);
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

function importFitModule(t) {
  return importTypescriptModule(
    t,
    "../app/templates/polaroid-field/viewport-fit.ts",
    "viewport-fit.ts",
  );
}

function importFieldLayoutModule(t) {
  return importTypescriptModule(
    t,
    "../app/templates/polaroid-field/field-layout.ts",
    "field-layout.ts",
  );
}

function importNavigationModule(t) {
  return importTypescriptModule(
    t,
    "../app/templates/polaroid-field/navigation.ts",
    "navigation.ts",
  );
}

function importSocialLinksModule(t) {
  return importTypescriptModule(
    t,
    "../app/templates/polaroid-field/social-links.ts",
    "social-links.ts",
  );
}

function extractBraceBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `expected to find ${marker}`);
  const openIndex = source.indexOf("{", markerIndex + marker.length);
  assert.notEqual(openIndex, -1, `expected ${marker} to open a block`);

  let depth = 1;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }

  assert.fail(`expected ${marker} to close its block`);
}

function parseDeclarations(block) {
  return Object.fromEntries(block
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colonIndex = declaration.indexOf(":");
      return [
        declaration.slice(0, colonIndex).trim(),
        declaration.slice(colonIndex + 1).trim(),
      ];
    }));
}

function remValue(value) {
  const match = value.match(/^([\d.]+)rem$/);
  assert.ok(match, `expected a rem value, received ${value}`);
  return Number(match[1]);
}

function minimumClampRem(value) {
  assert.ok(value.startsWith("clamp(") && value.endsWith(")"), `expected clamp(), received ${value}`);
  return remValue(value.slice("clamp(".length, -1).split(",", 1)[0].trim());
}

function maximumClampRem(value) {
  assert.ok(value.startsWith("clamp(") && value.endsWith(")"), `expected clamp(), received ${value}`);
  const values = value.slice("clamp(".length, -1).split(",");
  assert.equal(values.length, 3, `expected three clamp values, received ${value}`);
  return remValue(values[2].trim());
}

function splitCssValues(value) {
  const values = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    if (value[index] === ")") depth -= 1;
    if (/\s/.test(value[index]) && depth === 0) {
      if (start < index) values.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (start < value.length) values.push(value.slice(start));
  return values;
}

function extractCssRule(source, selector, occurrence = 0) {
  const marker = `${selector} {`;
  let ruleIndex = -1;
  let searchStart = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    ruleIndex = source.indexOf(marker, searchStart);
    if (ruleIndex === -1) break;
    searchStart = ruleIndex + marker.length;
  }
  assert.notEqual(ruleIndex, -1, `expected CSS rule ${selector}`);
  return extractBraceBlock(source.slice(ruleIndex), selector);
}

const VIEWPORT = { width: 1536, height: 720 };
const FIT_INSET = 32;
const REM = 16;
const DEFAULT_RATIOS = ["3:2", "3:2", "3:2", "3:2", "2:3", "3:2", "3:2", "3:2", "3:2"];

function layoutGeometry(layout) {
  return {
    canvas: { width: layout.canvasWidth * REM, height: layout.canvasHeight * REM },
    cards: layout.placements.map((placement) => ({
      left: placement.left * REM,
      top: placement.top * REM,
      width: placement.width * REM,
      height: placement.height * REM,
      rotation: placement.rotation,
    })),
  };
}

function projectBounds(bounds, fit, view = fit.view) {
  return {
    left: fit.viewport.width / 2 + view.x + (bounds.left - fit.canvas.width / 2) * view.scale,
    top: fit.viewport.height / 2 + view.y + (bounds.top - fit.canvas.height / 2) * view.scale,
    right: fit.viewport.width / 2 + view.x + (bounds.right - fit.canvas.width / 2) * view.scale,
    bottom: fit.viewport.height / 2 + view.y + (bounds.bottom - fit.canvas.height / 2) * view.scale,
  };
}

function assertAllCardsInside(getRotatedBounds, fit, cards) {
  const tolerance = .01;
  for (const [index, card] of cards.entries()) {
    const projected = projectBounds(getRotatedBounds(card), fit);
    assert.ok(projected.left >= fit.inset - tolerance, `card ${index + 1} left edge`);
    assert.ok(projected.top >= fit.inset - tolerance, `card ${index + 1} top edge`);
    assert.ok(projected.right <= fit.viewport.width - fit.inset + tolerance, `card ${index + 1} right edge`);
    assert.ok(projected.bottom <= fit.viewport.height - fit.inset + tolerance, `card ${index + 1} bottom edge`);
  }
}

test("rotation-aware bounds include the card's transformed corners", async (t) => {
  const { getRotatedBounds } = await importFitModule(t);
  const bounds = getRotatedBounds({ left: 10, top: 20, width: 100, height: 50, rotation: 90 });

  assert.ok(Math.abs(bounds.left - 35) < .0001);
  assert.ok(Math.abs(bounds.top + 5) < .0001);
  assert.ok(Math.abs(bounds.right - 85) < .0001);
  assert.ok(Math.abs(bounds.bottom - 95) < .0001);
});

test("desktop FIT keeps all nine rotated polaroids inside the safe viewport", async (t) => {
  const [{ fitRectsToViewport, getMinimumScale, getRotatedBounds }, { buildPolaroidFieldLayout }] = await Promise.all([
    importFitModule(t),
    importFieldLayoutModule(t),
  ]);
  const { canvas, cards } = layoutGeometry(buildPolaroidFieldLayout(DEFAULT_RATIOS));
  assert.equal(cards.length, 9);

  const fit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);
  assert.ok(fit);
  assert.ok(fit.view.scale > .72, "the ratio-aware constellation should remain legible in FIT");
  assert.ok(fit.view.scale <= 1);
  assert.equal(getMinimumScale(fit.view.scale), .72);
  assertAllCardsInside(getRotatedBounds, fit, cards);
});

test("resizing recomputes a legal FIT instead of reusing a stale scale", async (t) => {
  const [{ fitRectsToViewport, getRotatedBounds }, { buildPolaroidFieldLayout }] = await Promise.all([
    importFitModule(t),
    importFieldLayoutModule(t),
  ]);
  const { canvas, cards } = layoutGeometry(buildPolaroidFieldLayout(DEFAULT_RATIOS));
  const wideFit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);
  const narrowFit = fitRectsToViewport({ width: 900, height: 720 }, canvas, cards, FIT_INSET);

  assert.ok(wideFit && narrowFit);
  assert.ok(narrowFit.view.scale < wideFit.view.scale);
  assertAllCardsInside(getRotatedBounds, narrowFit, cards);
});

test("dynamic pan bounds keep every content edge reachable after zoom", async (t) => {
  const [{ constrainView, fitRectsToViewport, getMinimumScale, getPanBounds }, { buildPolaroidFieldLayout }] = await Promise.all([
    importFitModule(t),
    importFieldLayoutModule(t),
  ]);
  const { canvas, cards } = layoutGeometry(buildPolaroidFieldLayout(DEFAULT_RATIOS));
  const fit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);
  assert.ok(fit);

  const pan = getPanBounds(fit, 1);
  assert.ok(pan.minX < pan.maxX);
  assert.ok(pan.minY < pan.maxY);

  const rightEdge = projectBounds(fit.content, fit, { x: pan.minX, y: pan.minY, scale: 1 }).right;
  const leftEdge = projectBounds(fit.content, fit, { x: pan.maxX, y: pan.maxY, scale: 1 }).left;
  const bottomEdge = projectBounds(fit.content, fit, { x: pan.minX, y: pan.minY, scale: 1 }).bottom;
  const topEdge = projectBounds(fit.content, fit, { x: pan.maxX, y: pan.maxY, scale: 1 }).top;
  assert.ok(Math.abs(rightEdge - (VIEWPORT.width - FIT_INSET)) < .001);
  assert.ok(Math.abs(leftEdge - FIT_INSET) < .001);
  assert.ok(Math.abs(bottomEdge - (VIEWPORT.height - FIT_INSET)) < .001);
  assert.ok(Math.abs(topEdge - FIT_INSET) < .001);

  const constrained = constrainView(
    { x: 10_000, y: -10_000, scale: 10 },
    fit,
    getMinimumScale(fit.view.scale),
    1.28,
  );
  const maximumPan = getPanBounds(fit, 1.28);
  assert.equal(constrained.scale, 1.28);
  assert.ok(constrained.x <= maximumPan.maxX + .001);
  assert.ok(constrained.y >= maximumPan.minY - .001);
});

test("all 128 adaptive orientation combinations keep rotated cards bounded and separated", async (t) => {
  const [{ fitRectsToViewport, getRotatedBounds }, {
    buildPolaroidFieldLayout,
    getPolaroidFieldPlacementBounds,
    POLAROID_FIELD_MIN_GAP_REM,
    POLAROID_FIELD_SAFE_INSET_REM,
  }] = await Promise.all([importFitModule(t), importFieldLayoutModule(t)]);
  const adaptiveSlotIndexes = [0, 1, 2, 3, 5, 6, 7];
  const tolerance = .002;

  for (let orientationMask = 0; orientationMask < 2 ** adaptiveSlotIndexes.length; orientationMask += 1) {
    const ratios = [...DEFAULT_RATIOS];
    adaptiveSlotIndexes.forEach((slotIndex, bitIndex) => {
      ratios[slotIndex] = (orientationMask & (1 << bitIndex)) === 0 ? "3:2" : "2:3";
    });
    const layout = buildPolaroidFieldLayout(ratios);
    const bounds = layout.placements.map(getPolaroidFieldPlacementBounds);
    const { canvas, cards } = layoutGeometry(layout);
    const fit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);
    const heroBounds = bounds[4];

    assert.deepEqual(layout.placements.map(({ slotIndex }) => slotIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(layout.placements[4].band, "hero");
    assert.equal(layout.placements[4].ratio, "2:3");
    assert.ok(
      Math.abs((heroBounds.left + heroBounds.right) / 2 - layout.canvasWidth / 2) < tolerance,
      `mask ${orientationMask}: hero stays on the canvas horizontal center`,
    );
    assert.ok(
      Math.abs((heroBounds.top + heroBounds.bottom) / 2 - layout.canvasHeight / 2) < tolerance,
      `mask ${orientationMask}: hero stays on the canvas vertical center`,
    );
    assert.equal(layout.threads.length, 10);
    assert.ok(fit, `mask ${orientationMask}: FIT exists`);
    assert.ok(fit.view.scale > .72, `mask ${orientationMask}: FIT remains legible`);
    assertAllCardsInside(getRotatedBounds, fit, cards);

    bounds.forEach((card, index) => {
      assert.ok(card.left >= POLAROID_FIELD_SAFE_INSET_REM - tolerance, `mask ${orientationMask}, card ${index + 1}: left`);
      assert.ok(card.top >= POLAROID_FIELD_SAFE_INSET_REM - tolerance, `mask ${orientationMask}, card ${index + 1}: top`);
      assert.ok(card.right <= layout.canvasWidth - POLAROID_FIELD_SAFE_INSET_REM + tolerance, `mask ${orientationMask}, card ${index + 1}: right`);
      assert.ok(card.bottom <= layout.canvasHeight - POLAROID_FIELD_SAFE_INSET_REM + tolerance, `mask ${orientationMask}, card ${index + 1}: bottom`);
    });

    for (let leftIndex = 0; leftIndex < bounds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bounds.length; rightIndex += 1) {
        const left = bounds[leftIndex];
        const right = bounds[rightIndex];
        const horizontalGap = Math.max(left.left - right.right, right.left - left.right, 0);
        const verticalGap = Math.max(left.top - right.bottom, right.top - left.bottom, 0);
        assert.ok(
          horizontalGap >= POLAROID_FIELD_MIN_GAP_REM - tolerance
            || verticalGap >= POLAROID_FIELD_MIN_GAP_REM - tolerance,
          `mask ${orientationMask}: cards ${leftIndex + 1} and ${rightIndex + 1} must keep an auditable gap`,
        );
      }
    }
  }
});

test("field layout is ratio-aware, deterministic, and rejects a non-nine-slot contract", async (t) => {
  const { buildPolaroidFieldLayout } = await importFieldLayoutModule(t);
  const landscape = buildPolaroidFieldLayout(DEFAULT_RATIOS);
  const portraitRatios = [...DEFAULT_RATIOS];
  portraitRatios[0] = "2:3";
  const portrait = buildPolaroidFieldLayout(portraitRatios);

  assert.ok(portrait.placements[0].width < landscape.placements[0].width);
  assert.equal(portrait.placements[0].height, landscape.placements[0].height);
  assert.deepEqual(buildPolaroidFieldLayout(DEFAULT_RATIOS), landscape);
  assert.throws(() => buildPolaroidFieldLayout(DEFAULT_RATIOS.slice(0, 8)), /exactly 9 ratios/);
});

test("polaroid navigation maps stable hashes to the three same-route views", async (t) => {
  const { POLAROID_VIEW_HASHES, getPolaroidViewFromHash } = await importNavigationModule(t);

  assert.deepEqual(POLAROID_VIEW_HASHES, {
    field: "#polaroid-top",
    packages: "#polaroid-packages",
    booking: "#polaroid-booking",
  });
  assert.equal(getPolaroidViewFromHash(""), "field");
  assert.equal(getPolaroidViewFromHash("#polaroid-top"), "field");
  assert.equal(getPolaroidViewFromHash(POLAROID_VIEW_HASHES.field), "field");
  assert.equal(getPolaroidViewFromHash(POLAROID_VIEW_HASHES.packages), "packages");
  assert.equal(getPolaroidViewFromHash(POLAROID_VIEW_HASHES.booking), "booking");
  assert.equal(getPolaroidViewFromHash("  #POLAROID-BOOKING  "), "booking");
  assert.equal(getPolaroidViewFromHash("#unknown-section"), "field");
});

test("polaroid contact options resolve QQ only from social rows and accept safe HTTPS URLs", async (t) => {
  const { findQqContact, getSafeSocialUrl } = await importSocialLinksModule(t);

  assert.equal(findQqContact([
    { label: "邮箱", handle: "123456789@qq.example" },
    { label: " qq ", handle: " QQ_DEMO_123 " },
  ]), "QQ_DEMO_123");
  assert.equal(findQqContact([
    { label: "QQ", handle: "   " },
    { label: "QQ", handle: " second-qq " },
  ]), "second-qq");
  assert.equal(findQqContact([{ label: "邮箱", handle: "123456789@qq.example" }]), null);
  assert.equal(findQqContact([{ label: "微信", handle: "QQ" }]), null);

  assert.equal(
    getSafeSocialUrl("  https://portfolio.example/profile?q=作品#gallery  "),
    "https://portfolio.example/profile?q=%E4%BD%9C%E5%93%81#gallery",
  );
  for (const unsafe of [
    "",
    "portfolio.example/profile",
    "http://portfolio.example/profile",
    "mailto:owner@framezero.example",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "//portfolio.example/profile",
    "https://owner@portfolio.example/profile",
    "https://owner:secret@portfolio.example/profile",
    "https://",
    `https://portfolio.example/${"a".repeat(2_100)}`,
  ]) assert.equal(getSafeSocialUrl(unsafe), null, unsafe);
});

test("contact Admin manages up to eight account-or-HTTPS rows without changing SiteContent schema", async () => {
  const [editor, siteConfigSource] = await Promise.all([
    fs.readFile(new URL("../app/admin/contact/contact-editor.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/site-config.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(editor.includes("const MAX_SOCIAL_LINKS = 8"));
  assert.ok(editor.includes("current.social.length >= MAX_SOCIAL_LINKS"));
  assert.ok(editor.includes('social: [...current.social, { label: "", handle: "" }]'));
  assert.ok(editor.includes("current.social.filter((_, itemIndex) => itemIndex !== index)"));
  assert.ok(editor.includes("disabled={content.social.length >= MAX_SOCIAL_LINKS}"));
  assert.ok(editor.includes("添加平台账号"));
  assert.ok(editor.includes("删除平台账号"));
  assert.ok(editor.includes("普通账号"));
  assert.ok(editor.includes("HTTPS"));
  assert.ok(editor.includes("平台名称填写为 QQ"));

  const siteContentType = siteConfigSource.slice(
    siteConfigSource.indexOf("export type SiteContent"),
    siteConfigSource.indexOf("export const siteConfig"),
  );
  assert.ok(siteContentType.includes("contact: { wechat: string; email: string; note: string }"));
  assert.ok(siteContentType.includes("social: Array<{ label: string; handle: string }>"));
  assert.ok(!siteContentType.includes("qq:"));
  assert.ok(!siteContentType.includes("url:"));
});

test("polaroid contact rendering removes Email and generates QR locally only after disclosure", async () => {
  const [template, qrComponent] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/polaroid-field/social-qr-code.tsx", import.meta.url), "utf8"),
  ]);
  assert.ok(!template.includes("mailto:"));
  assert.ok(!template.includes("content.contact.email"));
  assert.ok(!template.includes("EMAIL /"));
  assert.ok(template.includes("findQqContact(socialItems)"));
  assert.ok(template.includes('onCopy(qqContact, "polaroid-qq")'));
  assert.ok(template.includes(".filter(({ handle }) => handle)"), "empty social handles do not render blank platform cards");
  assert.ok(template.includes("getSafeSocialUrl(item.handle)"));
  assert.ok(template.includes('<a href={href} target="_blank" rel="noopener noreferrer">'));
  assert.ok(template.includes("{href ? <SocialQrCode href={href} label={label} /> : null}"));
  assert.ok(template.includes(") : <span>{item.handle}</span>}"));

  assert.ok(qrComponent.includes("<details"));
  assert.ok(qrComponent.includes("onToggle={handleToggle}"));
  assert.ok(qrComponent.includes("if (!open"));
  assert.ok(qrComponent.includes('import("qrcode")'));
  assert.ok(qrComponent.includes("toDataURL(href"));
  assert.ok(qrComponent.includes("[href, open"));
  assert.ok(!/^import .*?["']qrcode["']/mu.test(qrComponent), "qrcode stays out of the initial module graph");
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|caches)\b/u.test(qrComponent));
  assert.ok(!qrComponent.includes("document.cookie"));
  assert.ok(!/https?:\/\//u.test(qrComponent), "QR generation does not call an external service");
  assert.ok(!qrComponent.includes("dangerouslySetInnerHTML"));
});

test("polaroid template exposes accessible Chinese view navigation on desktop and mobile", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url), "utf8"),
  ]);
  const navStart = template.indexOf('<nav aria-label="作品集页面导航">');
  const navEnd = template.indexOf("</nav>", navStart);
  assert.notEqual(navStart, -1);
  assert.notEqual(navEnd, -1);
  const nav = template.slice(navStart, navEnd);

  for (const [view, hash, label] of [
    ["field", "#polaroid-top", "作品"],
    ["packages", "#polaroid-packages", "拍摄套餐"],
    ["booking", "#polaroid-booking", "联系约拍"],
  ]) {
    assert.ok(nav.includes(`href="${hash}"`), `${label} keeps a same-route hash URL`);
    assert.ok(nav.includes(`>${label}</a>`), `${label} is visible in Chinese`);
    assert.ok(nav.includes(`activeView === "${view}"`), `${label} exposes its selected state`);
  }

  for (const [id, view] of [
    ["polaroid-top", "field"],
    ["polaroid-field", "field"],
    ["polaroid-packages", "packages"],
    ["polaroid-booking", "booking"],
  ]) {
    const sectionStart = template.indexOf(`id="${id}"`);
    assert.notEqual(sectionStart, -1, `expected section ${id}`);
    const sectionOpeningTag = template.slice(sectionStart, template.indexOf(">", sectionStart));
    assert.ok(sectionOpeningTag.includes(`data-polaroid-view="${view}"`));
    assert.ok(sectionOpeningTag.includes(`hidden={activeView !== "${view}"}`));
  }

  assert.ok(template.includes('window.history.pushState(null, "", hash)'));
  assert.ok(template.includes('window.addEventListener("hashchange", handleHistoryNavigation)'));
  assert.ok(template.includes('window.addEventListener("popstate", handleHistoryNavigation)'));
  assert.ok(template.includes('window.removeEventListener("hashchange", handleHistoryNavigation)'));
  assert.ok(template.includes('window.removeEventListener("popstate", handleHistoryNavigation)'));
  assert.ok(
    template.includes('className={`${styles.topbar} ${isPreview ? styles.previewTopbar : ""}`}'),
    "admin previews opt out of the sticky public header",
  );

  const desktopNav = parseDeclarations(extractBraceBlock(css, ".topbar nav"));
  const desktopLink = parseDeclarations(extractBraceBlock(css, ".topbar nav a"));
  const previewTopbar = parseDeclarations(extractBraceBlock(css, ".previewTopbar"));
  assert.equal(desktopNav.display, "flex");
  assert.ok(remValue(desktopLink["min-height"]) >= 2.75, "desktop links provide a 44px touch target");
  assert.ok(minimumClampRem(desktopLink["font-size"]) >= 1, "navigation text stays at least 16px");
  assert.equal(previewTopbar.position, "relative");
  assert.equal(previewTopbar.top, "auto");

  const mobileCss = extractBraceBlock(css, "@media (max-width: 800px)");
  const mobileNav = parseDeclarations(extractBraceBlock(mobileCss, ".topbar nav"));
  const mobileLink = parseDeclarations(extractBraceBlock(mobileCss, ".topbar nav a"));
  assert.equal(mobileNav.display, "grid");
  assert.ok(remValue(mobileLink["min-height"]) >= 2.75, "mobile links provide a 44px touch target");
  assert.ok(
    mobileLink["font-size"] === undefined || minimumClampRem(mobileLink["font-size"]) >= 1,
    "mobile navigation inherits or preserves the 16px text floor",
  );
});

test("polaroid field view anchors desktop context above the centered work and keeps a mobile fallback", async () => {
  const css = await fs.readFile(
    new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url),
    "utf8",
  );
  const hero = parseDeclarations(extractCssRule(css, ".hero"));
  const heroPadding = splitCssValues(hero.padding);
  const heroTitle = parseDeclarations(extractCssRule(css, ".heroTitle"));
  const heroCopy = parseDeclarations(extractCssRule(css, ".heroCopy"));
  assert.equal(hero.width, "100%", "desktop hero uses the full content width for opposing anchors");
  assert.equal(hero["align-items"], "start", "desktop hero context stays above the work");
  assert.equal(heroTitle["align-self"], "start");
  assert.equal(heroTitle["justify-self"], "start", "title anchors to the upper inline start");
  assert.equal(heroCopy["align-self"], "start");
  assert.equal(heroCopy["justify-self"], "end", "information card anchors to the upper inline end");
  assert.ok(maximumClampRem(hero["min-height"]) <= 28, "hero no longer occupies a full desktop viewport");
  assert.ok(maximumClampRem(heroPadding[0]) <= 2.5, "hero vertical padding stays compact");

  const field = parseDeclarations(extractCssRule(css, ".fieldSection"));
  const fieldPadding = splitCssValues(field["padding-block"]);
  assert.ok(maximumClampRem(fieldPadding[0]) <= 1.75, "field begins close to the hero");
  assert.ok(maximumClampRem(fieldPadding[1]) <= 5, "field keeps a bounded closing rhythm");

  const fieldHeading = parseDeclarations(extractCssRule(css, ".fieldSection .sectionHeading"));
  assert.ok(maximumClampRem(fieldHeading["margin-bottom"]) <= 1.1, "field heading stays close to the canvas");

  const heroSeal = parseDeclarations(extractCssRule(css, ".heroSeal", 1));
  assert.ok(maximumClampRem(heroSeal.width) <= 7, "desktop seal stays clear of the hero copy");
  assert.notEqual(heroSeal.top, "auto", "desktop seal uses the upper edge as its vertical anchor");
  assert.notEqual(heroSeal.right, "auto", "desktop seal remains anchored to the inline end");
  assert.equal(heroSeal.bottom, "auto");
  assert.equal(heroSeal["pointer-events"], "none");

  const mobileCss = extractBraceBlock(css, "@media (max-width: 800px)");
  const mobileHero = parseDeclarations(extractCssRule(mobileCss, ".hero"));
  const mobileHeroPadding = splitCssValues(mobileHero.padding).map(remValue);
  assert.equal(mobileHero["grid-template-columns"], "1fr", "mobile restores a readable single-column flow");
  assert.ok(mobileHeroPadding[0] <= 3 && mobileHeroPadding[2] <= 3.5);
  const mobileHeroSeal = parseDeclarations(extractCssRule(mobileCss, ".heroSeal"));
  assert.equal(mobileHeroSeal.display, "none", "mobile hero removes the overlapping seal");
  const mobileField = parseDeclarations(extractCssRule(mobileCss, ".fieldSection"));
  const mobileFieldPadding = splitCssValues(mobileField["padding-block"]).map(remValue);
  assert.ok(mobileFieldPadding[0] <= 2.5 && mobileFieldPadding[1] <= 3.5);

  const mobileCta = parseDeclarations(extractCssRule(mobileCss, ".mobileCta"));
  const fieldMobileCta = parseDeclarations(extractCssRule(
    mobileCss,
    '.shell[data-polaroid-active-view="field"] .mobileCta',
  ));
  assert.equal(mobileCta.display, "grid", "mobile CTA remains available in the contact flows");
  assert.equal(fieldMobileCta.display, "none", "field view does not cover the gallery with the mobile CTA");
});

test("polaroid package facts use only non-empty trust items and stay out of the field view", async () => {
  const template = await fs.readFile(
    new URL("../app/templates/polaroid-field/template.tsx", import.meta.url),
    "utf8",
  );
  const fieldStart = template.indexOf('id="polaroid-field"');
  const packageStart = template.indexOf('id="polaroid-packages"');
  const bookingStart = template.indexOf('id="polaroid-booking"');
  assert.ok(fieldStart >= 0 && packageStart > fieldStart && bookingStart > packageStart);
  const fieldSection = template.slice(fieldStart, packageStart);
  const packageSection = template.slice(packageStart, bookingStart);
  const packageNoteIndex = packageSection.indexOf("styles.packageNote");
  const factRowIndex = packageSection.indexOf("styles.factRow");
  assert.ok(!fieldSection.includes("styles.factRow"), "facts do not lengthen the field view");
  assert.notEqual(packageNoteIndex, -1, "package note remains present");
  assert.ok(factRowIndex > packageNoteIndex, "facts follow the package note");

  const sourceFile = ts.createSourceFile(
    "polaroid-field-template.tsx",
    template,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let trustFilter;
  let trustRender;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "trustItems"
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(sourceFile) === "content.trustItems.filter"
    ) {
      trustFilter = node.initializer.arguments[0];
    }
    if (
      ts.isConditionalExpression(node)
      && node.condition.getText(sourceFile).replaceAll(/\s/g, "") === "trustItems.length>0"
      && node.whenTrue.getText(sourceFile).includes("styles.factRow")
    ) {
      trustRender = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert.ok(trustFilter && ts.isArrowFunction(trustFilter), "trust items have an explicit filter");
  assert.ok(ts.isBinaryExpression(trustFilter.body));
  assert.equal(trustFilter.body.operatorToken.kind, ts.SyntaxKind.BarBarToken);
  assert.deepEqual(
    [trustFilter.body.left, trustFilter.body.right]
      .map((node) => node.getText(sourceFile))
      .sort(),
    ["label.trim()", "value.trim()"],
  );
  assert.ok(trustRender, "all-empty facts skip the entire row");
  assert.equal(trustRender.whenFalse.kind, ts.SyntaxKind.NullKeyword);
  assert.ok(trustRender.whenTrue.getText(sourceFile).includes("trustItems.map"));
  assert.ok(!trustRender.whenTrue.getText(sourceFile).includes("content.trustItems.map"));
});

test("polaroid header removes the fixed field note and suppresses blank availability", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url), "utf8"),
  ]);
  assert.ok(!template.includes("FIELD NOTE / 001—009"));
  assert.ok(!template.includes("styles.heroIndex"));
  assert.ok(!css.includes(".heroIndex"));

  const sourceFile = ts.createSourceFile(
    "polaroid-field-template.tsx",
    template,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let availabilityLabelName;
  const conditionalRenders = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isConditionalExpression(node.initializer)
      && node.initializer.condition.getText(sourceFile) === "isPreview"
      && node.initializer.whenTrue.getText(sourceFile) === '"TEMPLATE PREVIEW"'
      && ts.isCallExpression(node.initializer.whenFalse)
      && node.initializer.whenFalse.arguments.length === 0
      && node.initializer.whenFalse.expression.getText(sourceFile) === "content.profile.availability.trim"
    ) {
      availabilityLabelName = node.name.text;
    }
    if (
      ts.isConditionalExpression(node)
      && node.whenFalse.kind === ts.SyntaxKind.NullKeyword
      && node.whenTrue.getText(sourceFile).includes("<p>")
    ) {
      conditionalRenders.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert.ok(availabilityLabelName, "availability is trimmed from the existing profile field");
  const availabilityRender = conditionalRenders.find((node) => (
    node.condition.getText(sourceFile) === availabilityLabelName
    && node.whenTrue.getText(sourceFile).includes(availabilityLabelName)
  ));
  assert.ok(availabilityRender, "availability uses a conditional render");
  assert.equal(availabilityRender.condition.getText(sourceFile), availabilityLabelName);
  assert.equal(availabilityRender.whenFalse.kind, ts.SyntaxKind.NullKeyword);
  assert.ok(availabilityRender.whenTrue.getText(sourceFile).includes(availabilityLabelName));
});

test("template wiring preserves nine slots, keyboard access, FIT reset, mobile layout, and reduced motion", async () => {
  const [template, css, catalog] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
  ]);
  assert.match(catalog, /id: "polaroid-field"[\s\S]*photoSlots: 9/);
  assert.match(template, /buildPolaroidFieldLayout\(fieldSlots\.map/);
  assert.match(template, /data-field-layout="ratio-aware-v1"/);
  assert.match(template, /data-rotation=\{placement\.rotation\}/);
  assert.match(template, /data-layout-band=\{placement\.band\}/);
  assert.match(template, /new ResizeObserver\(scheduleRecompute\)/);
  assert.match(template, /tabIndex=\{desktopFieldEnabled \? 0 : undefined\}/);
  assert.match(template, /desktopFieldEnabled[\s\S]*九张拍立得作品画廊/);
  assert.match(template, /case "0":[\s\S]*case "Home":[\s\S]*fitToContent\(\)/);
  assert.match(template, /onClick=\{fitToContent\}[\s\S]*>FIT<\/button>/);
  assert.doesNotMatch(template, /resetView/);
  assert.match(css, /\.fieldCanvas \{[\s\S]*width: var\(--field-canvas-width[\s\S]*height: var\(--field-canvas-height/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*\.fieldCanvas \{[\s\S]*repeat\(auto-fit, minmax\(min\(100%, 14rem\), 1fr\)\)[\s\S]*transform: none !important;/);
  assert.doesNotMatch(css, /\.polaroid\[data-polaroid=/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ready \.polaroid/);
  assert.match(css, /@media \(max-width: 800px\) and \(prefers-reduced-motion: reduce\)[\s\S]*transform: none/);
});
