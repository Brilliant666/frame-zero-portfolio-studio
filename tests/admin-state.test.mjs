import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importAdminState(t) {
  const sourcePath = new URL("../app/admin/admin-state.ts", import.meta.url);
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "admin-state.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-admin-state-"));
  const modulePath = path.join(directory, "admin-state.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

test("admin dirty state returns to clean when a draft is reverted", async (t) => {
  const { hasAdminChanges } = await importAdminState(t);
  const persisted = { profile: { brand: "FRAME//ZERO" }, works: [] };
  const changed = { profile: { brand: "FRAME//ONE" }, works: [] };

  assert.equal(hasAdminChanges(persisted, persisted), false);
  assert.equal(hasAdminChanges(changed, persisted), true);
  assert.equal(hasAdminChanges({ profile: { brand: "FRAME//ZERO" }, works: [] }, persisted), false);
});

test("admin save eligibility rejects loading, in-flight, and unchanged drafts", async (t) => {
  const { canSubmitAdminSave } = await importAdminState(t);
  const persisted = { value: "saved" };
  const draft = { value: "draft" };

  assert.equal(canSubmitAdminSave("loading", "idle", draft, persisted), false);
  assert.equal(canSubmitAdminSave("degraded", "idle", draft, persisted), false);
  assert.equal(canSubmitAdminSave("error", "idle", draft, persisted), false);
  assert.equal(canSubmitAdminSave("ready", "saving", draft, persisted), false);
  assert.equal(canSubmitAdminSave("ready", "idle", persisted, persisted), false);
  assert.equal(canSubmitAdminSave("ready", "idle", draft, persisted), true);
});

test("a save response never overwrites edits made while the request was in flight", async (t) => {
  const { reconcileAdminSave } = await importAdminState(t);
  const submitted = { profile: { brand: "submitted" } };
  const normalized = { profile: { brand: "normalized" } };
  const currentDraft = { profile: { brand: "typed while saving" } };

  assert.deepEqual(reconcileAdminSave(submitted, submitted, normalized), {
    draft: normalized,
    persisted: normalized,
    changedWhileSaving: false,
  });
  assert.deepEqual(reconcileAdminSave(submitted, currentDraft, normalized), {
    draft: currentDraft,
    persisted: normalized,
    changedWhileSaving: true,
  });
});

test("Ctrl+S and Command+S are the only admin save shortcuts", async (t) => {
  const { isAdminSaveShortcut } = await importAdminState(t);
  const event = (patch = {}) => ({ altKey: false, ctrlKey: false, key: "s", metaKey: false, ...patch });

  assert.equal(isAdminSaveShortcut(event({ ctrlKey: true })), true);
  assert.equal(isAdminSaveShortcut(event({ key: "S", metaKey: true })), true);
  assert.equal(isAdminSaveShortcut(event()), false);
  assert.equal(isAdminSaveShortcut(event({ altKey: true, ctrlKey: true })), false);
  assert.equal(isAdminSaveShortcut(event({ ctrlKey: true, key: "p" })), false);
});

test("admin status distinguishes load errors, save errors, dirty, and success", async (t) => {
  const { getAdminStatus } = await importAdminState(t);

  assert.deepEqual(getAdminStatus("loading", "idle", false), { label: "正在读取", tone: "busy" });
  assert.deepEqual(getAdminStatus("degraded", "idle", false), { label: "读取受阻", tone: "error" });
  assert.deepEqual(getAdminStatus("error", "idle", false), { label: "读取失败", tone: "error" });
  assert.deepEqual(getAdminStatus("ready", "saving", true), { label: "正在保存", tone: "busy" });
  assert.deepEqual(getAdminStatus("ready", "error", true), { label: "保存失败", tone: "error" });
  assert.deepEqual(getAdminStatus("ready", "success", true), { label: "未保存", tone: "dirty" });
  assert.deepEqual(getAdminStatus("ready", "success", false), { label: "保存成功", tone: "success" });
  assert.deepEqual(getAdminStatus("ready", "idle", false), { label: "已保存", tone: "saved" });
});
