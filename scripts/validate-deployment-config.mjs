#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { loadDeploymentEnvironment } from "./lib/deployment-config.mjs";

const filePath = process.argv[2];
if (!filePath || process.argv.length !== 3) {
  console.error("Usage: npm run deployment:validate -- <server-only-env-file>");
  process.exit(2);
}

try {
  const config = await loadDeploymentEnvironment(path.resolve(filePath));
  console.log(JSON.stringify({
    caddyConfig: config.caddyConfig,
    domain: config.domain,
    mode: config.mode,
    release: config.release,
    status: "valid",
  }));
} catch (error) {
  const code = typeof error?.code === "string" ? error.code : "invalid_configuration";
  console.error(`Deployment configuration rejected: ${code}.`);
  process.exit(1);
}
