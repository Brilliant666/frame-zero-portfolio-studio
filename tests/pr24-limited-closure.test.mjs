import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("archived checkpoint and handoff retain the complete approved historical text", async () => {
  const separator = "\n---\n\n";
  for (const [filename, digest] of [
    ["docs/CURRENT_STATUS_HISTORY_2026-10-27.md", "d3cfb395fbf467f0d8991a99f6aabd7a13e8b34970b6e87a62bca4b727737238"],
    ["docs/SESSION_HANDOFF_HISTORY_2026-10-27.md", "95d6328ae8520597ad05c11f5c56243d9cf92763faa3b6f1a2288826f883cb73"],
  ]) {
    const document = (await source(filename)).replaceAll("\r\n", "\n");
    const boundary = document.indexOf(separator);
    assert.notEqual(boundary, -1, `${filename} identifies the archived source boundary`);
    const archivedSource = document.slice(boundary + separator.length);
    assert.equal(createHash("sha256").update(archivedSource).digest("hex"), digest, `${filename} retains main 58a92d2 historical evidence`);
  }
});

async function historicalClosure(readSource = source) {
  const [historicalStatus, ledger, productPolish] = await Promise.all([
    readSource("docs/CURRENT_STATUS_HISTORY_2026-10-27.md"),
    readSource("docs/human-directed-product-polish.md"),
    readSource("docs/pre-launch-product-polish.md"),
  ]);
  return { historicalStatus, ledger, productPolish };
}

function assertHistoricalClosure({ historicalStatus, ledger, productPolish }) {
  const governance = `${historicalStatus}\n${ledger}\n${productPolish}`;

  for (const required of [
    "PR24_LIMITED_BASELINE_READY",
    "ced247e5baf19510329c4c3a084a69e6b1ab0c2c",
    "FEATURE_FREEZE = TRUE",
    "PR24 = OPEN + DRAFT",
    "PR24_READY = NO",
    "PR24_MERGED = NO",
    "NEXT_PR_CREATED = NO",
    "PRE_LAUNCH_PRODUCT_POLISH = IN_PROGRESS",
    "ELEVEN_TEMPLATE_HUMAN_VISUAL_APPROVAL = PENDING",
    "HUMAN_APPROVED = 0 / 11",
    "WAITING_FOR_HUMAN_REVIEW",
    "CURRENT_SAVED_TEMPLATE_FALLBACK_BROKEN = CLOSED",
    "ENGINEERING_LAUNCH = FROZEN_AT_REPO_SIDE_BOOTSTRAP_READY",
    "SERVER_DNS_TLS_OPERATIONS = NONE",
    "AUDIT_RECONCILIATION",
    "NEXT_PR_P1",
    "NEXT_PR_P2",
    "PRE_DEPLOYMENT_P1",
    "FUTURE_HOSTED",
    "LOCAL_ONLY_FUTURE",
  ]) {
    assert.match(governance, new RegExp(escapeRegExp(required)));
  }
  assert.equal(
    governance.match(/WAITING_FOR_HUMAN_INPUT/g)?.length,
    1,
    "the superseded token may appear only in the additive audit reconciliation",
  );
  assert.match(ledger, /`WAITING_TOKEN`:[\s\S]*`WAITING_FOR_HUMAN_REVIEW`[\s\S]*`WAITING_FOR_HUMAN_INPUT`/);
  assert.match(ledger, /6173c7564100350e9d2d32fee4b07236895b6b6e/);
  assert.match(ledger, /WINDOWS_LIBVIPS_IMPORT_LIFECYCLE/);
  assert.match(ledger, /HR-006_CHROME_EVIDENCE/);
  assert.match(ledger, /ROUTE_AND_PUBLIC_IDENTITY_DEFERRED/);
  assert.match(ledger, /PUBLIC_IDENTITY_SSR_MISMATCH/);
  assert.match(ledger, /PR #24 merge would accept only this limited baseline/);
  for (const templateId of [
    "cinematic-light",
    "neon-hud",
    "film-rail",
    "manga-panels",
    "prism-liquid",
    "orbital-portal",
    "archive-os",
    "editorial-duet",
    "polaroid-field",
    "character-select",
    "museum-depth",
  ]) {
    assert.match(ledger, new RegExp("^\\| `" + templateId + "` \\| `READY_FOR_HUMAN_RECHECK` \\|", "m"));
  }
  assert.doesNotMatch(ledger, /ELEVEN_TEMPLATE_HUMAN_VISUAL_APPROVAL\s*=\s*(?:COMPLETE|APPROVED)/);
}

test("PR24 historical closure preserves its recorded freeze, review gate, and deferred buckets", async () => {
  assertHistoricalClosure(await historicalClosure());
});

test("current checkpoint changes cannot rewrite or freeze the historical PR24 acceptance", async () => {
  const requested = [];
  const documents = await historicalClosure(async (relativePath) => {
    requested.push(relativePath);
    assert.notEqual(relativePath, "docs/CURRENT_STATUS.md", "current execution state is not a historical fixture");
    return source(relativePath);
  });
  assertHistoricalClosure(documents);
  assert.deepEqual(requested, [
    "docs/CURRENT_STATUS_HISTORY_2026-10-27.md",
    "docs/human-directed-product-polish.md",
    "docs/pre-launch-product-polish.md",
  ]);

  // Moving the fixture must not silently weaken the old acceptance evidence.
  const corrupted = Object.fromEntries(Object.entries(documents).map(([key, value]) => [
    key, value.replaceAll("HUMAN_APPROVED = 0 / 11", "HISTORICAL_APPROVAL_REMOVED"),
  ]));
  assert.throws(() => assertHistoricalClosure(corrupted), /HUMAN_APPROVED/);
});

test("template inspection and selection cannot automatically Apply or save a layout", async () => {
  const template = await source("app/admin/template/template-editor.tsx");
  const inspectHandler = template.slice(
    template.indexOf("const inspectTemplate"),
    template.indexOf("const continueToLayout"),
  );
  const continueHandler = template.slice(
    template.indexOf("const continueToLayout"),
    template.indexOf("const detailState"),
  );

  assert.match(inspectHandler, /setInspectedOverride\(value\)/);
  assert.doesNotMatch(inspectHandler, /setContent|templateWorks|applyTemplateCompositionPreview|fetch\(|method:\s*"PUT"/);
  assert.match(continueHandler, /setContent\(\(current\) => \(\{ \.\.\.current, activeTemplate: templateId \}\)\)/);
  assert.match(continueHandler, /router\.push\(siteScope \? `\$\{siteScope\.adminBasePath\}\/layout` : pathname\.startsWith\("\/test\/admin"\) \? "\/test\/admin\/layout" : "\/admin\/layout"\)/);
  assert.doesNotMatch(
    continueHandler,
    /templateWorks|applyTemplateCompositionPreview|save|fetch\(|method:\s*"PUT"|\/api\/site-content/,
  );
});

test("budget policy preserves historical references and separate production lanes", async () => {
  const [{ LEGACY_REFERENCES }, { NEXT_BUILD_BUDGETS }] = await Promise.all([
    import("../scripts/check-build-budget.mjs"),
    import("../scripts/check-next-build-budget.mjs"),
  ]);
  // Warning/error and CLI behavior are covered with anonymous artifacts in
  // legacy-build-budget.test.mjs and next-build-budget.test.mjs, not source regexes.
  assert.deepEqual(LEGACY_REFERENCES, {
    publicJs: 563200, adminJs: 163840, adminEntryJs: 81920,
    totalCss: 307200, templateJs: 65536, templateCss: 65536,
  });
  assert.deepEqual(NEXT_BUILD_BUDGETS, {
    applicationJs: 563200, bootstrapJs: 716800, publicCss: 307200, templateJs: 65536,
  });
});
