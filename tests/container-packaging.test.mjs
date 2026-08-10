import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadProductionPublicFiles,
  prepareNextStandalone,
  PRODUCTION_PUBLIC_MANIFEST,
} from "../scripts/prepare-next-standalone.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createFixture(t, manifest = { version: 1, files: ["safe.svg"] }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "frame-zero-container-contract-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(path.join(root, ".next", "standalone"), { recursive: true });
  await mkdir(path.join(root, ".next", "static"), { recursive: true });
  await mkdir(path.join(root, "config"), { recursive: true });
  await mkdir(path.join(root, "public", "photos"), { recursive: true });
  await writeFile(path.join(root, ".next", "standalone", "server.js"), "// fixture\n");
  await writeFile(path.join(root, ".next", "static", "app.css"), "fixture\n");
  await writeFile(path.join(root, "public", "safe.svg"), "<svg/>\n");
  await writeFile(path.join(root, "public", "photos", "library-manifest.json"), "private\n");
  await writeFile(path.join(root, "public", "og.png"), "private\n");
  await writeFile(
    path.join(root, ...PRODUCTION_PUBLIC_MANIFEST.split("/")),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return root;
}

test("production public manifest exactly names the reviewed repository assets", async () => {
  assert.deepEqual(await loadProductionPublicFiles(projectRoot), [
    "favicon.svg",
    "file.svg",
    "globe.svg",
    "window.svg",
  ]);
});

test("standalone preparation succeeds without Git metadata and copies only the allowlist", async (t) => {
  const root = await createFixture(t);
  const result = await prepareNextStandalone(root);
  assert.equal(result.publicFiles, 1);
  assert.equal(await readFile(path.join(root, ".next", "standalone", "public", "safe.svg"), "utf8"), "<svg/>\n");
  assert.equal(await readFile(path.join(root, ".next", "standalone", ".next", "static", "app.css"), "utf8"), "fixture\n");
  await assert.rejects(readFile(path.join(root, ".next", "standalone", "public", "photos", "library-manifest.json")));
  await assert.rejects(readFile(path.join(root, ".next", "standalone", "public", "og.png")));
});

test("production public manifest rejects malformed and private paths", async (t) => {
  const cases = [
    [{ version: 2, files: ["safe.svg"] }, /version 1/],
    [{ version: 1, files: ["safe.svg"], extra: true }, /unknown or missing/],
    [{ version: 1, files: [] }, /1 to 256/],
    [{ version: 1, files: ["safe.svg", "safe.svg"] }, /duplicate/],
    [{ version: 1, files: ["photos/library-manifest.json"] }, /Private local asset/],
    [{ version: 1, files: ["og.png"] }, /Private local asset/],
    [{ version: 1, files: ["../escape.svg"] }, /Unsafe production public path/],
    [{ version: 1, files: ["folder\\escape.svg"] }, /Unsafe production public path/],
    [{ version: 1, files: ["z.svg", "a.svg"] }, /sorted/],
  ];
  for (const [manifest, pattern] of cases) {
    const root = await createFixture(t, manifest);
    await assert.rejects(loadProductionPublicFiles(root), pattern);
  }
});

test("allowlisted public entries must be regular files", async (t) => {
  const root = await createFixture(t, { version: 1, files: ["directory"] });
  await mkdir(path.join(root, "public", "directory"));
  await assert.rejects(prepareNextStandalone(root), /must be a regular file/);
});

test("Docker contract is default-deny, pinned, non-root, and Standard Next only", async () => {
  const [dockerfile, dockerignore, packageJson, workflow, preparer, verifier] = await Promise.all([
    readFile(path.join(projectRoot, "Dockerfile"), "utf8"),
    readFile(path.join(projectRoot, ".dockerignore"), "utf8"),
    readFile(path.join(projectRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectRoot, ".github", "workflows", "container.yml"), "utf8"),
    readFile(path.join(projectRoot, "scripts", "prepare-next-standalone.mjs"), "utf8"),
    readFile(path.join(projectRoot, "scripts", "verify-production-container.mjs"), "utf8"),
  ]);

  assert.equal(dockerignore.split(/\r?\n/).find((line) => line && !line.startsWith("#")), "**");
  for (const privatePath of [".git", ".frame-zero", ".env", ".openai", "public/photos", "public/og.png"]) {
    const escapedPath = privatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(dockerignore, new RegExp(`^!${escapedPath}`, "m"));
    assert.match(dockerignore, new RegExp(`^(?:\\*\\*/)?${escapedPath}(?:/\\*\\*)?$`, "m"));
  }
  for (const publicFile of await loadProductionPublicFiles(projectRoot)) {
    const escapedFile = publicFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(dockerignore, new RegExp(`^!public/${escapedFile}$`, "m"));
  }
  assert.equal((dockerfile.match(/node:22\.22\.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752/g) ?? []).length, 2);
  assert.match(dockerfile, /^USER 1000:1000$/m);
  assert.match(dockerfile, /^ENTRYPOINT \[\]$/m);
  assert.match(dockerfile, /^CMD \["node", "server\.js"\]$/m);
  assert.match(dockerfile, /^LABEL org\.opencontainers\.image\.title="Portfolio Platform" \\$/m);
  assert.doesNotMatch(
    dockerfile,
    /^LABEL org\.opencontainers\.image\.title="Frame Zero Portfolio Studio"/m,
  );
  assert.match(dockerfile, /^COPY --from=builder --chown=1000:1000 \/workspace\/\.next\/standalone \.\/$/m);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./);
  assert.doesNotMatch(dockerfile, /\b(?:vinext|wrangler|cloudflare:workers)\b/i);
  assert.doesNotMatch(dockerfile, /^(?:ARG|ENV)\s+.*(?:PASSWORD|SECRET|TOKEN)/im);
  assert.doesNotMatch(dockerfile, /chmod\s+777|apt-get|\b(?:curl|wget|python)\b/i);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /npm run verify:container/);
  assert.doesNotMatch(workflow, /docker\s+(?:login|push)|kubectl|ssh\s/i);
  assert.equal(packageJson.scripts["test:container-contract"], "node --test tests/container-packaging.test.mjs");
  assert.equal(packageJson.scripts["verify:container"], "node scripts/verify-production-container.mjs");
  assert.doesNotMatch(preparer, /\bgit\b|execFile|child_process/);
  assert.match(verifier, /!current\.startsWith\("\/app\/node_modules\/"\).*local Windows path leaked/s);
  assert.match(verifier, /build-context sentinel leaked into runtime/);
  assert.match(
    verifier,
    /inspection\.Config\.Labels\?\.\["org\.opencontainers\.image\.title"\], "Portfolio Platform"/,
  );
});
