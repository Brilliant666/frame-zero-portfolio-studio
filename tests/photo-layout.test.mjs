import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule(t, sourceRelativePath) {
  const sourcePath = new URL(`../${sourceRelativePath}`, import.meta.url);
  const source = await fs.readFile(sourcePath, "utf8");
  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.basename(sourceRelativePath),
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-layout-test-"));
  const modulePath = path.join(directory, `${path.basename(sourceRelativePath, path.extname(sourceRelativePath))}.mjs`);
  if (
    sourceRelativePath === "app/photo-library.ts"
    || sourceRelativePath === "app/templates/shared/source-orientation-layout.ts"
  ) {
    const policySource = await fs.readFile(new URL("../app/photo-ratio-policy.ts", import.meta.url), "utf8");
    const policyCompiled = ts.transpileModule(policySource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: "photo-ratio-policy.ts",
    }).outputText;
    await fs.writeFile(path.join(directory, "photo-ratio-policy.mjs"), policyCompiled, "utf8");
    compiled = compiled
      .replaceAll('from "./photo-ratio-policy"', 'from "./photo-ratio-policy.mjs"')
      .replaceAll('from "../../photo-ratio-policy"', 'from "./photo-ratio-policy.mjs"');
  }
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

function asset(id, aspectRatio, orientation) {
  const width = Math.round(aspectRatio * 1000);
  const variant = (name, scale) => ({
    src: `/photos/library/${id}-${name}.webp`,
    width: Math.round(width * scale),
    height: Math.round(1000 * scale),
    bytes: 1000,
  });
  return {
    id,
    aspectRatio,
    orientation,
    variants: {
      thumbnail: variant("thumbnail", .3),
      card: variant("card", .7),
      full: variant("full", 1),
    },
  };
}

test("template catalog slot counts stay aligned with their ratio contracts", async (t) => {
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  const adapterSource = await fs.readFile(new URL("../app/legacy-site-content-adapter.ts", import.meta.url), "utf8");
  assert.equal(templateCatalog.length, 11);
  for (const template of templateCatalog) {
    assert.equal(template.photoSlots, template.slotRatios.length, template.id);
    assert.match(
      adapterSource,
      new RegExp(`"${template.id}": Object\\.freeze\\(\\{ templateVersion: TEMPLATE_VERSION, slotCount: ${template.photoSlots} \\}\\)`),
      `${template.id} must stay aligned with the frozen V1 legacy adapter capacity`,
    );
  }
});

test("cinematic light partitions nine frozen slots into independent hero, archive, and statement surfaces", async (t) => {
  const {
    CINEMATIC_LIGHT_ARCHIVE_SLOT_INDEXES,
    CINEMATIC_LIGHT_HERO_SLOT_INDEX,
    CINEMATIC_LIGHT_SLOT_COUNT,
    CINEMATIC_LIGHT_STATEMENT_SLOT_INDEX,
    splitCinematicLightSlots,
  } = await importTypeScriptModule(t, "app/templates/cinematic-light/slot-plan.ts");
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  const cinematic = templateCatalog.find(({ id }) => id === "cinematic-light");

  assert.equal(CINEMATIC_LIGHT_SLOT_COUNT, 9);
  assert.equal(cinematic.photoSlots, CINEMATIC_LIGHT_SLOT_COUNT);
  assert.deepEqual(
    [CINEMATIC_LIGHT_HERO_SLOT_INDEX, ...CINEMATIC_LIGHT_ARCHIVE_SLOT_INDEXES, CINEMATIC_LIGHT_STATEMENT_SLOT_INDEX].sort((left, right) => left - right),
    Array.from({ length: 9 }, (_, index) => index),
  );

  const legacySlots = Array.from({ length: 9 }, (_, slotIndex) => ({ assetId: `legacy-${slotIndex}`, slotIndex }));
  const split = splitCinematicLightSlots(legacySlots);
  assert.equal(split.hero.assetId, "legacy-0");
  assert.equal(split.statement.assetId, "legacy-8");
  assert.deepEqual(split.archive.flatMap((slot) => slot ? [slot.assetId] : []), [
    "legacy-1", "legacy-2", "legacy-3", "legacy-4", "legacy-5", "legacy-6", "legacy-7",
  ]);
  assert.equal(new Set([
    split.hero.assetId,
    ...split.archive.flatMap((slot) => slot ? [slot.assetId] : []),
    split.statement.assetId,
  ]).size, 9, "legacy assets must render once without a silent duplicate projection");
});

test("cinematic light auto composition fills all nine frozen slots with unique assets", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  const cinematic = templateCatalog.find(({ id }) => id === "cinematic-light");
  const assets = Array.from({ length: 39 }, (_, index) => index % 2 === 0
    ? asset(`cinematic-landscape-${String(index).padStart(2, "0")}`, 3 / 2, "landscape")
    : asset(`cinematic-portrait-${String(index).padStart(2, "0")}`, 2 / 3, "portrait"));
  const works = autoComposeTemplateWorks(assets, cinematic.slotRatios, [], { templateId: cinematic.id });

  assert.equal(works.length, 9);
  assert.deepEqual(works.map(({ slotIndex }) => slotIndex), Array.from({ length: 9 }, (_, index) => index));
  assert.equal(new Set(works.map(({ assetId }) => assetId)).size, 9);
});

test("cinematic renderer never maps structural hero or statement slots into the archive", async () => {
  const template = await fs.readFile(new URL("../app/templates/cinematic-light/template.tsx", import.meta.url), "utf8");

  assert.match(template, /splitCinematicLightSlots\(photoSlots\)/);
  assert.match(template, /groupSourceOrientationSlots\(archiveSlots\)/);
  assert.match(template, /archiveRows\.map\(/);
  assert.doesNotMatch(template, /photoSlots\.map\(/);
  assert.match(template, /data-cinematic-photo-role="hero"/);
  assert.match(template, /data-cinematic-photo-role="archive"/);
  assert.match(template, /data-cinematic-photo-role="statement"/);
  assert.match(template, /data-cinematic-archive-position=/);
});

test("film rail partitions nine frozen slots into one hero and eight independent frames", async (t) => {
  const {
    FILM_RAIL_FRAME_SLOT_INDEXES,
    FILM_RAIL_HERO_SLOT_INDEX,
    FILM_RAIL_SLOT_COUNT,
    splitFilmRailSlots,
  } = await importTypeScriptModule(t, "app/templates/film-rail/slot-plan.ts");
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  const film = templateCatalog.find(({ id }) => id === "film-rail");

  assert.equal(FILM_RAIL_SLOT_COUNT, 9);
  assert.equal(film.photoSlots, FILM_RAIL_SLOT_COUNT);
  assert.deepEqual(
    [FILM_RAIL_HERO_SLOT_INDEX, ...FILM_RAIL_FRAME_SLOT_INDEXES].sort((left, right) => left - right),
    Array.from({ length: 9 }, (_, index) => index),
  );

  const legacySlots = Array.from({ length: 9 }, (_, slotIndex) => ({ assetId: `legacy-film-${slotIndex}`, slotIndex }));
  const split = splitFilmRailSlots(legacySlots);
  assert.equal(split.hero.assetId, "legacy-film-0");
  assert.deepEqual(split.frames.flatMap((slot) => slot ? [slot.assetId] : []), [
    "legacy-film-1", "legacy-film-2", "legacy-film-3", "legacy-film-4",
    "legacy-film-5", "legacy-film-6", "legacy-film-7", "legacy-film-8",
  ]);
  assert.equal(new Set([
    split.hero.assetId,
    ...split.frames.flatMap((slot) => slot ? [slot.assetId] : []),
  ]).size, 9, "legacy film assets must render once without reusing the hero as frame one");
});

test("film rail auto composition fills its hero and all eight frames uniquely", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  const film = templateCatalog.find(({ id }) => id === "film-rail");
  const assets = Array.from({ length: 19 }, (_, index) => (
    asset(`film-landscape-${String(index).padStart(2, "0")}`, 3 / 2, "landscape")
  ));
  const works = autoComposeTemplateWorks(assets, film.slotRatios, [], { templateId: film.id });

  assert.equal(works.length, 9);
  assert.deepEqual(works.map(({ slotIndex }) => slotIndex), Array.from({ length: 9 }, (_, index) => index));
  assert.equal(new Set(works.map(({ assetId }) => assetId)).size, 9);
});

test("film renderer keeps its hero outside the eight-frame rail", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/film-rail/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/film-rail/film-rail.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(template, /splitFilmRailSlots\(photoSlots\)/);
  assert.doesNotMatch(template, /filmSlots\.find\(/);
  assert.match(template, /data-film-photo-role="hero"/);
  assert.match(template, /data-film-photo-role="frame"/);
  assert.match(template, />八格连续放映</);
  assert.match(css, /\.timeline > div \{[^}]*grid-template-columns:\s*repeat\(8, 1fr\)/);
  assert.doesNotMatch(css, /\.timeline > div \{[^}]*repeat\(9, 1fr\)/);
});

test("film rail exposes boundary-aware controls on the two track edges", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/film-rail/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/film-rail/film-rail.module.css", import.meta.url), "utf8"),
  ]);

  const filmStockStart = template.indexOf("className={styles.filmStock}");
  const railStart = template.indexOf("className={styles.rail}", filmStockStart);
  const controlsStart = template.indexOf("className={styles.railControls}", filmStockStart);
  assert.ok(filmStockStart >= 0 && controlsStart > filmStockStart && controlsStart < railStart,
    "the controls must overlay the film stock instead of remaining in its heading");

  const controls = template.slice(controlsStart, railStart);
  assert.match(controls, /role="group"\s+aria-label="胶片轨道控制"/);
  assert.equal((controls.match(/aria-controls="film-rail"/g) ?? []).length, 2);
  assert.match(controls, /className=\{styles\.railPrevious\}[\s\S]*?onClick=\{\(\) => handleRailMove\(-1\)\}[\s\S]*?aria-label="向左滑动胶片轨道"[\s\S]*?aria-disabled=\{railEdges\.atStart\}/);
  assert.match(controls, /className=\{styles\.railNext\}[\s\S]*?onClick=\{\(\) => handleRailMove\(1\)\}[\s\S]*?aria-label="向右滑动胶片轨道"[\s\S]*?aria-disabled=\{railEdges\.atEnd\}/);
  assert.doesNotMatch(controls, /(?:^|\s)disabled=/,
    "edge controls must remain focusable when they reach a boundary");
  assert.match(template, /useState\(\{ atStart: true, atEnd: false \}\)/);
  assert.match(template, /atStart:\s*rail\.scrollLeft <= 2/);
  assert.match(template, /atEnd:\s*maxScrollLeft <= 2 \|\| rail\.scrollLeft >= maxScrollLeft - 2/);
  assert.match(template, /rail\.addEventListener\("scroll", syncRailEdges, \{ passive: true \}\)/);
  assert.match(template, /new ResizeObserver\(syncRailEdges\)/);
  assert.match(template, /window\.addEventListener\("resize", syncRailEdges\)/);
  assert.match(template, /\[activeView, filmSlots\.length, syncRailEdges\]/);
  assert.match(template, /const handleRailMove = \(direction: -1 \| 1\) => \{[\s\S]*?const isAtRequestedEdge = direction === -1 \? railEdges\.atStart : railEdges\.atEnd;[\s\S]*?if \(isAtRequestedEdge\) return;[\s\S]*?moveRail\(direction\);[\s\S]*?\};/);

  assert.match(css, /\.railControls\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.railControls button\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px[^}]*pointer-events:\s*auto/s);
  assert.match(css, /\.railPrevious\s*\{[^}]*left:/s);
  assert.match(css, /\.railNext\s*\{[^}]*right:/s);
  assert.match(css, /\.railControls button\[aria-disabled="true"\]\s*\{/);
  assert.doesNotMatch(css, /\.railControls button:disabled\s*\{/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.railControls button\s*\{[^}]*width:\s*3rem[^}]*height:\s*3rem/s);
});

test("film edge controls retain drag, snap, timeline, and reduced-motion behavior", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/film-rail/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/film-rail/film-rail.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(template, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(template, /rail\.scrollBy\(\{[\s\S]*?left:\s*direction \* Math\.max\(280, rail\.clientWidth \* 0\.78\)[\s\S]*?behavior:\s*reduceMotion \? "auto" : "smooth"/);
  assert.match(template, /<div className=\{styles\.rail\} id="film-rail" ref=\{railRef\} tabIndex=\{0\} aria-label="横向作品胶片">/);
  assert.match(template, /href=\{`#film-frame-\$\{index \+ 1\}`\}/);

  const railRule = css.match(/\.rail\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";
  assert.match(railRule, /overflow-x:\s*auto/);
  assert.match(railRule, /scroll-snap-type:\s*x mandatory/);
  assert.match(railRule, /scrollbar-width:\s*thin/);
  assert.match(railRule, /overscroll-behavior-inline:\s*contain/);
  assert.match(railRule, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /\.frame\s*\{[^}]*scroll-snap-align:\s*center[^}]*scroll-snap-stop:\s*always/s);
  assert.match(css, /@media \(pointer: coarse\)\s*\{[\s\S]*?\.rail\s*\{[^}]*scroll-snap-type:\s*x proximity/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?scroll-behavior:\s*auto !important/s);
});

test("neon and manga keep their frozen nine-slot selections while separating structural surfaces", async (t) => {
  const { assetToWork, autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  const { templateSlotOrientationMode } = await importTypeScriptModule(t, "app/photo-ratio-policy.ts");

  for (const templateId of ["neon-hud", "manga-panels"]) {
    const template = templateCatalog.find(({ id }) => id === templateId);
    const assets = Array.from({ length: 9 }, (_, slotIndex) => {
      const ratio = templateId === "manga-panels" && slotIndex === 0 ? 2 / 3 : 3 / 2;
      return asset(`${templateId}-legacy-${slotIndex}`, ratio, ratio < 1 ? "portrait" : "landscape");
    });
    const legacyWorks = assets.map((item, slotIndex) => ({
      ...assetToWork(item, slotIndex),
      locked: true,
    }));
    const works = autoComposeTemplateWorks(
      assets,
      template.slotRatios,
      legacyWorks,
      { templateId },
    );

    assert.equal(template.photoSlots, 9, templateId);
    assert.deepEqual(works.map(({ slotIndex }) => slotIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8], templateId);
    assert.equal(new Set(works.map(({ assetId }) => assetId)).size, 9, templateId);
    assert.equal(
      templateSlotOrientationMode(templateId, 8),
      templateId === "neon-hud" ? "fixed" : "source-adaptive",
      templateId,
    );
  }
});

test("all eleven templates expose the approved per-slot orientation policy", async (t) => {
  const { templateSlotOrientationMode } = await importTypeScriptModule(t, "app/photo-ratio-policy.ts");
  const expectedFixedSlots = {
    "cinematic-light": [0, 8],
    "neon-hud": [0, 8],
    "film-rail": "all",
    "manga-panels": [0, 2, 6],
    "prism-liquid": [0, 1, 5],
    "orbital-portal": "all",
    "archive-os": [0],
    "editorial-duet": [0, 2, 5, 8],
    "polaroid-field": [4, 8],
    "character-select": [],
    "museum-depth": [0, 2],
  };
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");

  for (const template of templateCatalog) {
    const fixed = expectedFixedSlots[template.id];
    assert.ok(fixed, template.id);
    for (let slotIndex = 0; slotIndex < template.photoSlots; slotIndex += 1) {
      assert.equal(
        templateSlotOrientationMode(template.id, slotIndex),
        fixed === "all" || fixed.includes(slotIndex) ? "fixed" : "source-adaptive",
        `${template.id} slot ${slotIndex}`,
      );
    }
  }
});

test("hybrid auto composition reserves structural slots and accepts either direction in gallery slots", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const { templateCatalog } = await importTypeScriptModule(t, "app/templates/catalog.ts");
  const hybridIds = [
    "cinematic-light", "neon-hud", "manga-panels", "prism-liquid", "archive-os",
    "editorial-duet", "polaroid-field", "museum-depth",
  ];
  const assets = Array.from({ length: 12 }, (_, index) => index % 2 === 0
    ? asset(`landscape-${index}`, 3 / 2, "landscape")
    : asset(`portrait-${index}`, 2 / 3, "portrait"));

  for (const templateId of hybridIds) {
    const template = templateCatalog.find(({ id }) => id === templateId);
    const works = autoComposeTemplateWorks(assets, template.slotRatios, [], { templateId });
    const reversedWorks = autoComposeTemplateWorks([...assets].reverse(), template.slotRatios, [], { templateId });
    assert.equal(works.length, template.photoSlots, templateId);
    assert.equal(new Set(works.map(({ assetId }) => assetId)).size, works.length, templateId);
    assert.deepEqual(reversedWorks, works, `${templateId} must not depend on manifest order`);
  }
});

test("16:9 remains a display crop while primary landscape assignment targets 3:2", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const primary = asset("primary", 1.5, "landscape");
  const cinematicWide = asset("cinematic-wide", 16 / 9, "landscape");

  const works = autoComposeTemplateWorks(
    [cinematicWide, primary],
    ["16:9"],
  );
  assert.equal(works[0].assetId, primary.id);
});

test("source-orientation adaptive composition fills all nine stable slots for every landscape/portrait mix", async (t) => {
  const { autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const characterRatios = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];

  for (let portraitCount = 0; portraitCount <= 9; portraitCount += 1) {
    const assets = Array.from({ length: 9 }, (_, index) => index < portraitCount
      ? asset(`portrait-${portraitCount}-${index}`, 2 / 3, "portrait")
      : asset(`landscape-${portraitCount}-${index}`, 3 / 2, "landscape"));
    const works = autoComposeTemplateWorks(
      assets,
      characterRatios,
      [],
      { adaptiveToSourceOrientation: true },
    );

    assert.equal(works.length, 9, `${portraitCount} portrait assets`);
    assert.deepEqual(works.map(({ slotIndex }) => slotIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(
      works.map(({ assetId }) => assetId),
      assets.map(({ id }) => id).sort((left, right) => left.localeCompare(right)),
    );
  }
});

test("source-orientation adaptive composition preserves valid locked slot identities", async (t) => {
  const { assetToWork, autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const characterRatios = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];
  const assets = [
    asset("landscape", 3 / 2, "landscape"),
    asset("portrait", 2 / 3, "portrait"),
  ];
  const lockedPortrait = {
    ...assetToWork(assets[1], 7),
    locked: true,
  };

  const works = autoComposeTemplateWorks(
    assets,
    characterRatios,
    [lockedPortrait],
    { adaptiveToSourceOrientation: true },
  );
  const bySlot = new Map(works.map((work) => [work.slotIndex, work]));
  assert.equal(bySlot.get(7)?.assetId, "portrait");
  assert.equal(bySlot.get(7)?.locked, true);
  assert.equal(bySlot.get(0)?.assetId, "landscape");
});

test("character presentation keeps every nine-photo orientation permutation in three justified rows", async (t) => {
  const {
    buildSourceOrientationSlots,
    groupSourceOrientationSlots,
    justifiedPhotoColumns,
  } = await importTypeScriptModule(t, "app/templates/shared/source-orientation-layout.ts");
  const fallback = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];
  const work = (index, portrait) => ({
    code: `WORK-${index}`,
    previewWidth: portrait ? 800 : 1200,
    previewHeight: portrait ? 1200 : 800,
  });

  for (let orientationMask = 0; orientationMask < 2 ** 9; orientationMask += 1) {
    const works = Array.from(
      { length: 9 },
      (_, index) => work(index, (orientationMask & (1 << index)) !== 0),
    );
    const slots = buildSourceOrientationSlots(works, fallback);
    const rows = groupSourceOrientationSlots(slots);
    const portraitCount = works.filter((item) => item.previewHeight > item.previewWidth).length;

    assert.equal(slots.length, 9);
    assert.deepEqual(slots.map(({ index }) => index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(slots.map(({ work: item }) => item?.code), works.map(({ code }) => code));
    assert.equal(slots.filter(({ ratio }) => ratio === "2:3").length, portraitCount);
    assert.ok(slots.every(({ ratio }) => ratio === "3:2" || ratio === "2:3"));
    assert.deepEqual(rows.map(({ length }) => length), [3, 3, 3]);
    assert.deepEqual(rows.flat().map(({ index }) => index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const row of rows) {
      const fractions = justifiedPhotoColumns(row).split(" ").map((value) => Number.parseFloat(value));
      assert.deepEqual(
        fractions.map((fraction, index) => Math.round((fraction / (row[index].ratio === "2:3" ? 2 / 3 : 3 / 2)) * 1_000)),
        [1_000, 1_000, 1_000],
      );
    }
  }
});

test("prism triptychs justify every mixed-direction row while preserving feature and panorama slots", async (t) => {
  const { justifiedPhotoColumns } = await importTypeScriptModule(t, "app/templates/shared/source-orientation-layout.ts");
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/prism-liquid/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/prism-liquid/template.module.css", import.meta.url), "utf8"),
  ]);

  for (const slotIndexes of [[2, 3, 4], [6, 7, 8]]) {
    for (let orientationMask = 0; orientationMask < 2 ** slotIndexes.length; orientationMask += 1) {
      const row = slotIndexes.map((index, columnIndex) => ({
        index,
        ratio: (orientationMask & (1 << columnIndex)) === 0 ? "3:2" : "2:3",
      }));
      const fractions = justifiedPhotoColumns(row).split(" ").map((value) => Number.parseFloat(value));
      const normalizedHeights = fractions.map((fraction, index) => (
        fraction / (row[index].ratio === "2:3" ? 2 / 3 : 3 / 2)
      ));
      assert.ok(normalizedHeights.every((height) => Math.abs(height - normalizedHeights[0]) < 1e-9));
    }
  }

  assert.match(template, /gallerySlots\.slice\(0, 2\).*justified: false/);
  assert.match(template, /gallerySlots\.slice\(2, 5\).*justified: true/);
  assert.match(template, /gallerySlots\.slice\(5, 6\).*justified: false/);
  assert.match(template, /gallerySlots\.slice\(6, 9\).*justified: true/);
  assert.match(template, /prismTriptychRowStyle\(group\.slots\)/);
  assert.match(template, /data-prism-justified-row=/);
  assert.match(css, /grid-template-columns:\s*var\(--prism-triptych-columns\)/);
  assert.doesNotMatch(css, /\.galleryTriptych\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
});

test("editorial portrait chapters are centered and width-capped only on desktop", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/editorial-duet/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/editorial-duet/template.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(template, /className=\{styles\.photoChapter\}[\s\S]*data-photo-ratio=\{slot\.ratio\}/);
  assert.match(
    css,
    /\.photoChapter\[data-photo-ratio="2:3"\]\s*>\s*:is\(button,\s*\.photoPlaceholderFrame\)\s*\{[^}]*width:\s*min\(64%,\s*30rem\);[^}]*margin-inline:\s*auto;/s,
  );
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*\.photoChapter\[[\s\S]*width:\s*100%;\s*margin:\s*0;/,
  );
});

test("character presentation preserves placeholders and square source identity without a 1:1 target", async (t) => {
  const { buildSourceOrientationSlots } = await importTypeScriptModule(t, "app/templates/shared/source-orientation-layout.ts");
  const fallback = ["3:2", "3:2", "16:9", "3:2", "2:3", "3:2", "16:9", "3:2", "3:2"];

  for (let workCount = 0; workCount <= 9; workCount += 1) {
    const works = Array.from({ length: workCount }, (_, index) => ({
      previewWidth: index === 0 ? 1000 : 1500,
      previewHeight: 1000,
    }));
    const slots = buildSourceOrientationSlots(works, fallback);
    assert.equal(slots.filter(({ work }) => work).length, workCount);
    assert.equal(slots.filter(({ work }) => !work).length, 9 - workCount);
    assert.ok(slots.every(({ ratio }) => ratio === "3:2" || ratio === "2:3"));
    if (workCount > 0) {
      assert.equal(slots[0].sourceOrientation, "square");
      assert.equal(slots[0].ratio, "3:2", "square identity is retained while its presentation target is not square");
    }
  }
});

test("character template keeps keyboard, lightbox, placeholder, and responsive justified-row interactions", async () => {
  const [template, css] = await Promise.all([
    fs.readFile(new URL("../app/templates/character-select/template.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/templates/character-select/template.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(template, /templateId: "character-select"/);
  assert.match(template, /groupSourceOrientationSlots/);
  assert.match(template, /data-character-row/);
  assert.match(template, /data-source-orientation/);
  assert.match(template, /event\.key === "ArrowLeft"/);
  assert.match(template, /event\.key === "ArrowRight"/);
  assert.match(template, /aria-pressed=/);
  assert.ok((template.match(/onOpenWork\(/g) ?? []).length >= 2, "fighter and archive must keep lightbox entry points");
  assert.ok((template.match(/<PhotoPlaceholder/g) ?? []).length >= 3);
  assert.match(template, /PhotoPlaceholder slot=\{slot\} compact label="ARCHIVE SLOT PENDING"/);
  assert.match(css, /grid-template-columns:var\(--character-columns\)/);
  assert.match(css, /@media \(max-width:650px\)/);
  assert.doesNotMatch(css, /aspect-ratio:\s*1(?:;|\})/);
});

test("all formal renderers opt into the shared slot-level orientation policy and retain mobile CSS", async () => {
  const templateIds = [
    "cinematic-light", "neon-hud", "film-rail", "manga-panels", "prism-liquid",
    "orbital-portal", "archive-os", "editorial-duet", "polaroid-field",
    "character-select", "museum-depth",
  ];
  const cssByTemplate = {
    "cinematic-light": "../app/globals.css",
    "neon-hud": "../app/templates/neon-hud/template.module.css",
    "film-rail": "../app/templates/film-rail/film-rail.module.css",
    "manga-panels": "../app/templates/manga-panels/manga-panels.module.css",
    "prism-liquid": "../app/templates/prism-liquid/template.module.css",
    "orbital-portal": "../app/templates/orbital-portal/template.module.css",
    "archive-os": "../app/templates/archive-os/archive-os.module.css",
    "editorial-duet": "../app/templates/editorial-duet/template.module.css",
    "polaroid-field": "../app/templates/polaroid-field/polaroid-field.module.css",
    "character-select": "../app/templates/character-select/template.module.css",
    "museum-depth": "../app/templates/museum-depth/template.module.css",
  };
  for (const templateId of templateIds) {
    const [template, css] = await Promise.all([
      fs.readFile(new URL(`../app/templates/${templateId}/template.tsx`, import.meta.url), "utf8"),
      fs.readFile(new URL(cssByTemplate[templateId], import.meta.url), "utf8"),
    ]);
    assert.match(template, new RegExp(`templateId: ["']${templateId}["']`), templateId);
    assert.match(template, /data-photo-ratio/, templateId);
    assert.match(css, /@media\s*\(max-width:/, `${templateId} must retain its 390/320 responsive lane`);
  }
});

test("moving a work retargets only system-generated frame titles", async (t) => {
  const {
    assetToWork,
    generatedFrameTitle,
    retargetWorkToSlot,
  } = await importTypeScriptModule(t, "app/photo-library.ts");
  const source = assetToWork(asset("move-me", 1.5, "landscape"), 0);

  const moved = retargetWorkToSlot(source, 8);
  assert.equal(moved.slotIndex, 8);
  assert.equal(moved.title, "FRAME 09");
  assert.equal(generatedFrameTitle(8), "FRAME 09");

  const custom = retargetWorkToSlot({ ...source, title: "MY CUSTOM TITLE" }, 8);
  assert.equal(custom.slotIndex, 8);
  assert.equal(custom.title, "MY CUSTOM TITLE", "human-authored titles must survive slot changes");
});

test("auto composition preserves valid locks, drops orphan locks, and leaves incompatible slots empty", async (t) => {
  const { assetToWork, autoComposeTemplateWorks } = await importTypeScriptModule(t, "app/photo-library.ts");
  const landscape = asset("landscape", 1.5, "landscape");
  const secondLandscape = asset("landscape-two", 1.7, "landscape");
  const locked = { ...assetToWork(landscape, 1), locked: true, title: "KEEP THIS EDIT" };
  const orphan = { ...assetToWork(asset("missing", .67, "portrait"), 2), locked: true };
  const incompatibleLock = { ...assetToWork(secondLandscape, 2), locked: true };

  const works = autoComposeTemplateWorks(
    [landscape, secondLandscape],
    ["3:2", "16:9", "2:3"],
    [locked, orphan, incompatibleLock],
  );
  const bySlot = new Map(works.map((work) => [work.slotIndex, work]));

  assert.equal(bySlot.get(1)?.assetId, landscape.id);
  assert.equal(bySlot.get(1)?.title, "KEEP THIS EDIT");
  assert.equal(bySlot.get(1)?.locked, true);
  assert.equal(bySlot.get(0)?.assetId, secondLandscape.id);
  assert.equal(bySlot.get(0)?.locked, false, "an incompatible lock must be released before rematching");
  assert.equal(bySlot.has(2), false, "portrait slot should remain a placeholder");
  assert.equal(works.some((work) => work.assetId === "missing"), false);
});
