#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseDeploymentEnvironment } from "./lib/deployment-config.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(projectRoot, "deploy", "compose.yaml");
const suffix = `${process.pid}-${Date.now()}`;
const projectName = `portfolio-bootstrap-${suffix}`;
const releaseA = `ci-a-${suffix}`;
const releaseB = `ci-b-${suffix}`;
const appImageA = `portfolio-platform-app:${releaseA}`;
const appImageB = `portfolio-platform-app:${releaseB}`;
const logSentinel = process.env.FRAME_ZERO_DEPLOYMENT_LOG_SENTINEL
  ?? `deployment-log-sentinel-${randomUUID()}`;
const caddyDigest = "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648";
const maxOutput = 64 * 1024 * 1024;
let activeEnvironment;
let composeStarted = false;
let normalCleanupComplete = false;

function configText(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
}

function deploymentEnvironment(mode, release) {
  const values = mode === "production" ? {
    PORTFOLIO_BIND_ADDRESS: "0.0.0.0",
    PORTFOLIO_CADDY_CONFIG: "Caddyfile",
    PORTFOLIO_DEPLOYMENT_MODE: "production",
    PORTFOLIO_DOMAIN: "photo.cosflow.icu",
    PORTFOLIO_HTTP_PORT: "80",
    PORTFOLIO_HTTPS_PORT: "443",
    PORTFOLIO_LOG_LEVEL: "INFO",
    PORTFOLIO_RELEASE: release,
  } : {
    PORTFOLIO_BIND_ADDRESS: "127.0.0.1",
    PORTFOLIO_CADDY_CONFIG: "Caddyfile.ci",
    PORTFOLIO_DEPLOYMENT_MODE: "ci",
    PORTFOLIO_DOMAIN: "portfolio.test",
    PORTFOLIO_HTTP_PORT: "0",
    PORTFOLIO_HTTPS_PORT: "0",
    PORTFOLIO_LOG_LEVEL: "INFO",
    PORTFOLIO_RELEASE: release,
  };
  parseDeploymentEnvironment(configText(values));
  return Object.freeze({ ...process.env, ...values });
}

async function command(executable, args, options = {}) {
  try {
    const result = await execFileAsync(executable, args, {
      cwd: projectRoot,
      encoding: "utf8",
      env: options.env ?? process.env,
      maxBuffer: maxOutput,
      timeout: options.timeout ?? 10 * 60_000,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    throw new Error(`${executable} ${args[0] ?? ""} failed.\n${stdout}${stderr}`.trim(), { cause: error });
  }
}

function composeArgs(args) {
  return ["compose", "--project-name", projectName, "--file", composeFile, ...args];
}

async function compose(args, options = {}) {
  return command("docker", composeArgs(args), {
    ...options,
    env: options.env ?? activeEnvironment,
  });
}

async function docker(args, options = {}) {
  return command("docker", args, options);
}

async function inspectContainer(service) {
  const id = await compose(["ps", "--quiet", service]);
  assert.match(id, /^[0-9a-f]{12,64}$/, `${service} must have exactly one container`);
  const [inspection] = JSON.parse(await docker(["container", "inspect", id]));
  return inspection;
}

function mappedPort(output, containerPort) {
  const match = output.match(new RegExp(`127\\.0\\.0\\.1:(\\d+)(?:\\s|$)`));
  assert.ok(match, `Expected loopback mapping for ${containerPort}: ${output}`);
  const port = Number(match[1]);
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65_535);
  return port;
}

function httpsRequest(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      headers: { Host: "portfolio.test", ...(options.headers ?? {}) },
      host: "127.0.0.1",
      method: options.method ?? "GET",
      path: pathname,
      port,
      rejectUnauthorized: false,
      servername: "portfolio.test",
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        status: response.statusCode,
      }));
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

function httpRequest(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      headers: { Host: "portfolio.test" },
      host: "127.0.0.1",
      method: "GET",
      path: pathname,
      port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        status: response.statusCode,
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

async function waitForHttps(port) {
  const deadline = Date.now() + 90_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await httpsRequest(port, "/api/health/ready");
      if (response.status === 200) return response;
      lastError = new Error(`Unexpected readiness status ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const logs = await compose(["logs", "--no-color", "--timestamps"]).catch(() => "<logs unavailable>");
  throw new Error(`Deployment bootstrap did not become ready: ${lastError?.message ?? "timeout"}.\n${logs}`);
}

async function assertHealth(port, pathname, expectedStatus) {
  const get = await httpsRequest(port, pathname);
  assert.equal(get.status, 200, `GET ${pathname}`);
  assert.equal(get.headers["cache-control"], "no-store");
  assert.equal(get.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(JSON.parse(get.body), { status: expectedStatus });

  const head = await httpsRequest(port, pathname, { method: "HEAD" });
  assert.equal(head.status, 200, `HEAD ${pathname}`);
  assert.equal(head.body, "");

  const post = await httpsRequest(port, pathname, { method: "POST" });
  assert.equal(post.status, 405, `POST ${pathname}`);
}

async function assertPublicContract(httpsPort) {
  await assertHealth(httpsPort, "/api/health/live", "live");
  await assertHealth(httpsPort, "/api/health/ready", "ready");

  const home = await httpsRequest(httpsPort, "/", {
    headers: {
      Authorization: `Bearer ${logSentinel}`,
      Cookie: `session=${logSentinel}`,
    },
  });
  assert.equal(home.status, 200);
  assert.match(home.headers["content-type"] ?? "", /^text\/html\b/i);
  const staticPath = home.body.match(/(?:href|src)="([^"?]*\/_next\/static\/[^"?]+\.(?:css|js))/)?.[1];
  assert.ok(staticPath, "homepage must reference a packaged Next static asset");
  assert.equal((await httpsRequest(httpsPort, staticPath)).status, 200);
  assert.equal((await httpsRequest(httpsPort, "/favicon.svg")).status, 200);

  const siteContent = await httpsRequest(httpsPort, "/api/site-content");
  assert.equal(siteContent.status, 200, "legacy public SiteContent read must remain available");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const denied = await httpsRequest(httpsPort, "/api/site-content", { method });
    assert.equal(denied.status, 405, `${method} /api/site-content`);
    assert.equal(denied.headers.allow, "GET, HEAD");
  }

  for (const pathname of [
    "/admin",
    "/admin/template",
    "/star/admin",
    "/star/admin/profile",
    "/login",
    "/api/admin",
    "/api/auth/session",
    "/api/draft",
    "/api/upload",
    "/api/uploads",
    "/api/unreviewed",
  ]) {
    assert.equal((await httpsRequest(httpsPort, pathname)).status, 404, pathname);
  }
}

async function assertRuntimeSecurity() {
  const [app, caddy] = await Promise.all([inspectContainer("app"), inspectContainer("caddy")]);
  assert.equal(app.Config.User, "1000:1000");
  assert.equal(app.HostConfig.ReadonlyRootfs, true);
  assert.equal(app.HostConfig.Privileged, false);
  assert.deepEqual(app.HostConfig.CapDrop, ["ALL"]);
  assert.ok(app.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.equal(Object.keys(app.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(app.HostConfig.Binds?.some((entry) => entry.includes("docker.sock")) ?? false, false);

  assert.equal(caddy.HostConfig.ReadonlyRootfs, true);
  assert.equal(caddy.HostConfig.Privileged, false);
  assert.deepEqual(caddy.HostConfig.CapDrop, ["ALL"]);
  assert.ok(
    caddy.HostConfig.CapAdd.some((capability) =>
      capability.replace(/^CAP_/, "") === "NET_BIND_SERVICE"),
    "the proxy must retain only its reviewed low-port binding capability",
  );
  assert.ok(caddy.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  for (const binding of Object.values(caddy.HostConfig.PortBindings)) {
    for (const entry of binding) assert.equal(entry.HostIp, "127.0.0.1");
  }
  assert.equal(caddy.HostConfig.Binds?.some((entry) => entry.includes("docker.sock")) ?? false, false);

  const [caddyImage] = JSON.parse(await docker(["image", "inspect", caddy.Image]));
  assert.ok(
    (caddyImage.RepoDigests ?? []).some((digest) => digest.endsWith(`@${caddyDigest}`)),
    "the running proxy must use the reviewed official Caddy index digest",
  );
  return { app, caddy };
}

async function assertLogs() {
  const logs = await compose(["logs", "--no-color", "--timestamps", "app", "caddy"]);
  assert.match(logs, /(?:Next\.js|Local:|Ready in)/i, "App startup/runtime stdout must be readable");
  const caddyAccessLogPattern = /"logger":"http\.log\.access(?:\.[A-Za-z0-9_-]+)?","msg":"handled request"/;
  assert.match(logs, caddyAccessLogPattern, "Caddy structured JSON access logs must be readable");
  assert.equal(logs.includes(logSentinel), false, "sensitive request sentinels must be redacted or stripped");
  assert.doesNotMatch(logs, /[A-Za-z]:[\\/](?:Users|Documents|AppData)[\\/]/i);
}

async function validateCaddy(environment) {
  await compose([
    "run", "--rm", "--no-deps", "caddy",
    "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile",
  ], { env: environment, timeout: 2 * 60_000 });
}

async function projectVolumes() {
  const output = await docker([
    "volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${projectName}`,
  ]);
  return output.split(/\r?\n/).filter(Boolean).sort();
}

async function cleanup() {
  const failures = [];
  if (composeStarted) {
    await compose(["down", "--remove-orphans", "--timeout", "10"], { timeout: 2 * 60_000 })
      .catch((error) => failures.push(error));
  }
  const volumes = await projectVolumes().catch((error) => {
    failures.push(error);
    return [];
  });
  for (const volume of volumes) {
    if (!volume.startsWith(`${projectName}_`) || !/_caddy_(?:config|data)$/.test(volume)) {
      failures.push(new Error(`Refusing to remove unexpected volume: ${volume}`));
      continue;
    }
    await docker(["volume", "rm", volume], { timeout: 30_000 }).catch((error) => failures.push(error));
  }
  for (const image of [appImageB, appImageA]) {
    await docker(["image", "rm", "--force", image], { timeout: 60_000 }).catch(() => {});
  }
  if (failures.length > 0) throw new AggregateError(failures, "Deployment bootstrap cleanup failed.");
}

try {
  const daemonVersion = await docker(["version", "--format", "{{.Server.Version}}"], { timeout: 30_000 });
  assert.match(daemonVersion, /^\d+\.\d+/);
  const composeVersion = await docker(["compose", "version", "--short"], { timeout: 30_000 });
  assert.match(composeVersion, /^\d+\.\d+/);
  // From this point onward even validation-only Compose commands may create
  // isolated networks or volumes, so every failure path must run `down`.
  composeStarted = true;

  const productionEnvironment = deploymentEnvironment("production", "sha-0123456789abcdef");
  activeEnvironment = deploymentEnvironment("ci", releaseA);
  await compose(["config", "--quiet"], { env: productionEnvironment });
  await compose(["config", "--quiet"]);

  await compose(["pull", "caddy"], { timeout: 5 * 60_000 });
  await validateCaddy(productionEnvironment);
  await validateCaddy(activeEnvironment);

  await compose(["build", "--pull", "app"], { timeout: 15 * 60_000 });
  await compose(["up", "--detach", "--wait", "--wait-timeout", "120"]);

  const httpsPort = mappedPort(await compose(["port", "caddy", "443"]), 443);
  const httpPort = mappedPort(await compose(["port", "caddy", "80"]), 80);
  await waitForHttps(httpsPort);
  const redirect = await httpRequest(httpPort, "/");
  assert.ok([301, 302, 307, 308].includes(redirect.status));
  assert.equal(new URL(redirect.headers.location).origin, "https://portfolio.test");

  await assertPublicContract(httpsPort);
  const initialRuntime = await assertRuntimeSecurity();
  await assertLogs();

  const initialIds = {
    app: initialRuntime.app.Id,
    caddy: initialRuntime.caddy.Id,
  };
  await compose(["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build"]);
  assert.equal((await inspectContainer("app")).Id, initialIds.app, "idempotent up must keep App");
  assert.equal((await inspectContainer("caddy")).Id, initialIds.caddy, "idempotent up must keep Caddy");

  await compose(["restart", "app"], { timeout: 2 * 60_000 });
  await waitForHttps(httpsPort);
  await assertHealth(httpsPort, "/api/health/ready", "ready");

  await docker(["image", "tag", appImageA, appImageB]);
  activeEnvironment = deploymentEnvironment("ci", releaseB);
  await compose(["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build"]);
  assert.equal((await inspectContainer("app")).Config.Image, appImageB);
  await waitForHttps(httpsPort);

  activeEnvironment = deploymentEnvironment("ci", releaseA);
  await compose(["up", "--detach", "--wait", "--wait-timeout", "120", "--no-build"]);
  assert.equal((await inspectContainer("app")).Config.Image, appImageA);
  await waitForHttps(httpsPort);
  await assertPublicContract(httpsPort);
  await assertLogs();

  const stoppedIds = {
    app: (await inspectContainer("app")).Id,
    caddy: (await inspectContainer("caddy")).Id,
  };
  await compose(["stop", "--timeout", "10"], { timeout: 30_000 });
  const [stoppedApp, stoppedCaddy] = await Promise.all([
    docker(["container", "inspect", stoppedIds.app]).then((value) => JSON.parse(value)[0]),
    docker(["container", "inspect", stoppedIds.caddy]).then((value) => JSON.parse(value)[0]),
  ]);
  for (const stopped of [stoppedApp, stoppedCaddy]) {
    assert.equal(stopped.State.Running, false);
    assert.equal(stopped.State.OOMKilled, false);
    assert.notEqual(stopped.State.ExitCode, 137, "services must not require SIGKILL");
  }

  await compose(["down", "--remove-orphans", "--timeout", "10"], { timeout: 2 * 60_000 });
  composeStarted = false;
  assert.equal(
    await docker(["container", "ls", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${projectName}`]),
    "",
  );
  assert.equal(
    await docker(["network", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${projectName}`]),
    "",
  );
  const volumesAfterDown = await projectVolumes();
  assert.deepEqual(volumesAfterDown, [
    `${projectName}_caddy_config`,
    `${projectName}_caddy_data`,
  ], "normal down must preserve future persistent proxy state");

  console.log("DEPLOYMENT_BOOTSTRAP_EVIDENCE " + JSON.stringify({
    appHostPorts: 0,
    caddyDigest,
    composeServices: ["app", "caddy"],
    composeVersion,
    daemonVersion,
    deploymentMode: "ci",
    httpsEvidence: "CI_TLS_EVIDENCE_ONLY",
    idempotentUp: true,
    logSentinelLeaked: false,
    privateBoundary: "PASS",
    releaseUpdate: `${releaseA}->${releaseB}`,
    rollback: `${releaseB}->${releaseA}`,
    volumesPreservedAfterDown: volumesAfterDown.length,
  }));
  normalCleanupComplete = true;
} finally {
  await cleanup();
  if (!normalCleanupComplete) {
    console.error("Deployment bootstrap verification stopped before evidence completion; isolated resources were cleaned.");
  }
}
