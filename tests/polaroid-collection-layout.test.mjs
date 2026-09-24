import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function load(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "collection-layout-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const name of ["viewport-fit", "collection-layout"]) {
    const source = await fs.readFile(new URL(`../app/templates/polaroid-field/${name}.ts`, import.meta.url), "utf8");
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    await fs.writeFile(path.join(directory, `${name}.mjs`), js.replace('"./viewport-fit"', '"./viewport-fit.mjs"'));
  }
  return { ...await import(pathToFileURL(path.join(directory, "collection-layout.mjs"))), ...await import(pathToFileURL(path.join(directory, "viewport-fit.mjs"))) };
}

test("variable constellations retain every natural ratio, order and rotated bounds", async (t) => {
  const { buildCollectionLayout, getCollectionPlacementBounds, COLLECTION_CARD_CHROME, fitRectsToViewport } = await load(t);
  for (const count of [0, 1, 2, 3, 5, 8, 9, 13, 40]) {
    for (const ratios of [[2 / 3], [3 / 2], [16 / 9, 3 / 2, 4 / 3, 1, 3 / 4, 2 / 3]]) {
      const cards = Array.from({ length: count }, (_, i) => ({ id: `photo-${i}`, aspectRatio: ratios[i % ratios.length] }));
      for (const viewportWidth of [1440, 390, 320]) {
        const layout = buildCollectionLayout(cards, { viewportWidth, kind: count <= 3 ? "covers" : "photos" });
        assert.deepEqual(layout, buildCollectionLayout(cards, { viewportWidth, kind: count <= 3 ? "covers" : "photos" }));
        assert.deepEqual(layout.placements.map((item) => item.id), cards.map((item) => item.id));
        const bounds = layout.placements.map(getCollectionPlacementBounds);
        layout.placements.forEach((card, i) => {
          assert.ok(Math.abs((card.width - COLLECTION_CARD_CHROME.horizontal) / (card.height - COLLECTION_CARD_CHROME.vertical) - cards[i].aspectRatio) < 1e-9);
          const inset = viewportWidth < 600 ? 15.99 : 55.99;
          assert.ok(bounds[i].left >= inset && bounds[i].top >= inset);
          assert.ok(bounds[i].right <= layout.canvasWidth - inset && bounds[i].bottom <= layout.canvasHeight - inset);
          for (let j = i + 1; j < bounds.length; j++) {
            const a = bounds[i], b = bounds[j];
            assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `collision ${i}/${j}`);
          }
        });
        const fit = fitRectsToViewport({ width: viewportWidth, height: 720 }, { width: layout.canvasWidth, height: layout.canvasHeight }, layout.placements, 24);
        if (!count) assert.equal(fit, null);
        else {
          assert.ok((fit.content.right - fit.content.left) * fit.view.scale <= viewportWidth - 48 + 1e-7);
          assert.ok((fit.content.bottom - fit.content.top) * fit.view.scale <= 672 + 1e-7);
        }
      }
    }
  }
});

test("three covers reserve identity space; focus selection is stable and scenes grow", async (t) => {
  const { buildCollectionLayout, getCollectionPlacementBounds } = await load(t);
  const cards = Array.from({ length: 40 }, (_, i) => ({ id: `asset-${i}`, aspectRatio: i % 2 ? 2 / 3 : 3 / 2 }));
  const covers = buildCollectionLayout(cards.slice(0, 3), { kind: "covers" });
  assert.ok(Math.min(...covers.placements.map((card) => getCollectionPlacementBounds(card).left)) >= 136);
  assert.ok(covers.placements[1].left > covers.placements[0].left);
  assert.ok(covers.placements[2].left < covers.placements[0].left);
  assert.ok(covers.placements[1].top < covers.placements[2].top);
  assert.equal(buildCollectionLayout(cards, { focusId: "missing" }).focusId, "asset-0");
  const chosen = buildCollectionLayout(cards, { focusId: "asset-17" });
  assert.equal(chosen.focusId, "asset-17");
  assert.equal(chosen.placements[17].zIndex, 42);
  const small = buildCollectionLayout(cards.slice(0, 9));
  const large = buildCollectionLayout(cards);
  assert.equal(small.placements[0].width, large.placements[0].width);
  assert.ok(large.canvasWidth * large.canvasHeight > small.canvasWidth * small.canvasHeight);
  assert.equal(large.threads.length, 39);
});

test("mobile keeps readable staggered photos in a vertically growing scene", async (t) => {
  const { buildCollectionLayout, getCollectionPlacementBounds } = await load(t);
  const cards = Array.from({ length: 9 }, (_, i) => ({ id: `mobile-${i}`, aspectRatio: i % 2 ? 2 / 3 : 3 / 2 }));
  const mobile = buildCollectionLayout(cards, { kind: "photos", viewportWidth: 390 });
  const desktop = buildCollectionLayout(cards, { kind: "photos", viewportWidth: 1440 });
  assert.ok(mobile.canvasWidth < 340);
  assert.ok(mobile.placements.every((card) => card.width >= 190));
  for (let i = 1; i < mobile.placements.length; i++) {
    assert.ok(getCollectionPlacementBounds(mobile.placements[i]).top >= getCollectionPlacementBounds(mobile.placements[i - 1]).bottom + 41.99);
  }
  t.diagnostic(`9 mixed photos: desktop ${desktop.canvasWidth}x${desktop.canvasHeight}; mobile ${mobile.canvasWidth}x${mobile.canvasHeight}`);
  const covers = buildCollectionLayout(cards.slice(0, 3), { kind: "covers", viewportWidth: 390 });
  t.diagnostic(`3 mobile covers: ${covers.canvasWidth}x${covers.canvasHeight}`);
});
