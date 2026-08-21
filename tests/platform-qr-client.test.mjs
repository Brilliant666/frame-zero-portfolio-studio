import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function loadClient(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-platform-qr-client-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sources = [
    ["app/platform-qr.ts", "platform-qr.mjs"],
    ["app/admin/contact/platform-qr-client.ts", "platform-qr-client.mjs"],
  ];
  for (const [sourcePath, outputName] of sources) {
    const source = await fs.readFile(sourcePath, "utf8");
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: sourcePath,
    }).outputText;
    output = output.replace('../../platform-qr', './platform-qr.mjs');
    await fs.writeFile(path.join(directory, outputName), output, "utf8");
  }
  return import(`${new URL(`file:///${path.join(directory, "platform-qr-client.mjs").replaceAll("\\", "/")}`).href}?${Date.now()}`);
}

function namedBlob(name, size = 32) {
  const blob = new Blob([Buffer.alloc(size)]);
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

test("platform QR client uploads only binary bytes and safe metadata", async (t) => {
  const { uploadPlatformQr } = await loadClient(t);
  const file = namedBlob("private-name.png");
  let request;
  const result = await uploadPlatformQr("http://127.0.0.1:43123", file, {
    fetchImpl: async (input, init) => {
      request = { input: String(input), init };
      return Response.json({
        ok: true,
        status: "added",
        assetId: "a".repeat(64),
        width: 987,
        height: 1347,
      });
    },
  });

  assert.deepEqual(result, {
    assetId: "a".repeat(64),
    height: 1347,
    status: "added",
    width: 987,
  });
  assert.equal(request.input, "http://127.0.0.1:43123/platform-qr/import");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.body, file);
  assert.equal(request.init.headers["content-type"], "application/octet-stream");
  assert.equal(request.init.headers["x-frame-zero-local-import"], "1");
  assert.equal(request.init.headers["x-frame-zero-photo-extension"], ".png");
  assert.doesNotMatch(JSON.stringify(request.init), /private-name|[A-Za-z]:[\\/]/);
});

test("platform QR client rejects unsafe origins, files, and responses", async (t) => {
  const { platformQrUploadMaximumBytes, uploadPlatformQr } = await loadClient(t);
  await assert.rejects(
    () => uploadPlatformQr("https://127.0.0.1:3002", namedBlob("card.png")),
    /暂不可用/,
  );
  await assert.rejects(
    () => uploadPlatformQr("http://127.0.0.1:3002", namedBlob("card.svg")),
    /仅支持/,
  );
  await assert.rejects(
    () => uploadPlatformQr("http://127.0.0.1:3002", namedBlob("card.png", platformQrUploadMaximumBytes + 1)),
    /10 MiB/,
  );
  await assert.rejects(
    () => uploadPlatformQr("http://127.0.0.1:3002", namedBlob("card.png"), {
      fetchImpl: async () => Response.json({ ok: true, status: "added", assetId: "https://unsafe.example", width: 1, height: 1 }),
    }),
    /上传失败/,
  );
});

test("platform QR client preserves aborts and sanitizes service failures", async (t) => {
  const { uploadPlatformQr } = await loadClient(t);
  await assert.rejects(
    () => uploadPlatformQr("http://127.0.0.1:3002", namedBlob("card.png"), {
      fetchImpl: async () => { throw new DOMException("aborted", "AbortError"); },
    }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  await assert.rejects(
    () => uploadPlatformQr("http://127.0.0.1:3002", namedBlob("card.png"), {
      fetchImpl: async () => Response.json({ ok: false, error: { code: "invalid-image", message: "private path" } }, { status: 422 }),
    }),
    /无法安全读取/,
  );
});
