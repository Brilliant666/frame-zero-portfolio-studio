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
  for (const field of ["profile", "hero", "trustItems", "statement"]) assert.match(profile, new RegExp(`content\\.${field}`));
  assert.match(packages, /content\.packages/);
  assert.match(layout, /content\.templateWorks/);
  for (const field of ["contact", "social", "bookingFields"]) assert.match(contact, new RegExp(`content\\.${field}`));
  assert.match(advanced, /content\.works/);

  const combined = [template, profile, packages, layout, contact, advanced].join("\n");
  assert.doesNotMatch(combined, /SiteDocumentV1|legacy-site-content-adapter|stable-id-migration|randomUUID|drizzle-orm/);
});

test("template browsing, package disclosures, layout tools, and legacy controls keep their required semantics", async () => {
  const [template, templatePreview, profile, packages, layout, advanced, resetDialog] = await Promise.all([
    source("app/admin/template/template-editor.tsx"),
    source("app/admin/template/template-composition-preview.tsx"),
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
  assert.match(template, /chooseTemplate\(inspectedTemplate\.id\)/);
  assert.match(template, /data-saved=\{inspectedIsSaved\}/);
  assert.match(template, /data-draft=\{inspectedIsDraft\}/);
  assert.match(template, /data-inspected="true"/);
  assert.doesNotMatch(template, /data-template-card/);
  const inspectHandler = template.slice(
    template.indexOf("const inspectTemplate"),
    template.indexOf("const chooseTemplate"),
  );
  assert.match(inspectHandler, /isTemplateId\(value\)/);
  assert.match(inspectHandler, /setInspectedOverride\(value\)/);
  assert.doesNotMatch(inspectHandler, /setContent|activeTemplate/);
  const chooseHandler = template.slice(
    template.indexOf("const chooseTemplate"),
    template.indexOf("const statusLabels"),
  );
  assert.match(chooseHandler, /activeTemplate: templateId/);
  assert.match(template, /onChange=\{\(event\) => inspectTemplate\(event\.target\.value\)\}/);
  for (const status of ["已保存", "当前草稿", "正在查看"]) assert.match(template, new RegExp(status));
  const browseControl = template.slice(
    template.indexOf("data-template-option"),
    template.indexOf("</button>", template.indexOf("data-template-option")),
  );
  assert.match(browseControl, /setInspectedOverride/);
  assert.doesNotMatch(browseControl, /chooseTemplate|setContent/);
  assert.match(template, /独立预览/);
  assert.match(template, /查看候选详情不会修改草稿/);
  assert.match(template, /素材排版可能变化/);
  assert.match(template, /不会在这里静默删除/);
  assert.match(template, /getTemplateMaterialProfile\(inspectedTemplate\.id\)/);
  assert.match(template, /data-template-material-profile=\{materialProfile\.templateId\}/);
  assert.match(template, /建议 \{materialProfile\.recommendedPhotoCount\} 张/);
  for (const requirement of ["横图", "竖图", "方图", "主视觉", "裁切压力", "手机策略"]) {
    assert.match(template, new RegExp(requirement));
  }
  assert.match(template, /<TemplateCompositionPreview templateId=\{inspectedTemplate\.id\}/);
  assert.match(templatePreview, /planTemplateCompositionPreview/);
  assert.match(templatePreview, /data-preview-readonly="true"/);
  assert.match(templatePreview, /data-template-preview-apply=\{templateId\}/);
  assert.match(templatePreview, /打开真实模板预览/);
  assert.match(templatePreview, /<TemplateRenderer/);
  assert.match(templatePreview, /应用此排版到草稿/);
  assert.match(templatePreview, /仍需“保存全部修改”才会持久化/);
  assert.match(templatePreview, /setContent\(\(current\) => applyTemplateCompositionPreview\(current, planned\)\)/);
  assert.match(templatePreview, /activeTemplate: preview\.templateId/);
  assert.match(templatePreview, /data-hero-missing=\{planned\.heroMissingCount\}/);
  assert.match(templatePreview, /主视觉 \{planned\.heroMissingCount\} 张/);
  assert.match(templatePreview, /<Lightbox/);
  assert.doesNotMatch(templatePreview, /onOpenWork=\{\(\) => \{\}\}|method:\s*"PUT"|\/api\/site-content/);
  const previewApplyHandler = templatePreview.slice(
    templatePreview.indexOf("const applyPreview"),
    templatePreview.indexOf("return (", templatePreview.indexOf("const applyPreview")),
  );
  assert.doesNotMatch(previewApplyHandler, /activeTemplate|chooseTemplate|fetch\(/);

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
  assert.match(layout, /isImporting \|\| assets\.length === 0/);
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
  assert.match(templatePreview, /请先到“素材排版”添加素材/);
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

test("template composition preview excludes recycled local assets from new recommendations", async () => {
  const previewSource = await source("app/admin/template/template-composition-preview.tsx");
  assert.match(previewSource, /loadLocalPhotoLibrary\(localPhotoImportOrigin\)/);
  assert.match(previewSource, /filter\(\(item\) => item\.status === "active"\)/);
  assert.match(previewSource, /localPhotoImportState === "configured"/);
  assert.match(previewSource, /localPhotoImportOrigin/);
  assert.match(previewSource, /templateId === "character-select"/);
  assert.match(previewSource, /primaryPhotoRatioForDimensions\(work\.previewWidth, work\.previewHeight\)/);
  assert.match(previewSource, /data-ratio=\{presentationRatio\}/);
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
  const [shell, css, globals] = await Promise.all([
    source("app/admin/admin-shell.tsx"),
    source("app/admin/admin-v2.module.css"),
    source("app/globals.css"),
  ]);
  assert.match(shell, /ADMIN_SECTIONS\.map/);
  assert.match(shell, /<select value=\{current\.href\}/);
  assert.match(shell, /data-admin-title="true"/);
  assert.doesNotMatch(shell, /FRAME\/\/ZERO/);
  assert.match(shell, /saveActionLabel = saveState === "saving" \? "正在保存全部修改" : "保存全部修改"/);
  assert.match(shell, /aria-label=\{saveActionLabel\}/);
  assert.match(shell, /title=\{saveActionLabel\}/);
  assert.match(shell, /className=\{styles\.saveButtonFull\}/);
  assert.match(shell, /className=\{styles\.saveButtonCompact\}/);
  assert.match(css, /\.templateWorkbench\s*\{[^}]*grid-template-columns:\s*minmax\(13rem, 16rem\) minmax\(0, 1fr\)/s);
  assert.match(css, /\.templateList\s*\{/);
  assert.match(css, /\.templateDetail\s*\{/);
  assert.match(css, /\.templateMaterialProfile\s*\{/);
  assert.match(css, /\.templateMaterialDemand\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.templateCompositionPreview\s*\{/);
  assert.match(css, /\.templatePreviewSlotMap\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.templatePreviewDialog\s*\{/);
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
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.templateMaterialDemand,[\s\S]*\.templateMaterialSignals\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.templatePreviewSlotMap\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.saveButtonCompact\s*\{\s*display:\s*none/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.saveButtonFull\s*\{\s*display:\s*none;\s*\}[\s\S]*\.saveButtonCompact\s*\{\s*display:\s*inline;/);
  assert.match(css, /\.slotEditorBody\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s);
  assert.match(css, /\.slotCanvas\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
  assert.doesNotMatch(css, /\.slotPane\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /\.assetPane\s*\{[^}]*display:\s*none/s);
  assert.match(globals, /\.template-swatch::before\s*\{[^}]*content:\s*"LIGHT"/s);
  assert.doesNotMatch(globals, /\.template-swatch::before\s*\{[^}]*content:\s*"F\/\/0"/s);
});
