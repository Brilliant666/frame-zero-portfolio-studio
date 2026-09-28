import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadAvailabilityProbe(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-platform-card-availability-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sourcePath = "app/templates/shared/platform-card-availability.ts";
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const outputPath = path.join(directory, "platform-card-availability.mjs");
  await fs.writeFile(outputPath, output, "utf8");
  return import(`${pathToFileURL(outputPath).href}?test=${Date.now()}`);
}

test("platform cards use one fail-closed HEAD capability probe", async (t) => {
  const { probePlatformCardAvailability } = await loadAvailabilityProbe(t);
  const calls = [];
  const controller = new AbortController();
  const available = await probePlatformCardAvailability("/api/platform-qr/synthetic", {
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return new Response(null, {
        headers: { "content-type": "image/png; charset=binary" },
        status: 200,
      });
    },
    signal: controller.signal,
  });

  assert.equal(available, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/api/platform-qr/synthetic");
  assert.equal(calls[0].init.method, "HEAD");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.signal, controller.signal);
});

test("platform cards fail visually safe for 404, 503, wrong content, and network errors", async (t) => {
  const { probePlatformCardAvailability } = await loadAvailabilityProbe(t);
  for (const response of [
    new Response(null, { status: 404 }),
    new Response(null, { status: 503 }),
    new Response(null, { headers: { "content-type": "text/html" }, status: 200 }),
  ]) {
    assert.equal(
      await probePlatformCardAvailability("/api/platform-qr/synthetic", {
        fetchImpl: async () => response,
      }),
      false,
    );
  }

  assert.equal(
    await probePlatformCardAvailability("/api/platform-qr/synthetic", {
      fetchImpl: async () => { throw new TypeError("network unavailable"); },
    }),
    false,
  );
});

test("JPEG and WebP cards are accepted only on controlled Site variant routes", async (t) => {
  const { probePlatformCardAvailability } = await loadAvailabilityProbe(t);
  const site = "/api/sites/owner-a/assets/12345678-1234-4234-8234-123456789abc/full";
  for (const type of ["image/jpeg", "image/webp"]) {
    const fetchImpl = async () => new Response(null, { headers: { "content-type": type } });
    assert.equal(await probePlatformCardAvailability(site, { fetchImpl }), true);
    for (const url of ["/api/platform-qr/synthetic", "https://example.com/x.webp", `${site}?external=1`, "/photos/library/a.webp"]) {
      assert.equal(await probePlatformCardAvailability(url, { fetchImpl }), false, url);
    }
    for (const status of [401, 403, 404, 503]) assert.equal(await probePlatformCardAvailability(site, { fetchImpl: async () => new Response(null, { status, headers: { "content-type": type } }) }), false);
  }
  for (const type of ["image/svg+xml", "text/html", "application/octet-stream"]) assert.equal(await probePlatformCardAvailability(site, { fetchImpl: async () => new Response(null, { headers: { "content-type": type } }) }), false);
});
