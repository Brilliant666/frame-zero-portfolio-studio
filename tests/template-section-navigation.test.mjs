import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const SHARED_NAVIGATION_PATH = "app/templates/shared/use-template-section-navigation.ts";
const PRIMARY_VIEWS = ["works", "packages", "contact"];
const PRIMARY_LABELS = ["作品", "拍摄套餐", "联系约拍"];

const TOP_NAVIGATION_TEMPLATES = [
  {
    id: "cinematic-light",
    cssPath: "app/globals.css",
    navSelector: ".topbar nav",
    linkSelector: ".topbar nav a",
    mobileBreakpoint: 900,
  },
  {
    id: "neon-hud",
    cssPath: "app/templates/neon-hud/template.module.css",
    navSelector: ".header nav",
    linkSelector: ".header nav a",
    mobileBreakpoint: 1080,
  },
  {
    id: "film-rail",
    cssPath: "app/templates/film-rail/film-rail.module.css",
    navSelector: ".header nav",
    linkSelector: ".header nav a",
    mobileBreakpoint: 720,
  },
  {
    id: "prism-liquid",
    cssPath: "app/templates/prism-liquid/template.module.css",
    navSelector: ".header nav",
    linkSelector: ".header nav a",
    mobileBreakpoint: 900,
  },
  {
    id: "orbital-portal",
    cssPath: "app/templates/orbital-portal/template.module.css",
    navSelector: ".header nav",
    linkSelector: ".header nav a",
    mobileBreakpoint: 1000,
  },
  {
    id: "editorial-duet",
    cssPath: "app/templates/editorial-duet/template.module.css",
    navSelector: ".header nav",
    linkSelector: ".header nav a",
    mobileBreakpoint: 760,
  },
  {
    id: "character-select",
    cssPath: "app/templates/character-select/template.module.css",
    navSelector: ".header nav",
    linkSelector: ".header nav a",
    mobileBreakpoint: 650,
  },
  {
    id: "museum-depth",
    cssPath: "app/templates/museum-depth/template.module.css",
    navSelector: ".header nav",
    linkSelector: ".header nav a",
    mobileBreakpoint: 900,
  },
];

async function source(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function parseSource(text, fileName, scriptKind = ts.ScriptKind.TSX) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind);
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function jsxOpening(node) {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

function jsxTagName(opening, parsed) {
  return opening.tagName.getText(parsed);
}

function jsxAttribute(opening, name) {
  return opening.attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  ) ?? null;
}

function jsxAttributeText(attribute, parsed) {
  if (!attribute?.initializer) return "";
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    return attribute.initializer.expression.getText(parsed);
  }
  return attribute.initializer.getText(parsed);
}

function jsxText(node) {
  const chunks = [];
  visit(node, (child) => {
    if (ts.isJsxText(child)) chunks.push(child.text);
  });
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function directJsxChildren(element, tagName, parsed) {
  return element.children.filter((child) => {
    const opening = jsxOpening(child);
    return opening && jsxTagName(opening, parsed) === tagName;
  });
}

function findPrimaryNavigation(parsed) {
  let match = null;
  visit(parsed, (node) => {
    if (match || !ts.isJsxElement(node) || jsxTagName(node.openingElement, parsed) !== "nav") return;
    const anchors = directJsxChildren(node, "a", parsed);
    if (anchors.map(jsxText).join("|") === PRIMARY_LABELS.join("|")) match = node;
  });
  return match;
}

function findRootMain(parsed) {
  let match = null;
  visit(parsed, (node) => {
    const opening = jsxOpening(node);
    if (!match && opening && jsxTagName(opening, parsed) === "main") match = opening;
  });
  return match;
}

function objectPropertyNames(objectLiteral) {
  return new Set(objectLiteral.properties.flatMap((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return [property.name.text];
    if (ts.isPropertyAssignment(property)) return [property.name.getText()];
    return [];
  }));
}

function objectPropertyValueText(objectLiteral, name, parsed) {
  const property = objectLiteral.properties.find((candidate) => {
    if (ts.isShorthandPropertyAssignment(candidate)) return candidate.name.text === name;
    if (ts.isPropertyAssignment(candidate)) return candidate.name.getText(parsed) === name;
    return false;
  });
  if (!property) return "";
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return property.initializer.getText(parsed);
}

function extractBraceBlock(text, openBraceIndex) {
  assert.equal(text[openBraceIndex], "{", "expected a CSS block opening brace");
  let depth = 1;
  for (let index = openBraceIndex + 1; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(openBraceIndex + 1, index);
  }
  assert.fail("expected CSS block to close");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cssRuleBlocks(text, selector) {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{`, "g");
  const blocks = [];
  for (const match of text.matchAll(pattern)) {
    const openBraceIndex = text.indexOf("{", match.index);
    blocks.push(extractBraceBlock(text, openBraceIndex));
  }
  return blocks;
}

function cssDeclarations(block) {
  return Object.fromEntries(Array.from(block.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;{}]+)/g))
    .map((match) => [match[1], match[2].trim()]));
}

function mediaBlocks(text, maxWidth) {
  const pattern = new RegExp(`@media\\s*\\(\\s*max-width\\s*:\\s*${maxWidth}px\\s*\\)\\s*\\{`, "g");
  return Array.from(text.matchAll(pattern), (match) => {
    const openBraceIndex = text.indexOf("{", match.index);
    return extractBraceBlock(text, openBraceIndex);
  });
}

function minimumRem(value) {
  const trimmed = value.trim();
  const simple = trimmed.match(/^([\d.]+)rem$/);
  if (simple) return Number(simple[1]);
  const clamp = trimmed.match(/^clamp\(\s*([\d.]+)rem\s*,/);
  assert.ok(clamp, `expected a rem value or rem-based clamp(), received ${value}`);
  return Number(clamp[1]);
}

async function importPureNavigationModule() {
  const text = await source(SHARED_NAVIGATION_PATH);
  const start = text.indexOf("export type TemplatePrimaryView");
  const end = text.indexOf("export function useTemplateSectionNavigation");
  assert.ok(start >= 0 && end > start, "shared navigation must keep its pure helpers before the React hook");
  const compiled = ts.transpileModule(text.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "template-section-navigation.ts",
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(url);
}

test("shared template navigation resolves canonical hashes, aliases, and safe fallback views", async () => {
  const {
    getKnownTemplateViewFromHash,
    getTemplateViewFromHash,
  } = await importPureNavigationModule();
  const hashes = {
    works: "#portfolio",
    packages: "#packages",
    contact: "#contact",
  };
  const aliases = [
    { hash: "#top", view: "works" },
    { hash: "#rates", view: "packages" },
    { hash: "#booking", view: "contact" },
  ];

  assert.equal(getKnownTemplateViewFromHash(" #PORTFOLIO ", hashes, aliases), "works");
  assert.equal(getKnownTemplateViewFromHash("packages", hashes, aliases), "packages");
  assert.equal(getKnownTemplateViewFromHash("#contact", hashes, aliases), "contact");
  assert.equal(getKnownTemplateViewFromHash("TOP", hashes, aliases), "works");
  assert.equal(getKnownTemplateViewFromHash("#rates", hashes, aliases), "packages");
  assert.equal(getKnownTemplateViewFromHash("booking", hashes, aliases), "contact");
  assert.equal(getKnownTemplateViewFromHash("#unknown", hashes, aliases), null);
  assert.equal(getKnownTemplateViewFromHash("", hashes, aliases), null);
  assert.equal(getTemplateViewFromHash("#unknown", hashes, aliases), "works");
});

test("shared template navigation owns delegated hash handling, preview safety, and browser history sync", async () => {
  const text = await source(SHARED_NAVIGATION_PATH);
  const parsed = parseSource(text, "use-template-section-navigation.ts", ts.ScriptKind.TS);
  const calls = [];
  visit(parsed, (node) => {
    if (ts.isCallExpression(node)) calls.push(node.getText(parsed));
  });

  assert.ok(calls.some((call) => call.startsWith("event.preventDefault(")));
  assert.ok(calls.some((call) => call.startsWith("window.history.pushState(")));
  assert.ok(calls.some((call) => call.includes('window.addEventListener("hashchange"')));
  assert.ok(calls.some((call) => call.includes('window.addEventListener("popstate"')));
  assert.ok(calls.some((call) => call.includes('window.removeEventListener("hashchange"')));
  assert.ok(calls.some((call) => call.includes('window.removeEventListener("popstate"')));
  assert.match(text, /if\s*\(isPreview\)\s*return/);
  assert.match(text, /if\s*\(!isPreview\s*&&[\s\S]*?window\.history\.pushState/);
  assert.match(text, /a\[href\^=["']#["']\]/);
});

test("shared template navigation closes an open work before direct or history-driven view updates", async () => {
  const text = await source(SHARED_NAVIGATION_PATH);
  const parsed = parseSource(text, "use-template-section-navigation.ts", ts.ScriptKind.TS);
  let optionalCallbackType = null;
  const callbackCalls = [];
  const viewSetterCalls = [];

  visit(parsed, (node) => {
    if (
      ts.isPropertySignature(node)
      && node.name.getText(parsed) === "onBeforeViewChange"
    ) optionalCallbackType = node;
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "onBeforeViewChange"
      && node.questionDotToken
    ) callbackCalls.push(node);
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "setActiveView"
    ) viewSetterCalls.push(node);
  });

  assert.ok(optionalCallbackType?.questionToken, "the pre-view-change callback must remain optional");
  assert.equal(optionalCallbackType.type.getText(parsed).replace(/\s+/g, ""), "()=>void");
  assert.ok(callbackCalls.length > 0, "view navigation must invoke the optional close callback");
  assert.ok(viewSetterCalls.length > 0, "the shared hook must still own view state");

  for (const setter of viewSetterCalls) {
    const precedingSetter = Math.max(
      -1,
      ...viewSetterCalls.filter((candidate) => candidate.pos < setter.pos).map((candidate) => candidate.pos),
    );
    const precedingCallback = Math.max(
      -1,
      ...callbackCalls.filter((candidate) => candidate.pos < setter.pos).map((candidate) => candidate.pos),
    );
    assert.ok(
      precedingCallback > precedingSetter,
      "every shared view-state update must close a possible lightbox first",
    );
  }

  const isInsideConditional = (node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isIfStatement(parent)) return true;
      if (ts.isFunctionLike(parent)) return false;
    }
    return false;
  };
  assert.ok(callbackCalls.some((call) => !isInsideConditional(call)), "known internal links close before activation");
  assert.ok(callbackCalls.some(isInsideConditional), "history focus sync closes before changing views");
});

test("history restores real secondary works hashes without blindly scrolling unknown targets", async () => {
  const text = await source(SHARED_NAVIGATION_PATH);
  const parsed = parseSource(text, "use-template-section-navigation.ts", ts.ScriptKind.TS);
  let knownViewDeclaration = null;
  let normalizedDeclaration = null;
  let secondaryWorksDeclaration = null;
  let secondaryClosestCall = null;
  let historyScrollCall = null;

  visit(parsed, (node) => {
    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(parsed) === "getKnownTemplateViewFromHash"
    ) knownViewDeclaration = node;
    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(parsed) === "normalizeHash"
      && node.parent.parent.parent.getText(parsed).includes("window.location.hash")
    ) normalizedDeclaration = node;
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "closest"
      && node.arguments[0]?.getText(parsed) === `'[data-template-view="works"]'`
    ) {
      secondaryClosestCall = node;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isVariableDeclaration(parent)) {
          secondaryWorksDeclaration = parent;
          break;
        }
      }
    }
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "scrollToHash"
      && node.arguments[0]?.getText(parsed) !== "normalized"
    ) return;
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "scrollToHash"
      && node.arguments[0]?.getText(parsed) === "normalized"
    ) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isIfStatement(parent)) {
          historyScrollCall = { call: node, guard: parent.expression };
          break;
        }
        if (ts.isFunctionLike(parent)) break;
      }
    }
  });

  assert.ok(knownViewDeclaration && normalizedDeclaration && secondaryWorksDeclaration && secondaryClosestCall);
  assert.match(
    secondaryClosestCall.expression.expression.getText(parsed),
    /document\.getElementById\([^)]*\.slice\(1\)\)/,
    "secondary history targets must resolve from the normalized fragment ID",
  );
  assert.ok(historyScrollCall, "history scrolling must be explicitly guarded");
  const knownName = knownViewDeclaration.name.getText(parsed);
  const normalizedName = normalizedDeclaration.name.getText(parsed);
  const secondaryName = secondaryWorksDeclaration.name.getText(parsed);
  let historySyncFunction = historyScrollCall.call.parent;
  while (historySyncFunction && !ts.isFunctionLike(historySyncFunction)) {
    historySyncFunction = historySyncFunction.parent;
  }
  let historyViewSetter = null;
  visit(historySyncFunction, (node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "setActiveView"
    ) historyViewSetter = node;
  });
  assert.ok(historyViewSetter && historyViewSetter.pos < historyScrollCall.call.pos);
  assert.equal(
    historyViewSetter.arguments[0].getText(parsed).replace(/\s+/g, ""),
    `${knownName}??"works"`,
    "history must unhide the works view before scrolling to a valid secondary works target",
  );
  assert.equal(
    historyScrollCall.guard.getText(parsed).replace(/\s+/g, ""),
    `(${knownName}||${secondaryName})&&${normalizedName}`,
    "only a known primary hash or an existing works descendant may trigger history scrolling",
  );

  for (const [templateId, idFragment] of [
    ["film-rail", "film-frame-"],
    ["editorial-duet", "editorial-work-"],
  ]) {
    const templateText = await source(`app/templates/${templateId}/template.tsx`);
    const templateSource = parseSource(templateText, `${templateId}.tsx`);
    let secondaryTarget = null;
    visit(templateSource, (node) => {
      const opening = jsxOpening(node);
      if (
        !secondaryTarget
        && opening
        && jsxAttributeText(jsxAttribute(opening, "id"), templateSource).includes(idFragment)
      ) secondaryTarget = opening;
    });
    assert.ok(secondaryTarget, `${templateId} must retain its secondary deep-link target`);
    let worksAncestor = false;
    for (let parent = secondaryTarget.parent; parent; parent = parent.parent) {
      const opening = jsxOpening(parent);
      if (
        opening
        && jsxAttributeText(jsxAttribute(opening, "data-template-view"), templateSource) === "works"
      ) {
        worksAncestor = true;
        break;
      }
    }
    assert.ok(worksAncestor, `${templateId} secondary hashes must remain inside the works view`);
  }
});

test("delegated secondary works anchors unhide, focus, and update only the public URL", async () => {
  const text = await source(SHARED_NAVIGATION_PATH);
  const parsed = parseSource(text, "use-template-section-navigation.ts", ts.ScriptKind.TS);
  const callbackBody = (name) => {
    let declaration = null;
    visit(parsed, (node) => {
      if (
        !declaration
        && ts.isVariableDeclaration(node)
        && node.name.getText(parsed) === name
      ) declaration = node;
    });
    assert.ok(declaration?.initializer && ts.isCallExpression(declaration.initializer));
    const callback = declaration.initializer.arguments[0];
    assert.ok(callback && ts.isFunctionLike(callback));
    return callback.body;
  };
  const activateBody = callbackBody("activateHash");
  const handlerBody = callbackBody("handleInternalLinkClick");

  let resolvedView = null;
  let publicPush = null;
  let activationScroll = null;
  let successfulActivation = null;
  visit(activateBody, (node) => {
    if (
      ts.isVariableDeclaration(node)
      && node.initializer?.getText(parsed).includes("getKnownTemplateViewFromHash")
      && node.initializer.getText(parsed).includes('[data-template-view="works"]')
    ) resolvedView = node;
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "window.history.pushState"
    ) publicPush = node;
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "scrollToHash"
    ) activationScroll = node;
    if (ts.isReturnStatement(node) && node.expression?.kind === ts.SyntaxKind.TrueKeyword) {
      successfulActivation = node;
    }
  });
  assert.ok(resolvedView, "activation must resolve known hashes or a real works descendant");
  const resolvedViewText = resolvedView.initializer.getText(parsed).replace(/\s+/g, "");
  assert.match(resolvedViewText, /^getKnownTemplateViewFromHash\(/);
  assert.match(resolvedViewText, /\?\?\(.*document\.getElementById\(.*\.slice\(1\)\).*\.closest\('\[data-template-view="works"\]'\).*\?"works":null\)$/);
  assert.ok(publicPush && activationScroll && successfulActivation);

  let pushGuard = publicPush.parent;
  while (pushGuard && !ts.isIfStatement(pushGuard)) pushGuard = pushGuard.parent;
  assert.ok(pushGuard, "URL writes must remain guarded");
  assert.equal(
    pushGuard.expression.getText(parsed).replace(/\s+/g, ""),
    "!isPreview&&window.location.hash!==normalized",
    "preview navigation must not write a secondary hash while public navigation may push it",
  );
  assert.equal(publicPush.arguments[2].getText(parsed), "normalized");
  assert.deepEqual(
    activationScroll.arguments.map((argument) => argument.getText(parsed)),
    ["normalized", "focusTarget"],
    "scrolling and focus remain active outside the preview-only URL guard",
  );
  assert.ok(
    pushGuard.end <= activationScroll.getStart(parsed)
    && activationScroll.end <= successfulActivation.getStart(parsed),
  );

  let knownDeclaration = null;
  let secondaryDeclaration = null;
  let passthroughGuard = null;
  let preventDefault = null;
  let delegatedActivation = null;
  visit(handlerBody, (node) => {
    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(parsed) === "getKnownTemplateViewFromHash"
    ) knownDeclaration = node;
    if (
      ts.isVariableDeclaration(node)
      && node.initializer?.getText(parsed).includes('[data-template-view="works"]')
    ) secondaryDeclaration = node;
    if (
      ts.isIfStatement(node)
      && node.thenStatement.getText(parsed).replace(/\s+/g, "") === "return;"
    ) {
      const guardText = node.expression.getText(parsed);
      if (guardText.includes("knownView") || guardText.includes("secondaryWorksTarget")) passthroughGuard = node;
    }
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "event.preventDefault"
    ) preventDefault = node;
    if (
      ts.isCallExpression(node)
      && node.expression.getText(parsed) === "activateHash"
    ) delegatedActivation = node;
  });
  assert.ok(knownDeclaration && secondaryDeclaration && passthroughGuard && preventDefault && delegatedActivation);
  const knownName = knownDeclaration.name.getText(parsed);
  const secondaryName = secondaryDeclaration.name.getText(parsed);
  assert.equal(
    passthroughGuard.expression.getText(parsed).replace(/\s+/g, ""),
    `!${knownName}&&!${secondaryName}`,
    "missing and non-works unknown hashes must pass through without interception",
  );
  assert.ok(
    passthroughGuard.end <= preventDefault.getStart(parsed)
    && preventDefault.end <= delegatedActivation.getStart(parsed),
  );
  assert.deepEqual(
    delegatedActivation.arguments.map((argument) => argument.getText(parsed)),
    ["hash", "true"],
    "handled secondary works anchors must scroll and focus their target",
  );
});

test("public and Admin renderers pass a stable lightbox closer through the optional template callback", async () => {
  const [typesText, ...ownerTexts] = await Promise.all([
    source("app/templates/types.ts"),
    source("app/page.tsx"),
    source("app/admin/template-preview-dialog.tsx"),
  ]);
  const types = parseSource(typesText, "types.ts", ts.ScriptKind.TS);
  let callbackProperty = null;
  visit(types, (node) => {
    if (
      ts.isPropertySignature(node)
      && node.name.getText(types) === "onBeforeViewChange"
    ) callbackProperty = node;
  });
  assert.ok(callbackProperty?.questionToken, "TemplateProps keeps the close callback optional for navigation exceptions");
  assert.equal(callbackProperty.type.getText(types).replace(/\s+/g, ""), "()=>void");

  for (const [index, text] of ownerTexts.entries()) {
    const fileName = index === 0 ? "page.tsx" : "template-preview-dialog.tsx";
    const parsed = parseSource(text, fileName);
    let renderer = null;
    visit(parsed, (node) => {
      const opening = jsxOpening(node);
      if (!renderer && opening && jsxTagName(opening, parsed) === "TemplateRenderer") renderer = opening;
    });
    assert.ok(renderer, `${fileName} must render a template`);
    const callbackExpression = jsxAttributeText(jsxAttribute(renderer, "onBeforeViewChange"), parsed);
    assert.match(callbackExpression, /^[A-Za-z_$][\w$]*$/, `${fileName} must pass a named stable callback`);

    let callbackDeclaration = null;
    visit(parsed, (node) => {
      if (
        !callbackDeclaration
        && ts.isVariableDeclaration(node)
        && node.name.getText(parsed) === callbackExpression
      ) callbackDeclaration = node;
    });
    assert.ok(callbackDeclaration?.initializer && ts.isCallExpression(callbackDeclaration.initializer));
    assert.equal(callbackDeclaration.initializer.expression.getText(parsed), "useCallback");
    assert.ok(
      ts.isArrayLiteralExpression(callbackDeclaration.initializer.arguments[1])
      && callbackDeclaration.initializer.arguments[1].elements.length > 0,
      `${fileName} lightbox closer must have an explicit dependency list`,
    );
    let closesOptionalWork = false;
    visit(callbackDeclaration.initializer.arguments[0], (node) => {
      if (
        ts.isCallExpression(node)
        && node.arguments.some((argument) => argument.kind === ts.SyntaxKind.NullKeyword)
      ) closesOptionalWork = true;
    });
    assert.ok(closesOptionalWork, `${fileName} callback must clear the optional active work`);
  }
});

test("Admin template preview uses one scroll root with a sticky toolbar above fixed template headers", async () => {
  const [dialogCss, globalCss] = await Promise.all([
    source("app/admin/template-preview-dialog.module.css"),
    source("app/globals.css"),
  ]);
  const dialog = cssDeclarations(cssRuleBlocks(dialogCss, ".dialog")[0] ?? "");
  const toolbar = cssDeclarations(cssRuleBlocks(dialogCss, ".toolbar")[0] ?? "");
  const toolbarButton = cssDeclarations(cssRuleBlocks(dialogCss, ".toolbar button")[0] ?? "");
  const surface = cssDeclarations(cssRuleBlocks(dialogCss, ".surface")[0] ?? "");
  const previewSelectorStart = globalCss.indexOf(
    "dialog[data-template-real-preview] main[data-template]:is(",
  );
  assert.notEqual(previewSelectorStart, -1, "preview header offset must use an explicit :is() allowlist");
  const previewSelectorEnd = globalCss.indexOf(") > header", previewSelectorStart);
  assert.notEqual(previewSelectorEnd, -1, "preview header offset must target the direct template header");
  const previewSelector = globalCss.slice(previewSelectorStart, previewSelectorEnd + ") > header".length);
  const previewTemplateIds = Array.from(
    previewSelector.matchAll(/\[data-template="([^"]+)"\]/g),
    (match) => match[1],
  );
  const expectedPreviewTemplateIds = TOP_NAVIGATION_TEMPLATES.map(({ id }) => id);
  assert.equal(new Set(previewTemplateIds).size, previewTemplateIds.length, "preview allowlist IDs must be unique");
  assert.deepEqual(
    [...previewTemplateIds].sort(),
    [...expectedPreviewTemplateIds].sort(),
    "preview header offset must cover exactly the eight shared-topbar templates",
  );
  for (const excluded of ["manga-panels", "archive-os", "polaroid-field"]) {
    assert.ok(!previewTemplateIds.includes(excluded), `${excluded} must remain outside the preview header offset`);
  }
  const previewHeaderOpen = globalCss.indexOf("{", previewSelectorEnd);
  const previewHeader = cssDeclarations(extractBraceBlock(globalCss, previewHeaderOpen));

  assert.equal(dialog.overflow, "auto", "the dialog must remain the sole preview scroll root");
  assert.equal(toolbar.position, "sticky");
  assert.equal(toolbar.top, "0");
  assert.equal(toolbar.height, "4rem");
  assert.ok(minimumRem(toolbarButton["min-height"]) >= 2.75, "the close button needs a 44px target");
  assert.equal(surface["min-height"]?.replace(/\s+/g, ""), "calc(100dvh-4rem)");
  assert.equal(surface.overflow, "clip", "the surface must not become a competing scroll root");
  assert.ok(!surface.transform || surface.transform === "none", "the surface must not re-contain fixed headers");
  assert.equal(previewHeader.top?.replace(/\s+/g, ""), "4rem!important");

  const mobileBlocks = mediaBlocks(dialogCss, 480);
  const mobileToolbar = mobileBlocks.flatMap((block) => cssRuleBlocks(block, ".toolbar").map(cssDeclarations));
  const mobileDescription = mobileBlocks.flatMap((block) => cssRuleBlocks(block, ".toolbar span").map(cssDeclarations));
  assert.ok(mobileToolbar.length > 0, "the preview toolbar needs a compact mobile rule");
  assert.ok(
    mobileToolbar.every((rule) => rule["flex-direction"] !== "column" && rule["flex-wrap"] !== "wrap"),
    "the 480px toolbar must remain a single row",
  );
  assert.ok(mobileDescription.some((rule) => rule.display === "none"), "mobile preview hides toolbar help text");
});

test("cinematic mobile services clear the expanded two-row primary navigation", async () => {
  const css = await source("app/globals.css");
  const mobileServices = mediaBlocks(css, 560)
    .flatMap((block) => cssRuleBlocks(block, ".services").map(cssDeclarations));
  const paddingRule = mobileServices.find((rule) => rule["padding-top"]);
  assert.ok(paddingRule, "cinematic mobile services need an explicit safe top inset");
  assert.ok(minimumRem(paddingRule["padding-top"]) >= 9, "cinematic mobile services need at least 9rem top padding");
});

for (const template of TOP_NAVIGATION_TEMPLATES) {
  test(`${template.id} exposes the shared Chinese three-view navigation contract`, async () => {
    const templatePath = `app/templates/${template.id}/template.tsx`;
    const text = await source(templatePath);
    const parsed = parseSource(text, `${template.id}.tsx`);

    const sharedImport = parsed.statements.find((statement) => (
      ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === "../shared/use-template-section-navigation"
    ));
    assert.ok(sharedImport, `${template.id} must use the shared section navigation`);

    let hookCall = null;
    visit(parsed, (node) => {
      if (
        !hookCall
        && ts.isCallExpression(node)
        && node.expression.getText(parsed) === "useTemplateSectionNavigation"
      ) hookCall = node;
    });
    assert.ok(hookCall, `${template.id} must call useTemplateSectionNavigation`);
    assert.equal(hookCall.arguments.length, 1);
    assert.ok(ts.isObjectLiteralExpression(hookCall.arguments[0]));
    const hookProperties = objectPropertyNames(hookCall.arguments[0]);
    assert.ok(hookProperties.has("hashes"), `${template.id} must pass its hash map`);
    assert.ok(hookProperties.has("isPreview"), `${template.id} must preserve preview-mode history safety`);
    assert.ok(hookProperties.has("onBeforeViewChange"), `${template.id} must close a possible lightbox before switching views`);
    assert.equal(
      objectPropertyValueText(hookCall.arguments[0], "onBeforeViewChange", parsed),
      "onBeforeViewChange",
      `${template.id} must forward the TemplateProps callback instead of creating local modal state`,
    );

    const rootMain = findRootMain(parsed);
    assert.ok(rootMain, `${template.id} must render a main root`);
    assert.match(
      jsxAttributeText(jsxAttribute(rootMain, "onClick"), parsed),
      /handleInternalLinkClick/,
      `${template.id} must delegate internal section links from its root`,
    );

    const navigation = findPrimaryNavigation(parsed);
    assert.ok(navigation, `${template.id} must expose the three Chinese primary labels in order`);
    const anchors = directJsxChildren(navigation, "a", parsed);
    assert.equal(anchors.length, 3);
    assert.deepEqual(anchors.map(jsxText), PRIMARY_LABELS);
    assert.equal(new Set(anchors.map((anchor) => (
      jsxAttributeText(jsxAttribute(jsxOpening(anchor), "href"), parsed)
    ))).size, 3, `${template.id} primary hashes must be unique`);

    for (const [index, view] of PRIMARY_VIEWS.entries()) {
      const opening = jsxOpening(anchors[index]);
      const href = jsxAttributeText(jsxAttribute(opening, "href"), parsed);
      assert.match(href, /^#[\w-]+$/, `${template.id} ${view} must remain deep-linkable`);
      const ariaCurrent = jsxAttributeText(jsxAttribute(opening, "aria-current"), parsed);
      assert.ok(
        ariaCurrent.includes("activeView") && ariaCurrent.includes(`\"${view}\"`),
        `${template.id} ${view} link must expose its active page`,
      );
    }
    if (template.id === "character-select") {
      assert.equal(
        jsxAttributeText(jsxAttribute(jsxOpening(anchors[0]), "href"), parsed),
        "#select-top",
        "character works navigation must focus the visible hero instead of its nested roster",
      );
      assert.match(text, /characterViewAliases\s*=\s*\[\{\s*hash:\s*"#select-roster",\s*view:\s*"works"\s*\}\]/);
    }

    const viewNodes = new Map(PRIMARY_VIEWS.map((view) => [view, []]));
    visit(parsed, (node) => {
      const opening = jsxOpening(node);
      if (!opening) return;
      const view = jsxAttributeText(jsxAttribute(opening, "data-template-view"), parsed);
      if (viewNodes.has(view)) viewNodes.get(view).push(opening);
    });
    for (const view of PRIMARY_VIEWS) {
      const openings = viewNodes.get(view);
      assert.ok(openings.length > 0, `${template.id} must mark at least one ${view} view region`);
      for (const opening of openings) {
        const hidden = jsxAttributeText(jsxAttribute(opening, "hidden"), parsed);
        assert.ok(
          hidden.includes("activeView") && hidden.includes("!==") && hidden.includes(`\"${view}\"`),
          `${template.id} ${view} regions must be hidden when their view is inactive`,
        );
      }
    }
  });

  test(`${template.id} keeps primary navigation readable and visible on mobile`, async () => {
    const css = await source(template.cssPath);
    const linkRules = cssRuleBlocks(css, template.linkSelector).map(cssDeclarations);
    const navRules = cssRuleBlocks(css, template.navSelector).map(cssDeclarations);
    const fontRules = [...navRules, ...linkRules].filter((rule) => rule["font-size"]);
    const targetRule = linkRules.find((rule) => rule["min-height"]);
    assert.ok(fontRules.length > 0, `${template.id} needs an explicit primary-nav font-size`);
    assert.ok(targetRule, `${template.id} needs an explicit min-height on primary links`);
    assert.ok(minimumRem(targetRule["min-height"]) >= 2.75, `${template.id} targets must be at least 2.75rem`);

    for (const rule of [...navRules, ...linkRules]) {
      if (rule["font-size"]) {
        assert.ok(minimumRem(rule["font-size"]) >= 1, `${template.id} must not shrink nav text below 1rem`);
      }
    }
    for (const rule of linkRules) {
      if (rule["min-height"]) {
        assert.ok(minimumRem(rule["min-height"]) >= 2.75, `${template.id} must not shrink targets below 2.75rem`);
      }
    }

    assert.ok(navRules.length > 0, `${template.id} needs a primary nav CSS rule`);
    assert.ok(
      navRules.every((rule) => rule.display !== "none"),
      `${template.id} primary nav must never be hidden by a breakpoint`,
    );

    const mobile = mediaBlocks(css, template.mobileBreakpoint);
    assert.ok(mobile.length > 0, `${template.id} needs its ${template.mobileBreakpoint}px mobile layout`);
    const mobileNavRules = mobile.flatMap((block) => cssRuleBlocks(block, template.navSelector).map(cssDeclarations));
    assert.ok(
      mobileNavRules.some((rule) => (
        rule.display === "grid"
        && rule["grid-template-columns"]?.replace(/\s+/g, "").startsWith("repeat(3,")
      )),
      `${template.id} mobile primary nav must remain visible as three columns`,
    );
  });
}

test("manga and archive retain their intentional navigation models instead of receiving the shared top bar", async () => {
  const [manga, archive] = await Promise.all([
    source("app/templates/manga-panels/template.tsx"),
    source("app/templates/archive-os/template.tsx"),
  ]);

  for (const [id, text] of [["manga-panels", manga], ["archive-os", archive]]) {
    assert.doesNotMatch(text, /useTemplateSectionNavigation/, `${id} is an explicit shared-topbar exception`);
    assert.doesNotMatch(text, /data-template-view=/, `${id} must retain its own navigation state model`);
  }

  assert.match(manga, /aria-label="章节目录"/);
  for (const label of ["角色分镜", "拍摄模式", "约拍作战"]) assert.match(manga, new RegExp(label));
  assert.match(archive, /aria-label="移动端档案导航"/);
  for (const label of ["分类", "档案", "检查器", "约拍"]) assert.match(archive, new RegExp(label));
});
