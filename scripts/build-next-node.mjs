#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prepareNextStandalone } from "./prepare-next-standalone.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextCli, "build"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    FRAME_ZERO_NEXT_NODE_PARITY_BUILD: "1",
  },
  stdio: "inherit",
  windowsHide: true,
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Next.js build exited with signal ${signal}`));
    else resolve(code ?? 1);
  });
});

if (exitCode !== 0) {
  process.exitCode = exitCode;
} else {
  const result = await prepareNextStandalone(projectRoot);
  console.log(
    `Prepared Standard Next.js standalone artifact with ${result.publicFiles} allowlisted public files.`,
  );
}
