import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const DIST_CLIENT = join("dist", "client");
const MANIFEST_PATH = join(DIST_CLIENT, ".vite", "manifest.json");
const MAX_TOTAL_JS = 550 * 1024;
const MAX_TOTAL_CSS = 300 * 1024;
const MAX_TEMPLATE_JS = 64 * 1024;
const MAX_TEMPLATE_CSS = 64 * 1024;
const EXPECTED_TEMPLATE_COUNT = 11;

if (!existsSync(MANIFEST_PATH)) {
  throw new Error("Build manifest is missing. Run `npm run build` before the bundle budget check.");
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

if (totalJs > MAX_TOTAL_JS) violations.push(`total client JS is ${totalJs} bytes`);
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
  `Build budget passed: ${templateEntries.length} lazy templates, ${(totalJs / 1024).toFixed(1)} KiB JS, ${(totalCss / 1024).toFixed(1)} KiB CSS; largest template ${(largestTemplate.jsBytes + largestTemplate.cssBytes) / 1024 < 10 ? "<10" : ((largestTemplate.jsBytes + largestTemplate.cssBytes) / 1024).toFixed(1)} KiB.`,
);
