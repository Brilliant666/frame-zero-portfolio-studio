#!/usr/bin/env node

import process from "node:process";
import { importPhotoLibrary } from "./lib/photo-import.mjs";

function parseSourceArgument(args) {
  let source = null;
  let adoptLinkedOutput = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--adopt-linked-output" || argument === "adopt-linked-output") {
      adoptLinkedOutput = true;
      continue;
    }
    if (argument === "--source") {
      source = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument.startsWith("--source=")) {
      source = argument.slice("--source=".length);
      continue;
    }
    // Some npm versions consume the `--source` option while forwarding its
    // value. Accept one positional directory so the documented npm command
    // remains portable across those versions.
    if (!argument.startsWith("-") && source === null) {
      source = argument;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!source) {
    throw new Error('Usage: npm run photos:import -- --source "<photo-folder>" [adopt-linked-output]');
  }
  return { adoptLinkedOutput, sourceDir: source };
}

try {
  const { adoptLinkedOutput, sourceDir } = parseSourceArgument(process.argv.slice(2));
  const result = await importPhotoLibrary({ adoptLinkedOutput, sourceDir, projectRoot: process.cwd() });

  console.log(
    `Imported ${result.sourceAssets} unique source assets; the additive library now contains ${result.importedAssets} assets `
    + `(${result.generatedAssets} generated, ${result.reusedAssets} reused, ${result.duplicateFiles} exact duplicates).`,
  );
  console.log("Manifest: public/photos/library-manifest.json");

  if (result.skippedSymlinks > 0) {
    console.warn(`Skipped ${result.skippedSymlinks} symbolic links.`);
  }
  if (result.skipped.length > 0) {
    console.warn(`Skipped ${result.skipped.length} unreadable or damaged files:`);
    for (const item of result.skipped) console.warn(`- ${item.file}: ${item.reason}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (Array.isArray(error?.skipped)) {
    for (const item of error.skipped) console.error(`- ${item.file}: ${item.reason}`);
  }
  process.exitCode = 1;
}
