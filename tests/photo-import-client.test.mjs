import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { photoImportContract } from "../scripts/lib/photo-import.mjs";
import {
  LOCAL_PHOTO_IMPORT_HOST,
  LOCAL_PHOTO_IMPORT_MAX_BYTES,
  LOCAL_PHOTO_IMPORT_PORT,
} from "../scripts/photo-import-server.mjs";

async function importPhotoImportClient(t) {
  const sourcePath = new URL("../app/admin/layout/photo-import-client.ts", import.meta.url);
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "photo-import-client.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-photo-import-client-"));
  const modulePath = path.join(directory, "photo-import-client.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

function photo(name, contents = name) {
  return Object.assign(new Blob([contents]), { name });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("the browser and loopback service share the importer limits", async (t) => {
  const {
    localPhotoImportExtensions,
    localPhotoImportMaximumBytes,
    localPhotoImportOrigin,
  } = await importPhotoImportClient(t);
  assert.deepEqual(localPhotoImportExtensions, photoImportContract.supportedExtensions);
  assert.equal(localPhotoImportMaximumBytes, LOCAL_PHOTO_IMPORT_MAX_BYTES);
  assert.equal(localPhotoImportOrigin, `http://${LOCAL_PHOTO_IMPORT_HOST}:${LOCAL_PHOTO_IMPORT_PORT}`);
});

test("the browser selection accepts the importer whitelist without reading folder paths", async (t) => {
  const {
    getLocalPhotoImportExtension,
    localPhotoImportExtensions,
    selectLocalPhotoImportFiles,
  } = await importPhotoImportClient(t);
  assert.deepEqual(localPhotoImportExtensions, [
    ".avif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp",
  ]);
  assert.equal(getLocalPhotoImportExtension("PORTRAIT.JPEG"), ".jpeg");
  assert.equal(getLocalPhotoImportExtension("camera.cr3"), null);

  const nested = photo("portrait.jpg");
  Object.defineProperty(nested, "webkitRelativePath", {
    get() { throw new Error("the temporary folder path must not be inspected"); },
  });
  const selection = selectLocalPhotoImportFiles({
    0: nested,
    1: photo("notes.txt"),
    length: 2,
  });
  assert.deepEqual(selection.accepted, [nested]);
  assert.equal(selection.ignored, 1);
});

test("a batch performs one raw sequential request per photo and refreshes once", async (t) => {
  const { runLocalPhotoImport } = await importPhotoImportClient(t);
  const files = [
    photo("private-name.jpg", "first"),
    photo("duplicate.PNG", "second"),
    photo("broken.heic", "third"),
  ];
  const requests = [];
  let postsInFlight = 0;
  let maximumPostsInFlight = 0;
  let postIndex = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith("/health")) return jsonResponse({ ok: true });
    postsInFlight += 1;
    maximumPostsInFlight = Math.max(maximumPostsInFlight, postsInFlight);
    requests.push({ url: String(url), init });
    await new Promise((resolve) => setTimeout(resolve, 4));
    postsInFlight -= 1;
    const response = [
      jsonResponse({ ok: true, status: "added", totalAssets: 19 }),
      jsonResponse({ ok: true, status: "already-exists", totalAssets: 19 }),
      jsonResponse({ ok: false, error: { code: "invalid-image", message: "redacted" } }, 422),
    ][postIndex];
    postIndex += 1;
    return response;
  };
  let refreshes = 0;
  const progress = [];

  const result = await runLocalPhotoImport(files, {
    fetchImpl,
    onProgress: (value) => progress.push(value),
    refreshLibrary: async () => {
      refreshes += 1;
      return 19;
    },
  });

  assert.equal(maximumPostsInFlight, 1);
  assert.equal(requests.length, 3);
  assert.equal(refreshes, 1);
  assert.equal(progress.at(0).processed, 0);
  assert.deepEqual(progress.slice(1).map(({ processed }) => processed), [1, 2, 3]);
  assert.deepEqual(result, {
    total: 3,
    processed: 3,
    added: 1,
    alreadyExists: 1,
    failed: 1,
    failures: [{ index: 2, reason: "照片无法解码或格式暂不受支持" }],
    libraryTotal: 19,
    refreshFailed: false,
  });

  requests.forEach(({ url, init }, index) => {
    assert.equal(url, "http://127.0.0.1:3002/import");
    assert.equal(init.method, "POST");
    assert.equal(init.body, files[index]);
    assert.equal(init.headers["content-type"], "application/octet-stream");
    assert.equal(init.headers["x-frame-zero-local-import"], "1");
    assert.equal(init.headers["x-frame-zero-photo-extension"], [".jpg", ".png", ".heic"][index]);
    const transmittedMetadata = JSON.stringify({ url, headers: init.headers });
    assert.doesNotMatch(transmittedMetadata, /private-name|duplicate|broken|webkitRelativePath|base64/i);
  });
});

test("oversized and failed photos do not stop later queue items", async (t) => {
  const { localPhotoImportMaximumBytes, runLocalPhotoImport } = await importPhotoImportClient(t);
  const huge = { name: "huge.tiff", size: localPhotoImportMaximumBytes + 1 };
  const files = [huge, photo("network.jpg"), photo("last.webp")];
  let postIndex = 0;
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/health")) return jsonResponse({ ok: true });
    postIndex += 1;
    if (postIndex === 1) throw new TypeError("network unavailable");
    return jsonResponse({ ok: true, status: "added", totalAssets: 20 });
  };

  const result = await runLocalPhotoImport(files, {
    fetchImpl,
    refreshLibrary: async () => null,
  });

  assert.equal(postIndex, 2, "the oversized file must not be sent, and the last file must still run");
  assert.equal(result.processed, 3);
  assert.equal(result.added, 1);
  assert.equal(result.failed, 2);
  assert.deepEqual(result.failures, [
    { index: 0, reason: "文件超过 200 MiB 上限" },
    { index: 1, reason: "无法连接本地照片导入服务" },
  ]);
  assert.equal(result.libraryTotal, 20, "the safe service count remains useful if manifest refresh fails");
  assert.equal(result.refreshFailed, true);
});

test("an unavailable health endpoint starts no batch and performs no refresh", async (t) => {
  const { LocalPhotoImportUnavailableError, runLocalPhotoImport } = await importPhotoImportClient(t);
  let calls = 0;
  let refreshes = 0;
  await assert.rejects(
    runLocalPhotoImport([photo("one.jpg")], {
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ ok: false }, 503);
      },
      refreshLibrary: async () => {
        refreshes += 1;
        return 0;
      },
    }),
    LocalPhotoImportUnavailableError,
  );
  assert.equal(calls, 1);
  assert.equal(refreshes, 0);
});

test("a full library is reported as a safe recoverable batch failure", async (t) => {
  const { runLocalPhotoImport } = await importPhotoImportClient(t);
  const result = await runLocalPhotoImport([photo("one.jpg")], {
    fetchImpl: async (url) => String(url).endsWith("/health")
      ? jsonResponse({ ok: true })
      : jsonResponse({
          ok: false,
          error: { code: "library-full", message: "redacted" },
        }, 409),
    refreshLibrary: async () => 10_000,
  });
  assert.equal(result.failed, 1);
  assert.deepEqual(result.failures, [{ index: 0, reason: "素材库已达到 10,000 张上限" }]);
  assert.equal(result.libraryTotal, 10_000);
});
