import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createPhotoImportService } from "../scripts/photo-import-server.mjs";

async function startService(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-platform-qr-service-"));
  const projectRoot = path.join(root, "project");
  const tempRoot = path.join(root, "temporary");
  await Promise.all([fs.mkdir(projectRoot), fs.mkdir(tempRoot)]);
  const service = createPhotoImportService({ projectRoot, tempRoot });
  const address = await service.listen(0);
  t.after(async () => {
    await service.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { origin: `http://127.0.0.1:${address.port}`, projectRoot, tempRoot };
}

async function syntheticCard() {
  return sharp({
    create: { width: 640, height: 960, channels: 3, background: { r: 238, g: 238, b: 238 } },
  }).png().toBuffer();
}

const allowedOrigin = "http://127.0.0.1:3001";
const importHeaders = {
  "content-type": "application/octet-stream",
  "origin": allowedOrigin,
  "x-frame-zero-local-import": "1",
  "x-frame-zero-photo-extension": ".png",
};

test("local platform QR service enforces CORS, imports, and serves immutable PNG bytes", async (t) => {
  const { origin, projectRoot } = await startService(t);
  const preflight = await fetch(`${origin}/platform-qr/import`, {
    method: "OPTIONS",
    headers: {
      origin: allowedOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-frame-zero-local-import,x-frame-zero-photo-extension",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), allowedOrigin);

  const upload = await fetch(`${origin}/platform-qr/import`, {
    method: "POST",
    headers: importHeaders,
    body: await syntheticCard(),
  });
  assert.equal(upload.status, 200);
  assert.equal(upload.headers.get("access-control-allow-origin"), allowedOrigin);
  const result = await upload.json();
  assert.equal(result.ok, true);
  assert.equal(result.status, "added");
  assert.match(result.assetId, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes("platform-qr-service"), false);

  const image = await fetch(`${origin}/platform-qr/${result.assetId}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(image.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), result.assetId);

  const head = await fetch(`${origin}/platform-qr/${result.assetId}`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "image/png");
  assert.equal(Number(head.headers.get("content-length")), bytes.byteLength);
  assert.equal((await head.arrayBuffer()).byteLength, 0);

  await assert.rejects(fs.stat(path.join(projectRoot, "public", "photos")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(projectRoot, ".frame-zero", "photo-library-catalog.json")), { code: "ENOENT" });
});

test("local platform QR service fails closed for bad origins, assets, and methods", async (t) => {
  const { origin } = await startService(t);
  const forbidden = await fetch(`${origin}/platform-qr/import`, {
    method: "POST",
    headers: { ...importHeaders, origin: "http://127.0.0.1:9999" },
    body: await syntheticCard(),
  });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "forbidden-origin");

  const missing = await fetch(`${origin}/platform-qr/${"f".repeat(64)}`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "asset-not-found");

  const wrongMethod = await fetch(`${origin}/platform-qr/${"f".repeat(64)}`, { method: "POST" });
  assert.equal(wrongMethod.status, 405);

  const invalid = await fetch(`${origin}/platform-qr/import`, {
    method: "POST",
    headers: importHeaders,
    body: Buffer.from("not an image"),
  });
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).error.code, "invalid-image");
});
