import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [sourceDir, outputDir] = process.argv.slice(2);

if (!sourceDir || !outputDir) {
  throw new Error("Usage: node scripts/prepare-photos.mjs <source> <output>");
}

await fs.mkdir(outputDir, { recursive: true });

const files = (await fs.readdir(sourceDir))
  .filter((file) => /\.(jpe?g|png)$/i.test(file))
  .sort((a, b) => a.localeCompare(b, "zh-CN"));

for (const [index, file] of files.entries()) {
  const source = path.join(sourceDir, file);
  const id = String(index + 1).padStart(2, "0");
  const base = sharp(source).rotate();

  await Promise.all([
    base
      .clone()
      .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 4, smartSubsample: true })
      .toFile(path.join(outputDir, `photo-${id}-full.webp`)),
    base
      .clone()
      .resize({ width: 1100, height: 1100, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70, effort: 4, smartSubsample: true })
      .toFile(path.join(outputDir, `photo-${id}-card.webp`)),
  ]);
}

console.log(`Prepared ${files.length} responsive photo pairs in ${outputDir}`);
