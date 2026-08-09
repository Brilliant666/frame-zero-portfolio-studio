import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importFitModule(t) {
  const sourcePath = new URL("../app/templates/polaroid-field/viewport-fit.ts", import.meta.url);
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "viewport-fit.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-polaroid-fit-test-"));
  const modulePath = path.join(directory, "viewport-fit.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

const CANVAS = { width: 2112, height: 992 };
const VIEWPORT = { width: 1536, height: 720 };
const FIT_INSET = 32;
const WIDTHS = [400, 336, 384, 320, 432, 304, 368, 336, 416];
const RATIOS = [3 / 2, 16 / 9, 3 / 2, 3 / 2, 2 / 3, 3 / 2, 16 / 9, 3 / 2, 3 / 2];
const LEFT = [.06, .38, .69, .18, .47, .77, .03, .35, .64];
const TOP = [.08, .04, .12, .43, .35, .48, .69, .71, .72];
const ROTATIONS = [-7, 4, -2, 6, -4, 8, 3, -8, 5];

const CARDS = WIDTHS.map((width, index) => ({
  left: LEFT[index] * CANVAS.width,
  top: TOP[index] * CANVAS.height,
  width,
  height: (width - 27.2) / RATIOS[index] + 99.2,
  rotation: ROTATIONS[index],
}));

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
  const { fitRectsToViewport, getMinimumScale, getRotatedBounds } = await importFitModule(t);
  assert.equal(CARDS.length, 9);

  const fit = fitRectsToViewport(VIEWPORT, CANVAS, CARDS, FIT_INSET);
  assert.ok(fit);
  assert.ok(fit.view.scale > .60, "the compact constellation should remain legible in FIT");
  assert.ok(fit.view.scale < .72, "FIT may lower the former 72% minimum when containment requires it");
  assert.equal(getMinimumScale(fit.view.scale), fit.view.scale);
  assertAllCardsInside(getRotatedBounds, fit, CARDS);
});

test("resizing recomputes a legal FIT instead of reusing a stale scale", async (t) => {
  const { fitRectsToViewport, getRotatedBounds } = await importFitModule(t);
  const wideFit = fitRectsToViewport(VIEWPORT, CANVAS, CARDS, FIT_INSET);
  const narrowFit = fitRectsToViewport({ width: 900, height: 720 }, CANVAS, CARDS, FIT_INSET);

  assert.ok(wideFit && narrowFit);
  assert.ok(narrowFit.view.scale < wideFit.view.scale);
  assertAllCardsInside(getRotatedBounds, narrowFit, CARDS);
});

test("dynamic pan bounds keep every content edge reachable after zoom", async (t) => {
  const { constrainView, fitRectsToViewport, getMinimumScale, getPanBounds } = await importFitModule(t);
  const fit = fitRectsToViewport(VIEWPORT, CANVAS, CARDS, FIT_INSET);
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

test("template wiring preserves nine slots, keyboard access, FIT reset, mobile layout, and reduced motion", async () => {
  const [template, css, catalog] = await Promise.all([
    fs.readFile(new URL("../app/templates/polaroid-field/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/polaroid-field/polaroid-field.module.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/catalog.ts", import.meta.url), "utf8"),
  ]);
  const placementBlock = template.match(/const placements = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  assert.equal(placementBlock.match(/rotation:/g)?.length, 9);
  assert.match(placementBlock, /top: "35%"[\s\S]*z: 12/);
  assert.match(catalog, /id: "polaroid-field"[\s\S]*photoSlots: 9/);
  assert.match(template, /data-rotation=\{placement\.rotation\}/);
  assert.match(template, /new ResizeObserver\(scheduleRecompute\)/);
  assert.match(template, /tabIndex=\{desktopFieldEnabled \? 0 : undefined\}/);
  assert.match(template, /desktopFieldEnabled[\s\S]*九张拍立得作品画廊/);
  assert.match(template, /case "0":[\s\S]*case "Home":[\s\S]*fitToContent\(\)/);
  assert.match(template, /onClick=\{fitToContent\}[\s\S]*>FIT<\/button>/);
  assert.doesNotMatch(template, /resetView/);
  assert.match(css, /\.fieldCanvas \{[\s\S]*height: 62rem;/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*\.fieldCanvas \{[\s\S]*transform: none !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ready \.polaroid/);
});
