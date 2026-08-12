#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getLocalPhotoLibrarySnapshot,
  importPhotoLibrary,
  photoImportContract,
  setLocalPhotoAssetsArchived,
} from "./lib/photo-import.mjs";

export const LOCAL_PHOTO_IMPORT_HOST = "127.0.0.1";
export const LOCAL_PHOTO_IMPORT_PORT = 3002;
export const LOCAL_PHOTO_IMPORT_MAX_BYTES = 200 * 1024 * 1024;
export const LOCAL_PHOTO_IMPORT_PORT_ENV = "FRAME_ZERO_LOCAL_PHOTO_IMPORT_PORT";

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3001",
  "http://localhost:3001",
]);
const ALLOWED_PREFLIGHT_HEADERS = new Set([
  "content-type",
  "x-frame-zero-local-import",
  "x-frame-zero-photo-batch",
  "x-frame-zero-photo-batch-position",
  "x-frame-zero-photo-batch-size",
  "x-frame-zero-photo-extension",
  "x-frame-zero-photo-source",
]);
const IMPORT_HEADER = "x-frame-zero-local-import";
const EXTENSION_HEADER = "x-frame-zero-photo-extension";
const BATCH_HEADER = "x-frame-zero-photo-batch";
const BATCH_POSITION_HEADER = "x-frame-zero-photo-batch-position";
const BATCH_SIZE_HEADER = "x-frame-zero-photo-batch-size";
const SOURCE_HEADER = "x-frame-zero-photo-source";
const TEMP_DIRECTORY_PREFIX = "frame-zero-photo-import-";
const MAX_MANAGEMENT_BODY_BYTES = 8 * 1024;

async function removeTemporaryDirectory(temporaryDirectory) {
  await fs.rm(temporaryDirectory, {
    recursive: true,
    force: true,
    maxRetries: 2,
    retryDelay: 25,
  });
}

async function removeTemporaryDirectoryEventually(temporaryDirectory) {
  await fs.rm(temporaryDirectory, {
    recursive: true,
    force: true,
    maxRetries: 40,
    retryDelay: 50,
  });
}

function parsePortValue(value, source) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,4})$/.test(value)) {
    throw new TypeError(`${source} must be an integer from 0 to 65535`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError(`${source} must be an integer from 0 to 65535`);
  }
  return port;
}

export function resolvePhotoImportPort({
  argv = [],
  environment = process.env,
} = {}) {
  if (!Array.isArray(argv)) throw new TypeError("argv must be an array");

  let commandLinePort;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    let rawPort;
    if (argument === "--port") {
      index += 1;
      rawPort = argv[index];
    } else if (typeof argument === "string" && argument.startsWith("--port=")) {
      rawPort = argument.slice("--port=".length);
    } else {
      throw new TypeError("Only --port is supported");
    }
    if (commandLinePort !== undefined) throw new TypeError("--port may only be provided once");
    commandLinePort = parsePortValue(rawPort, "--port");
  }

  if (commandLinePort !== undefined) return commandLinePort;
  const environmentPort = environment?.[LOCAL_PHOTO_IMPORT_PORT_ENV];
  if (environmentPort === undefined) return LOCAL_PHOTO_IMPORT_PORT;
  return parsePortValue(environmentPort, LOCAL_PHOTO_IMPORT_PORT_ENV);
}

export function createPhotoImportReadyMessage(address) {
  if (
    !address
    || typeof address !== "object"
    || address.address !== LOCAL_PHOTO_IMPORT_HOST
    || !Number.isInteger(address.port)
    || address.port < 1
    || address.port > 65_535
  ) {
    throw new TypeError("The local photo import service returned an invalid address");
  }
  return {
    type: "ready",
    host: LOCAL_PHOTO_IMPORT_HOST,
    port: address.port,
  };
}

class SafeHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function oneHeader(value) {
  return typeof value === "string" ? value : null;
}

function originForRequest(request, { required }) {
  const origin = oneHeader(request.headers.origin);
  if (!origin && !required) return null;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    throw new SafeHttpError(403, "forbidden-origin", "This local request origin is not allowed.");
  }
  return origin;
}

function writeJson(response, status, payload, origin = null) {
  const body = Buffer.from(JSON.stringify(payload));
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", String(body.byteLength));
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.end(body);
}

function writeEmpty(response, status, origin) {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Frame-Zero-Local-Import, X-Frame-Zero-Photo-Batch, "
      + "X-Frame-Zero-Photo-Batch-Position, X-Frame-Zero-Photo-Batch-Size, "
      + "X-Frame-Zero-Photo-Extension, X-Frame-Zero-Photo-Source",
  );
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  response.end();
}

function parseRequestPath(request) {
  try {
    return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    throw new SafeHttpError(400, "invalid-request", "The request URL is invalid.");
  }
}

function validatePreflight(request, response, pathname) {
  const origin = originForRequest(request, { required: true });
  if (oneHeader(request.headers["access-control-request-method"]) !== "POST") {
    throw new SafeHttpError(403, "forbidden-preflight", "This local preflight request is not allowed.");
  }

  const requestedHeaders = oneHeader(request.headers["access-control-request-headers"]);
  if (!requestedHeaders) {
    throw new SafeHttpError(403, "forbidden-preflight", "This local preflight request is not allowed.");
  }
  const normalizedHeaders = requestedHeaders.split(",").map((value) => value.trim().toLowerCase());
  const requiredHeaders = pathname === "/import"
    ? [
        "content-type",
        IMPORT_HEADER,
        EXTENSION_HEADER,
        BATCH_HEADER,
        BATCH_POSITION_HEADER,
        BATCH_SIZE_HEADER,
        SOURCE_HEADER,
      ]
    : ["content-type", IMPORT_HEADER];
  if (normalizedHeaders.some((value) => !ALLOWED_PREFLIGHT_HEADERS.has(value))
    || requiredHeaders.some((value) => !normalizedHeaders.includes(value))) {
    throw new SafeHttpError(403, "forbidden-preflight", "This local preflight request is not allowed.");
  }

  writeEmpty(response, 204, origin);
}

function supportedExtensionsFromContract(contract) {
  if (!Array.isArray(contract?.supportedExtensions) || contract.supportedExtensions.length === 0) {
    throw new Error("The photo importer extension contract is unavailable");
  }
  const values = contract.supportedExtensions.map((value) => String(value).toLowerCase());
  if (values.some((value) => !/^\.[a-z0-9]+$/.test(value))) {
    throw new Error("The photo importer extension contract is invalid");
  }
  return new Set(values);
}

function parseSafeHeaderInteger(value, name, { minimum, maximum }) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new SafeHttpError(400, "invalid-batch-metadata", `The ${name} header is invalid.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new SafeHttpError(400, "invalid-batch-metadata", `The ${name} header is invalid.`);
  }
  return number;
}

function validateImportHeaders(request, supportedExtensions, maximumAssets) {
  if (oneHeader(request.headers[IMPORT_HEADER]) !== "1") {
    throw new SafeHttpError(403, "missing-import-header", "The required local import header is missing.");
  }

  const contentType = oneHeader(request.headers["content-type"]);
  if (!contentType || contentType.split(";", 1)[0].trim().toLowerCase() !== "application/octet-stream") {
    throw new SafeHttpError(415, "unsupported-media-type", "Photo imports require a binary request body.");
  }

  const rawExtension = oneHeader(request.headers[EXTENSION_HEADER]);
  if (!rawExtension || !/^\.[a-z0-9]+$/i.test(rawExtension)) {
    throw new SafeHttpError(415, "unsupported-extension", "This photo extension is not supported.");
  }
  const extension = rawExtension.toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new SafeHttpError(415, "unsupported-extension", "This photo extension is not supported.");
  }
  const batchId = oneHeader(request.headers[BATCH_HEADER]);
  const sourceKind = oneHeader(request.headers[SOURCE_HEADER]);
  if (!batchId || !/^[a-f0-9]{32}$/.test(batchId) || !["photos", "folder"].includes(sourceKind)) {
    throw new SafeHttpError(400, "invalid-batch-metadata", "The local import batch metadata is invalid.");
  }
  const batchPosition = parseSafeHeaderInteger(
    oneHeader(request.headers[BATCH_POSITION_HEADER]),
    "batch position",
    { minimum: 0, maximum: maximumAssets - 1 },
  );
  const batchSize = parseSafeHeaderInteger(
    oneHeader(request.headers[BATCH_SIZE_HEADER]),
    "batch size",
    { minimum: 1, maximum: maximumAssets },
  );
  if (batchPosition >= batchSize) {
    throw new SafeHttpError(400, "invalid-batch-metadata", "The local import batch metadata is invalid.");
  }
  return { extension, batchId, batchPosition, batchSize, sourceKind };
}

function validateManagementHeaders(request) {
  if (oneHeader(request.headers[IMPORT_HEADER]) !== "1") {
    throw new SafeHttpError(403, "missing-import-header", "The required local import header is missing.");
  }
  const contentType = oneHeader(request.headers["content-type"]);
  if (!contentType || contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new SafeHttpError(415, "unsupported-media-type", "Local library changes require JSON.");
  }
}

function validateDeclaredBodySize(request, maximumBytes) {
  const rawLength = request.headers["content-length"];
  if (rawLength === undefined) return;
  const value = oneHeader(rawLength);
  if (!value || !/^\d+$/.test(value)) {
    throw new SafeHttpError(400, "invalid-content-length", "The request body length is invalid.");
  }
  if (Number(value) > maximumBytes) {
    request.resume();
    throw new SafeHttpError(413, "payload-too-large", "This photo exceeds the local import size limit.");
  }
}

async function streamRequestToFile(request, filePath, maximumBytes) {
  const file = await fs.open(filePath, "wx", 0o600);
  let totalBytes = 0;

  try {
    const iterator = typeof request.iterator === "function"
      ? request.iterator({ destroyOnReturn: false })
      : request[Symbol.asyncIterator]();
    for await (const value of iterator) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maximumBytes) {
        request.resume();
        throw new SafeHttpError(413, "payload-too-large", "This photo exceeds the local import size limit.");
      }

      let offset = 0;
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await file.write(chunk, offset, chunk.byteLength - offset);
        if (bytesWritten === 0) throw new Error("Unable to write the temporary photo");
        offset += bytesWritten;
      }
    }
  } catch (error) {
    if (request.aborted && !(error instanceof SafeHttpError)) {
      throw new SafeHttpError(400, "request-aborted", "The photo upload was interrupted.");
    }
    throw error;
  } finally {
    await file.close();
  }

  if (totalBytes === 0) {
    throw new SafeHttpError(400, "empty-body", "The photo request body is empty.");
  }
  return totalBytes;
}

async function readSmallJsonBody(request) {
  const rawLength = oneHeader(request.headers["content-length"]);
  if (rawLength && (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_MANAGEMENT_BODY_BYTES)) {
    request.resume();
    throw new SafeHttpError(413, "payload-too-large", "The local library request is too large.");
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_MANAGEMENT_BODY_BYTES) {
      request.resume();
      throw new SafeHttpError(413, "payload-too-large", "The local library request is too large.");
    }
    chunks.push(chunk);
  }
  if (totalBytes === 0) throw new SafeHttpError(400, "invalid-request", "The request body is required.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SafeHttpError(400, "invalid-request", "The request body is invalid.");
  }
}

function parseLibraryMutation(value) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || !Array.isArray(value.assetIds)
    || value.assetIds.length < 1
    || value.assetIds.length > 100
    || value.assetIds.some((assetId) => typeof assetId !== "string" || !/^[a-f0-9]{64}$/.test(assetId))
    || new Set(value.assetIds).size !== value.assetIds.length
    || !Number.isSafeInteger(value.expectedRevision)
    || value.expectedRevision < 0
  ) throw new SafeHttpError(400, "invalid-request", "The local library request is invalid.");
  return { assetIds: value.assetIds, expectedRevision: value.expectedRevision };
}

function createPromiseQueue() {
  let tail = Promise.resolve();
  return function enqueue(operation) {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  };
}

function classifyImportError(error) {
  if (/Photo library is limited to \d+ assets/i.test(String(error?.message))) {
    return new SafeHttpError(409, "library-full", "The local photo library has reached its asset limit.");
  }
  if (Array.isArray(error?.skipped) || /No readable photographs could be imported/i.test(String(error?.message))) {
    return new SafeHttpError(422, "invalid-image", "This image could not be decoded.");
  }
  return new SafeHttpError(500, "import-failed", "The local photo import failed.");
}

function classifyLibraryError(error) {
  switch (error?.code) {
    case "CATALOG_REVISION_CONFLICT":
      return new SafeHttpError(409, "library-changed", "The local library changed; refresh and try again.");
    case "ASSET_NOT_FOUND":
      return new SafeHttpError(404, "asset-not-found", "This local photo asset no longer exists.");
    case "ASSET_VARIANTS_MISSING":
      return new SafeHttpError(409, "asset-variants-missing", "Re-import this photo before restoring it.");
    default:
      return new SafeHttpError(500, "library-update-failed", "The local photo library could not be updated.");
  }
}

function normalizeImportResult(result) {
  if (
    !Array.isArray(result?.assetOutcomes)
    || result.assetOutcomes.length !== 1
    || !result.assetOutcomes[0]
    || typeof result.assetOutcomes[0] !== "object"
    || !/^[a-f0-9]{64}$/.test(result.assetOutcomes[0].assetId)
    || !["added", "duplicate", "restored"].includes(result.assetOutcomes[0].disposition)
    || !Number.isInteger(result.activeAssets)
    || result.activeAssets < 1
    || !Number.isInteger(result.catalogRevision)
    || result.catalogRevision < 0
  ) throw new Error("The photo importer did not return one valid asset outcome");
  const outcome = result.assetOutcomes[0];
  return {
    ok: true,
    status: outcome.disposition,
    assetId: outcome.assetId,
    totalAssets: result.activeAssets,
    revision: result.catalogRevision,
  };
}

export function createPhotoImportService({
  projectRoot,
  importer = importPhotoLibrary,
  libraryReader = getLocalPhotoLibrarySnapshot,
  libraryMutator = setLocalPhotoAssetsArchived,
  contract = photoImportContract,
  tempRoot = os.tmpdir(),
  maximumBytes = LOCAL_PHOTO_IMPORT_MAX_BYTES,
  temporaryDirectoryCleanup = removeTemporaryDirectory,
  deferredTemporaryDirectoryCleanup = removeTemporaryDirectoryEventually,
} = {}) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new TypeError("projectRoot is required");
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError("maximumBytes must be a positive safe integer");
  }
  if (
    typeof temporaryDirectoryCleanup !== "function"
    || typeof deferredTemporaryDirectoryCleanup !== "function"
  ) {
    throw new TypeError("temporary directory cleanup functions are required");
  }

  const supportedExtensions = supportedExtensionsFromContract(contract);
  const maximumAssets = Number.isSafeInteger(contract?.maxManifestAssets)
    && contract.maxManifestAssets > 0
    ? contract.maxManifestAssets
    : 10_000;
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedTempRoot = path.resolve(tempRoot);
  const enqueueRequest = createPromiseQueue();
  const inFlight = new Set();
  const deferredCleanups = new Set();
  let closing = false;
  let pendingListen = null;

  const scheduleDeferredCleanup = (temporaryDirectory) => {
    const task = Promise.resolve()
      .then(() => deferredTemporaryDirectoryCleanup(temporaryDirectory))
      .catch(() => {
        // Keep filesystem details out of logs. A later service restart or the
        // operating system can release the private random-name temp file.
        console.error("A local photo import temporary file could not be removed.");
      });
    deferredCleanups.add(task);
    void task.finally(() => deferredCleanups.delete(task));
  };

  async function importOne(request) {
    const metadata = validateImportHeaders(request, supportedExtensions, maximumAssets);
    validateDeclaredBodySize(request, maximumBytes);

    await fs.mkdir(resolvedTempRoot, { recursive: true });
    const temporaryDirectory = await fs.mkdtemp(path.join(resolvedTempRoot, TEMP_DIRECTORY_PREFIX));
    const temporaryFile = path.join(
      temporaryDirectory,
      `photo-${randomBytes(16).toString("hex")}${metadata.extension}`,
    );

    let result;
    let operationError;
    try {
      await streamRequestToFile(request, temporaryFile, maximumBytes);
      try {
        result = await importer({
          sourceDir: temporaryDirectory,
          projectRoot: resolvedProjectRoot,
          recordSourceState: false,
          batchId: metadata.batchId,
          batchPosition: metadata.batchPosition,
          batchSize: metadata.batchSize,
          sourceKind: metadata.sourceKind,
        });
      } catch (error) {
        throw classifyImportError(error);
      }
      result = normalizeImportResult(result);
    } catch (error) {
      operationError = error;
    }

    try {
      await temporaryDirectoryCleanup(temporaryDirectory);
    } catch {
      // Importer writes are committed before it returns. A transient Windows
      // file lock must not turn that committed success into a false failure.
      scheduleDeferredCleanup(temporaryDirectory);
    }

    if (operationError) throw operationError;
    return result;
  }

  async function readLibrary() {
    try {
      return { ok: true, ...await libraryReader({ projectRoot: resolvedProjectRoot }) };
    } catch (error) {
      throw classifyLibraryError(error);
    }
  }

  async function updateLibrary(request, archived) {
    validateManagementHeaders(request);
    const input = parseLibraryMutation(await readSmallJsonBody(request));
    try {
      return {
        ok: true,
        ...await libraryMutator({
          projectRoot: resolvedProjectRoot,
          assetIds: input.assetIds,
          archived,
          expectedRevision: input.expectedRevision,
        }),
      };
    } catch (error) {
      throw classifyLibraryError(error);
    }
  }

  async function handle(request, response) {
    let responseOrigin = null;
    try {
      const pathname = parseRequestPath(request);

      if (pathname === "/health" && request.method === "GET") {
        responseOrigin = originForRequest(request, { required: false });
        writeJson(response, 200, { ok: true }, responseOrigin);
        return;
      }

      if (pathname === "/library" && request.method === "GET") {
        responseOrigin = originForRequest(request, { required: true });
        if (closing) throw new SafeHttpError(503, "service-stopping", "The local import service is stopping.");
        writeJson(response, 200, await enqueueRequest(readLibrary), responseOrigin);
        return;
      }

      if (
        ["/import", "/library/archive", "/library/restore"].includes(pathname)
        && request.method === "OPTIONS"
      ) {
        validatePreflight(request, response, pathname);
        return;
      }

      if (pathname === "/import" && request.method === "POST") {
        responseOrigin = originForRequest(request, { required: true });
        if (closing) {
          throw new SafeHttpError(503, "service-stopping", "The local import service is stopping.");
        }
        writeJson(response, 200, await enqueueRequest(() => importOne(request)), responseOrigin);
        return;
      }

      if (
        ["/library/archive", "/library/restore"].includes(pathname)
        && request.method === "POST"
      ) {
        responseOrigin = originForRequest(request, { required: true });
        if (closing) throw new SafeHttpError(503, "service-stopping", "The local import service is stopping.");
        writeJson(
          response,
          200,
          await enqueueRequest(() => updateLibrary(request, pathname === "/library/archive")),
          responseOrigin,
        );
        return;
      }

      if (["/health", "/import", "/library", "/library/archive", "/library/restore"].includes(pathname)) {
        throw new SafeHttpError(405, "method-not-allowed", "This request method is not allowed.");
      }
      throw new SafeHttpError(404, "not-found", "This local service endpoint does not exist.");
    } catch (error) {
      const safeError = error instanceof SafeHttpError
        ? error
        : new SafeHttpError(500, "internal-error", "The local photo import service failed.");
      if (!response.headersSent && !response.destroyed) {
        writeJson(response, safeError.status, {
          ok: false,
          error: { code: safeError.code, message: safeError.message },
        }, responseOrigin);
      } else if (!response.destroyed) {
        response.end();
      }
    }
  }

  const server = createServer((request, response) => {
    const task = handle(request, response);
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });

  async function listen(port = LOCAL_PHOTO_IMPORT_PORT) {
    if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new TypeError("port is invalid");
    if (closing) throw new Error("The local photo import service is stopping");
    if (pendingListen || server.listening) throw new Error("The local photo import service is already listening");

    const listenAttempt = new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen({ host: LOCAL_PHOTO_IMPORT_HOST, port });
    });
    pendingListen = listenAttempt;
    try {
      await listenAttempt;
      if (closing) throw new Error("The local photo import service is stopping");
      return server.address();
    } finally {
      if (pendingListen === listenAttempt) pendingListen = null;
    }
  }

  async function close() {
    closing = true;
    const listenAttempt = pendingListen;
    if (listenAttempt) await listenAttempt.catch(() => undefined);
    if (server.listening) {
      server.closeIdleConnections?.();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    await Promise.allSettled([...inFlight]);
    await Promise.allSettled([...deferredCleanups]);
  }

  return { close, listen, server };
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(scriptPath).href;

if (isMain) {
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const service = createPhotoImportService({ projectRoot });
  let shutdownPromise = null;

  const shutdown = () => {
    shutdownPromise ??= service.close();
    return shutdownPromise;
  };
  const finishShutdown = async () => {
    await shutdown();
    if (process.connected) process.disconnect();
  };

  process.on("SIGINT", () => void finishShutdown().then(() => { process.exitCode = 0; }));
  process.on("SIGTERM", () => void finishShutdown().then(() => { process.exitCode = 0; }));
  process.on("message", (message) => {
    if (message && typeof message === "object" && message.type === "shutdown") {
      void finishShutdown().then(() => { process.exitCode = 0; });
    }
  });

  try {
    const requestedPort = resolvePhotoImportPort({
      argv: process.argv.slice(2),
      environment: process.env,
    });
    const address = await service.listen(requestedPort);
    const readyMessage = createPhotoImportReadyMessage(address);
    console.log(`Local photo import service: http://${readyMessage.host}:${readyMessage.port}`);
    if (typeof process.send === "function") process.send(readyMessage);
  } catch {
    console.error("Unable to start the local photo import service.");
    process.exitCode = 1;
    await finishShutdown();
  }
}
