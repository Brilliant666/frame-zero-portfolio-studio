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
    "../app/social-links.ts",
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

test("polaroid social links extract exactly one safe HTTPS URL from platform share text", async (t) => {
  const { getSafeSocialUrl } = await importSocialLinksModule(t);

  for (const [shareText, expected] of [
    [
      "  https://portfolio.example/profile?q=works#gallery  ",
      "https://portfolio.example/profile?q=works#gallery",
    ],
    [
      "小红书分享：角色正片 https://redbook-share.example/discovery/item/demo-42?source=share，复制后打开 App。",
      "https://redbook-share.example/discovery/item/demo-42?source=share",
    ],
    [
      "抖音分享（https://video-share.example/AbC123/）。长按复制此消息。",
      "https://video-share.example/AbC123/",
    ],
    [
      "第一行是分享说明\nhttps://portfolio.example/creator/demo\n最后一行是账号提示",
      "https://portfolio.example/creator/demo",
    ],
  ]) assert.equal(getSafeSocialUrl(shareText), expected, shareText);

  for (const unsafe of [
    "",
    "小红书号：FRAMEZERO_COS",
    "@FRAMEZERO_STUDIO",
    "portfolio.example/profile",
    "http://portfolio.example/profile",
    "mailto:owner@framezero.example",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "//portfolio.example/profile",
    "https://owner@portfolio.example/profile",
    "https://owner:secret@portfolio.example/profile",
    "https://",
    "两个主页 https://one.example/profile 和 https://two.example/profile",
    "重复链接 https://repeat.example/profile https://repeat.example/profile",
    `https://portfolio.example/${"a".repeat(2_100)}`,
  ]) assert.equal(getSafeSocialUrl(unsafe), null, unsafe);
});

test("contact Admin keeps WeChat, Email, and note while normalizing safe platform share links", async () => {
  const [editor, siteConfigSource, adminStyles] = await Promise.all([
    fs.readFile(new URL("../app/admin/contact/contact-editor.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/site-config.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/admin/admin-v2.module.css", import.meta.url), "utf8"),
  ]);
  const contactStart = editor.indexOf('<FormGroup title="联系方式"');
  const platformStart = editor.indexOf("title=\"平台账号与二维码\"");
  assert.notEqual(contactStart, -1);
  assert.notEqual(platformStart, -1);
  assert.ok(contactStart < platformStart, "the shared contact fields stay in the primary Admin section");
  const contactFields = editor.slice(contactStart, platformStart);
  assert.ok(contactFields.includes('label="微信号"'));
  assert.ok(contactFields.includes("content.contact.wechat"));
  assert.ok(contactFields.includes('label="邮箱"'));
  assert.ok(contactFields.includes("content.contact.email"));
  assert.ok(contactFields.includes('label="联系区说明"'));
  assert.ok(contactFields.includes("content.contact.note"));
  assert.ok(!editor.includes('label="QQ号"'));
  assert.ok(!editor.includes("findQqContact"));
  assert.ok(!editor.includes("isQqSocialEntry"));
  assert.ok(!editor.includes("updateQqContact"));
  assert.ok(!editor.includes("<details"), "shared contact fields are not hidden behind template-specific UI");
  assert.ok(!editor.includes("其他模板兼容内容"));

  assert.ok(editor.includes("const MAX_SOCIAL_LINKS = 8"));
  assert.ok(editor.includes("current.social.length >= MAX_SOCIAL_LINKS"));
  assert.ok(editor.includes('social: [...current.social, { label: "", handle: "" }]'));
  assert.ok(editor.includes("current.social.filter((_, itemIndex) => itemIndex !== index)"));
  assert.ok(editor.includes("disabled={content.social.length >= MAX_SOCIAL_LINKS}"));
  assert.ok(editor.includes("添加平台账号"));
  assert.ok(editor.includes("删除平台账号"));
  assert.ok(editor.includes("普通账号"));
  assert.ok(editor.includes("HTTPS"));
  assert.ok(editor.includes("分享"), "the editor explains that a whole platform share message is accepted");
  assert.ok(editor.includes("getSafeSocialUrl(value)"));
  assert.ok(editor.includes("onBlur={(value) => normalizeSocialHandle(index, value)}"), "recognized share text is normalized after editing");
  assert.ok(editor.includes("`${styles.pairGrid} ${styles.socialGrid}`"), "social entries use the dedicated full-width row layout");
  assert.match(
    adminStyles,
    /\.pairRow\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[^}]*align-items:\s*start[^}]*\}/,
    "platform and account fields align at the top even when only the account field has help text",
  );
  assert.match(adminStyles, /\.socialGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*\}/);
  assert.match(adminStyles, /\.rowActions\.socialRowActions\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*\}/);
  assert.match(
    extractBraceBlock(adminStyles, "@media (max-width: 760px)"),
    /\.pairRow\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*\}/,
    "narrow screens stack platform and account fields without creating an implicit action column",
  );

  const siteContentType = siteConfigSource.slice(
    siteConfigSource.indexOf("export type SiteContent"),
    siteConfigSource.indexOf("export const siteConfig"),
  );
  assert.ok(siteContentType.includes("contact: { wechat: string; email: string; note: string }"));
  assert.ok(siteContentType.includes("social: Array<{ label: string; handle: string; qrAssetId?: string }>"));
  assert.ok(!siteContentType.includes("qq:"));
  assert.ok(!siteContentType.includes("url:"));
});

test("polaroid contact renders WeChat and Email while delegating uploaded cards to the shared renderer", async () => {
  const [template, platformAccounts] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/shared/platform-accounts.tsx", import.meta.url), "utf8"),
  ]);
  assert.ok(template.includes('onCopy(content.contact.wechat, "polaroid-wechat")'));
  assert.ok(template.includes("mailto:${content.contact.email}"));
  assert.ok(template.includes("content.contact.note"));
  assert.ok(template.includes("styles.contactNote"));
  assert.ok(!template.includes("findQqContact"));
  assert.ok(!template.includes("isQqSocialEntry"));
  assert.ok(!template.includes("updateQqContact"));
  assert.ok(!template.includes("polaroid-qq"));
  assert.ok(!template.includes("QQ / 点击复制"));
  assert.ok(template.includes('import PlatformAccounts from "../shared/platform-accounts"'));
  assert.ok(template.includes('<PlatformAccounts accounts={content.social} tone="dark" />'));
  assert.ok(!template.includes("content.social.map"));
  assert.ok(!template.includes("SocialQrCode"));

  assert.ok(platformAccounts.includes("getSafeSocialUrl"));
  assert.ok(platformAccounts.includes("getPlatformQrAssetPath"));
  assert.ok(platformAccounts.includes("if (!handle && !qrUrl) return []"));
  assert.ok(platformAccounts.includes("<details"));
  assert.ok(platformAccounts.includes("<summary>查看{account.label}分享卡片</summary>"));
  assert.ok(platformAccounts.includes('loading="lazy"'));
  assert.ok(platformAccounts.includes('decoding="async"'));
  assert.ok(platformAccounts.includes('rel="noopener noreferrer"'));
  assert.ok(!platformAccounts.includes("toDataURL"));
  assert.ok(!platformAccounts.includes("data:image"));
  assert.ok(!platformAccounts.includes("dangerouslySetInnerHTML"));
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

test("polaroid gateway leaves the profile card and becomes a responsive central field entrance", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url), "utf8"),
  ]);
  const sourceFile = ts.createSourceFile(
    "polaroid-field-template.tsx",
    template,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const openingElement = (node) => (
    ts.isJsxElement(node) ? node.openingElement : node
  );
  const attribute = (node, name) => openingElement(node).attributes.properties.find((item) => (
    ts.isJsxAttribute(item) && item.name.getText(sourceFile) === name
  ));
  const attributeValue = (node, name) => {
    const item = attribute(node, name);
    if (!item?.initializer) return undefined;
    if (ts.isStringLiteral(item.initializer)) return item.initializer.text;
    if (ts.isJsxExpression(item.initializer)) return item.initializer.expression?.getText(sourceFile);
    return item.initializer.getText(sourceFile);
  };
  const tagName = (node) => openingElement(node).tagName.getText(sourceFile);
  const directVisibleText = (node) => node.children
    .filter(ts.isJsxText)
    .map((child) => child.text)
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();

  let hero;
  const matchingGateways = [];
  function visit(node) {
    if (
      ts.isJsxElement(node)
      && tagName(node) === "section"
      && attributeValue(node, "id") === "polaroid-top"
    ) hero = node;
    if (
      ts.isJsxElement(node)
      && tagName(node) === "a"
      && directVisibleText(node) === "进入影像星野"
    ) matchingGateways.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert.ok(hero, "expected the field hero section");
  assert.equal(matchingGateways.length, 1, "the field entrance has one visible gateway label");
  const heroChildren = hero.children.filter((node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node));
  assert.deepEqual(
    heroChildren.map((node) => attributeValue(node, "className")),
    ["styles.heroTitle", "styles.heroCopy", "styles.heroOrbitTrack", "styles.heroGateway", "styles.heroSeal"],
    "mobile source order reads title, profile context, then the field entrance",
  );

  const heroCopy = heroChildren[1];
  let heroCopyLinks = 0;
  function countHeroCopyLinks(node) {
    if (ts.isJsxElement(node) && tagName(node) === "a") heroCopyLinks += 1;
    ts.forEachChild(node, countHeroCopyLinks);
  }
  countHeroCopyLinks(heroCopy);
  assert.equal(heroCopyLinks, 0, "the profile card contains context rather than the field action");

  const orbitTrack = heroChildren[2];
  assert.equal(attributeValue(orbitTrack, "aria-hidden"), "true", "the orbit rail stays decorative");

  const gateway = matchingGateways[0];
  assert.equal(attributeValue(gateway, "className"), "styles.heroGateway");
  assert.equal(attributeValue(gateway, "href"), "#polaroid-field");
  const onClick = attribute(gateway, "onClick");
  assert.ok(onClick?.initializer && ts.isJsxExpression(onClick.initializer));
  assert.ok(onClick.initializer.expression && ts.isArrowFunction(onClick.initializer.expression));
  const handlerCall = onClick.initializer.expression.body;
  assert.ok(ts.isCallExpression(handlerCall));
  assert.equal(handlerCall.expression.getText(sourceFile), "handleViewLink");
  assert.deepEqual(
    handlerCall.arguments.map((argument) => argument.getText(sourceFile)),
    ["event", '"field"', '"#polaroid-field"', "true"],
    "the relocated gateway preserves same-view hash navigation and focus",
  );
  const gatewayMarker = gateway.children.find((node) => ts.isJsxElement(node) && tagName(node) === "b");
  assert.ok(gatewayMarker);
  assert.equal(attributeValue(gatewayMarker, "aria-hidden"), "true", "the arrow does not duplicate the link name");

  const desktopTrack = parseDeclarations(extractCssRule(css, ".heroOrbitTrack"));
  const desktopGuide = parseDeclarations(extractCssRule(css, ".heroOrbitTrack::after"));
  const desktopGateway = parseDeclarations(extractCssRule(css, ".heroGateway"));
  const gatewayFocus = parseDeclarations(extractCssRule(css, ".heroGateway:focus-visible"));
  assert.equal(desktopTrack.position, "absolute");
  assert.equal(desktopTrack["pointer-events"], "none");
  assert.ok(desktopTrack["border-top"], "desktop orbit rail has a visible connection line");
  assert.equal(desktopGuide.position, "absolute");
  assert.ok(desktopGuide.height && desktopGuide.background, "orbit rail includes a vertical guide toward the work");
  assert.equal(desktopGateway.position, "absolute");
  assert.notEqual(desktopGateway.top, "auto");
  assert.equal(desktopGateway.left, "50%", "desktop gateway uses the hero's horizontal center line");
  assert.match(desktopGateway.transform, /translate\(\s*-50%\s*,/u);
  assert.ok(remValue(desktopGateway["min-height"]) >= 2.75, "gateway preserves a 44px pointer target");
  assert.ok(gatewayFocus.outline && gatewayFocus.outline !== "none", "gateway keeps a visible keyboard focus style");

  const mobileCss = extractBraceBlock(css, "@media (max-width: 800px)");
  const mobileTrack = parseDeclarations(extractCssRule(mobileCss, ".heroOrbitTrack"));
  const mobileGateway = parseDeclarations(extractCssRule(mobileCss, ".heroGateway"));
  assert.equal(mobileTrack.display, "none", "mobile removes the decorative desktop rail");
  assert.equal(mobileGateway.position, "relative");
  assert.equal(mobileGateway.top, "auto");
  assert.equal(mobileGateway.left, "auto");
  assert.equal(mobileGateway.width, "100%");
  assert.equal(mobileGateway.transform, "none", "mobile gateway returns to normal single-column flow");
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
