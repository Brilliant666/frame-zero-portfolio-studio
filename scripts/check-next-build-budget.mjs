#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NEXT_BUILD_BUDGETS = Object.freeze({
  applicationJs: 550 * 1024,
  bootstrapJs: 700 * 1024,
  publicCss: 300 * 1024,
  templateJs: 64 * 1024,
});

export const TEMPLATE_IDS = Object.freeze([
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
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readPageClientManifest(filePath) {
  const source = readFileSync(filePath, "utf8");
  const match = source.match(/globalThis\.__RSC_MANIFEST\["\/page"\] = (\{.*\});\s*$/s);
  if (!match) throw new Error("Next.js page client reference manifest has an unknown shape.");
  return JSON.parse(match[1]);
}

function listFiles(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(directory, entry.name));
}

function totalBytes(nextRoot, relativePaths, violations) {
  let total = 0;
  for (const relativePath of relativePaths) {
    const normalized = relativePath.replaceAll("/", path.sep);
    const fullPath = path.resolve(nextRoot, normalized);
    const relative = path.relative(nextRoot, fullPath);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
      violations.push(`artifact path escapes .next: ${relativePath}`);
      continue;
    }
    if (!existsSync(fullPath)) {
      violations.push(`artifact file is missing: ${relativePath}`);
      continue;
    }
    total += statSync(fullPath).size;
  }
  return total;
}

function unique(values) {
  return [...new Set(values)];
}

export function inspectNextBuild(projectRoot = process.cwd()) {
  const nextRoot = path.resolve(projectRoot, ".next");
  const chunksRoot = path.join(nextRoot, "static", "chunks");
  const buildManifestPath = path.join(nextRoot, "build-manifest.json");
  const pageManifestPath = path.join(nextRoot, "server", "app", "page_client-reference-manifest.js");
  const standaloneServerPath = path.join(nextRoot, "standalone", "server.js");
  const required = [buildManifestPath, pageManifestPath, standaloneServerPath];
  const missing = required.filter((filePath) => !existsSync(filePath));
  if (missing.length > 0) {
    throw new Error("Standard Next.js artifact is missing. Run `npm run build` before the bundle budget check.");
  }

  const violations = [];
  const buildManifest = readJson(buildManifestPath);
  const pageManifest = readPageClientManifest(pageManifestPath);
  const pageEntryJs = pageManifest.entryJSFiles?.["[project]/app/page"] ?? [];
  const pageEntryCss = (pageManifest.entryCSSFiles?.["[project]/app/page"] ?? [])
    .map((entry) => entry.path);

  if (pageEntryJs.length === 0) violations.push("public page has no client JS entry");
  if (pageEntryCss.length === 0) violations.push("public page has no CSS entry");

  const jsFiles = listFiles(chunksRoot, ".js");
  const jsSources = new Map(jsFiles.map((filePath) => [filePath, readFileSync(filePath, "utf8")]));
  const eagerPageChunks = new Set(pageEntryJs.map((filePath) => filePath.replaceAll("/", path.sep)));
  const templateChunks = [];
  const templateSizes = [];

  for (const templateId of TEMPLATE_IDS) {
    const candidates = [...jsSources.entries()].filter(([filePath, source]) => {
      if (eagerPageChunks.has(path.relative(nextRoot, filePath))) return false;
      if (!source.includes(templateId)) return false;
      return TEMPLATE_IDS.filter((candidate) => source.includes(candidate)).length === 1;
    });
    if (candidates.length !== 1) {
      violations.push(`${templateId} expected one lazy client chunk, found ${candidates.length}`);
      continue;
    }
    const [filePath] = candidates[0];
    const relativePath = path.relative(nextRoot, filePath).replaceAll(path.sep, "/");
    const bytes = statSync(filePath).size;
    templateChunks.push(relativePath);
    templateSizes.push({ templateId, relativePath, bytes });
    if (bytes > NEXT_BUILD_BUDGETS.templateJs) {
      violations.push(`${templateId} lazy JS is ${bytes} bytes`);
    }
  }

  if (new Set(templateChunks).size !== TEMPLATE_IDS.length) {
    violations.push(`expected ${TEMPLATE_IDS.length} distinct lazy template chunks`);
  }

  const applicationJsFiles = unique([...pageEntryJs, ...templateChunks]);
  const applicationJsBytes = totalBytes(nextRoot, applicationJsFiles, violations);
  if (applicationJsBytes > NEXT_BUILD_BUDGETS.applicationJs) {
    violations.push(`public application JS is ${applicationJsBytes} bytes`);
  }

  const bootstrapJsFiles = unique([
    ...(buildManifest.polyfillFiles ?? []),
    ...(buildManifest.rootMainFiles ?? []),
    ...pageEntryJs,
  ]);
  const bootstrapJsBytes = totalBytes(nextRoot, bootstrapJsFiles, violations);
  if (bootstrapJsBytes > NEXT_BUILD_BUDGETS.bootstrapJs) {
    violations.push(`Next.js bootstrap JS is ${bootstrapJsBytes} bytes`);
  }

  const cssFiles = listFiles(chunksRoot, ".css");
  const cssSources = new Map(cssFiles.map((filePath) => [filePath, readFileSync(filePath, "utf8")]));
  const publicCssFiles = new Set(pageEntryCss);
  for (const { relativePath, templateId } of templateSizes) {
    const source = readFileSync(path.join(nextRoot, relativePath), "utf8");
    const tokens = unique(source.match(/[A-Za-z0-9_-]+-module__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+/g) ?? []);
    if (tokens.length === 0) continue;
    const matchingCss = [...cssSources.entries()]
      .filter(([, css]) => tokens.some((token) => css.includes(token)))
      .map(([filePath]) => path.relative(nextRoot, filePath).replaceAll(path.sep, "/"));
    if (matchingCss.length === 0) violations.push(`${templateId} CSS could not be traced from its lazy chunk`);
    matchingCss.forEach((filePath) => publicCssFiles.add(filePath));
  }
  const publicCssBytes = totalBytes(nextRoot, [...publicCssFiles], violations);
  if (publicCssBytes > NEXT_BUILD_BUDGETS.publicCss) {
    violations.push(`public CSS is ${publicCssBytes} bytes`);
  }

  const result = {
    applicationJsBytes,
    bootstrapJsBytes,
    publicCssBytes,
    templateChunks: templateSizes,
    violations,
  };
  return Object.freeze(result);
}

export function enforceNextBuildBudget(projectRoot = process.cwd()) {
  const result = inspectNextBuild(projectRoot);
  if (result.violations.length > 0) {
    throw new Error(`Standard Next.js build budget failed:\n${result.violations.map((item) => `- ${item}`).join("\n")}`);
  }
  return result;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isMain) {
  try {
    const result = enforceNextBuildBudget();
    const largestTemplate = [...result.templateChunks].sort((left, right) => right.bytes - left.bytes)[0];
    console.log(
      `Standard Next.js build budget passed: ${result.templateChunks.length} lazy templates, `
      + `${(result.applicationJsBytes / 1024).toFixed(1)} KiB application JS, `
      + `${(result.bootstrapJsBytes / 1024).toFixed(1)} KiB bootstrap JS, `
      + `${(result.publicCssBytes / 1024).toFixed(1)} KiB public CSS; `
      + `largest template ${(largestTemplate.bytes / 1024).toFixed(1)} KiB.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
