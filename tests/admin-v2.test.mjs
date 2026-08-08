import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const ADMIN_SECTIONS = ["template", "profile", "packages", "layout", "contact", "advanced"];

async function source(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

async function importNavigation(t) {
  const input = await source("app/admin/admin-navigation.ts");
  const output = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "admin-navigation.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-admin-nav-"));
  const modulePath = path.join(directory, "admin-navigation.mjs");
  await fs.writeFile(modulePath, output, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

test("Admin V2 freezes six task routes and a template default", async (t) => {
  const { ADMIN_SECTIONS: sections, getAdminSection } = await importNavigation(t);
  assert.deepEqual(sections.map(({ id, href }) => ({ id, href })), ADMIN_SECTIONS.map((id) => ({
    id,
    href: `/admin/${id}`,
  })));
  assert.equal(getAdminSection("/admin/contact").id, "contact");
  assert.equal(getAdminSection("/admin/unknown").id, "template");

  const adminPage = await source("app/admin/page.tsx");
  assert.match(adminPage, /redirect\("\/admin\/template"\)/);
});

test("every Admin route renders one dedicated editor instead of the legacy long form", async () => {
  for (const section of ADMIN_SECTIONS) {
    const page = await source(`app/admin/${section}/page.tsx`);
    assert.doesNotMatch(page, /AdminSectionPlaceholder|AdminEditor/);
    assert.match(page, new RegExp(`<[A-Z][A-Za-z]+`));
  }
});

test("the six editors retain ownership of every legacy SiteContent root field", async () => {
  const [template, profile, packages, layout, contact, advanced] = await Promise.all([
    source("app/admin/template/template-editor.tsx"),
    source("app/admin/profile/profile-editor.tsx"),
    source("app/admin/packages/packages-editor.tsx"),
    source("app/admin/layout/layout-workspace.tsx"),
    source("app/admin/contact/contact-editor.tsx"),
    source("app/admin/advanced/advanced-editor.tsx"),
  ]);

  assert.match(template, /content\.activeTemplate/);
  for (const field of ["profile", "hero", "trustItems", "statement"]) assert.match(profile, new RegExp(`content\\.${field}`));
  assert.match(packages, /content\.packages/);
  assert.match(layout, /content\.templateWorks/);
  for (const field of ["contact", "social", "bookingFields"]) assert.match(contact, new RegExp(`content\\.${field}`));
  assert.match(advanced, /content\.works/);

  const combined = [template, profile, packages, layout, contact, advanced].join("\n");
  assert.doesNotMatch(combined, /SiteDocumentV1|legacy-site-content-adapter|stable-id-migration|randomUUID|drizzle-orm/);
});

test("template browsing, package disclosures, layout tools, and legacy controls keep their required semantics", async () => {
  const [template, packages, layout, advanced, resetDialog] = await Promise.all([
    source("app/admin/template/template-editor.tsx"),
    source("app/admin/packages/packages-editor.tsx"),
    source("app/admin/layout/layout-workspace.tsx"),
    source("app/admin/advanced/advanced-editor.tsx"),
    source("app/admin/advanced/reset-example-dialog.tsx"),
  ]);

  assert.match(template, /templateCatalog\.map/);
  assert.match(template, /setInspectedId/);
  assert.match(template, /chooseTemplate/);
  assert.match(template, /独立预览/);
  assert.match(template, /素材排版可能变化/);
  assert.match(template, /不会在这里静默删除/);

  assert.match(packages, /aria-expanded=\{open\}/);
  for (const field of ["number", "english", "name", "description", "price", "duration", "deliverables", "enabled"]) {
    assert.match(packages, new RegExp(`item\\.${field}`));
  }
  assert.match(packages, /key=\{index\}/);
  assert.doesNotMatch(packages, /key=\{`\$\{item\.number\}/);
  assert.match(packages, /已启用/);
  assert.match(packages, /已隐藏/);

  for (const operation of ["autoComposeTemplateWorks", "parsePhotoLibraryManifest", "isPhotoAssetCompatibleWithSlot", "parseFocusPosition"]) {
    assert.match(layout, new RegExp(operation));
  }
  assert.match(layout, /复杂素材排版建议使用桌面端/);
  assert.doesNotMatch(layout, /\/api\//);

  assert.match(advanced, /useState\(false\)/);
  assert.match(advanced, /aria-expanded=\{legacyOpen\}/);
  assert.match(resetDialog, /showModal\(\)/);
  assert.match(resetDialog, /resetToExample\(\)/);
  assert.match(resetDialog, /event\.key !== "Escape"/);
  assert.match(resetDialog, /dialogRef\.current\?\.close\(\)/);
  assert.ok(
    resetDialog.indexOf("const confirmReset") < resetDialog.indexOf("resetToExample();"),
    "the reset must only happen inside the explicit confirmation handler",
  );
  assert.match(resetDialog, /onClose=\{\(\) => triggerRef\.current\?\.focus\(\)\}/);
});

test("the obsolete long-form Admin implementation is removed", async () => {
  for (const relativePath of [
    "app/admin/admin-editor.tsx",
    "app/admin/photo-library-editor.tsx",
    "app/admin/section-placeholder.tsx",
  ]) {
    await assert.rejects(fs.access(new URL(`../${relativePath}`, import.meta.url)));
  }
});

test("Admin V2 keeps shared draft persistence on the unchanged site-content endpoint", async () => {
  const provider = await source("app/admin/admin-provider.tsx");
  assert.match(provider, /fetch\("\/api\/site-content", \{ cache: "no-store" \}\)/);
  assert.match(provider, /method: "PUT"/);
  assert.match(provider, /JSON\.stringify\(\{ content: submitted \}\)/);
  assert.match(provider, /beforeunload/);
  assert.match(provider, /isAdminSaveShortcut/);
  assert.doesNotMatch(provider, /site_settings|SiteDocument|migration|repository/);
});

test("responsive CSS exposes a mobile section switcher and single-column layout without hiding data", async () => {
  const [shell, css] = await Promise.all([
    source("app/admin/admin-shell.tsx"),
    source("app/admin/admin-v2.module.css"),
  ]);
  assert.match(shell, /ADMIN_SECTIONS\.map/);
  assert.match(shell, /<select value=\{current\.href\}/);
  assert.match(css, /@media \(max-width: 1280px\) and \(min-width: 761px\)/);
  assert.match(css, /grid-template-areas:\s*"slots editor"\s*"assets assets"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /grid-template-areas: "slots" "editor" "assets"/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(css, /\.slotPane\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /\.assetPane\s*\{[^}]*display:\s*none/s);
});
