import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

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

test("all eleven contact surfaces use exactly one shared platform account renderer", async () => {
  for (const templateId of templateIds) {
    const source = await fs.readFile(`app/templates/${templateId}/template.tsx`, "utf8");
    assert.equal((source.match(/import PlatformAccounts from "\.\.\/shared\/platform-accounts";/g) ?? []).length, 1, templateId);
    assert.equal((source.match(/<PlatformAccounts accounts=\{content\.social\}/g) ?? []).length, 1, templateId);
    assert.doesNotMatch(source, /content\.social\.map|SocialQrCode|toDataURL|data:image/i, templateId);
  }
});

test("shared platform account cards preserve links, accessibility, and natural image ratio", async () => {
  const [component, styles] = await Promise.all([
    fs.readFile("app/templates/shared/platform-accounts.tsx", "utf8"),
    fs.readFile("app/templates/shared/platform-accounts.module.css", "utf8"),
  ]);
  assert.match(component, /getSafeSocialUrl/);
  assert.match(component, /getPlatformQrAssetPath/);
  assert.doesNotMatch(component, /<details|<summary/);
  assert.match(component, /<div className=\{styles\.shareCard\} role="group" aria-label=\{`\$\{account\.label\}分享卡片`\}>/);
  assert.match(component, /已上传的分享卡片会在下方完整显示/);
  assert.match(component, /loading="lazy"/);
  assert.match(component, /decoding="async"/);
  assert.match(component, /aria-label=\{`打开\$\{account\.label\}分享卡片原图`\}/);
  assert.match(styles, /\.profileLink,\s*\.fullImageLink\s*\{\s*min-height:\s*44px;/s);
  assert.doesNotMatch(styles, /summary|details-marker/);
  assert.match(styles, /height:\s*auto;/);
  assert.match(styles, /max-height:\s*min\(78svh,\s*48rem\);/);
  assert.match(styles, /object-fit:\s*contain;/);
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
