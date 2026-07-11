import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MAX_GIT_OUTPUT = 64 * 1024 * 1024;
const forbiddenRasterExtension = /\.(?:jpe?g|png|webp|avif|gif|tiff?|heic|heif|dng|raw|cr2|cr3|nef|arw)$/i;
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

  if (forbiddenRasterExtension.test(normalized)) {
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
    if (!content.includes(0)) inspectText(content.toString("utf8"), `index blob ${filePath}`);
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

  if (!content.includes(0)) inspectText(content.toString("utf8"), `tracked candidate ${filePath}`);
}

for (const entry of reachableEntries) {
  const separator = entry.indexOf(" ");
  if (separator === -1) continue;
  inspectPath(entry.slice(separator + 1), "reachable history");
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
