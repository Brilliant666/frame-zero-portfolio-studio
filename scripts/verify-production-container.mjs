#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { promisify } from "node:util";
import { hasNoContainerEntrypoint } from "./lib/container-entrypoint.mjs";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 64 * 1024 * 1024;
const imageName = `frame-zero-container-verify:${process.pid}-${Date.now()}`;
const builderImageName = `${imageName}-builder`;
const containerName = `frame-zero-container-verify-${process.pid}-${Date.now()}`;
const expectedSentinel = process.env.FRAME_ZERO_CONTAINER_TEST_SENTINEL ?? "";
let imageCreated = false;
let builderImageCreated = false;
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
const developmentPackages = new Set([
  "miniflare", "wrangler", "vinext", "vite", "auth", "drizzle-kit", "esbuild",
  "@esbuild-kit/core-utils", "@esbuild-kit/esm-loader", "@cloudflare/vite-plugin"
]);
function atLeast(version, minimum) {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) return false;
  const floor = minimum.split(".").map(Number);
  const difference = version.split(".").map(Number).map((part, index) => part - floor[index]).find(Boolean) || 0;
  return difference >= 0;
}
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
      if (path.basename(current) === "package.json") {
        const metadata = JSON.parse(source);
        if (developmentPackages.has(metadata.name)) {
          throw new Error("development dependency leaked into runtime: " + metadata.name + " at " + current);
        }
        if (metadata.name === "sharp" && !atLeast(metadata.version, "0.35.5")) {
          throw new Error("unpatched Sharp in runtime: " + current);
        }
      }
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
const nextRequire = require("node:module").createRequire(require.resolve("next/package.json"));
const imageDependencies = {};
for (const [owner, resolve] of [["uploads", require], ["next", nextRequire]]) {
  const sharp = resolve("sharp");
  if (!atLeast(sharp.versions.sharp, "0.35.5") || !atLeast(sharp.versions.rsvg, "2.63.2")) {
    throw new Error("unpatched native image dependency resolved by " + owner);
  }
  imageDependencies[owner] = { sharp: sharp.versions.sharp, rsvg: sharp.versions.rsvg, vips: sharp.versions.vips };
}
console.log(JSON.stringify({ files, gid: process.getgid(), uid: process.getuid(), node: process.version, imageDependencies }));
`;
}

function logImageConfig(stage, inspection) {
  const config = inspection.Config;
  console.log("CONTAINER_IMAGE_CONFIG " + JSON.stringify({
    stage,
    imageId: inspection.Id,
    entrypointPresent: Object.hasOwn(config, "Entrypoint"),
    config: Object.fromEntries(["Entrypoint", "Cmd", "User", "WorkingDir", "StopSignal"]
      .filter((key) => Object.hasOwn(config, key))
      .map((key) => [key, config[key]])),
  }));
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
  if (builderImageCreated) {
    await docker(["image", "rm", "--force", builderImageName], { timeout: 60_000 })
      .catch((error) => failures.push(error));
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Container verification cleanup failed.");
  }
}

try {
  const daemonVersion = await docker(["version", "--format", "{{.Server.Version}}"], { timeout: 30_000 });
  assert.match(daemonVersion, /^\d+\.\d+/);
  console.log("CONTAINER_DOCKER_VERSION " + await docker(["version", "--format", "{{json .}}"]));
  console.log("CONTAINER_BUILDX_VERSION " + await docker(["buildx", "version"])
    .catch(() => "unavailable; verification invokes docker build"));
  console.log("CONTAINER_BUILDER " + await docker(["buildx", "inspect"])
    .catch(() => "unavailable; verification invokes docker build"));
  const dockerfile = await readFile("Dockerfile", "utf8");
  const runtimeBase = dockerfile.match(/^FROM (\S+) AS runtime$/m)?.[1];
  assert.ok(runtimeBase, "the runtime stage must name its base image");
  console.log("CONTAINER_BUILD_INPUT " + JSON.stringify({
    dockerfile: "Dockerfile",
    sha256: createHash("sha256").update(dockerfile).digest("hex"),
    stages: ["builder", "runtime"],
    runtimeBase,
  }));
  await docker(["pull", runtimeBase]);
  const [baseInspection] = JSON.parse(await docker(["image", "inspect", runtimeBase]));
  logImageConfig("base", baseInspection);

  // Rebuild the builder without previous layers, then inspect the actual COPY
  // result: directory negations in .dockerignore otherwise admit descendants.
  builderImageCreated = true;
  await docker(["build", "--pull", "--no-cache", "--target", "builder", "--file", "Dockerfile", "--tag", builderImageName, "."]);
  await docker(["run", "--rm", "--entrypoint", "node", builderImageName, "-e", String.raw`
    const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
    const expected = JSON.parse(fs.readFileSync("config/production-public-files.json", "utf8")).files;
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw Error("unexpected public symlink: " + file);
      return entry.isDirectory() ? walk(file) : [path.relative("public", file)];
    });
    assert.deepEqual(walk("public").sort(), expected, "Docker context must contain only reviewed public files");
  `]);
  imageCreated = true;
  await docker(["build", "--pull", "--file", "Dockerfile", "--tag", imageName, "."]);

  const [inspection] = JSON.parse(await docker(["image", "inspect", imageName]));
  logImageConfig("runtime", inspection);
  assert.equal(inspection.Config.User, "1000:1000");
  assert.ok(
    hasNoContainerEntrypoint(inspection.Config),
    "the runtime must not inherit a shell entrypoint",
  );
  assert.deepEqual(inspection.Config.Cmd, ["node", "server.js"]);
  assert.equal(inspection.Config.StopSignal, "SIGTERM");
  assert.equal(inspection.Config.WorkingDir, "/app");
  assert.ok(inspection.Config.ExposedPorts?.["3000/tcp"]);
  assert.equal(inspection.Config.Labels?.["org.opencontainers.image.title"], "Portfolio Platform");
  assert.equal(inspection.Config.Labels?.["io.frame-zero.runtime"], "standard-next-standalone");
  assert.equal(
    inspection.Config.Labels?.["org.opencontainers.image.base.digest"],
    "sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da",
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
  assert.equal(runtimeInspection.node, "v22.23.4");
  console.log("CONTAINER_RUNTIME_DEPENDENCIES " + JSON.stringify(runtimeInspection.imageDependencies));
  assert.equal(runtimeInspection.gid, 1000);
  assert.ok(runtimeInspection.files > 0);

  // Overriding CMD must execute Node directly, without overriding ENTRYPOINT.
  const commandOverride = JSON.parse(await docker([
    "run", "--rm", "--read-only", imageName, "node", "-e",
    'console.log(JSON.stringify({ pid: process.pid, uid: process.getuid(), gid: process.getgid() }))',
  ]));
  assert.deepEqual(commandOverride, { pid: 1, uid: 1000, gid: 1000 });
  console.log("CONTAINER_CMD_OVERRIDE " + JSON.stringify(commandOverride));

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

  const processTree = JSON.parse(await docker(["exec", containerName, "node", "-e", String.raw`
    const fs = require("node:fs");
    const processes = fs.readdirSync("/proc").filter(name => /^\d+$/.test(name)).flatMap(pid => {
      try {
        return [{ pid: Number(pid), executable: fs.readlinkSync("/proc/" + pid + "/exe"),
          command: fs.readFileSync("/proc/" + pid + "/cmdline", "utf8").split("\0").filter(Boolean) }];
      } catch (error) {
        if (["ENOENT", "ESRCH"].includes(error.code)) return [];
        throw error;
      }
    });
    console.log(JSON.stringify(processes));
  `]));
  assert.match(processTree.find(entry => entry.pid === 1)?.executable ?? "", /\/node$/,
    "the default application process must be Node at PID 1, without a shell wrapper");
  console.log("CONTAINER_PROCESS_TREE " + JSON.stringify(processTree));

  const healthDeadline = Date.now() + 45_000;
  let containerHealth;
  do {
    const [running] = JSON.parse(await docker(["container", "inspect", containerName], {
      timeout: Math.max(1, Math.min(5_000, healthDeadline - Date.now())),
    }));
    assert.equal(running.State.Running, true, "the application must remain running");
    containerHealth = running.State.Health;
    if (containerHealth?.Status === "healthy") break;
    assert.notEqual(containerHealth?.Status, "unhealthy", "the configured Docker healthcheck failed");
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < healthDeadline);
  assert.equal(containerHealth?.Status, "healthy", "the configured Docker healthcheck must pass");
  console.log("CONTAINER_HEALTH " + JSON.stringify(containerHealth));

  const home = await fetch(`${origin}/`, { redirect: "manual" });
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await home.text();
  const staticAsset = html.match(/(?:href|src)="([^"?]*\/_next\/static\/[^"?]+\.(?:css|js))/)?.[1];
  assert.ok(staticAsset, "homepage must reference a packaged Next static asset");
  assert.equal((await fetch(`${origin}${staticAsset}`)).status, 200);
  assert.equal((await fetch(`${origin}/favicon.svg`)).status, 200);
  const fontSources = JSON.parse(await readFile(new URL("../public/fonts/noto-serif-sc-900/sources.json", import.meta.url), "utf8"));
  assert.equal(fontSources.files.length, 101);
  let fontBytes = 0;
  for (const font of fontSources.files) {
    const response = await fetch(`${origin}/fonts/noto-serif-sc-900/${font.file}`);
    assert.equal(response.status, 200, font.file);
    assert.match(response.headers.get("content-type") ?? "", /^(?:font\/woff2|application\/(?:font-woff2|octet-stream))\b/i);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");
    assert.equal(bytes.length, font.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), font.sha256Chunks.join(""));
    fontBytes += bytes.length;
  }
  const license = await fetch(`${origin}/fonts/noto-serif-sc-900/OFL.txt`);
  assert.equal(license.status, 200);
  assert.equal(await license.text(), await readFile(new URL("../public/fonts/noto-serif-sc-900/OFL.txt", import.meta.url), "utf8"));
  for (const route of ["/preview", "/preview/admin", "/api/preview/site-content", "/test", "/test/admin/template", "/login", "/star/admin"]) {
    assert.equal((await fetch(`${origin}${route}`)).status, 404, `${route} must remain closed`);
  }

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
    fontFiles: fontSources.files.length,
    fontBytes,
    imageSizeBytes: inspection.Size,
    layerCount: inspection.RootFS.Layers.length,
    readOnlyRoot: true,
    runtimeFiles: runtimeInspection.files,
    runtimeGid: runtimeInspection.gid,
    runtimeUid: runtimeInspection.uid,
    stopDurationMs,
    stopSignal: stopped.Config.StopSignal,
    pid1: processTree.find(entry => entry.pid === 1),
    healthStatus: containerHealth.Status,
    commandOverride,
  }));
} finally {
  await cleanup();
}
