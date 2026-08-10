#!/usr/bin/env node

import { execFile } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function assertPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify a path outside ${parent}`);
  }
}

export async function listTrackedPublicFiles(projectRoot) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z", "--", "public"], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });

  return stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.replaceAll("\\", "/"))
    .map((entry) => {
      if (!entry.startsWith("public/") || entry.includes("../") || path.isAbsolute(entry)) {
        throw new Error(`Unsafe tracked public path: ${entry}`);
      }
      if (entry === "public/photos" || entry.startsWith("public/photos/") || entry === "public/og.png") {
        throw new Error(`Private local asset cannot enter the standalone artifact: ${entry}`);
      }
      return entry;
    });
}

export async function prepareNextStandalone(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  const nextRoot = path.join(resolvedRoot, ".next");
  const standaloneRoot = path.join(nextRoot, "standalone");
  const staticSource = path.join(nextRoot, "static");
  const staticTarget = path.join(standaloneRoot, ".next", "static");
  const publicTarget = path.join(standaloneRoot, "public");

  assertPathInside(resolvedRoot, nextRoot);
  assertPathInside(nextRoot, standaloneRoot);
  assertPathInside(standaloneRoot, staticTarget);
  assertPathInside(standaloneRoot, publicTarget);

  await rm(staticTarget, { force: true, recursive: true });
  await rm(publicTarget, { force: true, recursive: true });
  await mkdir(path.dirname(staticTarget), { recursive: true });
  await mkdir(publicTarget, { recursive: true });
  await cp(staticSource, staticTarget, { recursive: true });

  const publicFiles = await listTrackedPublicFiles(resolvedRoot);
  for (const relativeSource of publicFiles) {
    const source = path.join(resolvedRoot, ...relativeSource.split("/"));
    const relativePublic = relativeSource.slice("public/".length);
    const target = path.join(publicTarget, ...relativePublic.split("/"));
    assertPathInside(publicTarget, target);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }

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
    `Prepared Standard Next.js standalone artifact with ${result.publicFiles} tracked public files.`,
  );
}
