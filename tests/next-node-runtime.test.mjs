import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stopChildProcess } from "../scripts/dev-local.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const serverPath = path.join(standaloneRoot, "server.js");
const templateIds = [
  "cinematic-light",
  "neon-hud",
  "film-rail",
  "manga-panels",
  "prism-liquid",
  "orbital-portal",
  "archive-os",
  "editorial-duet",
  "polaroid-field",
  "character-select",
  "museum-depth",
];

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { port } = address;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function waitUntilReady(origin, child, logs) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js standalone exited before ready.\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${origin}/`, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // The socket is expected to reject while the server is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next.js standalone did not become ready.\n${logs.join("")}`);
}

test("Standard Next.js standalone starts over HTTP with current route parity", async (t) => {
  assert.equal(existsSync(serverPath), true, "run npm run build:node before this test");
  assert.equal(existsSync(path.join(standaloneRoot, "public", "favicon.svg")), true);
  assert.equal(existsSync(path.join(standaloneRoot, "public", "photos")), false);
  assert.equal(existsSync(path.join(standaloneRoot, "public", "og.png")), false);
  assert.equal(existsSync(path.join(standaloneRoot, "worker")), false);

  const serverFiles = (await walkFiles(path.join(standaloneRoot, ".next", "server")))
    .filter((file) => /\.(?:cjs|js|mjs)$/.test(file));
  for (const file of serverFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /cloudflare:workers/);
  }
  const serverEntry = await readFile(serverPath, "utf8");
  assert.doesNotMatch(
    serverEntry,
    /(?:from\s*|require\(|import\()["']cloudflare:workers/,
  );
  assert.match(
    serverEntry,
    /"cloudflare:workers":"\.\/db\/node-cloudflare-workers\.ts"/,
  );
  const clientFiles = (await walkFiles(path.join(standaloneRoot, ".next", "static")))
    .filter((file) => /\.js$/.test(file));
  const clientSources = [];
  for (const file of clientFiles) {
    const source = await readFile(file, "utf8");
    clientSources.push(source);
    assert.doesNotMatch(
      source,
      /cloudflare:workers|FRAME_ZERO_NEXT_NODE_PARITY_BUILD|\.openai\/hosting\.json/,
    );
  }
  for (const templateId of templateIds) {
    assert.ok(
      clientSources.some((source) => source.includes(templateId)),
      `${templateId} must remain present in the Standard Next.js client artifact`,
    );
  }

  const port = await reserveLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const logs = [];
  const environment = { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port) };
  delete environment.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  const child = spawn(process.execPath, [serverPath], {
    cwd: standaloneRoot,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  t.after(async () => stopChildProcess(child));
  await waitUntilReady(origin, child, logs);

  const homeResponse = await fetch(`${origin}/`, { redirect: "manual" });
  assert.equal(homeResponse.status, 200);
  assert.match(homeResponse.headers.get("content-type") ?? "", /^text\/html\b/i);
  const homeHtml = await homeResponse.text();
  assert.match(homeHtml, /<title>FRAME\/\/ZERO｜上海 · 杭州可约 Cosplay 摄影师<\/title>/);
  assert.match(homeHtml, /id="archive"/);
  assert.match(homeHtml, /id="services"/);
  assert.match(homeHtml, /id="booking"/);
  const stylesheet = homeHtml.match(/href="([^"?]*\/_next\/static\/[^"?]+\.css)["?]/)?.[1];
  assert.ok(stylesheet, "the standalone HTML must reference packaged Next static CSS");
  assert.equal((await fetch(`${origin}${stylesheet}`)).status, 200);
  assert.equal((await fetch(`${origin}/favicon.svg`)).status, 200);

  const adminRedirect = await fetch(`${origin}/admin`, { redirect: "manual" });
  assert.ok([307, 308].includes(adminRedirect.status));
  assert.equal(new URL(adminRedirect.headers.get("location"), origin).pathname, "/admin/template");

  for (const section of ["template", "profile", "packages", "layout", "contact", "advanced"]) {
    const response = await fetch(`${origin}/admin/${section}`, { redirect: "manual" });
    assert.equal(response.status, 200, `/admin/${section}`);
    const html = await response.text();
    assert.match(html, /<title>内容管理后台<\/title>/);
    assert.match(html, new RegExp(`data-admin-section="${section}"`));
    assert.match(html, /aria-label="保存全部修改"/);
  }

  for (const templateId of templateIds) {
    const response = await fetch(`${origin}/?template=${templateId}`, { redirect: "manual" });
    assert.equal(response.status, 200, templateId);
    assert.match(await response.text(), /<title>FRAME\/\/ZERO｜上海 · 杭州可约 Cosplay 摄影师<\/title>/);
  }

  const apiResponse = await fetch(`${origin}/api/site-content`, { cache: "no-store" });
  assert.equal(apiResponse.status, 200);
  const apiPayload = await apiResponse.json();
  assert.equal(apiPayload.content.profile.brand, "FRAME//ZERO");
  assert.equal(apiPayload.updatedAt, null);
  assert.match(apiPayload.warning, /Cloudflare D1 binding `DB` is unavailable/);

  const writeResponse = await fetch(`${origin}/api/site-content`, {
    body: JSON.stringify({ content: { profile: { brand: "NODE PARITY WRITE" } } }),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
  assert.equal(writeResponse.status, 400);
  assert.match((await writeResponse.json()).error, /Cloudflare D1 binding `DB` is unavailable/);
});
