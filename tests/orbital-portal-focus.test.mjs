import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const helperPath = new URL("../app/templates/orbital-portal/portal-focus.ts", import.meta.url);
const templatePath = new URL("../app/templates/orbital-portal/template.tsx", import.meta.url);
const cssPath = new URL("../app/templates/orbital-portal/template.module.css", import.meta.url);

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

test("default-centred portraits protect their upper subject in the portrait portal", async (t) => {
  const { getOrbitalPortalObjectPosition } = await importPortalFocus(t);

  assert.equal(getOrbitalPortalObjectPosition({ position: "50% 50%", previewWidth: 800, previewHeight: 1200 }), "50% 32%");
});

test("the portal crop preserves explicit focus and non-portrait defaults", async (t) => {
  const { getOrbitalPortalObjectPosition } = await importPortalFocus(t);

  assert.equal(getOrbitalPortalObjectPosition({ position: "41% 18%", previewWidth: 800, previewHeight: 1200 }), "41% 18%");
  assert.equal(getOrbitalPortalObjectPosition({ position: "50% 50%", previewWidth: 1200, previewHeight: 800 }), "50% 50%");
  assert.equal(getOrbitalPortalObjectPosition({ position: "50% 50%", previewWidth: 900, previewHeight: 900 }), "50% 50%");
});

test("the safety focus applies only to the active portal presentation", async () => {
  const template = await fs.readFile(templatePath, "utf8");

  assert.match(template, /style=\{\{ objectPosition: activePortalObjectPosition \}\}/u);
  assert.match(template, /data-portal-focus=\{activePortalObjectPosition === activeWork\.position/u);
  assert.match(template, /loading="lazy" style=\{\{ objectPosition: slot\.work\.position \}\}/u);
});

test("the active portal follows the source orientation without changing the portrait orbit slots", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(templatePath, "utf8"),
    fs.readFile(cssPath, "utf8"),
  ]);

  assert.match(template, /import \{ primaryPhotoRatioForDimensions \} from "\.\.\/\.\.\/photo-ratio-policy"/u);
  assert.match(
    template,
    /const activePortalRatio = activeWork\s*\? primaryPhotoRatioForDimensions\(activeWork\.previewWidth, activeWork\.previewHeight\) \?\? "3:2"\s*:\s*activeSlot\.ratio === "2:3" \? "2:3" : "3:2"/su,
  );
  assert.match(template, /className=\{styles\.portalStage\} data-portal-ratio=\{activePortalRatio\}/u);
  assert.match(css, /\.portalImage\s*\{[^}]*width:\s*var\(--portal-media-size\);[^}]*aspect-ratio:\s*3 \/ 2;/su);
  assert.match(css, /\.portalStage\[data-portal-ratio="2:3"\] \.portalImage\s*\{[^}]*width:\s*auto;[^}]*height:\s*var\(--portal-media-size\);[^}]*aspect-ratio:\s*2 \/ 3;/su);
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*\.portalStage\s*\{[^}]*--portal-media-size:\s*82vw;/u);
});
