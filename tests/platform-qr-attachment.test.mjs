import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadAttachment(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-platform-qr-attachment-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sourcePath = "app/admin/contact/platform-qr-attachment.ts";
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const modulePath = path.join(directory, "platform-qr-attachment.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

const existingQrAssetId = "a".repeat(64);
const uploadedQrAssetId = "b".repeat(64);
const expected = {
  label: "Platform One",
  handle: "@platform-one",
  qrAssetId: existingQrAssetId,
};
const upload = {
  assetId: uploadedQrAssetId,
  height: 960,
  width: 640,
};

test("an unchanged platform row attaches one uploaded asset and reports success", async (t) => {
  const { completePlatformQrUpload } = await loadAttachment(t);
  const untouched = { label: "Platform Two", handle: "@platform-two" };
  const social = [{ ...expected }, untouched];
  const result = completePlatformQrUpload(social, 0, expected, upload);

  assert.equal(result.attached, true);
  assert.equal(result.message, "图片已加入当前草稿（640 × 960）；保存后主页生效。");
  assert.equal(result.social[0].qrAssetId, uploadedQrAssetId);
  assert.equal(result.social[1], untouched);
  assert.equal(result.social.filter((entry) => entry.qrAssetId === uploadedQrAssetId).length, 1);
  assert.equal(social[0].qrAssetId, existingQrAssetId, "the original draft array stays unchanged");
});

test("a changed platform row never attaches and always reports the stale-row message", async (t) => {
  const { completePlatformQrUpload } = await loadAttachment(t);
  const changedRows = [
    { ...expected, label: "Changed label" },
    { ...expected, handle: "@changed-handle" },
    { ...expected, qrAssetId: "c".repeat(64) },
  ];

  for (const changed of changedRows) {
    const social = [changed];
    const result = completePlatformQrUpload(social, 0, expected, upload);
    assert.equal(result.attached, false);
    assert.equal(result.message, "平台条目在上传期间发生变化，请重新选择图片。");
    assert.equal(result.social, social);
    assert.equal(result.social.some((entry) => entry.qrAssetId === uploadedQrAssetId), false);
  }
});
