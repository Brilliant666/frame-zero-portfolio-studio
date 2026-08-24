import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadRoute(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-platform-qr-route-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sources = [
    ["app/platform-qr.ts", "platform-qr.mjs"],
    ["app/platform-qr-server.ts", "platform-qr-server.mjs"],
    ["app/api/platform-qr/[assetId]/route.ts", "route.mjs"],
  ];
  for (const [sourcePath, outputName] of sources) {
    const source = await fs.readFile(sourcePath, "utf8");
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: sourcePath,
    }).outputText;
    output = output
      .replace('../../../platform-qr-server', './platform-qr-server.mjs')
      .replace('../../../platform-qr', './platform-qr.mjs');
    await fs.writeFile(path.join(directory, outputName), output, "utf8");
  }
  return import(`${pathToFileURL(path.join(directory, "route.mjs")).href}?test=${Date.now()}`);
}

async function startUpstream(t, handler) {
  const methods = [];
  const server = createServer((request, response) => {
    methods.push(request.method);
    handler(request, response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { methods, origin: `http://127.0.0.1:${address.port}`, server };
}

function context(assetId) {
  return { params: Promise.resolve({ assetId }) };
}

const assetId = "d".repeat(64);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("platform QR route proxies GET bytes and HEAD metadata without a body", async (t) => {
  const route = await loadRoute(t);
  const upstream = await startUpstream(t, (_request, response) => {
    response.statusCode = 200;
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Content-Length", String(pngBytes.byteLength));
    response.end(pngBytes);
  });
  const previousOrigin = process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN = upstream.origin;
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
    else process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN = previousOrigin;
  });

  const getResponse = await route.GET(new Request(`http://127.0.0.1/api/platform-qr/${assetId}`), context(assetId));
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("content-type"), "image/png");
  assert.equal(getResponse.headers.get("content-length"), String(pngBytes.byteLength));
  assert.equal(getResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(getResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await getResponse.arrayBuffer()), pngBytes);

  const headResponse = await route.HEAD(new Request(`http://127.0.0.1/api/platform-qr/${assetId}`, { method: "HEAD" }), context(assetId));
  assert.equal(headResponse.status, 200);
  assert.equal(headResponse.headers.get("content-type"), "image/png");
  assert.equal(headResponse.headers.get("content-length"), String(pngBytes.byteLength));
  assert.equal((await headResponse.arrayBuffer()).byteLength, 0);
  assert.deepEqual(upstream.methods, ["GET", "HEAD"]);
});

test("platform QR route fails closed for missing configuration and invalid IDs", async (t) => {
  const route = await loadRoute(t);
  const previousOrigin = process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  delete process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
    else process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN = previousOrigin;
  });

  const missingOrigin = await route.GET(new Request("http://127.0.0.1/api/platform-qr/missing"), context(assetId));
  assert.equal(missingOrigin.status, 404);

  process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN = "http://127.0.0.1:43123";
  const invalidId = await route.GET(new Request("http://127.0.0.1/api/platform-qr/not-an-id"), context("not-an-id"));
  assert.equal(invalidId.status, 404);
});

test("platform QR route maps upstream 404, non-PNG, and network failures", async (t) => {
  const route = await loadRoute(t);
  let mode = "missing";
  const upstream = await startUpstream(t, (_request, response) => {
    if (mode === "missing") {
      response.statusCode = 404;
      response.setHeader("Content-Type", "application/json");
      response.end("{}");
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain");
    response.end("not a png");
  });
  const previousOrigin = process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN = upstream.origin;
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
    else process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN = previousOrigin;
  });

  const missing = await route.GET(new Request(`http://127.0.0.1/api/platform-qr/${assetId}`), context(assetId));
  assert.equal(missing.status, 404);

  mode = "wrong-type";
  const wrongType = await route.GET(new Request(`http://127.0.0.1/api/platform-qr/${assetId}`), context(assetId));
  assert.equal(wrongType.status, 502);

  await new Promise((resolve) => upstream.server.close(resolve));
  const unavailable = await route.GET(new Request(`http://127.0.0.1/api/platform-qr/${assetId}`), context(assetId));
  assert.equal(unavailable.status, 503);
});
