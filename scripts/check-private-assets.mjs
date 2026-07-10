import { execFileSync } from "node:child_process";

const MAX_GIT_OUTPUT = 64 * 1024 * 1024;
const forbiddenRasterExtension = /\.(?:jpe?g|png|webp|avif|gif|tiff?|heic|heif)$/i;
const forbiddenPhotoDirectory = /^public\/photos(?:\/|$)/i;
const embeddedRasterData = /data\s*:\s*image(?:\/[a-z0-9.+-]+)?\s*;\s*base64\s*,?/i;
const windowsAbsolutePath = /(^|[^a-z0-9+.-])[a-z]:[\\/]{1,2}/im;

function gitText(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT,
  });
}

function gitBuffer(...args) {
  return execFileSync("git", args, {
    encoding: null,
    maxBuffer: MAX_GIT_OUTPUT,
  });
}

function normalizeGitPath(filePath) {
  const unquoted = filePath.startsWith('"') && filePath.endsWith('"')
    ? filePath.slice(1, -1)
    : filePath;
  return unquoted.replaceAll("\\", "/");
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split(/\r\n|\r|\n/).length;
}

const violations = new Set();
const trackedPaths = gitText("ls-files", "-z").split("\0").filter(Boolean);
const reachableEntries = gitText("-c", "core.quotePath=false", "rev-list", "--objects", "--all")
  .split(/\r?\n/)
  .filter(Boolean);

function inspectPath(filePath, source) {
  const normalized = normalizeGitPath(filePath);

  if (forbiddenPhotoDirectory.test(normalized)) {
    violations.add(`${source}: private photo directory: ${normalized}`);
  }

  if (forbiddenRasterExtension.test(normalized)) {
    violations.add(`${source}: raster asset: ${normalized}`);
  }
}

for (const filePath of trackedPaths) {
  inspectPath(filePath, "index");
}

for (const entry of reachableEntries) {
  const separator = entry.indexOf(" ");
  if (separator === -1) continue;
  inspectPath(entry.slice(separator + 1), "reachable history");
}

for (const filePath of trackedPaths) {
  let content;

  try {
    content = gitBuffer("show", `:${filePath}`);
  } catch {
    violations.add(`index: unable to inspect tracked file: ${filePath}`);
    continue;
  }

  if (content.includes(0)) continue;

  const text = content.toString("utf8");
  const embeddedMatch = embeddedRasterData.exec(text);
  const pathMatch = windowsAbsolutePath.exec(text);

  if (embeddedMatch) {
    violations.add(
      `tracked text: embedded raster data at ${filePath}:${lineNumberAt(text, embeddedMatch.index)}`,
    );
  }

  if (pathMatch) {
    const driveOffset = pathMatch.index + pathMatch[1].length;
    violations.add(
      `tracked text: Windows absolute path at ${filePath}:${lineNumberAt(text, driveOffset)}`,
    );
  }
}

if (violations.size > 0) {
  console.error("Private asset safety check failed:");
  for (const violation of [...violations].sort()) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `Private asset check passed: inspected ${trackedPaths.length} tracked paths and ${reachableEntries.length} reachable Git objects.`,
);
