#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadDeploymentEnvironment } from "./lib/deployment-config.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(projectRoot, "deploy", "compose.yaml");
const projectName = "portfolio-platform";
const maxOutput = 32 * 1024 * 1024;
const operations = new Set([
  "precheck",
  "prepare",
  "deploy",
  "verify",
  "update",
  "rollback",
  "stop",
  "logs",
  "health",
]);

function usage() {
  return [
    "Usage: npm run deployment:bootstrap -- <operation> <server-only-env-file>",
    "Operations: precheck prepare deploy verify update rollback stop logs health",
    "The env file must pass the strict production configuration contract.",
  ].join("\n");
}

async function command(executable, args, options = {}) {
  try {
    const result = await execFileAsync(executable, args, {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: maxOutput,
      timeout: options.timeout ?? 10 * 60_000,
      windowsHide: true,
    });
    if (options.forwardOutput && result.stdout) process.stdout.write(result.stdout);
    return result.stdout.trim();
  } catch (error) {
    const wrapped = new Error(`${executable}_${args[0] ?? "command"}_failed`);
    wrapped.code = "command_failed";
    wrapped.cause = error;
    throw wrapped;
  }
}

function composeArgs(envFile, args) {
  return [
    "compose",
    "--project-name", projectName,
    "--env-file", envFile,
    "--file", composeFile,
    ...args,
  ];
}

async function compose(envFile, args, options = {}) {
  return command("docker", composeArgs(envFile, args), options);
}

async function assertLinuxDocker(envFile) {
  if (process.platform !== "linux") {
    const error = new Error("Production deployment operations require the approved Linux target.");
    error.code = "linux_required";
    throw error;
  }
  assert.match(await command("docker", ["version", "--format", "{{.Server.Version}}"]), /^\d+\.\d+/);
  assert.match(await command("docker", ["compose", "version", "--short"]), /^\d+\.\d+/);
  await compose(envFile, ["config", "--quiet"]);
}

async function assertReviewedCheckout(release) {
  const head = await command("git", ["rev-parse", "HEAD"]);
  const expected = release.slice("sha-".length);
  if (!head.startsWith(expected)) {
    const error = new Error("The immutable release does not match the checked-out commit.");
    error.code = "release_checkout_mismatch";
    throw error;
  }
  const dirty = await command("git", ["status", "--porcelain"]);
  if (dirty !== "") {
    const error = new Error("The deployment checkout must be clean.");
    error.code = "dirty_checkout";
    throw error;
  }
}

async function assertImageExists(release) {
  await command("docker", ["image", "inspect", `portfolio-platform-app:${release}`]);
}

async function request(origin, pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    cache: "no-store",
    method: options.method ?? "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  return response;
}

async function assertHealth(origin) {
  for (const [pathname, status] of [
    ["/api/health/live", "live"],
    ["/api/health/ready", "ready"],
  ]) {
    const response = await request(origin, pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await response.json(), { status });
  }
}

async function assertPublicBoundary(config) {
  const origin = `https://${config.domain}`;
  await assertHealth(origin);
  for (const pathname of ["/", "/favicon.svg", "/api/site-content"]) {
    assert.equal((await request(origin, pathname)).status, 200, pathname);
  }
  const mutation = await request(origin, "/api/site-content", { method: "PUT" });
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get("allow"), "GET, HEAD");
  for (const pathname of [
    "/admin",
    "/star/admin",
    "/login",
    "/api/auth/session",
    "/api/upload",
    `/api/platform-qr/${"d".repeat(64)}`,
    "/api/unreviewed",
  ]) assert.equal((await request(origin, pathname)).status, 404, pathname);
}

async function precheck(envFile) {
  await assertLinuxDocker(envFile);
}

async function prepare(envFile, config) {
  await precheck(envFile);
  await assertReviewedCheckout(config.release);
  await compose(envFile, ["pull", "caddy"], { timeout: 5 * 60_000 });
  await compose(envFile, [
    "run", "--rm", "--no-deps", "caddy",
    "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile",
  ], { timeout: 2 * 60_000 });
  await compose(envFile, ["build", "--pull", "app"], { timeout: 20 * 60_000 });
}

async function deploy(envFile, config, options = {}) {
  await precheck(envFile);
  await assertImageExists(config.release);
  const args = ["up", "--detach", "--wait", "--wait-timeout", "120"];
  if (options.noBuild) args.push("--no-build");
  await compose(envFile, args, { timeout: 5 * 60_000 });
}

async function stop(envFile) {
  await precheck(envFile);
  await compose(envFile, ["stop", "--timeout", "10"], { timeout: 30_000 });
}

const operation = process.argv[2];
const rawEnvFile = process.argv[3];
if (operation === "--help" || operation === "-h") {
  console.log(usage());
  process.exit(0);
}
if (!operations.has(operation) || !rawEnvFile || process.argv.length !== 4) {
  console.error(usage());
  process.exit(2);
}

try {
  const envFile = path.resolve(rawEnvFile);
  const config = await loadDeploymentEnvironment(envFile);
  if (config.mode !== "production") {
    const error = new Error("Operator deployment tooling accepts production mode only.");
    error.code = "production_mode_required";
    throw error;
  }

  switch (operation) {
    case "precheck":
      await precheck(envFile);
      break;
    case "prepare":
      await prepare(envFile, config);
      break;
    case "deploy":
      await deploy(envFile, config, { noBuild: true });
      break;
    case "verify":
      await assertPublicBoundary(config);
      break;
    case "update":
      await prepare(envFile, config);
      await deploy(envFile, config, { noBuild: true });
      await assertPublicBoundary(config);
      break;
    case "rollback":
      await deploy(envFile, config, { noBuild: true });
      await assertPublicBoundary(config);
      break;
    case "stop":
      await stop(envFile);
      break;
    case "logs":
      await precheck(envFile);
      await compose(envFile, ["logs", "--no-color", "--timestamps", "--tail", "200"], {
        forwardOutput: true,
      });
      break;
    case "health":
      await assertHealth(`https://${config.domain}`);
      break;
  }
  console.log(JSON.stringify({ domain: config.domain, operation, release: config.release, status: "passed" }));
} catch (error) {
  const code = typeof error?.code === "string" ? error.code : "operation_failed";
  console.error(`Deployment operation failed: ${code}.`);
  process.exit(1);
}
