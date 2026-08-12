import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const MAX_GIT_OUTPUT = 64 * 1024 * 1024;
const forbiddenRasterExtension = /\.(?:jpe?g|png|webp|avif|gif|tiff?|heic|heif|dng|raw|cr2|cr3|nef|arw)$/i;
const templateStructurePreviewNames = new Set([
  "archive-os.webp",
  "character-select.webp",
  "cinematic-light.webp",
  "editorial-duet.webp",
  "film-rail.webp",
  "manga-panels.webp",
  "museum-depth.webp",
  "neon-hud.webp",
  "orbital-portal.webp",
  "polaroid-field.webp",
  "prism-liquid.webp",
]);
const templateStructurePreviewDirectory = "public/template-structure-previews/";
const templateStructurePreviewDigests = new Map([
  ["archive-os.webp", "3a5b6f49425f09eea2018d4d8dd06fbbf74c0011061eff92c90bc4f7709c11d8"],
  ["character-select.webp", "e25b2ed621751632eb0257e8328eddd6c4b57f8c124acbc4c8306e12e4c6f9f3"],
  ["cinematic-light.webp", "85ae44211a9880abb05528ae351975fba5c94077322a095d67195e88c716a1de"],
  ["editorial-duet.webp", "a3ce891413354da6cb2a7541a7c4ac31b132e1616d47b8dc717a67092156673a"],
  ["film-rail.webp", "f256e6a62d1a72e2d3954a3e7c8f952b1b682435ac110107768e050e2da6ac04"],
  ["manga-panels.webp", "515a92efcb505bf63cd6e5d3464587436318c8b1426f20bb8193b154c05cbd67"],
  ["museum-depth.webp", "a62f539a8eafded7dde423288365766510443064840e3d8e24cf2639aa41c022"],
  ["neon-hud.webp", "50572630432d3e73c01ebc14da888bae7f8b6101bb9955e7bf07840db51afc98"],
  ["orbital-portal.webp", "3d2f505fb9e235e8c8748ab50c94cfa5dea9664de597e249027e0b4c064dfa0e"],
  ["polaroid-field.webp", "eaea37e6a50349cee589f0c95e7c12d21e5da4315c8d2fbf51196a11b550866e"],
  ["prism-liquid.webp", "c988b0e1c6a478d115efb7b7b8cc6e0135182bdb43118b0f1aab7793cc06f510"],
]);
const forbiddenPhotoDirectory = /^public\/photos(?:\/|$)/i;
const forbiddenLocalStateDirectory = /^\.frame-zero(?:\/|$)/i;
const embeddedRasterData = /data\s*:\s*image(?:\/[a-z0-9.+-]+)?\s*;\s*base64\s*,?/i;
const windowsAbsolutePath = /(^|[^a-z0-9+.-])[a-z]:[\\/]{1,2}/im;
const localWechatPath = /(?:Tencent[\\/]WeChat Files|FileStorage[\\/](?:Temp|Image)|wxid_[a-z0-9_-]{4,})/i;
const chineseMobileNumber = /(^|\D)1[3-9]\d{9}(?!\d)/g;
const credentialMaterial = /(?:ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;
const emailAddress = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const allowedEmails = [
  /^git@github\.com$/i,
  /^noreply@github\.com$/i,
  /@users\.noreply\.github\.com$/i,
  /\.example$/i,
];

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

function reviewedTemplateStructurePreviewName(filePath) {
  const normalized = normalizeGitPath(filePath);
  if (
    !normalized.startsWith(templateStructurePreviewDirectory)
    || normalized.slice(templateStructurePreviewDirectory.length).includes("/")
  ) return null;
  const name = path.posix.basename(normalized);
  return templateStructurePreviewNames.has(name) ? name : null;
}

function inspectReviewedTemplateStructurePreview(content, filePath, source) {
  const name = reviewedTemplateStructurePreviewName(filePath);
  if (!name) return false;

  const isWebp = content.length >= 12
    && content.subarray(0, 4).toString("ascii") === "RIFF"
    && content.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isWebp) violations.add(`${source}: invalid WebP structure preview: ${normalizeGitPath(filePath)}`);
  if (content.length === 0 || content.length > 64 * 1024) {
    violations.add(`${source}: structure preview exceeds 64 KiB: ${normalizeGitPath(filePath)}`);
  }
  const digest = createHash("sha256").update(content).digest("hex");
  if (digest !== templateStructurePreviewDigests.get(name)) {
    violations.add(`${source}: unreviewed structure preview bytes: ${normalizeGitPath(filePath)}`);
  }
  return true;
}

const violations = new Set();
const indexPaths = gitText("ls-files", "--cached", "-z")
  .split("\0")
  .filter(Boolean);
const candidatePaths = gitText("ls-files", "--cached", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean);
const reachableEntries = gitText("-c", "core.quotePath=false", "rev-list", "--objects", "--all")
  .split(/\r?\n/)
  .filter(Boolean);

function inspectPath(filePath, source) {
  const normalized = normalizeGitPath(filePath);

  if (forbiddenPhotoDirectory.test(normalized)) {
    violations.add(`${source}: local photo directory: ${normalized}`);
  }

  if (forbiddenLocalStateDirectory.test(normalized)) {
    violations.add(`${source}: local import state directory: ${normalized}`);
  }

  const isReviewedTemplateStructurePreview = reviewedTemplateStructurePreviewName(normalized) !== null;

  if (forbiddenRasterExtension.test(normalized) && !isReviewedTemplateStructurePreview) {
    violations.add(`${source}: raster asset: ${normalized}`);
  }
}

function inspectText(text, source) {
  const checks = [
    [embeddedRasterData, "embedded raster data"],
    [windowsAbsolutePath, "Windows absolute path"],
    [localWechatPath, "local WeChat identifier or storage path"],
    [credentialMaterial, "credential or private key material"],
  ];

  for (const [pattern, label] of checks) {
    const match = pattern.exec(text);
    if (match) violations.add(`${source}: ${label} at line ${lineNumberAt(text, match.index)}`);
  }

  chineseMobileNumber.lastIndex = 0;
  const phoneMatch = chineseMobileNumber.exec(text);
  if (phoneMatch) {
    violations.add(`${source}: possible Chinese mobile number at line ${lineNumberAt(text, phoneMatch.index)}`);
  }

  emailAddress.lastIndex = 0;
  for (const match of text.matchAll(emailAddress)) {
    if (!allowedEmails.some((allowed) => allowed.test(match[0]))) {
      violations.add(`${source}: non-placeholder email ${match[0]} at line ${lineNumberAt(text, match.index)}`);
    }
  }
}

for (const filePath of indexPaths) {
  inspectPath(filePath, "index");

  try {
    const content = gitBuffer("show", `:${filePath}`);
    if (!inspectReviewedTemplateStructurePreview(content, filePath, "index blob") && !content.includes(0)) {
      inspectText(content.toString("utf8"), `index blob ${filePath}`);
    }
  } catch {
    violations.add(`index: unable to inspect staged blob: ${filePath}`);
  }
}

for (const filePath of candidatePaths) {
  inspectPath(filePath, "worktree/index");
  if (!existsSync(filePath)) continue;

  let content;
  try {
    content = readFileSync(filePath);
  } catch {
    violations.add(`worktree/index: unable to inspect file: ${filePath}`);
    continue;
  }

  if (!inspectReviewedTemplateStructurePreview(content, filePath, "worktree/index") && !content.includes(0)) {
    inspectText(content.toString("utf8"), `tracked candidate ${filePath}`);
  }
}

for (const entry of reachableEntries) {
  const separator = entry.indexOf(" ");
  if (separator === -1) continue;
  const objectId = entry.slice(0, separator);
  const filePath = entry.slice(separator + 1);
  inspectPath(filePath, "reachable history");
  const previewName = reviewedTemplateStructurePreviewName(filePath);
  if (previewName) {
    try {
      inspectReviewedTemplateStructurePreview(gitBuffer("cat-file", "blob", objectId), filePath, "reachable history blob");
    } catch {
      violations.add(`reachable history: unable to inspect structure preview blob: ${filePath}`);
    }
  }
}

const historyPatch = gitBuffer(
  "log",
  "--all",
  "--format=fuller",
  "--patch",
  "--no-ext-diff",
  "--no-renames",
).toString("utf8");
inspectText(historyPatch, "reachable history content");

if (violations.size > 0) {
  console.error("Public repository safety check failed:");
  for (const violation of [...violations].sort()) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `Public repository safety check passed: inspected ${indexPaths.length} index paths, ${candidatePaths.length} worktree candidates, and ${reachableEntries.length} reachable Git objects.`,
);
