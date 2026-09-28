#!/usr/bin/env node

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
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
  const match = source.match(/globalThis\.__RSC_MANIFEST\["[^"\n]+"\] = (\{.*\});\s*$/s);
  if (!match) throw new Error("Next.js page client reference manifest has an unknown shape.");
  return JSON.parse(match[1]);
}

function unique(values) {
  return [...new Set(values)];
}

export function inspectNextBuild(projectRoot = process.cwd()) {
  const nextRoot = path.resolve(projectRoot, ".next");
  const violations = [];
  const warnings = [];
  const attempt = (label, action) => {
    try { return action(); } catch (error) {
      violations.push(`${label}: ${error.message}`);
      return null;
    }
  };
  const inside = (root, target) => {
    const relative = path.relative(root, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const resolveArtifact = (relativePath) => {
    if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\\") || path.isAbsolute(relativePath)) {
      throw new Error(`invalid artifact path: ${String(relativePath)}`);
    }
    const file = path.resolve(nextRoot, relativePath);
    if (!inside(nextRoot, file) || !inside(realpathSync(nextRoot), realpathSync(file))) {
      throw new Error(`artifact path escapes .next: ${relativePath}`);
    }
    return file;
  };
  const source = (file) => attempt(file, () => readFileSync(resolveArtifact(file), "utf8"));
  const knownTotals = new Map();
  const setKey = (files) => JSON.stringify(unique(files).sort());
  const totalBytes = (files) => {
    if (files === null) return null;
    let total = 0;
    let complete = true;
    for (const file of unique(files)) {
      const bytes = attempt(file, () => {
        const resolved = resolveArtifact(file);
        const stat = statSync(resolved);
        if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) throw new Error("invalid artifact size or non-file resource");
        readFileSync(resolved); // Prove readability, not just existence/stat access.
        return stat.size;
      });
      if (bytes === null) complete = false;
      else total += bytes;
    }
    if (!Number.isSafeInteger(total)) { violations.push("invalid aggregate size"); return null; }
    knownTotals.set(setKey(files), total);
    return complete ? total : null;
  };
  const warnAggregate = (label, bytes, files, reference) => {
    const knownBytes = bytes ?? (files === null ? null : knownTotals.get(setKey(files)));
    if (knownBytes > reference) warnings.push(`${label} is ${bytes === null ? "at least " : ""}${knownBytes} bytes${bytes === null ? " (incomplete; exact total NOT_MEASURED)" : ""}; reference ${reference} bytes; review growth and involved resources: ${files.join(", ")}`);
  };
  const paths = (value, label, css = false) => attempt(label, () => {
    if (!Array.isArray(value)) throw new Error("required resource array is missing or invalid");
    const result = value.map((entry) => css ? entry?.path : entry);
    if (result.some((entry) => typeof entry !== "string" || !entry)) throw new Error("invalid resource path");
    return unique(result);
  });
  const buildManifest = attempt("build-manifest.json", () => readJson(resolveArtifact("build-manifest.json")));
  const pageManifest = attempt("/ client manifest", () => readPageClientManifest(resolveArtifact("server/app/page_client-reference-manifest.js")));
  const testManifest = attempt("/test client manifest", () => readPageClientManifest(resolveArtifact("server/app/test/page_client-reference-manifest.js")));
  source("standalone/server.js");
  const shared = [paths(buildManifest?.polyfillFiles, "polyfillFiles"), paths(buildManifest?.rootMainFiles, "rootMainFiles")];
  const join = (sets) => sets.some((set) => set === null) ? null : unique(sets.flat());
  const routeEntries = [["/", pageManifest, "[project]/app/page"], ["/test", testManifest, "[project]/app/test/page"]].map(([route, manifest, key]) => {
    let jsFiles = paths(manifest?.entryJSFiles?.[key], `${route} entry JS`);
    let cssFiles = paths(manifest?.entryCSSFiles?.[key], `${route} entry CSS`, true);
    if (jsFiles?.length === 0) { violations.push(`${route} has no client JS entry`); jsFiles = null; }
    if (cssFiles?.length === 0) { violations.push(`${route} has no CSS entry`); cssFiles = null; }
    return { route, jsFiles, cssFiles, staticEntryJsBytes: totalBytes(join([...shared, jsFiles])), staticEntryCssBytes: totalBytes(cssFiles) };
  });
  const combinedJs = join(routeEntries.map((route) => route.jsFiles));
  const combinedCss = join(routeEntries.map((route) => route.cssFiles));
  const pageEntryJs = combinedJs ?? [];
  const pageEntryCss = combinedCss ?? [];
  const chunkListing = attempt("static/chunks", () => readdirSync(resolveArtifact("static/chunks")));
  const chunkNames = chunkListing ?? [];
  const jsSources = new Map(chunkNames.filter((name) => name.endsWith(".js")).map((name) => {
    const file = `static/chunks/${name}`;
    return [file, source(file)];
  }).filter(([, text]) => text !== null));
  const eagerPageChunks = new Set(pageEntryJs.map((filePath) => filePath.replaceAll("/", path.sep)));
  const pageEntrySources = pageEntryJs.map(source).filter((text) => text !== null);
  const pageLazyChunks = new Set(
    pageEntrySources.flatMap((source) => source.match(/static\/chunks\/[^"']+\.js/g) ?? []),
  );
  const templateChunks = [];
  const templateSizes = [];

  for (const templateId of TEMPLATE_IDS) {
    const candidates = [...jsSources.entries()].filter(([filePath, source]) => {
      const relativePath = filePath.replaceAll("/", path.sep);
      if (eagerPageChunks.has(relativePath)) return false;
      if (!pageLazyChunks.has(relativePath.replaceAll(path.sep, "/"))) return false;
      if (!source.includes(templateId)) return false;
      return TEMPLATE_IDS.filter((candidate) => source.includes(candidate)).length === 1;
    });
    if (candidates.length !== 1) {
      violations.push(`${templateId} expected one lazy client chunk, found ${candidates.length}`);
      continue;
    }
    const [filePath] = candidates[0];
    const relativePath = filePath;
    const bytes = totalBytes([filePath]);
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
  const knownApplicationJsBytes = totalBytes(applicationJsFiles);
  const applicationJsBytes = combinedJs === null || templateChunks.length !== TEMPLATE_IDS.length ? null : knownApplicationJsBytes;
  warnAggregate("cross-route application JS", applicationJsBytes, applicationJsFiles, NEXT_BUILD_BUDGETS.applicationJs);

  const bootstrapJsFiles = join([...shared, combinedJs]);
  const bootstrapJsBytes = totalBytes(bootstrapJsFiles);
  warnAggregate("cross-route bootstrap JS", bootstrapJsBytes, bootstrapJsFiles, NEXT_BUILD_BUDGETS.bootstrapJs);

  const cssEntries = chunkNames.filter((name) => name.endsWith(".css")).map((name) => {
    const file = `static/chunks/${name}`;
    return [file, source(file)];
  });
  const cssSources = new Map(cssEntries.filter(([, text]) => text !== null));
  const publicCssFiles = new Set(pageEntryCss);
  let cssMappingComplete = chunkListing !== null && cssEntries.every(([, text]) => text !== null) && templateSizes.length === TEMPLATE_IDS.length;
  for (const { relativePath, templateId } of templateSizes) {
    const text = source(relativePath);
    const tokens = unique(text?.match(/[A-Za-z0-9_-]+-module__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+/g) ?? []);
    if (tokens.length === 0) {
      violations.push(`${templateId} CSS module tokens could not be parsed from its lazy chunk`);
      cssMappingComplete = false;
      continue;
    }
    const matchingCss = [...cssSources.entries()]
      .filter(([, css]) => tokens.some((token) => css.includes(token)))
      .map(([filePath]) => filePath);
    if (matchingCss.length === 0) {
      violations.push(`${templateId} CSS could not be traced from its lazy chunk`);
      cssMappingComplete = false;
    }
    const missingTokens = tokens.filter((token) => ![...cssSources.values()].some((css) => css.includes(token)));
    if (missingTokens.length) {
      violations.push(`${templateId} CSS tokens could not be traced: ${missingTokens.join(", ")}`);
      cssMappingComplete = false;
    }
    matchingCss.forEach((filePath) => publicCssFiles.add(filePath));
  }
  const knownPublicCssBytes = totalBytes([...publicCssFiles]);
  const publicCssBytes = combinedCss === null || !cssMappingComplete ? null : knownPublicCssBytes;
  warnAggregate("cross-route public CSS", publicCssBytes, [...publicCssFiles], NEXT_BUILD_BUDGETS.publicCss);

  const result = {
    applicationJsBytes,
    bootstrapJsBytes,
    publicCssBytes,
    templateChunks: templateSizes,
    routeEntries,
    unmeasuredRoutes: ["/login", "/:siteSlug/admin", "/:siteSlug (Published photography content)"],
    warnings,
    errors: violations,
    violations,
  };
  return Object.freeze(result);
}

export function enforceNextBuildBudget(projectRoot = process.cwd()) {
  const result = inspectNextBuild(projectRoot);
  if (result.violations.length > 0) {
    const error = new Error(`Standard Next.js artifact check failed:\n${result.violations.map((item) => `- ${item}`).join("\n")}`);
    error.result = result;
    throw error;
  }
  return result;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isMain) {
  try {
    const result = inspectNextBuild();
    const bytes = (value) => value === null ? "NOT_MEASURED" : `${value} bytes`;
    console.log("METRICS: raw artifact bytes; static entry estimates, NOT gzip/br transfer, actual browser requests or execution time.");
    console.log(`Cross-route collections (/ + /test + lazy templates): application JS ${bytes(result.applicationJsBytes)}, bootstrap JS ${bytes(result.bootstrapJsBytes)}, public CSS ${bytes(result.publicCssBytes)}.`);
    for (const route of result.routeEntries) console.log(`Route ${route.route} static entry estimate (deduplicated shared bootstrap + route entries; excludes lazy templates): JS ${bytes(route.staticEntryJsBytes)}, CSS ${bytes(route.staticEntryCssBytes)}.`);
    for (const route of result.unmeasuredRoutes) console.log(`Route ${route}: NOT_MEASURED`);
    for (const template of result.templateChunks) console.log(`Template ${template.templateId}: ${bytes(template.bytes)}; hard limit ${NEXT_BUILD_BUDGETS.templateJs} bytes.`);
    for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    if (result.errors.length) process.exitCode = 1;
    else console.log(result.warnings.length ? "Artifact check passed with size warnings; growth requires review." : "Artifact check passed; measured sizes within references.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
