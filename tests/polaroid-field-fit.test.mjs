import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importTypescriptModule(t, relativePath, fileName) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-polaroid-fit-test-"));
  const modulePath = path.join(directory, `${path.parse(fileName).name}.mjs`);
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

function importFitModule(t) {
  return importTypescriptModule(
    t,
    "../app/templates/polaroid-field/viewport-fit.ts",
    "viewport-fit.ts",
  );
}

function importFieldLayoutModule(t) {
  return importTypescriptModule(
    t,
    "../app/templates/polaroid-field/field-layout.ts",
    "field-layout.ts",
  );
}

const VIEWPORT = { width: 1536, height: 720 };
const FIT_INSET = 32;
const REM = 16;
const DEFAULT_RATIOS = ["3:2", "3:2", "3:2", "3:2", "2:3", "3:2", "3:2", "3:2", "3:2"];

function layoutGeometry(layout) {
  return {
    canvas: { width: layout.canvasWidth * REM, height: layout.canvasHeight * REM },
    cards: layout.placements.map((placement) => ({
      left: placement.left * REM,
      top: placement.top * REM,
      width: placement.width * REM,
      height: placement.height * REM,
      rotation: placement.rotation,
    })),
  };
}

function projectBounds(bounds, fit, view = fit.view) {
  return {
    left: fit.viewport.width / 2 + view.x + (bounds.left - fit.canvas.width / 2) * view.scale,
    top: fit.viewport.height / 2 + view.y + (bounds.top - fit.canvas.height / 2) * view.scale,
    right: fit.viewport.width / 2 + view.x + (bounds.right - fit.canvas.width / 2) * view.scale,
    bottom: fit.viewport.height / 2 + view.y + (bounds.bottom - fit.canvas.height / 2) * view.scale,
  };
}

function assertAllCardsInside(getRotatedBounds, fit, cards) {
  const tolerance = .01;
  for (const [index, card] of cards.entries()) {
    const projected = projectBounds(getRotatedBounds(card), fit);
    assert.ok(projected.left >= fit.inset - tolerance, `card ${index + 1} left edge`);
    assert.ok(projected.top >= fit.inset - tolerance, `card ${index + 1} top edge`);
    assert.ok(projected.right <= fit.viewport.width - fit.inset + tolerance, `card ${index + 1} right edge`);
    assert.ok(projected.bottom <= fit.viewport.height - fit.inset + tolerance, `card ${index + 1} bottom edge`);
  }
}

test("rotation-aware bounds include the card's transformed corners", async (t) => {
  const { getRotatedBounds } = await importFitModule(t);
  const bounds = getRotatedBounds({ left: 10, top: 20, width: 100, height: 50, rotation: 90 });

  assert.ok(Math.abs(bounds.left - 35) < .0001);
  assert.ok(Math.abs(bounds.top + 5) < .0001);
  assert.ok(Math.abs(bounds.right - 85) < .0001);
  assert.ok(Math.abs(bounds.bottom - 95) < .0001);
});

test("desktop FIT keeps all nine rotated polaroids inside the safe viewport", async (t) => {
  const [{ fitRectsToViewport, getMinimumScale, getRotatedBounds }, { buildPolaroidFieldLayout }] = await Promise.all([
    importFitModule(t),
    importFieldLayoutModule(t),
  ]);
  const { canvas, cards } = layoutGeometry(buildPolaroidFieldLayout(DEFAULT_RATIOS));
  assert.equal(cards.length, 9);

  const fit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);
  assert.ok(fit);
  assert.ok(fit.view.scale > .72, "the ratio-aware constellation should remain legible in FIT");
  assert.ok(fit.view.scale <= 1);
  assert.equal(getMinimumScale(fit.view.scale), .72);
  assertAllCardsInside(getRotatedBounds, fit, cards);
});

test("resizing recomputes a legal FIT instead of reusing a stale scale", async (t) => {
  const [{ fitRectsToViewport, getRotatedBounds }, { buildPolaroidFieldLayout }] = await Promise.all([
    importFitModule(t),
    importFieldLayoutModule(t),
  ]);
  const { canvas, cards } = layoutGeometry(buildPolaroidFieldLayout(DEFAULT_RATIOS));
  const wideFit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);
  const narrowFit = fitRectsToViewport({ width: 900, height: 720 }, canvas, cards, FIT_INSET);

  assert.ok(wideFit && narrowFit);
  assert.ok(narrowFit.view.scale < wideFit.view.scale);
  assertAllCardsInside(getRotatedBounds, narrowFit, cards);
});

test("dynamic pan bounds keep every content edge reachable after zoom", async (t) => {
  const [{ constrainView, fitRectsToViewport, getMinimumScale, getPanBounds }, { buildPolaroidFieldLayout }] = await Promise.all([
    importFitModule(t),
    importFieldLayoutModule(t),
  ]);
  const { canvas, cards } = layoutGeometry(buildPolaroidFieldLayout(DEFAULT_RATIOS));
  const fit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);
  assert.ok(fit);

  const pan = getPanBounds(fit, 1);
  assert.ok(pan.minX < pan.maxX);
  assert.ok(pan.minY < pan.maxY);

  const rightEdge = projectBounds(fit.content, fit, { x: pan.minX, y: pan.minY, scale: 1 }).right;
  const leftEdge = projectBounds(fit.content, fit, { x: pan.maxX, y: pan.maxY, scale: 1 }).left;
  const bottomEdge = projectBounds(fit.content, fit, { x: pan.minX, y: pan.minY, scale: 1 }).bottom;
  const topEdge = projectBounds(fit.content, fit, { x: pan.maxX, y: pan.maxY, scale: 1 }).top;
  assert.ok(Math.abs(rightEdge - (VIEWPORT.width - FIT_INSET)) < .001);
  assert.ok(Math.abs(leftEdge - FIT_INSET) < .001);
  assert.ok(Math.abs(bottomEdge - (VIEWPORT.height - FIT_INSET)) < .001);
  assert.ok(Math.abs(topEdge - FIT_INSET) < .001);

  const constrained = constrainView(
    { x: 10_000, y: -10_000, scale: 10 },
    fit,
    getMinimumScale(fit.view.scale),
    1.28,
  );
  const maximumPan = getPanBounds(fit, 1.28);
  assert.equal(constrained.scale, 1.28);
  assert.ok(constrained.x <= maximumPan.maxX + .001);
  assert.ok(constrained.y >= maximumPan.minY - .001);
});

test("all 128 adaptive orientation combinations keep rotated cards bounded and separated", async (t) => {
  const [{ fitRectsToViewport, getRotatedBounds }, {
    buildPolaroidFieldLayout,
    getPolaroidFieldPlacementBounds,
    POLAROID_FIELD_MIN_GAP_REM,
    POLAROID_FIELD_SAFE_INSET_REM,
  }] = await Promise.all([importFitModule(t), importFieldLayoutModule(t)]);
  const adaptiveSlotIndexes = [0, 1, 2, 3, 5, 6, 7];
  const tolerance = .002;

  for (let orientationMask = 0; orientationMask < 2 ** adaptiveSlotIndexes.length; orientationMask += 1) {
    const ratios = [...DEFAULT_RATIOS];
    adaptiveSlotIndexes.forEach((slotIndex, bitIndex) => {
      ratios[slotIndex] = (orientationMask & (1 << bitIndex)) === 0 ? "3:2" : "2:3";
    });
    const layout = buildPolaroidFieldLayout(ratios);
    const bounds = layout.placements.map(getPolaroidFieldPlacementBounds);
    const { canvas, cards } = layoutGeometry(layout);
    const fit = fitRectsToViewport(VIEWPORT, canvas, cards, FIT_INSET);

    assert.deepEqual(layout.placements.map(({ slotIndex }) => slotIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(layout.placements[4].band, "hero");
    assert.equal(layout.placements[4].ratio, "2:3");
    assert.equal(layout.threads.length, 10);
    assert.ok(fit, `mask ${orientationMask}: FIT exists`);
    assert.ok(fit.view.scale > .72, `mask ${orientationMask}: FIT remains legible`);
    assertAllCardsInside(getRotatedBounds, fit, cards);

    bounds.forEach((card, index) => {
      assert.ok(card.left >= POLAROID_FIELD_SAFE_INSET_REM - tolerance, `mask ${orientationMask}, card ${index + 1}: left`);
      assert.ok(card.top >= POLAROID_FIELD_SAFE_INSET_REM - tolerance, `mask ${orientationMask}, card ${index + 1}: top`);
      assert.ok(card.right <= layout.canvasWidth - POLAROID_FIELD_SAFE_INSET_REM + tolerance, `mask ${orientationMask}, card ${index + 1}: right`);
      assert.ok(card.bottom <= layout.canvasHeight - POLAROID_FIELD_SAFE_INSET_REM + tolerance, `mask ${orientationMask}, card ${index + 1}: bottom`);
    });

    for (let leftIndex = 0; leftIndex < bounds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bounds.length; rightIndex += 1) {
        const left = bounds[leftIndex];
        const right = bounds[rightIndex];
        const horizontalGap = Math.max(left.left - right.right, right.left - left.right, 0);
        const verticalGap = Math.max(left.top - right.bottom, right.top - left.bottom, 0);
        assert.ok(
          horizontalGap >= POLAROID_FIELD_MIN_GAP_REM - tolerance
            || verticalGap >= POLAROID_FIELD_MIN_GAP_REM - tolerance,
          `mask ${orientationMask}: cards ${leftIndex + 1} and ${rightIndex + 1} must keep an auditable gap`,
        );
      }
    }
  }
});

test("field layout is ratio-aware, deterministic, and rejects a non-nine-slot contract", async (t) => {
  const { buildPolaroidFieldLayout } = await importFieldLayoutModule(t);
  const landscape = buildPolaroidFieldLayout(DEFAULT_RATIOS);
  const portraitRatios = [...DEFAULT_RATIOS];
  portraitRatios[0] = "2:3";
  const portrait = buildPolaroidFieldLayout(portraitRatios);

  assert.ok(portrait.placements[0].width < landscape.placements[0].width);
  assert.equal(portrait.placements[0].height, landscape.placements[0].height);
  assert.deepEqual(buildPolaroidFieldLayout(DEFAULT_RATIOS), landscape);
  assert.throws(() => buildPolaroidFieldLayout(DEFAULT_RATIOS.slice(0, 8)), /exactly 9 ratios/);
});

test("template wiring preserves nine slots, keyboard access, FIT reset, mobile layout, and reduced motion", async () => {
  const [template, css, catalog] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
  ]);
  assert.match(catalog, /id: "polaroid-field"[\s\S]*photoSlots: 9/);
  assert.match(template, /buildPolaroidFieldLayout\(fieldSlots\.map/);
  assert.match(template, /data-field-layout="ratio-aware-v1"/);
  assert.match(template, /data-rotation=\{placement\.rotation\}/);
  assert.match(template, /data-layout-band=\{placement\.band\}/);
  assert.match(template, /new ResizeObserver\(scheduleRecompute\)/);
  assert.match(template, /tabIndex=\{desktopFieldEnabled \? 0 : undefined\}/);
  assert.match(template, /desktopFieldEnabled[\s\S]*九张拍立得作品画廊/);
  assert.match(template, /case "0":[\s\S]*case "Home":[\s\S]*fitToContent\(\)/);
  assert.match(template, /onClick=\{fitToContent\}[\s\S]*>FIT<\/button>/);
  assert.doesNotMatch(template, /resetView/);
  assert.match(css, /\.fieldCanvas \{[\s\S]*width: var\(--field-canvas-width[\s\S]*height: var\(--field-canvas-height/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*\.fieldCanvas \{[\s\S]*repeat\(auto-fit, minmax\(min\(100%, 14rem\), 1fr\)\)[\s\S]*transform: none !important;/);
  assert.doesNotMatch(css, /\.polaroid\[data-polaroid=/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ready \.polaroid/);
  assert.match(css, /@media \(max-width: 800px\) and \(prefers-reduced-motion: reduce\)[\s\S]*transform: none/);
});
