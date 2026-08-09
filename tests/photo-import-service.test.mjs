import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  createPhotoImportService,
  LOCAL_PHOTO_IMPORT_HOST,
  LOCAL_PHOTO_IMPORT_MAX_BYTES,
} from "../scripts/photo-import-server.mjs";
import { importPhotoLibrary, photoImportContract } from "../scripts/lib/photo-import.mjs";

const ALLOWED_ORIGIN = "http://127.0.0.1:3001";
const IMPORT_HEADERS = {
  "Content-Type": "application/octet-stream",
  "X-Frame-Zero-Local-Import": "1",
  "X-Frame-Zero-Photo-Extension": ".jpg",
  Origin: ALLOWED_ORIGIN,
};
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const supportsPhotoImport = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13);
const importerTest = supportsPhotoImport
  ? test
  : (name, callback) => test(name, { skip: "Photo importer requires Node.js >=22.13.0" }, callback);

async function makeWorkspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-photo-service-test-"));
  const projectRoot = path.join(root, "project");
  const tempRoot = path.join(root, "request-temp");
  await Promise.all([
    fs.mkdir(projectRoot, { recursive: true }),
    fs.mkdir(tempRoot, { recursive: true }),
  ]);
  t.after(async () => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 }));
  return { projectRoot, root, tempRoot };
}

async function startService(t, options) {
  const service = createPhotoImportService(options);
  const address = await service.listen(0);
  t.after(() => service.close());
  assert.equal(address.address, LOCAL_PHOTO_IMPORT_HOST);
  assert.equal(address.family, "IPv4");
  return { service, url: `http://${LOCAL_PHOTO_IMPORT_HOST}:${address.port}` };
}

function request({ url, pathname, method = "GET", headers = {}, chunks = [] }) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, url);
    const outgoing = http.request(target, { method, headers }, (incoming) => {
      const responseChunks = [];
      incoming.on("data", (chunk) => responseChunks.push(chunk));
      incoming.on("end", () => {
        const text = Buffer.concat(responseChunks).toString("utf8");
        resolve({
          body: text ? JSON.parse(text) : null,
          headers: incoming.headers,
          status: incoming.statusCode,
        });
      });
    });
    outgoing.on("error", reject);
    for (const chunk of chunks) outgoing.write(chunk);
    outgoing.end();
  });
}

async function waitUntil(predicate, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function makeJpegBuffer({ width = 96, height = 64, color = "#d26935" } = {}) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

test("health is minimal, loopback-only, and applies the exact Origin allowlist", async (t) => {
  const workspace = await makeWorkspace(t);
  const { url } = await startService(t, {
    ...workspace,
    contract: { supportedExtensions: [".jpg"] },
    importer: async () => assert.fail("health must not invoke the importer"),
  });

  const direct = await request({ url, pathname: "/health" });
  assert.equal(direct.status, 200);
  assert.deepEqual(direct.body, { ok: true });
  assert.equal(direct.headers["access-control-allow-origin"], undefined);

  const allowed = await request({ url, pathname: "/health", headers: { Origin: ALLOWED_ORIGIN } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers["access-control-allow-origin"], ALLOWED_ORIGIN);

  const forbidden = await request({
    url,
    pathname: "/health",
    headers: { Origin: "https://attacker.example" },
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, "forbidden-origin");
  assert.equal(forbidden.headers["access-control-allow-origin"], undefined);
  assert.ok(!JSON.stringify(direct.body).includes(workspace.projectRoot));
});

test("CORS preflight and import security headers are strict", async (t) => {
  const workspace = await makeWorkspace(t);
  const { url } = await startService(t, {
    ...workspace,
    contract: { supportedExtensions: [".jpg"] },
    importer: async () => assert.fail("rejected requests must not invoke the importer"),
  });

  const preflight = await request({
    url,
    pathname: "/import",
    method: "OPTIONS",
    headers: {
      Origin: ALLOWED_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": [
        "content-type",
        "x-frame-zero-local-import",
        "x-frame-zero-photo-extension",
      ].join(", "),
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], ALLOWED_ORIGIN);
  assert.match(preflight.headers["access-control-allow-headers"], /X-Frame-Zero-Local-Import/i);

  const headersWithoutOrigin = { ...IMPORT_HEADERS };
  delete headersWithoutOrigin.Origin;
  const missingOrigin = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: headersWithoutOrigin,
    chunks: ["photo"],
  });
  assert.equal(missingOrigin.status, 403);

  const forbiddenOrigin = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: { ...IMPORT_HEADERS, Origin: "https://attacker.example" },
    chunks: ["photo"],
  });
  assert.equal(forbiddenOrigin.status, 403);

  const headersWithoutCustomHeader = { ...IMPORT_HEADERS };
  delete headersWithoutCustomHeader["X-Frame-Zero-Local-Import"];
  const missingCustomHeader = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: headersWithoutCustomHeader,
    chunks: ["photo"],
  });
  assert.equal(missingCustomHeader.status, 403);
  assert.equal(missingCustomHeader.body.error.code, "missing-import-header");
});

test("media type and extension validation use the injected importer contract", async (t) => {
  const workspace = await makeWorkspace(t);
  const { url } = await startService(t, {
    ...workspace,
    contract: { supportedExtensions: [".jpg", ".heic"] },
    importer: async () => assert.fail("invalid requests must not invoke the importer"),
  });

  for (const extension of [".raw", "../photo.jpg", ".jpg/../png", " photo.jpg"] ) {
    const response = await request({
      url,
      pathname: "/import",
      method: "POST",
      headers: { ...IMPORT_HEADERS, "X-Frame-Zero-Photo-Extension": extension },
      chunks: ["photo"],
    });
    assert.equal(response.status, 415);
    assert.equal(response.body.error.code, "unsupported-extension");
  }

  const mediaType = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: { ...IMPORT_HEADERS, "Content-Type": "application/json" },
    chunks: ["photo"],
  });
  assert.equal(mediaType.status, 415);
  assert.equal(mediaType.body.error.code, "unsupported-media-type");
});

test("declared and streamed size limits reject safely and remove temporary files", async (t) => {
  const workspace = await makeWorkspace(t);
  const { url } = await startService(t, {
    ...workspace,
    maximumBytes: 12,
    contract: { supportedExtensions: [".jpg"] },
    importer: async () => assert.fail("oversized requests must not invoke the importer"),
  });

  const declared = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: { ...IMPORT_HEADERS, "Content-Length": "13" },
    chunks: [Buffer.alloc(13)],
  });
  assert.equal(declared.status, 413);
  assert.equal(declared.body.error.code, "payload-too-large");

  const streamed = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: IMPORT_HEADERS,
    chunks: [Buffer.alloc(8), Buffer.alloc(8)],
  });
  assert.equal(streamed.status, 413);
  assert.equal(streamed.body.error.code, "payload-too-large");
  await waitUntil(async () => (await fs.readdir(workspace.tempRoot)).length === 0);
  assert.equal(LOCAL_PHOTO_IMPORT_MAX_BYTES, 200 * 1024 * 1024);
});

test("empty, invalid, aborted, and internal failures are recoverable and sanitized", async (t) => {
  const workspace = await makeWorkspace(t);
  let behavior = "invalid";
  let capturedTemporaryDirectory = null;
  const { url } = await startService(t, {
    ...workspace,
    contract: { supportedExtensions: [".jpg"] },
    importer: async ({ sourceDir, projectRoot }) => {
      capturedTemporaryDirectory = sourceDir;
      if (behavior === "invalid") {
        const error = new Error(`decoder failed at ${sourceDir}`);
        error.skipped = [{ file: "private.jpg", reason: `bad ${projectRoot}` }];
        throw error;
      }
      if (behavior === "full") throw new Error("Photo library is limited to 10000 assets");
      throw new Error(`private path ${sourceDir} ${projectRoot} ${os.homedir()}`);
    },
  });

  const empty = await request({ url, pathname: "/import", method: "POST", headers: IMPORT_HEADERS });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, "empty-body");

  const invalid = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: IMPORT_HEADERS,
    chunks: ["not an image"],
  });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error.code, "invalid-image");
  assert.ok(!JSON.stringify(invalid.body).includes(capturedTemporaryDirectory));

  behavior = "full";
  const full = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: IMPORT_HEADERS,
    chunks: ["valid-shaped-placeholder"],
  });
  assert.equal(full.status, 409);
  assert.equal(full.body.error.code, "library-full");

  behavior = "internal";
  const internal = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: IMPORT_HEADERS,
    chunks: ["not an image"],
  });
  const internalText = JSON.stringify(internal.body);
  assert.equal(internal.status, 500);
  assert.equal(internal.body.error.code, "import-failed");
  for (const privateValue of [workspace.projectRoot, workspace.tempRoot, os.homedir()]) {
    assert.ok(!internalText.includes(privateValue));
  }

  const aborted = http.request(new URL("/import", url), { method: "POST", headers: IMPORT_HEADERS });
  aborted.on("error", () => undefined);
  aborted.write(Buffer.alloc(4));
  await waitUntil(async () => (await fs.readdir(workspace.tempRoot)).length > 0);
  aborted.destroy();
  await waitUntil(async () => (await fs.readdir(workspace.tempRoot)).length === 0);
});

test("chunked upload and import requests are fully serialized", async (t) => {
  const workspace = await makeWorkspace(t);
  let active = 0;
  let maximumActive = 0;
  let totalAssets = 18;
  const importedSizes = [];
  let maximumTemporaryDirectories = 0;
  const { url } = await startService(t, {
    ...workspace,
    contract: { supportedExtensions: [".jpg"] },
    importer: async ({ sourceDir }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        maximumTemporaryDirectories = Math.max(
          maximumTemporaryDirectories,
          (await fs.readdir(workspace.tempRoot)).length,
        );
        const [fileName] = await fs.readdir(sourceDir);
        importedSizes.push((await fs.stat(path.join(sourceDir, fileName))).size);
        await new Promise((resolve) => setTimeout(resolve, 30));
        totalAssets += 1;
        return { addedAssets: 1, importedAssets: totalAssets };
      } finally {
        active -= 1;
      }
    },
  });

  const requests = [
    request({ url, pathname: "/import", method: "POST", headers: IMPORT_HEADERS, chunks: ["abc", "def"] }),
    request({ url, pathname: "/import", method: "POST", headers: IMPORT_HEADERS, chunks: ["12", "34567"] }),
  ];
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(responses.map((response) => response.body.status), ["added", "added"]);
  assert.deepEqual(importedSizes.sort((left, right) => left - right), [6, 7]);
  assert.equal(maximumActive, 1);
  assert.equal(maximumTemporaryDirectories, 1);
  assert.equal((await fs.readdir(workspace.tempRoot)).length, 0);
});

importerTest("service and CLI entry paths produce identical pipeline assets", async (t) => {
  const workspace = await makeWorkspace(t);
  const cliProject = path.join(workspace.root, "cli-project");
  const guiProject = path.join(workspace.root, "gui-project");
  const sourceDir = path.join(workspace.root, "cli-source");
  await Promise.all([cliProject, guiProject, sourceDir].map((directory) => fs.mkdir(directory, { recursive: true })));
  const sourceBuffer = await makeJpegBuffer({ width: 1200, height: 1800, color: "#597ac4" });
  await fs.writeFile(path.join(sourceDir, "private-person-name.jpg"), sourceBuffer);

  const cliResult = await importPhotoLibrary({ sourceDir, projectRoot: cliProject });
  const { url } = await startService(t, {
    projectRoot: guiProject,
    tempRoot: workspace.tempRoot,
    contract: photoImportContract,
  });
  const guiResponse = await request({
    url,
    pathname: "/import",
    method: "POST",
    headers: IMPORT_HEADERS,
    chunks: [sourceBuffer.subarray(0, 100), sourceBuffer.subarray(100)],
  });
  assert.equal(guiResponse.status, 200);
  assert.equal(guiResponse.body.status, "added");

  const guiManifest = JSON.parse(await fs.readFile(
    path.join(guiProject, "public", "photos", "library-manifest.json"),
    "utf8",
  ));
  assert.deepEqual(guiManifest, cliResult.manifest);
  assert.deepEqual(
    Object.fromEntries(Object.entries(guiManifest.assets[0].variants)
      .map(([name, value]) => [name, { width: value.width, height: value.height }])),
    Object.fromEntries(Object.entries(cliResult.manifest.assets[0].variants)
      .map(([name, value]) => [name, { width: value.width, height: value.height }])),
  );
});

importerTest("additive service imports preserve 18 assets, deduplicate, and retain privacy", async (t) => {
  const workspace = await makeWorkspace(t);
  const sourceDir = path.join(workspace.root, "initial-source");
  await fs.mkdir(sourceDir, { recursive: true });
  for (let index = 0; index < 18; index += 1) {
    const color = `#${(0x20_20_20 + index * 0x07_0b_0d).toString(16).padStart(6, "0").slice(-6)}`;
    await sharp({ create: { width: 48 + index, height: 32 + index, channels: 3, background: color } })
      .jpeg({ quality: 80 })
      .toFile(path.join(sourceDir, `fixture-${index}.jpg`));
  }
  const initial = await importPhotoLibrary({ sourceDir, projectRoot: workspace.projectRoot });
  assert.equal(initial.importedAssets, 18);
  const originalIds = initial.manifest.assets.map((asset) => asset.id);

  const { url } = await startService(t, {
    ...workspace,
    contract: photoImportContract,
  });
  const firstBuffer = await makeJpegBuffer({ color: "#e05d28" });
  const secondBuffer = await makeJpegBuffer({ color: "#218f76" });
  const first = await request({
    url, pathname: "/import", method: "POST", headers: IMPORT_HEADERS, chunks: [firstBuffer],
  });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { ok: true, status: "added", totalAssets: 19 });

  const duplicate = await request({
    url, pathname: "/import", method: "POST", headers: IMPORT_HEADERS, chunks: [firstBuffer],
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(duplicate.body, { ok: true, status: "already-exists", totalAssets: 19 });

  const second = await request({
    url, pathname: "/import", method: "POST", headers: IMPORT_HEADERS, chunks: [secondBuffer],
  });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { ok: true, status: "added", totalAssets: 20 });

  const manifestPath = path.join(workspace.projectRoot, "public", "photos", "library-manifest.json");
  const statePath = path.join(workspace.projectRoot, ".frame-zero", "photo-import-state.json");
  const [manifestText, stateText] = await Promise.all([
    fs.readFile(manifestPath, "utf8"),
    fs.readFile(statePath, "utf8"),
  ]);
  const finalManifest = JSON.parse(manifestText);
  assert.equal(finalManifest.assets.length, 20);
  assert.ok(originalIds.every((id) => finalManifest.assets.some((asset) => asset.id === id)));
  for (const privateValue of [
    "browser-private-name.jpg",
    "webkitRelativePath",
    workspace.tempRoot,
    workspace.projectRoot,
  ]) {
    assert.ok(!manifestText.includes(privateValue));
    assert.ok(!stateText.includes(privateValue));
  }
  assert.equal((await fs.readdir(workspace.tempRoot)).length, 0);
});
