import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("PR24 limited closure keeps its feature freeze, human gate, and deferred buckets explicit", async () => {
  const [currentStatus, ledger, productPolish] = await Promise.all([
    source("docs/CURRENT_STATUS.md"),
    source("docs/human-directed-product-polish.md"),
    source("docs/pre-launch-product-polish.md"),
  ]);
  const governance = `${currentStatus}\n${ledger}\n${productPolish}`;

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
  assert.match(continueHandler, /router\.push\("\/admin\/layout"\)/);
  assert.doesNotMatch(
    continueHandler,
    /templateWorks|applyTemplateCompositionPreview|save|fetch\(|method:\s*"PUT"|\/api\/site-content/,
  );
});

test("legacy budget split cannot widen the public gate or replace the Standard Next gate", async () => {
  const [legacyGate, nextGate] = await Promise.all([
    source("scripts/check-build-budget.mjs"),
    source("scripts/check-next-build-budget.mjs"),
  ]);

  assert.match(legacyGate, /const MAX_PUBLIC_JS = 550 \* 1024/);
  assert.match(legacyGate, /const MAX_ADMIN_JS = 160 \* 1024/);
  assert.match(legacyGate, /const MAX_ADMIN_ENTRY_JS = 80 \* 1024/);
  assert.match(legacyGate, /if \(publicJs > MAX_PUBLIC_JS\)/);
  assert.match(legacyGate, /if \(adminJs > MAX_ADMIN_JS\)/);
  assert.match(legacyGate, /if \(bytes > MAX_ADMIN_ENTRY_JS\)/);
  assert.doesNotMatch(legacyGate, /MAX_PUBLIC_JS\s*=\s*(?:5[6-9]\d|[6-9]\d\d) \* 1024/);

  assert.match(nextGate, /applicationJs: 550 \* 1024/);
  assert.match(nextGate, /bootstrapJs: 700 \* 1024/);
  assert.match(nextGate, /publicCss: 300 \* 1024/);
  assert.match(nextGate, /templateJs: 64 \* 1024/);
  assert.match(nextGate, /applicationJsBytes > NEXT_BUILD_BUDGETS\.applicationJs/);
  assert.match(nextGate, /publicCssBytes > NEXT_BUILD_BUDGETS\.publicCss/);
});
