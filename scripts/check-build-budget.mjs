import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const DIST_CLIENT = join("dist", "client");
const MANIFEST_PATH = join(DIST_CLIENT, ".vite", "manifest.json");
const MAX_PUBLIC_JS = 550 * 1024;
const MAX_ADMIN_JS = 160 * 1024;
const MAX_ADMIN_ENTRY_JS = 80 * 1024;
const MAX_TOTAL_CSS = 300 * 1024;
const MAX_TEMPLATE_JS = 64 * 1024;
const MAX_TEMPLATE_CSS = 64 * 1024;
const EXPECTED_TEMPLATE_COUNT = 11;

if (!existsSync(MANIFEST_PATH)) {
  throw new Error("Legacy Vite build manifest is missing. Run `npm run build:legacy` before this check.");
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const templateEntries = Object.entries(manifest).filter(([source]) =>
  /^app\/templates\/[^/]+\/template\.tsx$/.test(source),
);

const violations = [];
if (templateEntries.length !== EXPECTED_TEMPLATE_COUNT) {
  violations.push(`expected ${EXPECTED_TEMPLATE_COUNT} lazy template entries, found ${templateEntries.length}`);
}

function fileBytes(relativePath) {
  const fullPath = join(DIST_CLIENT, relativePath);
  return existsSync(fullPath) ? statSync(fullPath).size : 0;
}

const templateSizes = templateEntries.map(([source, entry]) => {
  const jsBytes = fileBytes(entry.file);
  const cssBytes = (entry.css ?? []).reduce((total, file) => total + fileBytes(file), 0);
  if (jsBytes > MAX_TEMPLATE_JS) violations.push(`${source} JS is ${jsBytes} bytes`);
  if (cssBytes > MAX_TEMPLATE_CSS) violations.push(`${source} CSS is ${cssBytes} bytes`);
  return { source, jsBytes, cssBytes };
});

const assetFiles = Object.values(manifest)
  .flatMap((entry) => [entry.file, ...(entry.css ?? [])])
  .filter((file, index, files) => files.indexOf(file) === index);
const totalJs = assetFiles
  .filter((file) => extname(file) === ".js")
  .reduce((total, file) => total + fileBytes(file), 0);
const totalCss = assetFiles
  .filter((file) => extname(file) === ".css")
  .reduce((total, file) => total + fileBytes(file), 0);

// Admin routes are authenticated/editor-only dynamic entries in the legacy
// rollback artifact. Keep them individually bounded, but do not charge them to
// the public-page aggregate that protects visitors. Standard Next remains the
// default production lane and has its own route-aware budget gate.
const adminEntryFiles = new Set(Object.entries(manifest)
  .filter(([source]) => source.startsWith("app/admin/"))
  .map(([, entry]) => entry.file));
const publicJs = assetFiles
  .filter((file) => extname(file) === ".js" && !adminEntryFiles.has(file))
  .reduce((total, file) => total + fileBytes(file), 0);
const adminJs = [...adminEntryFiles]
  .reduce((total, file) => total + fileBytes(file), 0);

if (publicJs > MAX_PUBLIC_JS) violations.push(`public client JS is ${publicJs} bytes`);
if (adminJs > MAX_ADMIN_JS) violations.push(`Admin dynamic JS is ${adminJs} bytes`);
for (const [source, entry] of Object.entries(manifest).filter(([source]) => source.startsWith("app/admin/"))) {
  const bytes = fileBytes(entry.file);
  if (bytes > MAX_ADMIN_ENTRY_JS) violations.push(`${source} lazy JS is ${bytes} bytes`);
}
if (totalCss > MAX_TOTAL_CSS) violations.push(`total client CSS is ${totalCss} bytes`);

if (violations.length > 0) {
  console.error("Build budget check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

const largestTemplate = templateSizes.sort(
  (left, right) => right.jsBytes + right.cssBytes - (left.jsBytes + left.cssBytes),
)[0];

console.log(
  `Legacy Vite build budget passed: ${templateEntries.length} lazy templates, ${(publicJs / 1024).toFixed(1)} KiB public JS, ${(adminJs / 1024).toFixed(1)} KiB Admin dynamic JS (${(totalJs / 1024).toFixed(1)} KiB all routes), ${(totalCss / 1024).toFixed(1)} KiB CSS; largest template ${(largestTemplate.jsBytes + largestTemplate.cssBytes) / 1024 < 10 ? "<10" : ((largestTemplate.jsBytes + largestTemplate.cssBytes) / 1024).toFixed(1)} KiB.`,
);
