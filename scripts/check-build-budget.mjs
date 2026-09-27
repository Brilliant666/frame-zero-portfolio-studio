import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LEGACY_REFERENCES = Object.freeze({
  publicJs: 550 * 1024, adminJs: 160 * 1024, adminEntryJs: 80 * 1024,
  totalCss: 300 * 1024, templateJs: 64 * 1024, templateCss: 64 * 1024,
});
const TEMPLATE_NAMES = ["archive-os", "character-select", "cinematic-light", "editorial-duet", "film-rail", "manga-panels", "museum-depth", "neon-hud", "orbital-portal", "polaroid-field", "prism-liquid"];
const inside = (root, path) => { const rel = relative(root, path); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
const isAdmin = (source) => source.startsWith("app/admin/") || source.startsWith("app/test/admin/");

// Raw artifact bytes, not compressed transfer, first-page requests or execution cost.
// Preserve historical aggregate scopes; never classify shared modules as Admin.
export function checkLegacyBuildBudget({ root = process.cwd() } = {}) {
  const result = { metrics: {}, warnings: [], errors: [], references: LEGACY_REFERENCES };
  const fail = (message) => result.errors.push(message);
  const client = resolve(root, "dist/client");
  let realClient;
  function readAsset(path) {
    if (typeof path !== "string" || !path || path.includes("\\") || path.includes(":") || isAbsolute(path)) throw new Error(`invalid local asset path: ${String(path)}`);
    const full = resolve(client, path);
    if (!inside(client, full)) throw new Error(`asset path escapes output directory: ${path}`);
    const real = realpathSync(full);
    if (!inside(realClient, real)) throw new Error(`asset symlink escapes output directory: ${path}`);
    const stat = statSync(real);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) throw new Error(`invalid asset size or non-file: ${path}`);
    const bytes = readFileSync(real).byteLength;
    if (bytes !== stat.size) throw new Error(`asset changed while measuring: ${path}`);
    return bytes;
  }
  let manifest;
  try {
    realClient = realpathSync(client);
    readAsset(".vite/manifest.json");
    manifest = JSON.parse(readFileSync(resolve(client, ".vite/manifest.json"), "utf8"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || !Object.keys(manifest).length) throw new Error("manifest must be a non-empty object");
  } catch (error) {
    fail(`manifest analysis failed: ${error.message}`);
    result.metrics = { publicJs: null, adminJs: null, totalJs: null, totalCss: null };
    return result;
  }
  const entries = Object.entries(manifest);
  const files = new Map();
  const valid = new Map();
  for (const [source, entry] of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.file !== "string" || !entry.file) { fail(`invalid manifest entry: ${source}`); continue; }
    let good = true;
    for (const field of ["css", "assets", "imports", "dynamicImports"]) {
      if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some((item) => typeof item !== "string" || !item))) { fail(`invalid ${field} in ${source}`); good = false; }
    }
    for (const field of ["isEntry", "isDynamicEntry"]) {
      if (entry[field] !== undefined && typeof entry[field] !== "boolean") { fail(`invalid ${field} in ${source}`); good = false; }
    }
    if (!good) continue;
    valid.set(source, entry);
    for (const path of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
      if (files.has(path)) continue;
      try { files.set(path, readAsset(path)); } catch (error) { files.set(path, null); fail(`unreadable resource ${path}: ${error.message}`); }
    }
  }
  for (const [source, entry] of valid) for (const dependency of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
    if (!valid.has(dependency)) fail(`missing or invalid manifest dependency ${dependency} from ${source}`);
  }
  const templates = entries.filter(([source]) => /^app\/templates\/[^/]+\/template\.tsx$/.test(source));
  if (templates.length !== 11 || TEMPLATE_NAMES.some((name) => !valid.has(`app/templates/${name}/template.tsx`))) fail(`expected 11 known lazy template entries, found ${templates.length}`);
  const templateFiles = templates.filter(([source]) => valid.has(source)).map(([, entry]) => entry.file);
  if (new Set(templateFiles).size !== 11) fail("expected 11 independent lazy template JS files");
  if (![...valid.values()].some((entry) => entry.isEntry === true && extname(entry.file) === ".js")) fail("required client JS entry is missing");
  for (const [source] of templates) {
    const entry = valid.get(source);
    if (!entry || entry.isDynamicEntry !== true || entry.isEntry === true || extname(entry.file) !== ".js") fail(`template is not a lazy JS entry: ${source}`);
  }
  const eager = new Set();
  function walk(source) { if (eager.has(source)) return; eager.add(source); for (const child of valid.get(source)?.imports ?? []) walk(child); }
  for (const [source, entry] of valid) if (entry.isEntry) walk(source);
  for (const [source] of templates) if (eager.has(source)) fail(`template is eagerly imported by a client entry: ${source}`);
  function measure(paths, reference, label) {
    const unique = [...new Set(paths)];
    const knownBytes = unique.reduce((sum, path) => sum + (files.get(path) ?? 0), 0);
    const complete = unique.every((path) => files.has(path) && files.get(path) !== null);
    if (!Number.isSafeInteger(knownBytes)) { fail(`invalid measured total: ${label}`); return null; }
    if (reference !== undefined && knownBytes > reference) result.warnings.push({ metric: label, bytes: knownBytes, referenceBytes: reference, complete, files: unique, message: "Size signal requires review; not automatically accepted." });
    return complete ? knownBytes : null;
  }
  const assetFiles = [...new Set([...valid.values()].flatMap((entry) => [entry.file, ...(entry.css ?? [])]))];
  const adminFiles = [...new Set([...valid].filter(([source]) => isAdmin(source)).map(([, entry]) => entry.file))];
  result.metrics = {
    scope: "Cross-route raw artifact union; includes lazy templates, not first-page download",
    publicJs: measure(assetFiles.filter((path) => extname(path) === ".js" && !adminFiles.includes(path)), LEGACY_REFERENCES.publicJs, "publicJs"),
    adminJs: measure(adminFiles, LEGACY_REFERENCES.adminJs, "adminJs"),
    totalJs: measure(assetFiles.filter((path) => extname(path) === ".js"), undefined, "totalJs"),
    totalCss: measure(assetFiles.filter((path) => extname(path) === ".css"), LEGACY_REFERENCES.totalCss, "totalCss"),
    templateCount: templates.length,
    templates: templates.filter(([source]) => valid.has(source)).map(([source, entry]) => ({ source, jsBytes: measure([entry.file], LEGACY_REFERENCES.templateJs, `${source} JS`), cssBytes: measure(entry.css ?? [], LEGACY_REFERENCES.templateCss, `${source} CSS`) })),
    routes: { "/": "NOT_MEASURED: legacy manifest has no independent route mapping", "/test": "NOT_MEASURED: legacy manifest has no independent route mapping" },
  };
  for (const [source, entry] of valid) if (isAdmin(source)) measure([entry.file], LEGACY_REFERENCES.adminEntryJs, `${source} lazy JS`);
  if (valid.size !== entries.length) for (const key of ["publicJs", "adminJs", "totalJs", "totalCss"]) result.metrics[key] = null;
  return result;
}

export function reportLegacyBuildBudget(result) {
  console.log("METRICS", JSON.stringify(result.metrics, (_key, value) => value === null ? "NOT_MEASURED" : value, 2));
  console.log("WARNINGS", JSON.stringify(result.warnings, null, 2));
  console.log("ERRORS", JSON.stringify(result.errors, null, 2));
  console.log(result.errors.length ? "Artifact inspection failed." : result.warnings.length ? "Artifact inspection passed with size warnings (产物检查通过，存在体积告警)." : "Artifact inspection passed; measured sizes within references.");
  return result.errors.length ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = reportLegacyBuildBudget(checkLegacyBuildBudget());
