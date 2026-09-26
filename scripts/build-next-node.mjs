#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prepareNextStandalone } from "./prepare-next-standalone.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const localPreview = process.argv.includes("--local-preview");
if (process.argv.slice(2).some(argument => argument !== "--local-preview")) throw new Error("Only --local-preview is supported.");
const tsconfigPath=path.join(projectRoot,"tsconfig.json");
const originalTsconfig=localPreview?await readFile(tsconfigPath,"utf8"):null;

const child = spawn(process.execPath, [nextCli, "build"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    FRAME_ZERO_NEXT_NODE_PARITY_BUILD: "1",
    FRAME_ZERO_LOCAL_PREVIEW_BUILD: localPreview ? "1" : "0",
    NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW: localPreview ? "1" : "0",
  },
  stdio: "inherit",
  windowsHide: true,
});

const stopChild=()=>child.kill();
if(localPreview){process.once("SIGINT",stopChild);process.once("SIGTERM",stopChild);}
let exitCode;
try { exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Next.js build exited with signal ${signal}`));
    else resolve(code ?? 1);
  });
}); } finally {
  if(originalTsconfig!==null){
    const {restorableLocalTsconfig}=await import("./lib/local-preview-build.mjs");
    process.removeListener("SIGINT",stopChild);process.removeListener("SIGTERM",stopChild);
    const current=await readFile(tsconfigPath,"utf8"),restored=restorableLocalTsconfig(originalTsconfig,current);
    if(restored!==null && restored!==current)await writeFile(tsconfigPath,restored);
    else if(restored===null)console.warn("Local build left tsconfig unchanged because an independent edit was detected; review the generated includes manually.");
  }
}

if (exitCode !== 0) {
  process.exitCode = exitCode;
} else {
  const result = await prepareNextStandalone(projectRoot, localPreview ? ".next-local-preview" : ".next");
  console.log(
    `Prepared ${localPreview ? "LOOPBACK-ONLY PREVIEW" : "Standard Next.js"} standalone artifact with ${result.publicFiles} allowlisted public files.`,
  );
}
