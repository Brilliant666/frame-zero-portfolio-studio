import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

// Execute repository TSX with React's real server renderer. CSS modules only
// provide class names; the unrelated, browser-only collection canvas is omitted.
// Neither template contact branches nor PlatformAccounts are replaced by fixtures.
function contactRenderer() {
  const modules = new Map();
  let sharedCalls = 0;
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    const source = readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (id) => {
      if (id.endsWith(".css")) return { default: new Proxy({}, { get: (_, name) => String(name) }) };
      if (id === "./collection-experience") return { default: () => null };
      if (!id.startsWith(".")) return require(id);
      const base = path.resolve(path.dirname(filename), id);
      const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`].find(existsSync);
      assert.ok(resolved, `Cannot resolve ${id} from ${filename}`);
      if (resolved.endsWith(".json")) return JSON.parse(readFileSync(resolved, "utf8"));
      const imported = load(resolved);
      if (id === "../shared/platform-accounts") {
        return { ...imported, default: (props) => {
          sharedCalls += 1;
          return createElement(imported.default, props);
        } };
      }
      return imported;
    };
    vm.runInNewContext(compiled, {
      module: loadedModule, exports: loadedModule.exports, require: localRequire,
      process: { env: { NODE_ENV: "development" } },
      URL, structuredClone,
    }, { filename });
    return loadedModule.exports;
  }
  return {
    render(templateId, collectionWorkspace, overrides = {}, propsOverrides = {}) {
      sharedCalls = 0;
      const Template = load(path.resolve(`app/templates/${templateId}/template.tsx`)).default;
      const content = {
        profile: { brand: "TEST", mark: "T", photographer: "测试摄影师", role: "摄影", city: "测试城市", availability: "可约", intro: "测试简介" },
        hero: { eyebrow: "测试", title: "测试作品", services: "摄影" },
        trustItems: [], works: [], templateWorks: {}, packages: [], bookingFields: [],
        contact: { wechat: "fixture", email: "fixture@portfolio.example", note: "测试联系" },
        statement: { eyebrow: "测试", lineOne: "预约", lineTwo: "摄影" },
        social: [{ label: "测试平台", handle: "https://example.com/profile" }],
        ...overrides,
      };
      const html = renderToStaticMarkup(createElement(Template, {
        templateId, content, works: [], packages: [], bookingTemplate: "测试预约清单",
        booted: true, copiedKey: null, isPreview: true,
        onCopy: async () => {}, onOpenWork: () => {}, collectionWorkspace, ...propsOverrides,
      }));
      return { html, sharedCalls };
    },
  };
}

const templateIds = [
  "archive-os",
  "character-select",
  "cinematic-light",
  "editorial-duet",
  "film-rail",
  "manga-panels",
  "museum-depth",
  "neon-hud",
  "orbital-portal",
  "polaroid-field",
  "prism-liquid",
];

test("all eleven templates omit empty direct contact actions while retaining independent social contacts", () => {
  const renderer = contactRenderer();
  for (const templateId of templateIds) {
    for (const empty of ["", " \t "]) {
      const { html, sharedCalls } = renderer.render(templateId, undefined, {
        contact: { wechat: empty, email: empty, note: "保留联系说明" },
      });
      assert.doesNotMatch(html, /href="mailto:[^"]*"/, `${templateId}: blank email must not open a mail composer`);
      const buttons = html.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
      assert.ok(buttons.every(button => !/WECHAT|EMAIL|复制微信号/i.test(button)), `${templateId}: blank direct contacts must not offer copy actions`);
      assert.equal(sharedCalls, 1, `${templateId}: independent social rendering remains mounted`);
      assert.match(html, /href="https:\/\/example.com\/profile"/, `${templateId}: social URL remains usable`);
    }
    const filled = renderer.render(templateId, undefined, {
      contact: { wechat: "available_wechat", email: "available@portfolio.example", note: "" },
    }).html;
    assert.match(filled, /<button\b[^>]*>[\s\S]*?available_wechat[\s\S]*?<\/button>/, `${templateId}: nonempty WeChat copy action remains`);
    if (templateId === "manga-panels") assert.match(filled, /<button\b[^>]*>[\s\S]*?available@portfolio\.example[\s\S]*?<\/button>/, "manga retains its intentional email-copy action");
    else assert.match(filled, /href="mailto:available@portfolio\.example"/, `${templateId}: nonempty email keeps its original link`);
    const cardOnly = renderer.render(templateId, undefined, {
      contact: { wechat: "", email: "", note: "" },
      social: [{ label: "独立联系卡", handle: "", qrAssetId: "b".repeat(64) }],
    }).html;
    assert.match(cardOnly, /aria-label="平台账号与分享卡片"/, `${templateId}: optional card region survives without direct contacts`);
    assert.match(cardOnly, /独立联系卡/);
  }
});

test("all eleven contact surfaces use exactly one shared platform account renderer", async () => {
  const renderer = contactRenderer();
  for (const templateId of templateIds) {
    const source = await fs.readFile(`app/templates/${templateId}/template.tsx`, "utf8");
    assert.equal((source.match(/import PlatformAccounts from "\.\.\/shared\/platform-accounts";/g) ?? []).length, 1, templateId);
    assert.doesNotMatch(source, /content\.social\.map|SocialQrCode|toDataURL|data:image/i, templateId);
    const { html, sharedCalls } = renderer.render(templateId);
    assert.equal(sharedCalls, 1, `${templateId}: shared component executions`);
    assert.equal((html.match(/aria-label="平台账号与分享卡片"/g) ?? []).length, 1, `${templateId}: rendered account regions, including hidden content`);
    assert.equal((html.match(/href="https:\/\/example.com\/profile"/g) ?? []).length, 1, `${templateId}: account link`);
  }
});

test("basic polaroid retains shared account cards while premium renders its independent four contact channels", () => {
  const renderer = contactRenderer();
  const content = {
    contact: { wechat: "premium_wechat", email: "legacy@portfolio.example", note: "保留联系说明" },
    social: [
      { label: "旧平台", handle: "https://example.com/profile", qrAssetId: "a".repeat(64) },
      { label: "小红书", handle: "我的主页 https://xhslink.cn/o/fixture", qrAssetId: "b".repeat(64) },
      { label: "QQ", handle: "00123456789", qrAssetId: "c".repeat(64) },
      { label: "抖音", handle: "查看主页 https://v.douyin.com/fixture/", qrAssetId: "d".repeat(64) },
    ],
  };
  const before = structuredClone(content);
  const legacy = renderer.render("polaroid-field", undefined, content);
  const preview = renderer.render("polaroid-field", {
    collections: [], Navigation: () => createElement("nav", { "aria-label": "预览导航" }),
  }, content);
  assert.equal(legacy.sharedCalls, 1);
  assert.equal((legacy.html.match(/aria-label="平台账号与分享卡片"/g) ?? []).length, 1);
  assert.equal((legacy.html.match(/href="https:\/\/example.com\/profile"/g) ?? []).length, 1);
  assert.match(legacy.html, /href="mailto:legacy@portfolio\.example"/);
  assert.match(legacy.html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(legacy.html, /<footer\b[^>]*class="footer"/);
  assert.doesNotMatch(legacy.html, /aria-label="预览导航"/);
  assert.doesNotMatch(legacy.html, /data-polaroid-contact-channels/);

  assert.equal(preview.sharedCalls, 0, "premium never mounts the shared QR card region, including hidden content");
  assert.equal((preview.html.match(/data-polaroid-contact-channels="true"/g) ?? []).length, 1);
  const groups = [...preview.html.matchAll(/<section\b[^>]*aria-label="(联系方式|平台账号)"[^>]*>([\s\S]*?)<\/section>/g)];
  assert.deepEqual(groups.map(match => match[1]), ["联系方式", "平台账号"]);
  const actions = groups.flatMap(group => [...group[2].matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)]);
  assert.deepEqual(actions.map(match => match[2].match(/aria-label="([^"]+)"/)?.[1]), [
    "复制QQ账号", "复制Wechat账号", "查看抖音主页（在新标签页打开）", "查看小红书主页（在新标签页打开）",
  ]);
  assert.deepEqual(actions.map(match => match[1]), ["button", "button", "a", "a"]);
  assert.match(actions[0][3], /<strong>00123456789<\/strong>/);
  assert.match(actions[1][3], /<strong>premium_wechat<\/strong>/);
  for (const [index, href] of ["https://v.douyin.com/fixture/", "https://xhslink.cn/o/fixture"].entries()) {
    assert.ok(actions[index + 2][2].includes(`href="${href}"`));
    assert.match(actions[index + 2][2], /target="_blank" rel="noopener noreferrer"/);
  }
  assert.doesNotMatch(preview.html, /平台账号与分享卡片|旧平台|example\.com\/profile|legacy@portfolio\.example|mailto:|\/api\/platform-qr|分享卡片原图/);
  assert.ok(groups.every(group => !/<img\b|<svg\b/.test(group[2])), "premium contact groups contain no QR images or generated codes");
  assert.doesNotMatch(preview.html, /<footer\b/);
  assert.match(preview.html, /aria-label="预览导航"/);
  assert.deepEqual(content, before, "presentation never removes legacy email or saved QR references from content");
});

test("premium polaroid omits blank channels and treats unsafe platform values as copyable text", () => {
  const renderer = contactRenderer();
  const workspace = { collections: [], Navigation: () => createElement("nav") };
  for (const empty of ["", " \t "]) {
    const blank = renderer.render("polaroid-field", workspace, {
      contact: { wechat: empty, email: "legacy@portfolio.example", note: "" },
      social: [
        ...["QQ", "抖音", "小红书"].map(label => ({ label, handle: empty, qrAssetId: "a".repeat(64) })),
        { label: "旧平台", handle: "https://example.com/profile", qrAssetId: "b".repeat(64) },
      ],
    });
    assert.equal(blank.sharedCalls, 0);
    assert.doesNotMatch(blank.html, /aria-label="(?:联系方式|平台账号|复制QQ账号|复制Wechat账号)"|mailto:|legacy@portfolio\.example|example\.com\/profile|平台账号与分享卡片/);
  }
  const platformsOnly = renderer.render("polaroid-field", workspace, {
    contact: { wechat: "", email: "", note: "" },
    social: [{ label: "抖音", handle: "https://example.com/profile" }],
  }).html;
  assert.doesNotMatch(platformsOnly, /aria-label="联系方式"|复制QQ账号|复制Wechat账号/);
  assert.match(platformsOnly, /href="https:\/\/example.com\/profile" target="_blank" rel="noopener noreferrer"/);
  for (const value of ["javascript:alert(1)", "http://example.invalid", "https://user:password@example.invalid", "<img src=x onerror=alert(1)>"]) {
    const { html } = renderer.render("polaroid-field", workspace, {
      contact: { wechat: "", email: "", note: "" }, social: [{ label: "抖音", handle: value }],
    });
    const group = html.match(/<section\b[^>]*aria-label="平台账号"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(group);
    assert.match(group, /<button\b[^>]*aria-label="复制抖音账号"/);
    assert.doesNotMatch(group, /<a\b|<img\b|\shref=/);
    const escaped = renderToStaticMarkup(createElement("strong", null, value));
    assert.ok(group.includes(escaped), "unsafe values remain intact and HTML-escaped");
  }
});

test("shared platform account cards preserve links, accessibility, natural ratio, and fail-safe rendering", async () => {
  const [component, availability, styles] = await Promise.all([
    fs.readFile("app/templates/shared/platform-accounts.tsx", "utf8"),
    fs.readFile("app/templates/shared/platform-card-availability.ts", "utf8"),
    fs.readFile("app/templates/shared/platform-accounts.module.css", "utf8"),
  ]);
  assert.match(component, /"use client"/);
  assert.match(component, /probePlatformCardAvailability/);
  assert.match(component, /useEffect/);
  assert.match(component, /if \(status !== "available"\) return null/);
  assert.match(component, /onError=\{\(\) => setStatus\("unavailable"\)\}/);
  assert.match(component, /\{account\.qrUrl \? \([\s\S]*<PlatformShareCard/);
  assert.doesNotMatch(component, /setInterval|setTimeout/);
  assert.match(availability, /method:\s*"HEAD"/);
  assert.match(availability, /cache:\s*"no-store"/);
  assert.match(availability, /response\.ok && \(contentType === "image\/png"/);
  // Site JPEG/WebP capability and legacy PNG-only behavior are exercised by
  // platform-card-availability.test.mjs, rather than coupling to regex syntax.
  assert.match(availability, /catch\s*\{\s*return false;/s);
  assert.match(component, /getSafeSocialUrl/);
  assert.match(component, /getPlatformQrAssetPath/);
  assert.match(component, /layout\?: "grid" \| "stack"/);
  assert.match(component, /data-layout=\{layout\}/);
  assert.doesNotMatch(component, /<details|<summary/);
  assert.match(component, /<div className=\{styles\.shareCard\} role="group" aria-label=\{`\$\{label\}分享卡片`\}>/);
  assert.match(component, /已上传的分享卡片会在下方完整显示/);
  assert.match(component, /loading="lazy"/);
  assert.match(component, /decoding="async"/);
  assert.match(component, /aria-label=\{`打开\$\{label\}分享卡片原图`\}/);
  assert.match(styles, /\.profileLink,\s*\.fullImageLink\s*\{\s*min-height:\s*44px;/s);
  assert.doesNotMatch(styles, /summary|details-marker/);
  assert.match(styles, /height:\s*auto;/);
  assert.match(styles, /max-height:\s*min\(78svh,\s*48rem\);/);
  assert.match(styles, /object-fit:\s*contain;/);
  assert.match(styles, /\.accounts\[data-layout="stack"\] \.grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s);
  assert.match(styles, /overflow-wrap:\s*anywhere;/);
  assert.match(styles, /@media \(max-width:\s*640px\)/);
});

test("template contact styles do not override shared platform account typography", async () => {
  const [neonStyles, museumStyles] = await Promise.all([
    fs.readFile("app/templates/neon-hud/template.module.css", "utf8"),
    fs.readFile("app/templates/museum-depth/template.module.css", "utf8"),
  ]);
  assert.doesNotMatch(neonStyles, /\.contactPanel strong/);
  assert.match(neonStyles, /\.contactPanel > button strong,\s*\.contactPanel > a strong/);
  assert.doesNotMatch(museumStyles, /\.visitCopy strong/);
  assert.match(museumStyles, /\.visitCopy > button strong,\.visitCopy > a strong/);
});

test("manga keeps contact and booking on the left while showing uploaded cards on the right", async () => {
  const [template, styles] = await Promise.all([
    fs.readFile("app/templates/manga-panels/template.tsx", "utf8"),
    fs.readFile("app/templates/manga-panels/manga-panels.module.css", "utf8"),
  ]);
  const bookingStart = template.indexOf('<div className={styles.bookingGrid}>');
  const bookingEnd = template.indexOf('<footer className={styles.footer}>', bookingStart);
  const booking = template.slice(bookingStart, bookingEnd);

  assert.notEqual(bookingStart, -1);
  assert.notEqual(bookingEnd, -1);
  assert.ok(booking.indexOf('className={styles.contactPanel}') < booking.indexOf('className={styles.requestPanel}'));
  assert.ok(booking.indexOf('className={styles.requestPanel}') < booking.indexOf('className={styles.platformPanel}'));
  assert.match(booking, /<aside className=\{styles\.platformPanel\} aria-label="平台账号与二维码">/);
  assert.match(booking, /<PlatformAccounts accounts=\{content\.social\} layout="stack" tone="light" \/>/);

  assert.match(booking, /onClick=\{\(\) => void onCopy\(content\.contact\.email, "manga-email"\)\}/);
  assert.match(booking, /<strong>\{content\.contact\.email\}<\/strong>/);
  assert.match(booking, /copiedKey === "manga-email" \? "已复制 ✓" : "复制 ↗"/);
  assert.doesNotMatch(booking, /mailto:\$\{content\.contact\.email\}|写信/);

  assert.match(styles, /grid-template-areas:\s*"contact platform"\s*"request platform";/s);
  assert.match(styles, /\.contactPanel\s*\{[^}]*grid-area:\s*contact;/s);
  assert.match(styles, /\.requestPanel\s*\{[^}]*grid-area:\s*request;/s);
  assert.match(styles, /\.platformPanel\s*\{[^}]*grid-area:\s*platform;/s);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*grid-template-areas:\s*"contact"\s*"request"\s*"platform";/s);
});

test("Admin treats each uploaded QR as an explicit saved row reference", async () => {
  const [editor, attachment, client, siteConfig] = await Promise.all([
    fs.readFile("app/admin/contact/contact-editor.tsx", "utf8"),
    fs.readFile("app/admin/contact/platform-qr-attachment.ts", "utf8"),
    fs.readFile("app/admin/contact/platform-qr-client.ts", "utf8"),
    fs.readFile("app/site-config.ts", "utf8"),
  ]);
  assert.match(editor, /type="file"/);
  assert.match(editor, /aria-label=\{`\$\{item\.label/);
  assert.match(editor, /上传一张二维码图片/);
  assert.match(editor, /不再根据链接自动生成二维码/);
  assert.match(attachment, /qrAssetId:\s*upload\.assetId/);
  assert.match(editor, /delete withoutQr\.qrAssetId/);
  assert.match(editor, /从主页移除/);
  assert.match(editor, /本机私有原文件会保留/);
  assert.match(editor, /保存后主页生效/);
  assert.match(editor, /completePlatformQrUpload/);
  assert.match(attachment, /entry\.label === expected\.label/);
  assert.match(attachment, /entry\.handle === expected\.handle/);
  assert.match(attachment, /entry\.qrAssetId === expected\.qrAssetId/);
  assert.match(client, /application\/octet-stream/);
  assert.doesNotMatch(client, /FileReader|data:image|base64/i);
  assert.match(siteConfig, /qrAssetId\?: string/);
  assert.match(siteConfig, /normalizePlatformQrAssetId\(item\?\.qrAssetId\)/);
  await assert.rejects(fs.stat("app/templates/polaroid-field/social-qr-code.tsx"), { code: "ENOENT" });
});


test("basic main titles render the author's title in the actual heading", () => {
  const renderer = contactRenderer();
  for (const templateId of ["prism-liquid", "orbital-portal", "museum-depth", "polaroid-field"]) {
    const { html } = renderer.render(templateId, undefined, {
      hero: { eyebrow: "作者简介", title: "林间人像与城市光影", services: "人像摄影" },
    });
    assert.match(html, /<h1[^>]*>(?:<em>)?林间人像与城市光影/, templateId);
  }
});

test("basic metadata does not invent capture settings or a storage limit", () => {
  const renderer = contactRenderer();
  for (const templateId of ["cinematic-light", "neon-hud", "archive-os", "film-rail", "museum-depth"]) {
    const { html } = renderer.render(templateId);
    assert.doesNotMatch(html, /ISO 400|4K [/] 60FPS|KODAK PORTRA|40 CAPACITY|ACQ\. 2026|FRAME[/][/]ZERO/, templateId);
  }
});

test("museum quick index only links to real works and each target is focusable", () => {
  const renderer = contactRenderer();
  const works = Array.from({ length: 3 }, (_, index) => ({
    code: "review-" + index, title: "作品 " + index, subtitle: "匿名验证", category: "人像",
    preview: "/review-preview.webp", image: "/review-full.webp", position: "50% 50%",
    previewWidth: 1200, previewHeight: 800, fullWidth: 2200, fullHeight: 1467,
  }));
  const { html } = renderer.render("museum-depth", undefined, {}, { works });
  const index = html.match(/<nav class="exhibitIndex"[^>]*>(.*?)<\/nav>/)?.[1];
  assert.ok(index);
  const targets = [...index.matchAll(/href="#(museum-frame-\d+)"/g)].map((match) => match[1]);
  assert.ok(targets.length > 0);
  for (const target of targets) assert.ok(html.includes('id="' + target + '" tabindex="-1"'));
  assert.doesNotMatch(index, /PENDING|GALLERY/);
});
