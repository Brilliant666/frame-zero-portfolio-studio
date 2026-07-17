import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

const FORMAL_TEMPLATE_IDS = [
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
];

// Add later gated prototypes here; every structural assertion derives from this single list.
const LAB_PROTOTYPES = [
  {
    id: "quiet-focus",
    stage: "A",
    component: "app/template-lab/_prototypes/quiet-focus/prototype.tsx",
    css: "app/template-lab/_prototypes/quiet-focus/prototype.module.css",
    placeholderClass: "framePlaceholder",
    route: "app/template-lab/quiet-focus/page.tsx",
  },
  {
    id: "split-register",
    stage: "A",
    component: "app/template-lab/_prototypes/split-register/prototype.tsx",
    css: "app/template-lab/_prototypes/split-register/prototype.module.css",
    placeholderClass: "photoPlaceholder",
    route: "app/template-lab/split-register/page.tsx",
  },
  {
    id: "poster-chapters",
    stage: "B",
    component: "app/template-lab/_prototypes/poster-chapters/prototype.tsx",
    css: "app/template-lab/_prototypes/poster-chapters/prototype.module.css",
    placeholderClass: "posterPlaceholder",
    route: "app/template-lab/poster-chapters/page.tsx",
  },
  {
    id: "axis-atlas",
    stage: "B",
    component: "app/template-lab/_prototypes/axis-atlas/prototype.tsx",
    css: "app/template-lab/_prototypes/axis-atlas/prototype.module.css",
    placeholderClass: "photoPlaceholder",
    route: "app/template-lab/axis-atlas/page.tsx",
  },
  {
    id: "stacked-scenes",
    stage: "C",
    component: "app/template-lab/_prototypes/stacked-scenes/prototype.tsx",
    css: "app/template-lab/_prototypes/stacked-scenes/prototype.module.css",
    placeholderClass: "scenePlaceholder",
    route: "app/template-lab/stacked-scenes/page.tsx",
  },
];

const LAB_PROTOTYPE_IDS = LAB_PROTOTYPES.map(({ id }) => id);
const SAFE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const THIRD_PARTY_BRAND_PATTERN = /(?:refero|linear|apple|monopo|adobe|behance|dribbble|instagram|pinterest|spotify|netflix|nike)/iu;

const EXPECTED_DEPENDENCIES = {
  "drizzle-orm": "0.45.2",
  next: "16.2.6",
  react: "19.2.6",
  "react-dom": "19.2.6",
};

const EXPECTED_DEV_DEPENDENCIES = {
  "@cloudflare/vite-plugin": "1.37.1",
  "@tailwindcss/postcss": "4.2.1",
  "@types/node": "22.19.19",
  "@types/react": "19.2.14",
  "@types/react-dom": "19.2.3",
  "@vitejs/plugin-react": "6.0.2",
  "@vitejs/plugin-rsc": "0.5.26",
  "drizzle-kit": "0.31.10",
  eslint: "9.39.4",
  "eslint-config-next": "16.2.6",
  "react-server-dom-webpack": "19.2.6",
  sharp: "0.34.5",
  tailwindcss: "4.2.1",
  typescript: "5.9.3",
  vinext: "0.0.50",
  vite: "8.0.13",
  wrangler: "4.92.0",
};

function absolutePath(relativePath) {
  return path.join(repositoryRoot, ...relativePath.split("/"));
}

async function readRepositoryFile(relativePath) {
  return readFile(absolutePath(relativePath), "utf8");
}

async function pathExists(relativePath) {
  try {
    await access(absolutePath(relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(relativeDirectory) {
  const entries = await readdir(absolutePath(relativeDirectory), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walkFiles(relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }

  return files.sort();
}

function parseSource(relativePath, source) {
  const scriptKind = relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function findVariableInitializer(sourceFile, variableName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === variableName) {
        assert.ok(declaration.initializer, `${variableName} must have an initializer`);
        return declaration.initializer;
      }
    }
  }

  assert.fail(`Could not find ${variableName} in ${sourceFile.fileName}`);
}

function unwrapExpression(expression) {
  let current = expression;

  while (
    ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }

  if (
    ts.isCallExpression(current)
    && current.arguments.length === 1
    && ts.isPropertyAccessExpression(current.expression)
    && ts.isIdentifier(current.expression.expression)
    && current.expression.expression.text === "Object"
    && current.expression.name.text === "freeze"
  ) {
    return unwrapExpression(current.arguments[0]);
  }

  return current;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  assert.fail(`Unsupported computed property in static contract: ${name.getText()}`);
}

function literalValue(expression) {
  const value = unwrapExpression(expression);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(value)) return value.elements.map(literalValue);

  assert.fail(`Expected a static literal, received: ${value.getText()}`);
}

function arrayRecords(source, relativePath, variableName) {
  const sourceFile = parseSource(relativePath, source);
  const initializer = unwrapExpression(findVariableInitializer(sourceFile, variableName));
  assert.ok(ts.isArrayLiteralExpression(initializer), `${variableName} must remain an array literal`);

  return initializer.elements.map((element, index) => {
    const object = unwrapExpression(element);
    assert.ok(ts.isObjectLiteralExpression(object), `${variableName}[${index}] must remain an object literal`);
    const record = {};

    for (const property of object.properties) {
      assert.ok(ts.isPropertyAssignment(property), `${variableName}[${index}] may only use static properties`);
      record[propertyName(property.name)] = literalValue(property.initializer);
    }

    return record;
  });
}

function stringArray(source, relativePath, variableName) {
  const sourceFile = parseSource(relativePath, source);
  const initializer = unwrapExpression(findVariableInitializer(sourceFile, variableName));
  assert.ok(ts.isArrayLiteralExpression(initializer), `${variableName} must remain an array literal`);
  return initializer.elements.map((element) => {
    const value = literalValue(element);
    assert.equal(typeof value, "string", `${variableName} values must be strings`);
    return value;
  });
}

function objectKeys(source, relativePath, variableName) {
  const sourceFile = parseSource(relativePath, source);
  const initializer = unwrapExpression(findVariableInitializer(sourceFile, variableName));
  assert.ok(ts.isObjectLiteralExpression(initializer), `${variableName} must remain an object literal`);
  return initializer.properties.map((property) => {
    assert.ok(ts.isPropertyAssignment(property), `${variableName} may only use static properties`);
    return propertyName(property.name);
  });
}

function moduleSpecifiers(source, relativePath) {
  const sourceFile = parseSource(relativePath, source);
  const specifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function assertUniqueNonEmpty(records, field) {
  const values = records.map((record) => record[field]);
  for (const value of values) {
    assert.equal(typeof value, "string", `${field} must be a string`);
    assert.notEqual(value.trim(), "", `${field} must not be empty`);
  }
  assert.equal(new Set(values).size, values.length, `${field} values must be unique`);
}

function relativeLuminance(hexColor) {
  const channels = hexColor.match(/[a-f\d]{2}/giu).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function cssRuleBodiesForClass(source, className) {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `[^{}]*\\.${escapedClassName}(?:\\[[^\\]]+\\])?[^{}]*\\{(?<body>[^{}]*)\\}`,
    "gu",
  );
  return [...source.matchAll(pattern)].map((match) => match.groups?.body ?? "");
}

test("keeps the formal catalog, V1 contract, adapter, and legacy TemplateId on the original eleven identities", async () => {
  const [catalogSource, contractSource, adapterSource, legacySource] = await Promise.all([
    readRepositoryFile("app/templates/catalog.ts"),
    readRepositoryFile("app/site-document.ts"),
    readRepositoryFile("app/legacy-site-content-adapter.ts"),
    readRepositoryFile("app/site-config.ts"),
  ]);

  const runtimeIds = arrayRecords(catalogSource, "app/templates/catalog.ts", "templateCatalog")
    .map(({ id }) => id);
  const v1Ids = stringArray(
    contractSource,
    "app/site-document.ts",
    "SITE_DOCUMENT_V1_TEMPLATE_IDS",
  );
  const adapterIds = objectKeys(
    adapterSource,
    "app/legacy-site-content-adapter.ts",
    "LEGACY_SITE_CONTENT_TEMPLATE_SPECS",
  );

  assert.deepEqual(runtimeIds, FORMAL_TEMPLATE_IDS);
  assert.deepEqual(v1Ids, FORMAL_TEMPLATE_IDS);
  assert.deepEqual(adapterIds, FORMAL_TEMPLATE_IDS);
  assert.match(
    legacySource,
    /import\s*\{[\s\S]*?\btype\s+TemplateId\b[\s\S]*?\}\s*from\s*["']\.\/templates\/catalog["']/u,
    "legacy SiteContent must continue deriving TemplateId from the formal runtime catalog",
  );
  assert.match(legacySource, /activeTemplate:\s*TemplateId\s*;/u);
  assert.match(legacySource, /templateWorks:\s*Partial<Record<TemplateId,\s*Work\[\]>>\s*;/u);

  for (const id of LAB_PROTOTYPE_IDS) {
    for (const [label, source] of [
      ["runtime catalog", catalogSource],
      ["V1 contract", contractSource],
      ["legacy adapter", adapterSource],
      ["legacy SiteContent", legacySource],
    ]) {
      assert.equal(source.includes(`"${id}"`), false, `${id} must not enter ${label}`);
    }
  }
});

test("keeps every production app source free of Template Lab references and IDs", async () => {
  const formalConsumerPaths = (await walkFiles("app"))
    .filter((relativePath) => !relativePath.startsWith("app/template-lab/"));

  assert.ok(formalConsumerPaths.includes("app/page.tsx"));
  assert.ok(formalConsumerPaths.includes("app/admin/page.tsx"));
  assert.ok(formalConsumerPaths.includes("app/api/site-content/route.ts"));

  for (const relativePath of formalConsumerPaths) {
    const source = await readRepositoryFile(relativePath);
    assert.doesNotMatch(
      source,
      /template[-_/ ]lab|TemplateLab|LabPrototype/iu,
      `${relativePath} must not reference the isolated Template Lab`,
    );
    for (const id of LAB_PROTOTYPE_IDS) {
      assert.doesNotMatch(
        source,
        new RegExp(`["']${id}["']`, "u"),
        `${relativePath} must not register Lab ID ${id}`,
      );
    }
  }
});

test("keeps every app/template-lab source server-renderable, local, and disconnected from production data", async () => {
  const labFiles = await walkFiles("app/template-lab");
  assert.ok(labFiles.length > 0, "Template Lab sources must exist");
  for (const relativePath of labFiles) {
    assert.match(
      relativePath,
      /\.(?:css|ts|tsx)$/u,
      `${relativePath} must remain source-only; binary and downloaded assets are forbidden`,
    );
  }

  const forbiddenImportPattern = /^(?:node:|drizzle-orm(?:\/|$)|next\/image$)|(?:^|\/)(?:site-config|site-document|legacy-site-content-adapter|stable-id-migration|photo-library)(?:\.[cm]?[jt]sx?)?$|(?:^|\/)db(?:\/|$)|(?:^|\/)templates(?:\/|$)|manifest/iu;
  const forbiddenSourcePatterns = [
    ["fetch", /\bfetch\s*\(/u],
    ["API path", /\/api(?:\/|\b)/iu],
    ["D1", /\bD1\b/u],
    ["database", /\bdatabase\b/iu],
    ["node:crypto", /node:crypto/iu],
    ["Node runtime import", /\bnode:/u],
    ["process environment", /\bprocess\.env\b/u],
    ["network constructor", /\b(?:XMLHttpRequest|WebSocket|EventSource)\b/u],
    ["UUID allocation", /\b(?:crypto\.)?randomUUID\s*\(/u],
    ["localStorage", /\blocalStorage\b/u],
    ["sessionStorage", /\bsessionStorage\b/u],
    ["cookie", /\b(?:document\.)?cookies?\b/iu],
    ["HTTP URL", /https?:\/\//iu],
    ["CSS or markup resource URL", /\burl\s*\(/iu],
    ["image element", /<img\b/iu],
    ["runtime media element", /<(?:audio|picture|source|video)\b/iu],
    ["client component directive", /^[\t ]*["']use client["'];?/mu],
    ["manifest access", /\bmanifest\b/iu],
    ["formal content or template types", /\b(?:SiteDocument|SiteContent|TemplateId|buildPhotoSlots|PhotoPlaceholder)\b/u],
  ];

  for (const relativePath of labFiles) {
    const source = await readRepositoryFile(relativePath);
    if (/\.[cm]?[jt]sx?$/u.test(relativePath)) {
      for (const specifier of moduleSpecifiers(source, relativePath)) {
        assert.doesNotMatch(
          specifier,
          forbiddenImportPattern,
          `${relativePath} must not import production module ${specifier}`,
        );
      }
    }

    for (const [label, pattern] of forbiddenSourcePatterns) {
      assert.doesNotMatch(source, pattern, `${relativePath} must not contain ${label}`);
    }
  }
});

test("registers the gated neutral lab IDs with static routes, isolated components, and independent CSS", async () => {
  const catalogSource = await readRepositoryFile("app/template-lab/_lib/prototype-catalog.ts");
  const records = arrayRecords(
    catalogSource,
    "app/template-lab/_lib/prototype-catalog.ts",
    "labPrototypeCatalog",
  );
  const ids = records.map(({ id }) => id);

  assert.deepEqual(ids, LAB_PROTOTYPE_IDS);
  assert.equal(new Set(ids).size, ids.length, "prototype IDs must be unique");
  assert.equal(await pathExists("app/template-lab/[prototypeId]"), false, "Template Lab uses explicit static routes");

  const routeDirectories = (await readdir(absolutePath("app/template-lab"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(routeDirectories, [...LAB_PROTOTYPE_IDS].sort());

  const prototypeDirectories = (await readdir(
    absolutePath("app/template-lab/_prototypes"),
    { withFileTypes: true },
  ))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    prototypeDirectories,
    [...LAB_PROTOTYPE_IDS].sort(),
    "unregistered or orphan prototype directories are forbidden",
  );

  const cssSources = [];
  for (const prototype of LAB_PROTOTYPES) {
    assert.match(prototype.id, SAFE_ID_PATTERN);
    assert.doesNotMatch(prototype.id, THIRD_PARTY_BRAND_PATTERN);
    assert.equal(await pathExists(prototype.route), true, `${prototype.id} must have an explicit route`);
    assert.equal(await pathExists(prototype.component), true, `${prototype.id} must have its own component`);
    assert.equal(await pathExists(prototype.css), true, `${prototype.id} must have its own CSS module`);

    const record = records.find(({ id }) => id === prototype.id);
    assert.ok(record, `${prototype.id} must be present in the lab-only catalog`);
    assert.equal(record.stage, prototype.stage);
    assert.equal(record.route, `/template-lab/${prototype.id}`);
    assert.doesNotMatch(`${record.id} ${record.name}`, THIRD_PARTY_BRAND_PATTERN);

    const routeSource = await readRepositoryFile(prototype.route);
    const routeImports = moduleSpecifiers(routeSource, prototype.route);
    assert.ok(
      routeImports.includes(`../_prototypes/${prototype.id}/prototype`),
      `${prototype.route} must statically import only its own prototype`,
    );
    assert.doesNotMatch(routeSource, /\bimport\s*\(/u, `${prototype.route} must not use a shared dynamic route loader`);
    for (const otherId of LAB_PROTOTYPE_IDS.filter((id) => id !== prototype.id)) {
      assert.equal(routeSource.includes(otherId), false, `${prototype.route} must not import ${otherId}`);
    }

    const componentSource = await readRepositoryFile(prototype.component);
    const componentImports = moduleSpecifiers(componentSource, prototype.component);
    assert.ok(
      componentImports.includes("./prototype.module.css?inline"),
      `${prototype.component} must inline its route-local CSS module`,
    );
    assert.match(
      componentSource,
      /<style\s+data-template-lab-style=\{prototype\.id\}>\{prototypeCss\}<\/style>/u,
      `${prototype.component} must emit its route-local stylesheet without joining shared CSS`,
    );
    for (const otherId of LAB_PROTOTYPE_IDS.filter((id) => id !== prototype.id)) {
      assert.equal(
        componentImports.some((specifier) => specifier.includes(otherId)),
        false,
        `${prototype.component} must not import sibling prototype ${otherId}`,
      );
    }
    cssSources.push(await readRepositoryFile(prototype.css));
  }

  assert.equal(new Set(cssSources).size, cssSources.length, "prototype CSS modules must be independently authored");
});

test("keeps every Lab stylesheet on an explicit inline-only route boundary", async () => {
  const labFiles = await walkFiles("app/template-lab");

  for (const relativePath of labFiles.filter((file) => /\.[cm]?[jt]sx?$/u.test(file))) {
    const source = await readRepositoryFile(relativePath);
    const cssImports = moduleSpecifiers(source, relativePath)
      .filter((specifier) => /\.css(?:\?|$)/u.test(specifier));
    for (const specifier of cssImports) {
      assert.match(
        specifier,
        /\.module\.css\?inline$/u,
        `${relativePath} must not add Lab styles to the shared extracted CSS graph`,
      );
    }
  }

  const layoutSource = await readRepositoryFile("app/template-lab/layout.tsx");
  assert.match(layoutSource, /data-template-lab-style="shell"/u);
  assert.match(layoutSource, /data-template-lab-style="chrome"/u);
});

test("keeps catalog structure, token, browsing, slot, and responsive metadata explicit and distinct", async () => {
  const relativePath = "app/template-lab/_lib/prototype-catalog.ts";
  const source = await readRepositoryFile(relativePath);
  const records = arrayRecords(source, relativePath, "labPrototypeCatalog");

  assert.equal(records.length, LAB_PROTOTYPES.length, "catalog and gated prototype list must stay aligned");
  for (const field of ["browsingModel", "structureKey", "tokenKey"]) {
    assertUniqueNonEmpty(records, field);
  }

  for (const record of records) {
    assert.ok(Array.isArray(record.slotRatios) && record.slotRatios.length > 0, `${record.id} needs photo slots`);
    for (const ratio of record.slotRatios) {
      assert.match(ratio, /^[1-9]\d*:[1-9]\d*$/u, `${record.id} has invalid ratio ${ratio}`);
    }
    for (const field of ["desktop", "tablet", "mobile"]) {
      assert.equal(typeof record[field], "string", `${record.id}.${field} must be documented`);
      assert.notEqual(record[field].trim(), "", `${record.id}.${field} must not be empty`);
    }
    assert.match(record.structureKey, SAFE_ID_PATTERN);
    assert.match(record.tokenKey, SAFE_ID_PATTERN);
  }
});

test("gives every prototype CSS module mobile, narrow-screen, focus, and reduced-motion safeguards", async () => {
  for (const prototype of LAB_PROTOTYPES) {
    const source = await readRepositoryFile(prototype.css);
    const mediaWidths = [...source.matchAll(/@media\s*\(\s*max-width\s*:\s*([0-9.]+)\s*(px|rem|em)\s*\)/giu)]
      .map((match) => Number(match[1]) * (match[2].toLowerCase() === "px" ? 1 : 16));

    assert.ok(mediaWidths.some((width) => width <= 768), `${prototype.id} needs a mobile breakpoint`);
    assert.ok(mediaWidths.some((width) => width <= 400), `${prototype.id} needs a <=400px narrow-screen breakpoint`);
    assert.match(source, /:focus-visible/u, `${prototype.id} needs visible keyboard focus styles`);
    assert.match(
      source,
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u,
      `${prototype.id} needs a reduced-motion mode`,
    );
    const reducedMotionSource = source.slice(
      source.search(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u),
    );
    assert.match(
      reducedMotionSource,
      /(?:animation|transition)\s*:\s*none\b|scroll-behavior\s*:\s*auto\b/u,
      `${prototype.id} must actually disable animation, transition, or smooth scrolling`,
    );
  }
});

test("keeps declared photography ratios authoritative over placeholder box dimensions", async () => {
  const [chromeCss, chromeComponent] = await Promise.all([
    readRepositoryFile("app/template-lab/_components/lab-chrome.module.css"),
    readRepositoryFile("app/template-lab/_components/lab-chrome.tsx"),
  ]);
  const sharedPlaceholderRules = cssRuleBodiesForClass(chromeCss, "placeholder");
  assert.ok(sharedPlaceholderRules.length > 0, "the shared placeholder needs an explicit CSS rule");
  for (const rule of sharedPlaceholderRules) {
    assert.doesNotMatch(
      rule,
      /(?:min|max)-height\s*:/u,
      "the shared placeholder must not override its declared aspect ratio with height constraints",
    );
  }
  assert.match(chromeComponent, /style=\{\{ aspectRatio: ratio\.replace\(":"\s*,\s*" \/ "\) \} as CSSProperties\}/u);

  for (const prototype of LAB_PROTOTYPES) {
    const source = await readRepositoryFile(prototype.css);
    const placeholderRules = cssRuleBodiesForClass(source, prototype.placeholderClass);
    assert.ok(placeholderRules.length > 0, `${prototype.id} needs its placeholder style entry`);
    for (const rule of placeholderRules) {
      assert.doesNotMatch(
        rule,
        /(?:min|max)-height\s*:/u,
        `${prototype.id} must size placeholders through width so aspect-ratio stays authoritative`,
      );
    }
  }

  for (const prototypeId of ["quiet-focus", "poster-chapters", "stacked-scenes"]) {
    const prototype = LAB_PROTOTYPES.find(({ id }) => id === prototypeId);
    const source = await readRepositoryFile(prototype.css);
    for (const ratio of ["2:3", "3:2", "16:9"]) {
      assert.match(
        source,
        new RegExp(`\\.${prototype.placeholderClass}\\[data-photo-ratio="${ratio}"\\]\\s*\\{[^{}]*max-width\\s*:`, "u"),
        `${prototype.id} must contain ${ratio} through a ratio-preserving width cap`,
      );
    }
  }
});

test("keeps each prototype semantic, status-marked, placeholder-complete, and natively keyboard operable", async () => {
  for (const prototype of LAB_PROTOTYPES) {
    const source = await readRepositoryFile(prototype.component);

    assert.match(source, /<main\b/u, `${prototype.id} needs a main landmark`);
    assert.match(source, /<header\b/u, `${prototype.id} needs a header`);
    assert.match(source, /<h1\b/u, `${prototype.id} needs one visible page heading`);
    assert.match(source, /<section\b/u, `${prototype.id} needs semantic sections`);
    assert.match(source, /<(?:nav|article|figure|ol)\b/u, `${prototype.id} needs semantic browsing structure`);
    assert.match(source, /aria-(?:label|labelledby)=/u, `${prototype.id} needs explicit accessible naming`);
    assert.match(source, /<LabStatus\s*\/>/u, `${prototype.id} needs the experimental status labels`);
    assert.match(source, /<LabPlaceholder\b/u, `${prototype.id} must render without photographs`);
    assert.match(source, /<LabBrief\s+prototype=\{prototype\}\s*\/>/u, `${prototype.id} needs its design brief`);
    assert.match(source, /<a\b[^>]*\bhref=/u, `${prototype.id} needs native keyboard-operable navigation`);
    assert.doesNotMatch(
      source,
      /<(?:div|span|section|article)\b[^>]*\bonClick=/u,
      `${prototype.id} must not emulate controls with non-interactive elements`,
    );
  }
});

test("keeps Quiet Focus as one contained vertical frame sequence with a separate caption rail", async () => {
  const componentPath = "app/template-lab/_prototypes/quiet-focus/prototype.tsx";
  const cssPath = "app/template-lab/_prototypes/quiet-focus/prototype.module.css";
  const [componentSource, cssSource] = await Promise.all([
    readRepositoryFile(componentPath),
    readRepositoryFile(cssPath),
  ]);

  assert.match(componentSource, /<section\b[\s\S]*?className=\{styles\.sequence\}[\s\S]*?tabIndex=\{0\}/u);
  assert.match(componentSource, /<article\b[\s\S]*?className=\{styles\.frame\}[\s\S]*?tabIndex=\{0\}/u);
  assert.match(componentSource, /className=\{styles\.imagePlane\}/u);
  assert.match(componentSource, /className=\{styles\.captionRail\}/u);
  const sequenceRule = cssSource.match(/\.sequence\s*\{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? "";
  assert.match(sequenceRule, /overflow-y\s*:\s*auto\s*;/u);
  assert.match(sequenceRule, /overscroll-behavior-y\s*:\s*auto\s*;/u);
  assert.doesNotMatch(sequenceRule, /overscroll-behavior-y\s*:\s*contain\s*;/u);
  assert.match(sequenceRule, /scroll-snap-type\s*:\s*y\s+mandatory\s*;/u);
  assert.ok(
    componentSource.indexOf("<LabBrief") > componentSource.indexOf("className={styles.sequence}"),
    "the design brief must remain reachable after the sequence through document scroll chaining",
  );
});

test("keeps Split Register as a directory, image ledger, and annotation track", async () => {
  const componentPath = "app/template-lab/_prototypes/split-register/prototype.tsx";
  const cssPath = "app/template-lab/_prototypes/split-register/prototype.module.css";
  const [componentSource, cssSource] = await Promise.all([
    readRepositoryFile(componentPath),
    readRepositoryFile(cssPath),
  ]);

  assert.match(componentSource, /<nav\b[^>]*className=\{styles\.directory\}/u);
  assert.match(componentSource, /<ol\b[^>]*className=\{styles\.ledger\}/u);
  assert.match(componentSource, /<figure\b[^>]*className=\{styles\.imageLedger\}/u);
  assert.match(componentSource, /className=\{styles\.annotation\}/u);
  const directoryRule = cssSource.match(/\.directory\s*\{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? "";
  assert.match(directoryRule, /position\s*:\s*sticky\s*;/u);
});

test("keeps Poster Chapters as six navigable semantic chapters", async () => {
  const [source, cssSource, catalogSource] = await Promise.all([
    readRepositoryFile("app/template-lab/_prototypes/poster-chapters/prototype.tsx"),
    readRepositoryFile("app/template-lab/_prototypes/poster-chapters/prototype.module.css"),
    readRepositoryFile("app/template-lab/_lib/prototype-catalog.ts"),
  ]);
  const posterRecord = arrayRecords(
    catalogSource,
    "app/template-lab/_lib/prototype-catalog.ts",
    "labPrototypeCatalog",
  ).find(({ id }) => id === "poster-chapters");

  assert.ok(posterRecord, "Poster Chapters must remain in the lab-only catalog");
  assert.equal(posterRecord.slotRatios.length, 6, "Poster Chapters must define exactly six chapters");
  assert.match(source, /<nav\b[^>]*className=\{styles\.chapterNav\}[^>]*aria-label="Poster chapter navigation"/u);
  assert.match(source, /href=\{`#poster-chapter-\$\{chapter\.number\}`\}/u);
  assert.match(source, /<section\b[^>]*className=\{styles\.chapters\}/u);
  assert.match(source, /<article\b[\s\S]*?aria-labelledby=\{titleId\}/u);
  assert.doesNotMatch(
    source,
    /<article\b[\s\S]*?aria-label=\{`Poster chapter /u,
    "article names must not hide their aria-labelledby headings behind a competing label",
  );
  assert.ok(
    [...source.matchAll(/chapters\.map\(/gu)].length >= 2,
    "the chapter navigation and semantic chapter sequence must both derive from all six chapters",
  );

  const paper = cssSource.match(/--poster-paper\s*:\s*(#[a-f\d]{6})\s*;/iu)?.[1];
  const redText = cssSource.match(/--poster-red-text\s*:\s*(#[a-f\d]{6})\s*;/iu)?.[1];
  assert.ok(paper && redText, "Poster Chapters must expose static paper and red text tokens");
  assert.ok(
    contrastRatio(redText, paper) >= 4.5,
    `poster red text ${redText} must meet WCAG AA against paper ${paper}`,
  );
});

test("keeps Axis Atlas as at least three focusable contained horizontal snap strips", async () => {
  const componentPath = "app/template-lab/_prototypes/axis-atlas/prototype.tsx";
  const cssPath = "app/template-lab/_prototypes/axis-atlas/prototype.module.css";
  const [componentSource, cssSource] = await Promise.all([
    readRepositoryFile(componentPath),
    readRepositoryFile(cssPath),
  ]);
  const series = arrayRecords(componentSource, componentPath, "seriesDefinitions");

  assert.ok(series.length >= 3, "Axis Atlas needs at least three vertical series");
  assert.equal(new Set(series.map(({ id }) => id)).size, series.length, "axis series IDs must be unique");
  assert.match(componentSource, /seriesDefinitions\.map\(/u);
  assert.match(
    componentSource,
    /<ol\b[\s\S]*?className=\{styles\.strip\}[\s\S]*?tabIndex=\{0\}[\s\S]*?horizontal strip/u,
    "each mapped axis series must emit a labelled focusable strip",
  );

  const stripRule = cssSource.match(/\.strip\s*\{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? "";
  assert.match(stripRule, /overflow-x\s*:\s*auto\s*;/u, "axis strips must contain horizontal overflow");
  assert.match(
    stripRule,
    /overscroll-behavior-inline\s*:\s*contain\s*;/u,
    "axis strips must contain horizontal overscroll",
  );
  assert.match(stripRule, /scroll-snap-type\s*:\s*x\s+mandatory\s*;/u, "axis strips must snap horizontally");
  assert.match(cssSource, /\.strip:focus-visible\s*\{/u, "axis strips need a visible focus state");
  const reducedMotionSource = cssSource.slice(
    cssSource.search(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u),
  );
  assert.match(reducedMotionSource, /\.strip\s*\{[^{}]*scroll-snap-type\s*:\s*none\s*;/u);
});

test("keeps Stacked Scenes as five ordered sticky cards with a non-sticky mobile flow", async () => {
  const componentPath = "app/template-lab/_prototypes/stacked-scenes/prototype.tsx";
  const cssPath = "app/template-lab/_prototypes/stacked-scenes/prototype.module.css";
  const [componentSource, cssSource, catalogSource] = await Promise.all([
    readRepositoryFile(componentPath),
    readRepositoryFile(cssPath),
    readRepositoryFile("app/template-lab/_lib/prototype-catalog.ts"),
  ]);
  const stackedRecord = arrayRecords(
    catalogSource,
    "app/template-lab/_lib/prototype-catalog.ts",
    "labPrototypeCatalog",
  ).find(({ id }) => id === "stacked-scenes");

  assert.ok(stackedRecord, "Stacked Scenes must remain in the lab-only catalog");
  assert.equal(stackedRecord.slotRatios.length, 5, "Stacked Scenes must define exactly five cards");
  assert.match(componentSource, /<nav\b[^>]*className=\{styles\.sceneNav\}/u);
  assert.match(componentSource, /<div\b[^>]*className=\{styles\.stack\}/u);
  assert.match(
    componentSource,
    /<article\b[\s\S]*?className=\{`\$\{styles\.scene\}[\s\S]*?tabIndex=\{0\}/u,
  );
  assert.match(componentSource, /className=\{styles\.mediaField\}/u);
  assert.match(componentSource, /className=\{styles\.captionPanel\}/u);

  const sceneRule = cssSource.match(/\.scene\s*\{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? "";
  assert.match(sceneRule, /position\s*:\s*sticky\s*;/u, "desktop cards must use ordered sticky layering");
  const mobileStart = cssSource.search(/@media\s*\(\s*max-width\s*:\s*720px\s*\)/u);
  const mobileEnd = cssSource.indexOf("@media", mobileStart + 1);
  const mobileSource = cssSource.slice(mobileStart, mobileEnd);
  assert.match(mobileSource, /\.scene,[\s\S]*?position\s*:\s*relative\s*;/u);
  assert.match(mobileSource, /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s*;/u);

  const reducedMotionSource = cssSource.slice(
    cssSource.search(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u),
  );
  assert.match(
    reducedMotionSource,
    /\.scene,[\s\S]*?position\s*:\s*relative\s*;/u,
    "reduced motion must release the sticky card stack into document flow",
  );

  const mutedColor = cssSource.match(/--stack-muted\s*:\s*(#[a-f\d]{6})\s*;/iu)?.[1];
  const shellColor = cssSource.match(/--stack-shell\s*:\s*(#[a-f\d]{6})\s*;/iu)?.[1];
  const shellAccent = cssSource.match(/--stack-clay\s*:\s*(#[a-f\d]{6})\s*;/iu)?.[1];
  const shellFocus = cssSource.match(/--stack-focus\s*:\s*(#[a-f\d]{6})\s*;/iu)?.[1];
  const cardFocus = cssSource.match(/--stack-card-focus\s*:\s*(#[a-f\d]{6})\s*;/iu)?.[1];
  const cardColors = [...cssSource.matchAll(/--card-paper\s*:\s*(#[a-f\d]{6})\s*;/giu)]
    .map((match) => match[1]);
  const cardAccents = [...cssSource.matchAll(/--card-accent\s*:\s*(#[a-f\d]{6})\s*;/giu)]
    .map((match) => match[1]);
  assert.ok(mutedColor, "Stacked Scenes must expose its muted text token as a static hex color");
  assert.ok(shellColor && shellAccent && shellFocus && cardFocus, "Stacked Scenes needs static focus and shell tokens");
  assert.equal(cardColors.length, 5, "Stacked Scenes must expose all five static card colors");
  assert.equal(cardAccents.length, 5, "Stacked Scenes must expose all five static card accents");
  assert.ok(contrastRatio(shellAccent, shellColor) >= 4.5, "shell accent text must meet WCAG AA");
  assert.ok(contrastRatio(shellFocus, shellColor) >= 3, "shell focus must remain visible");
  for (const [index, cardColor] of cardColors.entries()) {
    assert.ok(
      contrastRatio(mutedColor, cardColor) >= 4.5,
      `muted text ${mutedColor} must meet WCAG AA against card ${cardColor}`,
    );
    assert.ok(
      contrastRatio(cardAccents[index], cardColor) >= 4.5,
      `card accent ${cardAccents[index]} must meet WCAG AA against card ${cardColor}`,
    );
    assert.ok(
      contrastRatio(cardFocus, cardColor) >= 3,
      `card focus ${cardFocus} must remain visible against card ${cardColor}`,
    );
  }
});

test("keeps package dependency sets exactly at the approved baseline", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));
  assert.deepEqual(packageJson.dependencies, EXPECTED_DEPENDENCIES);
  assert.deepEqual(packageJson.devDependencies, EXPECTED_DEV_DEPENDENCIES);
  assert.equal(packageJson.optionalDependencies, undefined);
  assert.equal(packageJson.peerDependencies, undefined);
  assert.equal(packageJson.bundledDependencies, undefined);
});
