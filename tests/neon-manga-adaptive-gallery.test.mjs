import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importOrientationLayout(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-neon-manga-layout-"));
  const [layoutSource, policySource] = await Promise.all([
    fs.readFile(new URL("../app/templates/shared/source-orientation-layout.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/photo-ratio-policy.ts", import.meta.url), "utf8"),
  ]);
  const compile = (source, fileName) => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName,
  }).outputText;

  await fs.writeFile(
    path.join(directory, "photo-ratio-policy.mjs"),
    compile(policySource, "photo-ratio-policy.ts"),
    "utf8",
  );
  await fs.writeFile(
    path.join(directory, "source-orientation-layout.mjs"),
    compile(layoutSource, "source-orientation-layout.ts")
      .replaceAll('from "../../photo-ratio-policy"', 'from "./photo-ratio-policy.mjs"'),
    "utf8",
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(path.join(directory, "source-orientation-layout.mjs")).href}?test=${Date.now()}`);
}

async function rendererSources() {
  return Promise.all([
    fs.readFile(new URL("../app/templates/neon-hud/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/neon-hud/template.module.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/manga-panels/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/manga-panels/manga-panels.module.css", import.meta.url), "utf8"),
  ]);
}

async function cinematicSources() {
  return Promise.all([
    fs.readFile(new URL("../app/templates/cinematic-light/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
}

test("cinematic, neon, and manga rows stay balanced, justified, deterministic, and ordered", async (t) => {
  const { groupSourceOrientationSlots, justifiedPhotoColumns } = await importOrientationLayout(t);

  for (const [templateId, slotCount, expectedRowLengths] of [
    ["cinematic-light", 7, [3, 2, 2]],
    ["neon-hud", 8, [3, 3, 2]],
    ["manga-panels", 8, [3, 3, 2]],
  ]) {
    for (let mask = 0; mask < 2 ** slotCount; mask += 1) {
      const slots = Array.from({ length: slotCount }, (_, index) => ({
        index,
        ratio: (mask & (1 << index)) === 0 ? "3:2" : "2:3",
        work: null,
      }));
      const rows = groupSourceOrientationSlots(slots);

      assert.deepEqual(rows.map(({ length }) => length), expectedRowLengths, templateId);
      assert.deepEqual(rows.flat().map(({ index }) => index), slots.map(({ index }) => index), templateId);
      for (const row of rows) {
        const columns = justifiedPhotoColumns(row).split(" ").map(Number.parseFloat);
        assert.deepEqual(
          columns.map((column, index) => Math.round(column / (row[index].ratio === "2:3" ? 2 / 3 : 3 / 2))),
          Array(row.length).fill(1),
          templateId,
        );
      }
    }
  }
});

test("cinematic keeps its hero and statement identities outside seven justified archive slots", async () => {
  const [template, css] = await cinematicSources();

  assert.match(template, /splitCinematicLightSlots\(photoSlots\)/);
  assert.match(template, /groupSourceOrientationSlots\(archiveSlots\)/);
  assert.match(template, /archiveRows\.map\(\(row, rowIndex\)/);
  assert.match(template, /archiveIndex = archiveSlots\.indexOf\(slot\)/);
  assert.doesNotMatch(template, /archiveIndex = rowIndex \* 3 \+ columnIndex/);
  assert.match(template, /data-cinematic-photo-role="hero"/);
  assert.match(template, /data-cinematic-photo-role="archive"/);
  assert.match(template, /data-cinematic-photo-role="statement"/);
  assert.match(template, /data-photo-slot=\{slot\.index \+ 1\}/);
  assert.match(template, /PhotoPlaceholder slot=\{slot\} tone="light"/);
  assert.match(template, /onClick=\{\(\) => onOpenWork\(work\)\}/);

  assert.match(css, /grid-template-columns:\s*var\(--cinematic-archive-columns\)/);
  assert.doesNotMatch(template, /cinematicArchiveLayout|cinematic-archive-basis|cinematic-archive-order/);
  assert.doesNotMatch(css, /cinematic-archive-basis|cinematic-archive-order|\.work-card\[data-photo-slot=/);
});

test("neon keeps the manifesto identity outside its eight interactive presentations", async () => {
  const [template, css] = await rendererSources();

  assert.match(template, /neonInteractiveSlotIndexes = \[0, 1, 2, 3, 4, 5, 6, 7\]/);
  assert.match(template, /neonManifestoSlotIndex = 8/);
  assert.match(template, /groupSourceOrientationSlots\(interactiveSlots\)/);
  assert.match(template, /interactiveSlots\.map\(\(slot, index\) => slot\.work/);
  assert.match(template, /archiveRows\.map\(\(row, rowIndex\)/);
  assert.match(template, /data-photo-slot=\{slot\.index \+ 1\}/);
  assert.match(template, /PhotoPlaceholder slot=\{slot\} tone="dark"/);
  assert.match(template, /onClick=\{\(\) => onOpenWork\(work\)\}/);

  assert.match(css, /grid-template-columns:\s*var\(--neon-archive-columns\)/);
  assert.doesNotMatch(css, /\bflex-basis|(?:^|[;{])\s*order:\s*(?:initial|[0-9]+)/m);
});

test("manga keeps the cover identity outside its eight ordered storyboard panels", async () => {
  const [, , template, css] = await rendererSources();

  assert.match(template, /leadSlot = photoSlots\[0\]/);
  assert.match(template, /photoSlots\.slice\(1, 9\)/);
  assert.match(template, /groupSourceOrientationSlots\(storyboardSlots\)/);
  assert.match(template, /storyboardRows\.map\(\(row, rowIndex\)/);
  assert.match(template, /data-photo-slot=\{slot\.index \+ 1\}/);
  assert.match(template, /PhotoPlaceholder slot=\{slot\} tone="light"/);
  assert.match(template, /onClick=\{\(\) => onOpenWork\(work\)\}/);

  assert.match(css, /grid-template-columns:\s*var\(--manga-storyboard-columns\)/);
  assert.doesNotMatch(css, /\bflex-basis|(?:^|[;{])\s*order:\s*(?:initial|[0-9]+)/m);
});

test("neon and manga mobile galleries keep adaptive portraits off full-width lanes", async () => {
  const [neonTemplate, neonCss, mangaTemplate, mangaCss] = await rendererSources();

  for (const [templateId, template, css, breakpoint] of [
    ["neon-hud", neonTemplate, neonCss, 760],
    ["manga-panels", mangaTemplate, mangaCss, 720],
  ]) {
    assert.match(template, new RegExp(`\\? "\\(max-width: ${breakpoint}px\\) 68vw,`, "i"), templateId);
    assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)/, templateId);
    assert.match(css, /display:\s*contents/, templateId);
    assert.match(css, /\[data-photo-ratio="2:3"\]\s*\{[^}]*width:\s*min\(72%, 22rem\)[^}]*justify-self:\s*center/s, templateId);
    assert.doesNotMatch(css, /\[data-photo-ratio="2:3"\][^{]*\{[^}]*width:\s*100%/s, templateId);
  }
});

test("cinematic mobile archive keeps adaptive portraits centered below full width", async () => {
  const [template, css] = await cinematicSources();

  assert.match(template, /\? "\(max-width: 900px\) 68vw,/i);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.cinematic-archive-row\s*\{\s*display:\s*contents/);
  assert.match(css, /\.work-card\[data-photo-ratio="2:3"\]\s*\{[^}]*width:\s*min\(72%, 22rem\)[^}]*justify-self:\s*center/s);
  assert.doesNotMatch(css, /\.work-card\[data-photo-ratio="2:3"\][^{]*\{[^}]*width:\s*100%/s);
});
