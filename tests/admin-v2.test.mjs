import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  const adminLayout = await source("app/admin/layout.tsx");
  assert.match(adminPage, /redirect\("\/admin\/template"\)/);
  assert.match(adminLayout, /title: "内容管理后台"/);
  assert.match(adminLayout, /CONTENT ADMIN/);
  assert.match(adminLayout, /openGraph:/);
  assert.match(adminLayout, /siteName: "内容管理后台"/);
  assert.match(adminLayout, /twitter:/);
  assert.doesNotMatch(adminLayout, /FRAME\/\/ZERO/);
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
  assert.doesNotMatch(template, /templateWorks|TemplateCompositionPreview|applyTemplateCompositionPreview/);
  for (const field of ["profile", "hero", "trustItems", "statement"]) assert.match(profile, new RegExp(`content\\.${field}`));
  assert.match(packages, /content\.packages/);
  assert.match(layout, /content\.templateWorks/);
  for (const field of ["contact", "social", "bookingFields"]) assert.match(contact, new RegExp(`content\\.${field}`));
  assert.match(advanced, /content\.works/);

  const combined = [template, profile, packages, layout, contact, advanced].join("\n");
  assert.doesNotMatch(combined, /SiteDocumentV1|legacy-site-content-adapter|stable-id-migration|randomUUID|drizzle-orm/);
});

test("template browsing, package disclosures, layout tools, and legacy controls keep their required semantics", async () => {
  const [template, structurePreview, structurePreviews, layoutPreview, draftPreview, draftPreviewDialog, templatePreviewDialog, profile, packages, layout, advanced, resetDialog] = await Promise.all([
    source("app/admin/template/template-editor.tsx"),
    source("app/admin/template/template-structure-preview.tsx"),
    source("app/templates/structure-previews.ts"),
    source("app/admin/template/template-composition-preview.tsx"),
    source("app/admin/draft-preview.tsx"),
    source("app/admin/draft-preview-dialog.tsx"),
    source("app/admin/template-preview-dialog.tsx"),
    source("app/admin/profile/profile-editor.tsx"),
    source("app/admin/packages/packages-editor.tsx"),
    source("app/admin/layout/layout-workspace.tsx"),
    source("app/admin/advanced/advanced-editor.tsx"),
    source("app/admin/advanced/reset-example-dialog.tsx"),
  ]);

  assert.match(template, /templateCatalog\.map/);
  assert.match(template, /useState<TemplateId \| null>\(null\)/);
  assert.match(template, /const inspectedId = inspectedOverride \?\? content\.activeTemplate/);
  assert.match(template, /data-template-option=\{template\.id\}/);
  assert.match(template, /data-template-detail=\{inspectedTemplate\.id\}/);
  assert.match(template, /setInspectedOverride\(template\.id\)/);
  assert.match(template, /continueToLayout\(inspectedTemplate\.id\)/);
  assert.match(template, /data-inspected="true"/);
  assert.doesNotMatch(template, /data-template-card/);
  assert.doesNotMatch(template, /templateSelectionSummary/);
  assert.doesNotMatch(template, /不是已保存选择|不是当前草稿/);
  assert.match(template, /data-template-state=\{detailState\}/);
  const inspectHandler = template.slice(
    template.indexOf("const inspectTemplate"),
    template.indexOf("const continueToLayout"),
  );
  assert.match(inspectHandler, /isTemplateId\(value\)/);
  assert.match(inspectHandler, /setInspectedOverride\(value\)/);
  assert.doesNotMatch(inspectHandler, /setContent|activeTemplate/);
  const continueHandler = template.slice(
    template.indexOf("const continueToLayout"),
    template.indexOf("const detailState"),
  );
  assert.match(continueHandler, /content\.activeTemplate !== templateId/);
  assert.match(continueHandler, /activeTemplate: templateId/);
  assert.match(continueHandler, /router\.push\("\/admin\/layout"\)/);
  assert.doesNotMatch(continueHandler, /save|fetch\(|method:\s*"PUT"|applyTemplateCompositionPreview|templateWorks/);
  assert.match(template, /onChange=\{\(event\) => inspectTemplate\(event\.target\.value\)\}/);
  assert.match(template, /当前草稿/);
  const browseControl = template.slice(
    template.indexOf("data-template-option"),
    template.indexOf("</button>", template.indexOf("data-template-option")),
  );
  assert.match(browseControl, /setInspectedOverride/);
  assert.doesNotMatch(browseControl, /chooseTemplate|setContent/);
  assert.match(template, /getTemplateMaterialProfile\(inspectedTemplate\.id\)/);
  assert.match(template, /getTemplateMaterialPlanSummary\(inspectedTemplate\.id\)/);
  assert.match(template, /formatTemplateMaterialDirectionSummary\(materialPlan\)/);
  assert.match(template, /data-template-material-profile=\{materialProfile\.templateId\}/);
  assert.match(template, /建议 \{materialProfile\.recommendedPhotoCount\} 张/);
  for (const requirement of ["槽位构成", "固定横图", "固定竖图", "方图", "任意方向", "主视觉", "裁切压力", "手机策略"]) {
    assert.match(template, new RegExp(requirement));
  }
  assert.doesNotMatch(template, /比例计划|photoRatios/);
  assert.match(template, /无需单独准备 16:9 素材/);
  assert.doesNotMatch(template, /TemplateCompositionPreview|LayoutCompositionPreview|planTemplateCompositionPreview|applyTemplateCompositionPreview|data-layout-preview-/);
  assert.match(template, /设为主页并进入素材排版/);
  assert.match(template, /进入素材排版/);
  assert.doesNotMatch(template, /独立预览/);
  assert.doesNotMatch(template, /TemplateEffectPreview|查看模板效果|data-template-candidate-preview/);
  assert.match(template, /<TemplateStructurePreview templateId=\{inspectedTemplate\.id\}/);
  assert.ok(
    template.indexOf("templateDetailIntro") < template.indexOf("<TemplateStructurePreview"),
    "the template heading and description must precede the structure diagram in the DOM",
  );
  const detailIntro = template.slice(
    template.indexOf("<header className={styles.templateDetailIntro}"),
    template.indexOf("</header>", template.indexOf("<header className={styles.templateDetailIntro}")),
  );
  assert.ok(
    detailIntro.indexOf("templateDetailHeader") < detailIntro.indexOf("templateDetailStates"),
    "the template name must remain the primary heading even when a saved or draft state is present",
  );
  assert.ok(
    template.indexOf("<TemplateStructurePreview") < template.indexOf("data-template-material-profile"),
    "the structure diagram must precede the detailed material profile",
  );
  assert.match(structurePreview, /data-template-structure-preview=\{templateId\}/);
  assert.match(structurePreview, /data-user-materials="false"/);
  assert.match(structurePreview, /getTemplateStructurePreview\(templateId\)/);
  assert.doesNotMatch(structurePreview, /PhotoAsset|PhotoLibrary|SiteContent|templateWorks|fetch\(|method:\s*"PUT"/);
  assert.match(structurePreviews, /satisfies Record<TemplateId, TemplateStructurePreview>/);
  assert.doesNotMatch(structurePreviews, /public\/photos|library-manifest|PhotoAsset|\bSiteContent\b|\bWork\b|fetch\(/);

  assert.match(layout, /<LayoutCompositionPreview/);
  assert.match(layout, /content\.activeTemplate !== savedContent\.activeTemplate/);
  assert.match(layout, /data-template-transition="unsaved"/);
  assert.match(layout, /ref=\{templateTransitionRef\}/);
  assert.match(layout, /templateTransitionRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(layout, /aria-live="polite"/);
  assert.match(layout, /tabIndex=\{-1\}/);
  assert.match(layout, /主页模板已切换为/);
  assert.match(layout, /尚未保存。现在可为它安排素材/);
  assert.match(layoutPreview, /planTemplateCompositionPreview/);
  assert.match(layoutPreview, /data-layout-composition-preview=\{templateId\}/);
  assert.match(layoutPreview, /data-layout-preview-generate=\{templateId\}/);
  assert.match(layoutPreview, /data-layout-preview-open=\{templateId\}/);
  assert.match(layoutPreview, /data-layout-preview-apply=\{templateId\}/);
  assert.match(layoutPreview, /刷新排版建议/);
  assert.match(layoutPreview, /预览推荐排版/);
  assert.match(layoutPreview, /采用推荐到草稿/);
  assert.match(layoutPreview, /仍需点击顶栏“保存修改”才会持久化/);
  assert.match(layoutPreview, /applyTemplateCompositionPreview\(current, planned\)/);
  assert.match(layoutPreview, /data-hero-missing=\{planned\.heroMissingCount\}/);
  assert.match(layoutPreview, /主视觉 \{planned\.heroMissingCount\} 张/);
  assert.match(layoutPreview, /dynamic\(\(\) => import\("\.\.\/template-preview-dialog"\)/);
  assert.doesNotMatch(layoutPreview, /TemplateRenderer|Lightbox|useTemplateInteractions|template-preview-dialog\.module\.css/);
  assert.doesNotMatch(layoutPreview, /onOpenWork=\{\(\) => \{\}\}|method:\s*"PUT"|\/api\/site-content/);
  const previewApplyHandler = layoutPreview.slice(
    layoutPreview.indexOf("const applyPreview"),
    layoutPreview.indexOf("return (", layoutPreview.indexOf("const applyPreview")),
  );
  assert.match(previewApplyHandler, /planned\.templateId !== content\.activeTemplate/);
  assert.match(previewApplyHandler, /current\.activeTemplate === planned\.templateId/);
  assert.doesNotMatch(previewApplyHandler, /activeTemplate\s*:|chooseTemplate|fetch\(/);
  assert.doesNotMatch(layoutPreview.slice(0, layoutPreview.indexOf("const applyPreview")), /setContent\(|method:\s*"PUT"/);

  assert.match(draftPreview, /dynamic\(\(\) => import\("\.\/draft-preview-dialog"\)/);
  assert.match(draftPreview, /triggerRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(draftPreview, /TemplateRenderer|Lightbox|buildPhotoSlots|useAdmin/);
  assert.match(draftPreviewDialog, /const \{ content \} = useAdmin\(\)/);
  assert.match(draftPreviewDialog, /useTemplateWorks\(content, templateId\)/);
  assert.doesNotMatch(draftPreviewDialog, /setContent|applyTemplateCompositionPreview|method:\s*"PUT"/);
  assert.match(draftPreviewDialog, /previewSource="draft"/);
  assert.match(draftPreviewDialog, /draftScope=\{scope\}/);
  assert.doesNotMatch(draftPreviewDialog, /TemplateRenderer|Lightbox|useTemplateInteractions|admin-v2\.module\.css/);
  assert.match(templatePreviewDialog, /data-admin-draft-preview-dialog=\{draftScope === "admin" \? "true" : undefined\}/);
  assert.match(templatePreviewDialog, /data-template-candidate-preview-dialog=\{draftScope === "candidate" \? templateId : undefined\}/);
  assert.match(templatePreviewDialog, /data-preview-source=\{previewSource\}/);
  assert.match(templatePreviewDialog, /<TemplateRenderer/);
  assert.match(templatePreviewDialog, /<Lightbox/);
  assert.match(templatePreviewDialog, /dialog\.showModal\(\)/);
  assert.match(templatePreviewDialog, /template-preview-dialog\.module\.css/);
  assert.doesNotMatch(templatePreviewDialog, /admin-v2\.module\.css/);
  assert.doesNotMatch(`${draftPreview}\n${draftPreviewDialog}\n${templatePreviewDialog}`, /fetch\(|method:\s*"PUT"|setContent|planTemplateCompositionPreview|loadLocalPhotoLibrary/);

  assert.match(profile, /<details className=\{styles\.optionalDisclosure\}/);
  assert.match(profile, /data-optional-brand-content="true"/);
  assert.match(profile, /可选品牌内容/);
  assert.ok(profile.indexOf('title="摄影师资料"') < profile.indexOf("data-optional-brand-content"));

  assert.match(packages, /aria-expanded=\{open\}/);
  for (const field of ["number", "english", "name", "description", "price", "duration", "deliverables", "enabled"]) {
    assert.match(packages, new RegExp(`item\\.${field}`));
  }
  assert.match(packages, /key=\{index\}/);
  assert.doesNotMatch(packages, /key=\{`\$\{item\.number\}/);
  assert.match(packages, /data-package-title-input=\{index\}/);
  assert.match(packages, /useState<number \| null>\(null\)/);
  assert.match(packages, /aria-label=\{`套餐 \$\{index \+ 1\} 标题`\}/);
  assert.match(packages, /updatePackage\(index, \{ name: event\.target\.value \}\)/);
  assert.doesNotMatch(packages, /label="中文名称"/);
  assert.match(packages, /已启用/);
  assert.match(packages, /已隐藏/);

  for (const operation of ["parsePhotoLibraryManifest", "isPhotoAssetCompatibleWithSlot", "parseFocusPosition", "templateSlotOrientationMode"]) {
    assert.match(layout, new RegExp(operation));
  }
  assert.match(layout, /复杂素材排版建议使用桌面端/);
  assert.match(layout, /hasSourceOrientationAdaptiveSlots\(content\.activeTemplate\)/);
  assert.match(layout, /templateSlotOrientationMode\(content\.activeTemplate, slotIndex\) === "source-adaptive"/);
  assert.match(layoutPreview, /templateSlotOrientationMode\(templateId, slotIndex\) === "source-adaptive"/);
  assert.doesNotMatch(layoutPreview, /templateId === "character-select"/);
  assert.match(layout, /isPhotoAssetCompatibleWithSlot\(asset, activeRatio, activeSlotUsesSourceOrientation\)/);
  assert.match(layout, /isWorkCompatibleWithSlot\(sourceWork, template\.slotRatios\[destination\], slotUsesSourceOrientation\(destination\)\)/);
  assert.match(layout, /isWorkCompatibleWithSlot\(destinationWork, template\.slotRatios\[slotIndex\], slotUsesSourceOrientation\(slotIndex\)\)/);
  assert.match(layoutPreview, /刷新排版建议/);
  assert.match(layoutPreview, /<details className=\{styles\.templatePreviewSlotDisclosure\}/);
  assert.match(layoutPreview, /data-layout-recommendation-details=\{templateId\}/);
  assert.match(layoutPreview, /<h3 id=\{`layout-preview-heading-\$\{templateId\}`\}>当前模板推荐排版<\/h3>/);
  assert.doesNotMatch(layoutPreview, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(layout, /const assetPageSize = 24;/);
  assert.match(layout, /const slotDirectionLabel = \(slotIndex: number\) =>/);
  assert.match(layout, /<h3 id="slot-list-heading">照片槽位<\/h3>/);
  assert.match(layout, /<h3 id="asset-library-heading">素材选择与管理<\/h3>/);
  assert.match(layout, /aria-label="模板照片槽位"/);
  assert.doesNotMatch(layout, /aria-label="模板固定照片槽位"/);
  assert.ok(
    layout.indexOf("className={styles.layoutSummary}") < layout.indexOf("<PhotoImportPanel"),
    "the current template summary must precede the import utility",
  );
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

test("local photo ingest stays isolated from the shared SiteContent draft", async () => {
  const [layout, panel, client, managementClient, references, provider, adminLayout, templatePreview, previewComposition, css, viteConfig] = await Promise.all([
    source("app/admin/layout/layout-workspace.tsx"),
    source("app/admin/layout/photo-import-panel.tsx"),
    source("app/admin/layout/photo-import-client.ts"),
    source("app/admin/layout/photo-library-management-client.ts"),
    source("app/photo-library-references.ts"),
    source("app/admin/admin-provider.tsx"),
    source("app/admin/layout.tsx"),
    source("app/admin/template/template-composition-preview.tsx"),
    source("app/templates/template-preview-composition.ts"),
    source("app/admin/admin-v2.module.css"),
    source("vite.config.ts"),
  ]);

  assert.match(layout, /<PhotoImportPanel/);
  assert.match(layout, /localPhotoImportOrigin/);
  assert.match(layout, /localPhotoImportState/);
  assert.match(layout, /<LayoutCompositionPreview/);
  assert.match(layout, /assets=\{assets\}/);
  assert.match(layout, /busy=\{isImporting\}/);
  assert.match(layout, /libraryRequestRef/);
  assert.match(layout, /request !== libraryRequestRef\.current/);
  assert.match(layout, /loadLocalPhotoLibrary/);
  assert.match(layout, /setLocalPhotoLibraryArchived/);
  assert.match(layout, /在库素材/);
  assert.match(layout, /回收站/);
  assert.match(layout, /最近新增/);
  assert.match(layout, /最早记录/);
  assert.match(layout, /导入批次/);
  assert.match(layout, /既有素材（时间未知）/);
  assert.match(layout, /当前草稿 \{references\.draft\.length\} 处 · 已保存 \{references\.saved\.length\} 处/);
  assert.match(layout, /移入回收站/);
  assert.match(layout, /恢复素材/);
  assert.match(layout, /现有排版引用保持可用/);
  assert.match(layout, /archivedAssetCount === 0/);
  assert.match(layout, /没有符合筛选条件的回收站素材/);
  assert.match(layout, /archiveConfirmRef/);
  assert.match(layout, /archiveTriggerRefs/);
  assert.match(layout, /archiveConfirmRef\.current\?\.focus\(\)/);
  assert.match(layout, /archiveTriggerRefs\.current\.get\(assetId\)\?\.focus\(\)/);
  assert.match(references, /work\.assetId/);
  assert.match(references, /work\.image, work\.preview/);
  assert.doesNotMatch(managementClient, /\/api\/site-content|method:\s*"PUT"|filename|webkitRelativePath/);
  assert.match(layout, /\["all", "landscape", "portrait", "square"\]/);
  assert.match(layout, /setLibraryMessage\("素材库还为空。"\)/);
  assert.match(layout, /libraryState === "error"[\s\S]*\? "素材库暂时无法读取"/);
  assert.match(layout, /<p>\{libraryState === "error"[\s\S]*\? libraryMessage/);
  assert.match(layout, /使用上方“添加素材”把照片或文件夹加入素材库/);
  assert.match(managementClient, /service-update-required/);
  assert.match(managementClient, /本地素材服务版本较旧；请停止并重新运行 npm run dev/);
  assert.doesNotMatch(layout, /先运行文件夹导入命令|重新执行导入命令/);
  assert.doesNotMatch(panel, /useAdmin|setContent|autoComposeTemplateWorks|\/api\/site-content|method:\s*"PUT"/);
  assert.match(panel, /data-add-materials-trigger="true"/);
  assert.equal(panel.match(/data-add-materials-trigger=/g)?.length, 1);
  assert.match(panel, /ref=\{addMaterialsTriggerRef\}/);
  assert.match(panel, /aria-expanded=\{addMaterialsOpen\}/);
  assert.match(panel, /hidden=\{!addMaterialsOpen\}/);
  assert.match(panel, /requestAnimationFrame\(\(\) => addMaterialsTriggerRef\.current\?\.focus\(\)\)/);
  assert.match(panel, /添加素材/);
  assert.match(panel, /data-photo-picker="files"/);
  assert.match(panel, /data-photo-picker="folder"/);
  assert.equal(panel.match(/data-photo-picker=/g)?.length, 2);
  const photoPickerSource = panel.slice(
    panel.indexOf('data-photo-picker="files"'),
    panel.indexOf("/>", panel.indexOf('data-photo-picker="files"')),
  );
  const folderPickerSource = panel.slice(
    panel.indexOf('data-photo-picker="folder"'),
    panel.indexOf("/>", panel.indexOf('data-photo-picker="folder"')),
  );
  assert.match(photoPickerSource, /accept=\{localPhotoImportAccept\}/);
  assert.doesNotMatch(folderPickerSource, /\baccept=/);
  assert.match(panel, /选择照片/);
  assert.match(panel, /选择文件夹/);
  assert.equal(panel.match(/\bmultiple\b/g)?.length, 2);
  assert.match(panel, /webkitdirectory/);
  assert.match(panel, /handleSelection\(event, "photos"\)/);
  assert.match(panel, /handleSelection\(event, "folder"\)/);
  assert.equal(panel.match(/aria-hidden="true"/g)?.length, 2);
  assert.equal(panel.match(/tabIndex=\{-1\}/g)?.length, 2);
  const selectionHandler = panel.match(/const handleSelection = \([\s\S]*?^  \};/m)?.[0] ?? "";
  const confirmationHandler = panel.match(/const confirmPendingImport = [\s\S]*?^  \};/m)?.[0] ?? "";
  const cancelHandler = panel.match(/const cancelPendingImport = [\s\S]*?^  \};/m)?.[0] ?? "";
  const reselectHandler = panel.match(/const reselectPendingImport = [\s\S]*?^  \};/m)?.[0] ?? "";
  assert.notEqual(selectionHandler, "", "photo selection must have an explicit handler");
  assert.match(selectionHandler, /setPendingBatch/);
  assert.match(selectionHandler, /if \(files\.length === 0\)/);
  assert.match(selectionHandler, /未收到文件/);
  assert.match(selectionHandler, /mode === "folder"/);
  assert.doesNotMatch(selectionHandler, /beginImport\(|runLocalPhotoImport\(|confirmPendingImport\(/);
  assert.notEqual(confirmationHandler, "", "pending selection must require explicit confirmation");
  assert.match(confirmationHandler, /beginImport\(/);
  assert.match(confirmationHandler, /pendingBatch/);
  assert.match(confirmationHandler, /clearPhotoPreviewPage\(\)/);
  assert.notEqual(cancelHandler, "", "cancelling a pending selection must be explicit");
  assert.match(cancelHandler, /clearPhotoPreviewPage\(\)/);
  assert.notEqual(reselectHandler, "", "reselect must preserve the pending batch if the chooser is cancelled");
  assert.doesNotMatch(reselectHandler, /setPendingBatch\(null\)/);
  assert.match(panel, /URL\.revokeObjectURL/);
  assert.match(panel, /function createPhotoPreviewUrl/);
  assert.match(panel, /function releasePhotoPreviewUrls/);
  assert.match(panel, /const photoImportPreviewPageSize = 24/);
  assert.match(panel, /function PhotoImportPreviewPage/);
  assert.match(panel, /files\.slice\(pageStart, pageEnd\)/);
  assert.match(panel, /const showPhotoPreviewPage/);
  assert.match(panel, /releasePhotoPreviewUrls\(previewPageRef\.current\?\.objectUrls \?\? \[\]\)/);
  assert.match(panel, /batch\.files\s*\.slice\(pageStart, pageStart \+ photoImportPreviewPageSize\)\s*\.map\(createPhotoPreviewUrl\)/);
  assert.match(panel, /useEffect\(\(\) => \(\) => \{/);
  assert.match(panel, /previewPageRef\.current = null/);
  assert.match(panel, /showPhotoPreviewPage\(nextBatch, 0\)/);
  assert.match(panel, /showPhotoPreviewPage\(pendingBatch, boundedPageIndex\)/);
  assert.doesNotMatch(panel, /previewObjectUrls:\s*selection\.accepted/);
  assert.match(panel, /data-photo-import-preflight="true"/);
  assert.match(panel, /data-photo-import-preview-item/);
  assert.match(panel, /pendingBatch\.files\.length/);
  assert.match(panel, /pendingBatch\.ignored/);
  assert.match(panel, /pendingBatch\.subdirectoryCount/);
  assert.match(panel, /Math\.ceil\(pendingBatch\.files\.length \/ photoImportPreviewPageSize\)/);
  assert.match(panel, /aria-label="待导入素材缩略图分页"/);
  assert.match(panel, /aria-label="选择缩略图页码"/);
  assert.match(panel, /上一页/);
  assert.match(panel, /下一页/);
  assert.match(panel, /第 \{previewPageIndex \+ 1\} \/ \{previewPageCount\} 页 · 共 \{pendingBatch\.files\.length\} 张/);
  assert.match(panel, /每页最多显示 24 张缩略图/);
  assert.match(confirmationHandler, /beginImport\(pendingBatch\.files, pendingBatch\.mode\)/);
  assert.doesNotMatch(confirmationHandler, /slice\(|previewPage/);
  assert.match(panel, /待处理/);
  assert.match(panel, /忽略/);
  assert.match(panel, /子目录/);
  assert.match(panel, /处理全部 \{pendingBatch\.files\.length\} 张/);
  assert.match(panel, /确认导入/);
  assert.match(panel, /取消/);
  assert.match(panel, /重新选择/);
  assert.match(panel, /onClick=\{confirmPendingImport\}/);
  assert.match(panel, /onClick=\{cancelPendingImport\}/);
  assert.match(panel, /onClick=\{reselectPendingImport\}/);
  assert.match(css, /\.photoImportPreviewPagination\s*\{/);
  assert.match(css, /\.photoImportPreviewPagination nav\s*\{/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(panel, /本地照片导入仅在本机编辑模式可用/);
  assert.match(panel, /本地照片导入服务未启动/);
  assert.match(panel, /请使用 npm run dev 启动完整编辑环境/);
  assert.match(panel, /data-photo-import-health="unavailable"/);
  assert.match(panel, /本地照片导入服务暂时不可用/);
  assert.match(panel, /导入地址已配置，但当前无法连接本地照片导入服务/);
  assert.doesNotMatch(panel, /高级 \/ 命令行导入|photos:import/);
  assert.match(panel, /本次新增 \{result\.added\}/);
  assert.match(panel, /恢复可用 \{result\.restored\}/);
  assert.match(panel, /重复跳过 \{result\.alreadyExists\}/);
  assert.match(panel, /可用素材总计 \$\{result\.libraryTotal\} 张/);
  assert.doesNotMatch(panel, /素材库总计 \$\{result\.libraryTotal\} 张/);
  assert.doesNotMatch(panel, /已存在/);
  assert.match(panel, /查看失败详情/);
  assert.match(panel, /aria-label="照片导入进度"/);
  assert.match(panel, /刷新素材列表（不重新扫描文件夹）/);
  assert.match(panel, /一次性读取/);
  assert.match(panel, /后续增删需再次选择/);
  assert.match(templatePreview, /没有可用于推荐排版的在库素材/);
  assert.match(previewComposition, /请刷新素材列表后重试/);
  assert.doesNotMatch(previewComposition, /刷新素材库后重试/);
  assert.match(panel, /正在处理第 \$\{Math\.min\(progress\.processed \+ 1, progress\.total\)\} 张，共 \$\{progress\.total\} 张/);
  assert.match(panel, /data-photo-import-selection=\{selectionMode\}/);
  assert.match(panel, /一次性快照，不会持续同步/);
  assert.doesNotMatch(panel, />重新读取</);
  assert.doesNotMatch(client, /JSON\.stringify|FileReader|readAsDataURL/);
  assert.match(client, /readSafeLocalRelativePath/);
  const transportClient = client.slice(client.indexOf("export async function runLocalPhotoImport"));
  assert.doesNotMatch(transportClient, /webkitRelativePath/);
  assert.match(client, /body: file/);
  assert.match(client, /"content-type": "application\/octet-stream"/);
  assert.match(client, /"x-frame-zero-local-import": "1"/);
  assert.match(client, /"x-frame-zero-photo-batch": batchId/);
  assert.match(client, /"x-frame-zero-photo-batch-position": String\(index\)/);
  assert.match(client, /"x-frame-zero-photo-source": sourceKind/);
  assert.match(client, /localPhotoImportMaximumBytes = 200 \* 1024 \* 1024/);
  assert.match(client, /checkLocalPhotoImportHealth\(\s*origin: string/);
  assert.match(client, /runLocalPhotoImport\(\s*origin: string/);
  assert.doesNotMatch(client, /127\.0\.0\.1:3002|localPhotoImportOrigin\s*=/);
  assert.match(provider, /localPhotoImportOrigin: string \| null/);
  assert.match(provider, /localPhotoImportState: "configured" \| "missing" \| "hosted"/);
  assert.match(adminLayout, /FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN/);
  assert.match(adminLayout, /local \? localPhotoImportOriginFromEnvironment\(\) : null/);
  assert.match(adminLayout, /\^http:\\\/\\\/127\\\.0\\\.0\\\.1:/);
  assert.match(adminLayout, /parsed\.username !== ""/);
  assert.match(adminLayout, /parsed\.password !== ""/);
  assert.match(adminLayout, /parsed\.pathname !== "\/"/);
  assert.match(adminLayout, /parsed\.search !== ""/);
  assert.match(adminLayout, /parsed\.hash !== ""/);
  assert.match(viteConfig, /command !== "serve" \|\| isPreview === true/);
  assert.match(viteConfig, /\^http:\\\/\\\/127\\\.0\\\.0\\\.1:/);
  assert.match(viteConfig, /\.\.\.resolvedConfig\.vars/);
  assert.match(viteConfig, /\[LOCAL_PHOTO_IMPORT_ORIGIN_ENV\]: localPhotoImportOrigin/);
  assert.doesNotMatch(viteConfig, /CLOUDFLARE_INCLUDE_PROCESS_ENV|NEXT_PUBLIC_|VITE_FRAME_ZERO/);
  assert.match(css, /\.libraryStats\s*\{/);
  assert.match(css, /\.photoImportProgress\s*,/);
  assert.match(css, /\.photoImportActions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.photoImportChoiceNotes\s*\{/);
  assert.doesNotMatch(css, /\.photoImportCli\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.libraryViews button:focus-visible/);
  assert.match(css, /\.librarySelect select:focus-visible/);
  assert.match(css, /\.assetManagement button:focus-visible/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.photoImportProgress dl\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("all formal templates have deterministic public-safe neutral structure preview assets", async (t) => {
  const [catalogSource, mapSource, componentSource, generatorSource, safetySource, dockerignore, manifestSource] = await Promise.all([
    source("app/templates/catalog.ts"),
    source("app/templates/structure-previews.ts"),
    source("app/admin/template/template-structure-preview.tsx"),
    source("scripts/generate-template-structure-previews.mjs"),
    source("scripts/check-public-safety.mjs"),
    source(".dockerignore"),
    source("config/production-public-files.json"),
  ]);
  const templateIds = [...catalogSource.matchAll(/\bid:\s*"([a-z][a-z0-9-]+)"/g)].map((match) => match[1]);
  const mappedIds = [...mapSource.matchAll(/"([a-z][a-z0-9-]+)":\s*preview\("\1"\)/g)].map((match) => match[1]);
  assert.equal(templateIds.length, 11);
  assert.deepEqual(mappedIds, templateIds);

  const { default: sharp } = await import("sharp");
  const {
    generateTemplateStructurePreviews,
    TEMPLATE_STRUCTURE_PREVIEW_HEIGHT,
    TEMPLATE_STRUCTURE_PREVIEW_IDS,
    TEMPLATE_STRUCTURE_PREVIEW_WIDTH,
  } = await import("../scripts/generate-template-structure-previews.mjs");
  assert.deepEqual([...TEMPLATE_STRUCTURE_PREVIEW_IDS], templateIds);
  assert.equal(TEMPLATE_STRUCTURE_PREVIEW_WIDTH, 1200);
  assert.equal(TEMPLATE_STRUCTURE_PREVIEW_HEIGHT, 675);

  const previewPaths = templateIds.map((id) => `template-structure-previews/${id}.webp`).sort();
  assert.deepEqual(JSON.parse(manifestSource), {
    version: 1,
    files: ["favicon.svg", "file.svg", "globe.svg", ...previewPaths, "window.svg"],
  });
  assert.match(safetySource, /const templateStructurePreviewNames = new Set/);
  assert.match(safetySource, /const templateStructurePreviewDigests = new Map/);
  assert.match(safetySource, /inspectReviewedTemplateStructurePreview/);
  assert.doesNotMatch(dockerignore, /!public\/template-structure-previews\/(?:\*|\*\*)/);
  const privacySources = `${mapSource}\n${componentSource}\n${generatorSource}`
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(privacySources, /public\/photos|library-manifest|PhotoAsset|\bSiteContent\b|\bWork\b|fetch\(|method:\s*"PUT"/);
  assert.match(componentSource, /data-user-materials="false"/);

  const generatedDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "template-structure-previews-"));
  t.after(() => fs.rm(generatedDirectory, { recursive: true, force: true }));
  await generateTemplateStructurePreviews(generatedDirectory);

  let totalBytes = 0;
  for (const id of templateIds) {
    const assetUrl = new URL(`../public/template-structure-previews/${id}.webp`, import.meta.url);
    const generatedPath = path.join(generatedDirectory, `${id}.webp`);
    const [committed, generated, stats, metadata] = await Promise.all([
      fs.readFile(assetUrl),
      fs.readFile(generatedPath),
      fs.stat(assetUrl),
      sharp(fileURLToPath(assetUrl)).metadata(),
    ]);
    totalBytes += stats.size;
    assert.ok(stats.size > 0 && stats.size <= 64 * 1024, `${id} structure preview must stay lightweight`);
    assert.equal(committed.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(committed.subarray(8, 12).toString("ascii"), "WEBP");
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 675);
    const committedDigest = createHash("sha256").update(committed).digest("hex");
    const generatedDigest = createHash("sha256").update(generated).digest("hex");
    assert.equal(generatedDigest, committedDigest, `${id} must be byte-identical to the deterministic generator output`);
    assert.match(safetySource, new RegExp(`\\["${id}\\.webp", "${committedDigest}"\\]`));
    assert.equal(safetySource.match(new RegExp(`"${id}\\.webp"`, "g"))?.length, 2);
    assert.match(dockerignore, new RegExp(`^!public/template-structure-previews/${id}\\.webp$`, "m"));
  }
  assert.ok(totalBytes <= 192 * 1024, "all eleven structure previews must remain a small deterministic UI asset set");
});

test("layout recommendations receive active library assets while template structure previews stay library-independent", async () => {
  const [layoutSource, layoutPreview, structurePreview] = await Promise.all([
    source("app/admin/layout/layout-workspace.tsx"),
    source("app/admin/template/template-composition-preview.tsx"),
    source("app/admin/template/template-structure-preview.tsx"),
  ]);
  assert.match(layoutSource, /libraryItems\.filter\(\(item\) => item\.status === "active"\)/);
  assert.match(layoutSource, /const assets = useMemo\(\(\) => activeItems\.map/);
  assert.match(layoutSource, /<LayoutCompositionPreview[\s\S]*assets=\{assets\}/);
  assert.match(layoutPreview, /planTemplateCompositionPreview\(\{[\s\S]*assets,/);
  assert.match(layoutPreview, /primaryPhotoRatioForDimensions\(work\.previewWidth, work\.previewHeight\)/);
  assert.match(layoutPreview, /data-ratio=\{presentationRatio\}/);
  assert.doesNotMatch(structurePreview, /PhotoAsset|libraryItems|libraryState|library-manifest|planTemplateCompositionPreview|loadLocalPhotoLibrary/);
});

test("Admin V2 keeps one shared save action on the unchanged site-content endpoint", async () => {
  const [provider, shell, template, structurePreview, layout, layoutPreview] = await Promise.all([
    source("app/admin/admin-provider.tsx"),
    source("app/admin/admin-shell.tsx"),
    source("app/admin/template/template-editor.tsx"),
    source("app/admin/template/template-structure-preview.tsx"),
    source("app/admin/layout/layout-workspace.tsx"),
    source("app/admin/template/template-composition-preview.tsx"),
  ]);
  assert.match(provider, /fetch\("\/api\/site-content", \{ cache: "no-store" \}\)/);
  assert.match(provider, /method: "PUT"/);
  assert.match(provider, /JSON\.stringify\(\{ content: submitted \}\)/);
  assert.match(provider, /beforeunload/);
  assert.match(provider, /isAdminSaveShortcut/);
  assert.match(provider, /saveState !== "success"/);
  assert.match(provider, /window\.setTimeout\(\(\) => setSaveState\("idle"\), 2500\)/);
  assert.doesNotMatch(provider, /site_settings|SiteDocument|migration|repository/);
  assert.equal([provider, shell, template, structurePreview, layout, layoutPreview]
    .reduce((count, input) => count + (input.match(/method:\s*"PUT"/g)?.length ?? 0), 0), 1);
  assert.doesNotMatch(shell, /DraftTemplatePreviewTrigger|预览当前草稿|data-admin-draft-preview-trigger/);
  assert.match(shell, /aria-keyshortcuts="Control\+S Meta\+S"/);
  assert.doesNotMatch([shell, template, structurePreview, layout, layoutPreview].join("\n"), /\/api\/site-content/);
});

test("responsive CSS exposes a mobile section switcher and single-column layout without hiding data", async () => {
  const [shell, css] = await Promise.all([
    source("app/admin/admin-shell.tsx"),
    source("app/admin/admin-v2.module.css"),
  ]);
  assert.match(shell, /ADMIN_SECTIONS\.map/);
  assert.match(shell, /<select value=\{current\.href\}/);
  assert.match(shell, /data-admin-title="true"/);
  assert.doesNotMatch(shell, /FRAME\/\/ZERO/);
  assert.match(shell, /"正在保存修改"/);
  assert.match(shell, /"重试保存"/);
  assert.match(shell, /"保存修改"/);
  assert.match(shell, /aria-label=\{saveActionLabel\}/);
  assert.match(shell, /aria-keyshortcuts="Control\+S Meta\+S"/);
  assert.match(shell, /title=\{saveActionLabel\}/);
  assert.match(shell, /className=\{styles\.saveButtonFull\}/);
  assert.match(shell, /className=\{styles\.saveButtonCompact\}/);
  assert.match(css, /\.templateWorkbench\s*\{[^}]*grid-template-columns:\s*minmax\(13rem, 16rem\) minmax\(0, 1fr\)/s);
  assert.match(css, /\.templateList\s*\{/);
  assert.match(css, /\.templateDetail\s*\{/);
  assert.match(css, /\.templateDetailIntro\s*\{/);
  assert.match(css, /\.templateMaterialProfile\s*\{/);
  assert.match(css, /\.templateMaterialDemand\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.templateCompositionPreview\s*\{/);
  assert.match(css, /\.templatePreviewSlotMap\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(8rem, 1fr\)\)/s);
  assert.match(css, /\.templatePreviewSlotMap\s*\{[^}]*align-items:\s*start/s);
  assert.match(css, /\.templatePreviewSlotDisclosure\s*\{/);
  assert.doesNotMatch(css, /\.templatePreviewSlot\[data-priority="critical"\]\s*\{[^}]*grid-column:/s);
  assert.doesNotMatch(css, /\.templatePreviewDialog\s*\{/);
  assert.doesNotMatch(css, /\.templateGrid|\.templateCard\b/);
  assert.match(css, /@media \(max-width: 1280px\) and \(min-width: 761px\)/);
  assert.match(css, /@media \(max-width: 960px\)\s*\{[^}]*\.packageCardHeader\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /grid-template-areas:\s*"slots editor"\s*"assets assets"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 760px\)\s*\{[^}]*\.templateWorkbench\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.templateList\s*\{\s*display:\s*none/);
  assert.match(css, /\.templateMobileSelector\s*\{\s*display:\s*grid/);
  assert.match(css, /grid-template-areas: "slots" "editor" "assets"/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /\.shell\s*\{[^}]*padding-top:\s*var\(--admin-v2-topbar-height\)/s);
  assert.match(css, /\.topbar\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0 0 auto;[^}]*height:\s*var\(--admin-v2-topbar-height\)/s);
  assert.match(css, /\.sidebar\s*\{[^}]*top:\s*var\(--admin-v2-topbar-height\);[^}]*height:\s*calc\(100dvh - var\(--admin-v2-topbar-height\)\)/s);
  assert.match(css, /\.main\s*\{[^}]*scroll-margin-top:\s*calc\(var\(--admin-v2-topbar-height\) \+ 1rem\)/s);
  assert.doesNotMatch(css, /\.previewLink|\.previewText/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.templateMaterialDemand,[\s\S]*\.templateMaterialSignals\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.templatePreviewSlotMap\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.saveButtonCompact\s*\{\s*display:\s*none/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.saveButtonFull\s*\{\s*display:\s*none;\s*\}[\s\S]*\.saveButtonCompact\s*\{\s*display:\s*inline;/);
  assert.match(css, /\.slotEditorBody\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s);
  assert.match(css, /\.slotCanvas\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
  assert.doesNotMatch(css, /\.slotPane\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /\.assetPane\s*\{[^}]*display:\s*none/s);
});
