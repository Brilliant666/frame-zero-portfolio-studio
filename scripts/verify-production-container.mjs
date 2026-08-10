#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 64 * 1024 * 1024;
const imageName = `frame-zero-container-verify:${process.pid}-${Date.now()}`;
const containerName = `frame-zero-container-verify-${process.pid}-${Date.now()}`;
const expectedSentinel = process.env.FRAME_ZERO_CONTAINER_TEST_SENTINEL ?? "";
let imageCreated = false;
let containerCreated = false;

async function docker(args, options = {}) {
  try {
    const result = await execFileAsync("docker", args, {
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT,
      timeout: options.timeout ?? 10 * 60_000,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    throw new Error(`docker ${args[0]} failed.\n${stdout}${stderr}`.trim(), { cause: error });
  }
}

async function waitForReady(origin) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health/ready`, { cache: "no-store" });
      if (response.status === 200) return;
    } catch {
      // The published loopback socket is expected to reject during startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const logs = await docker(["logs", containerName], { timeout: 10_000 }).catch(() => "<logs unavailable>");
  throw new Error(`Container did not become ready.\n${logs}`);
}

async function assertHealth(origin, pathname, status) {
  const response = await fetch(`${origin}${pathname}`, { cache: "no-store" });
  assert.equal(response.status, 200, `GET ${pathname}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.deepEqual(await response.json(), { status });

  const head = await fetch(`${origin}${pathname}`, { method: "HEAD" });
  assert.equal(head.status, 200, `HEAD ${pathname}`);
  assert.equal(head.headers.get("cache-control"), "no-store");
  assert.equal(head.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await head.text(), "");

  const mutation = await fetch(`${origin}${pathname}`, { method: "POST" });
  assert.equal(mutation.status, 405, `POST ${pathname}`);
}

function runtimeInspectionProgram() {
  return String.raw`
const fs = require("node:fs");
const path = require("node:path");
const forbiddenPaths = [
  "/app/.git", "/app/.frame-zero", "/app/.openai", "/app/public/photos",
  "/app/public/og.png", "/app/tests", "/app/docs", "/app/research",
  "/app/scripts", "/app/worker", "/app/package-lock.json", "/app/next.config.ts",
  "/app/tsconfig.json", "/app/Dockerfile", "/app/.dockerignore",
  "/app/node_modules/vinext", "/app/node_modules/vite", "/app/node_modules/wrangler",
  "/app/node_modules/typescript", "/app/node_modules/eslint",
  "/app/node_modules/@cloudflare/vite-plugin"
];
for (const entry of forbiddenPaths) {
  if (fs.existsSync(entry)) throw new Error("forbidden runtime path: " + entry);
}
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt"]);
const sentinel = process.argv[1] || "";
const stack = ["/app"];
let files = 0;
while (stack.length > 0) {
  const current = stack.pop();
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) throw new Error("unexpected runtime symlink: " + current);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(current)) {
      if (/^\.env(?:\.|$)/i.test(name) || /^(?:\.npmrc|id_rsa|id_ed25519)$/i.test(name)) {
        throw new Error("forbidden runtime filename: " + path.join(current, name));
      }
      stack.push(path.join(current, name));
    }
  } else if (stat.isFile()) {
    files += 1;
    if (stat.size <= 8 * 1024 * 1024 && textExtensions.has(path.extname(current).toLowerCase())) {
      const source = fs.readFileSync(current, "utf8");
      if (sentinel && source.includes(sentinel)) {
        throw new Error("build-context sentinel leaked into runtime: " + current);
      }
      // Framework/vendor sources can legitimately contain generic Windows-path
      // examples. A project-local path leak can only originate in the traced
      // application/generated artifacts, so keep this check outside node_modules.
      if (!current.startsWith("/app/node_modules/") && /[A-Za-z]:[\\/](?:Users|Documents|AppData)[\\/]/i.test(source)) {
        throw new Error("local Windows path leaked into runtime: " + current);
      }
      if (/\.(?:cjs|js|mjs)$/i.test(current) && /(?:from\s*|require\s*\(|import\s*\()["']cloudflare:workers["']/.test(source)) {
        throw new Error("cloudflare:workers runtime import found: " + current);
      }
    }
  }
}
console.log(JSON.stringify({ files, gid: process.getgid(), uid: process.getuid() }));
`;
}

async function cleanup() {
  const failures = [];
  if (containerCreated) {
    await docker(["rm", "--force", containerName], { timeout: 30_000 })
      .catch((error) => failures.push(error));
  }
  if (imageCreated) {
    await docker(["image", "rm", "--force", imageName], { timeout: 60_000 })
      .catch((error) => failures.push(error));
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Container verification cleanup failed.");
  }
}

try {
  const daemonVersion = await docker(["version", "--format", "{{.Server.Version}}"], { timeout: 30_000 });
  assert.match(daemonVersion, /^\d+\.\d+/);

  imageCreated = true;
  await docker(["build", "--pull", "--file", "Dockerfile", "--tag", imageName, "."]);

  const [inspection] = JSON.parse(await docker(["image", "inspect", imageName]));
  assert.equal(inspection.Config.User, "1000:1000");
  assert.ok(
    inspection.Config.Entrypoint === null
      || (Array.isArray(inspection.Config.Entrypoint) && inspection.Config.Entrypoint.length === 0),
    "the runtime must not inherit a shell entrypoint",
  );
  assert.deepEqual(inspection.Config.Cmd, ["node", "server.js"]);
  assert.equal(inspection.Config.WorkingDir, "/app");
  assert.ok(inspection.Config.ExposedPorts?.["3000/tcp"]);
  assert.equal(inspection.Config.Labels?.["org.opencontainers.image.title"], "Portfolio Platform");
  assert.equal(inspection.Config.Labels?.["io.frame-zero.runtime"], "standard-next-standalone");
  assert.equal(
    inspection.Config.Labels?.["org.opencontainers.image.base.digest"],
    "sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752",
  );
  assert.ok(inspection.Config.Healthcheck?.Test?.includes("node"));
  assert.ok(inspection.RootFS.Layers.length > 0);
  const imageEnvironmentKeys = (inspection.Config.Env ?? [])
    .map((entry) => entry.slice(0, Math.max(0, entry.indexOf("="))));
  assert.equal(
    imageEnvironmentKeys.some((key) => /(?:PASSWORD|SECRET|TOKEN)/i.test(key)),
    false,
    "runtime image configuration must not contain credential variables",
  );
  assert.equal(imageEnvironmentKeys.includes("FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN"), false);
  const imageHistory = await docker(["history", "--no-trunc", "--format", "{{json .CreatedBy}}", imageName]);
  if (expectedSentinel) assert.equal(imageHistory.includes(expectedSentinel), false);

  const runtimeInspection = JSON.parse(await docker([
    "run", "--rm", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m",
    "--entrypoint", "node", imageName, "-e", runtimeInspectionProgram(), expectedSentinel,
  ]));
  assert.equal(runtimeInspection.uid, 1000);
  assert.equal(runtimeInspection.gid, 1000);
  assert.ok(runtimeInspection.files > 0);

  containerCreated = true;
  await docker([
    "run", "--detach", "--name", containerName, "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m",
    "--publish", "127.0.0.1::3000", imageName,
  ]);
  const portOutput = await docker(["port", containerName, "3000/tcp"]);
  const portMatch = portOutput.match(/127\.0\.0\.1:(\d+)/);
  assert.ok(portMatch, `Unexpected Docker port mapping: ${portOutput}`);
  const origin = `http://127.0.0.1:${portMatch[1]}`;
  await waitForReady(origin);

  await assertHealth(origin, "/api/health/live", "live");
  await assertHealth(origin, "/api/health/ready", "ready");

  const home = await fetch(`${origin}/`, { redirect: "manual" });
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await home.text();
  const staticAsset = html.match(/(?:href|src)="([^"?]*\/_next\/static\/[^"?]+\.(?:css|js))/)?.[1];
  assert.ok(staticAsset, "homepage must reference a packaged Next static asset");
  assert.equal((await fetch(`${origin}${staticAsset}`)).status, 200);
  assert.equal((await fetch(`${origin}/favicon.svg`)).status, 200);

  const adminRedirect = await fetch(`${origin}/admin`, { redirect: "manual" });
  assert.ok([307, 308].includes(adminRedirect.status));
  assert.equal(new URL(adminRedirect.headers.get("location"), origin).pathname, "/admin/template");

  const stopStarted = Date.now();
  await docker(["stop", "--time", "10", containerName], { timeout: 20_000 });
  const stopDurationMs = Date.now() - stopStarted;
  const [stopped] = JSON.parse(await docker(["container", "inspect", containerName]));
  assert.equal(stopped.State.Running, false);
  assert.equal(stopped.State.OOMKilled, false);
  assert.notEqual(stopped.State.ExitCode, 137, "container must not require SIGKILL");
  assert.ok(stopDurationMs < 12_000, `container stop exceeded the signal grace period: ${stopDurationMs}ms`);

  console.log("CONTAINER_EVIDENCE " + JSON.stringify({
    baseImage: inspection.Config.Labels["org.opencontainers.image.base.name"],
    daemonVersion,
    exitCode: stopped.State.ExitCode,
    imageTitle: inspection.Config.Labels["org.opencontainers.image.title"],
    imageSizeBytes: inspection.Size,
    layerCount: inspection.RootFS.Layers.length,
    readOnlyRoot: true,
    runtimeFiles: runtimeInspection.files,
    runtimeGid: runtimeInspection.gid,
    runtimeUid: runtimeInspection.uid,
    stopDurationMs,
  }));
} finally {
  await cleanup();
}
