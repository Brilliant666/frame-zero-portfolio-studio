#!/usr/bin/env node

import { cp, lstat, mkdir, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PRODUCTION_PUBLIC_MANIFEST = "config/production-public-files.json";
const MANIFEST_KEYS = ["files", "version"];
const MAX_PUBLIC_FILES = 256;
const MAX_PUBLIC_PATH_LENGTH = 256;

function assertPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify a path outside ${parent}`);
  }
}

function assertPlainRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain JSON object.`);
  }
}

function validatePublicPath(value, index) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PUBLIC_PATH_LENGTH) {
    throw new Error(`Production public file at index ${index} must be a non-empty path up to ${MAX_PUBLIC_PATH_LENGTH} characters.`);
  }
  if (value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    throw new Error(`Unsafe production public path: ${JSON.stringify(value)}`);
  }
  const segments = value.split("/");
  if (
    segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.startsWith("."))
    || path.posix.normalize(value) !== value
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
  ) {
    throw new Error(`Unsafe production public path: ${JSON.stringify(value)}`);
  }
  const lowerPath = value.toLowerCase();
  if (lowerPath === "photos" || lowerPath.startsWith("photos/") || lowerPath === "og.png") {
    throw new Error(`Private local asset cannot enter the standalone artifact: public/${value}`);
  }
  return value;
}

export async function loadProductionPublicFiles(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  const manifestPath = path.join(resolvedRoot, ...PRODUCTION_PUBLIC_MANIFEST.split("/"));
  assertPathInside(resolvedRoot, manifestPath);

  const manifestStats = await lstat(manifestPath);
  if (!manifestStats.isFile() || manifestStats.isSymbolicLink()) {
    throw new Error(`${PRODUCTION_PUBLIC_MANIFEST} must be a regular file.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to parse ${PRODUCTION_PUBLIC_MANIFEST}: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
  assertPlainRecord(manifest, PRODUCTION_PUBLIC_MANIFEST);

  const keys = Object.keys(manifest).sort();
  if (keys.length !== MANIFEST_KEYS.length || keys.some((key, index) => key !== MANIFEST_KEYS[index])) {
    throw new Error(`${PRODUCTION_PUBLIC_MANIFEST} contains unknown or missing fields.`);
  }
  if (manifest.version !== 1) {
    throw new Error(`${PRODUCTION_PUBLIC_MANIFEST} must use version 1.`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > MAX_PUBLIC_FILES) {
    throw new Error(`${PRODUCTION_PUBLIC_MANIFEST} files must contain 1 to ${MAX_PUBLIC_FILES} paths.`);
  }

  const files = manifest.files.map(validatePublicPath);
  const normalizedKeys = files.map((file) => file.toLowerCase());
  if (new Set(normalizedKeys).size !== normalizedKeys.length) {
    throw new Error(`${PRODUCTION_PUBLIC_MANIFEST} contains duplicate paths.`);
  }
  const sortedFiles = [...files].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (files.some((file, index) => file !== sortedFiles[index])) {
    throw new Error(`${PRODUCTION_PUBLIC_MANIFEST} files must be sorted by canonical byte order.`);
  }
  return Object.freeze([...files]);
}

async function assertRegularDependencyTree(directory) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("Traced dependency must be a regular directory.");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlink inside traced dependency is not allowed.");
    if (entry.isDirectory()) await assertRegularDependencyTree(file);
    else if (!entry.isFile()) throw new Error("Non-regular traced dependency entry is not allowed.");
  }
}

// Turbopack emits hashed package aliases as symlinks. Materialize only aliases
// for exact-pinned runtime dependencies, using the already-traced standalone
// package (never copying an arbitrary symlink target or the full source package).
export async function materializeTracedDependencyAliases(projectRoot, standaloneRoot, distDirectory) {
  projectRoot = await realpath(projectRoot);
  standaloneRoot = await realpath(standaloneRoot);
  const aliases = path.join(standaloneRoot, distDirectory, "node_modules");
  try { await lstat(aliases); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  assertPathInside(standaloneRoot, aliases);
  const realStandalone = await realpath(standaloneRoot);
  if ((await lstat(aliases)).isSymbolicLink() || await realpath(aliases) !== aliases) {
    throw new Error("Dependency alias directory must not traverse symlinks.");
  }
  const runtimeDependencies = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")).dependencies ?? {};
  for (const entry of await readdir(aliases, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const match = /^([a-z0-9][a-z0-9._-]*)-[a-f0-9]{16}$/.exec(entry.name);
    if (!match || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(runtimeDependencies[match[1]] ?? "")) {
      throw new Error("Unreviewed standalone dependency alias.");
    }
    const name = match[1];
    const alias = path.join(aliases, entry.name);
    const traced = path.join(standaloneRoot, "node_modules", name);
    const installed = path.join(projectRoot, "node_modules", name);
    const target = await realpath(alias);
    if (target !== installed && target !== traced) throw new Error("Dependency alias target is outside its reviewed package.");
    const realTraced = await realpath(traced);
    assertPathInside(realStandalone, realTraced);
    if (realTraced !== traced) throw new Error("Traced dependency path must not traverse symlinks.");
    await assertRegularDependencyTree(traced);
    const manifest = JSON.parse(await readFile(path.join(traced, "package.json"), "utf8"));
    if (manifest.name !== name || manifest.version !== runtimeDependencies[name]) throw new Error("Traced dependency does not match its exact runtime pin.");
    assertPathInside(standaloneRoot, alias);
    // Remove only the vetted link, never recursively remove its resolved target.
    await rm(alias);
    await cp(traced, alias, { recursive: true, dereference: false, errorOnExist: true, force: false });
  }
}

export async function prepareNextStandalone(projectRoot, distDirectory = ".next") {
  if (![".next", ".next-local-preview"].includes(distDirectory)) throw new Error("Unsupported Next.js artifact directory.");
  const resolvedRoot = path.resolve(projectRoot);
  const nextRoot = path.join(resolvedRoot, distDirectory);
  const standaloneRoot = path.join(nextRoot, "standalone");
  const staticSource = path.join(nextRoot, "static");
  const staticTarget = path.join(standaloneRoot, distDirectory, "static");
  const publicSource = path.join(resolvedRoot, "public");
  const publicTarget = path.join(standaloneRoot, "public");

  assertPathInside(resolvedRoot, nextRoot);
  assertPathInside(nextRoot, standaloneRoot);
  assertPathInside(standaloneRoot, staticTarget);
  assertPathInside(standaloneRoot, publicTarget);

  const publicSourceStats = await lstat(publicSource);
  if (!publicSourceStats.isDirectory() || publicSourceStats.isSymbolicLink()) {
    throw new Error("public must be a real directory, not a symbolic link.");
  }
  const realPublicSource = await realpath(publicSource);

  await rm(staticTarget, { force: true, recursive: true });
  await rm(publicTarget, { force: true, recursive: true });
  await mkdir(path.dirname(staticTarget), { recursive: true });
  await mkdir(publicTarget, { recursive: true });
  await cp(staticSource, staticTarget, { recursive: true });

  const publicFiles = await loadProductionPublicFiles(resolvedRoot);
  for (const relativePublic of publicFiles) {
    const source = path.join(publicSource, ...relativePublic.split("/"));
    assertPathInside(publicSource, source);
    const sourceStats = await lstat(source);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      throw new Error(`Allowlisted public asset must be a regular file: public/${relativePublic}`);
    }
    const realSource = await realpath(source);
    assertPathInside(realPublicSource, realSource);
    const target = path.join(publicTarget, ...relativePublic.split("/"));
    assertPathInside(publicTarget, target);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }

  await materializeTracedDependencyAliases(resolvedRoot, standaloneRoot, distDirectory);

  return {
    publicFiles: publicFiles.length,
    standaloneRoot,
  };
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(scriptPath).href;

if (isMain) {
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const result = await prepareNextStandalone(projectRoot);
  console.log(
    `Prepared Standard Next.js standalone artifact with ${result.publicFiles} allowlisted public files.`,
  );
}
