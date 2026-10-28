#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseSiteDeploymentEnvironment } from "./lib/site-deployment-config.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--env" || !args[1]) throw new Error("INVALID_ARGUMENTS");
  parseSiteDeploymentEnvironment(await readFile(args[1], "utf8"));
  console.log("Site deployment configuration accepted; no services started or data changed.");
} catch {
  console.error("Site deployment configuration rejected. Check the private configuration and documented contract.");
  process.exitCode = 1;
}
