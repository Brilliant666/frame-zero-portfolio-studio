import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const helperPath = new URL("../app/templates/orbital-portal/portal-focus.ts", import.meta.url);
const templatePath = new URL("../app/templates/orbital-portal/template.tsx", import.meta.url);

async function importPortalFocus(t) {
  const source = await fs.readFile(helperPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "portal-focus.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-orbital-focus-test-"));
  const modulePath = path.join(directory, "portal-focus.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

test("default-centred portraits protect their upper subject in the wide portal crop", async (t) => {
  const { getOrbitalPortalObjectPosition } = await importPortalFocus(t);

  assert.equal(getOrbitalPortalObjectPosition({ position: "50% 50%", previewWidth: 800, previewHeight: 1200 }), "50% 32%");
});

test("the portal crop preserves explicit focus and non-portrait defaults", async (t) => {
  const { getOrbitalPortalObjectPosition } = await importPortalFocus(t);

  assert.equal(getOrbitalPortalObjectPosition({ position: "41% 18%", previewWidth: 800, previewHeight: 1200 }), "41% 18%");
  assert.equal(getOrbitalPortalObjectPosition({ position: "50% 50%", previewWidth: 1200, previewHeight: 800 }), "50% 50%");
  assert.equal(getOrbitalPortalObjectPosition({ position: "50% 50%", previewWidth: 900, previewHeight: 900 }), "50% 50%");
});

test("the safety focus applies only to the active secondary portal crop", async () => {
  const template = await fs.readFile(templatePath, "utf8");

  assert.match(template, /style=\{\{ objectPosition: activePortalObjectPosition \}\}/u);
  assert.match(template, /data-portal-focus=\{activePortalObjectPosition === activeWork\.position/u);
  assert.match(template, /loading="lazy" style=\{\{ objectPosition: slot\.work\.position \}\}/u);
});
