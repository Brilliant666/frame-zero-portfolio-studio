import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const root = new URL("../", import.meta.url);
const require = createRequire(new URL("package.json", root));
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));

function assertPatched(version, minimum, description) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${description} must be a stable version`);
  const actual = version.split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  const difference = actual.map((part, index) => part - floor[index]).find(Boolean) ?? 0;
  assert.ok(difference >= 0, `${description}: ${version} is below security baseline ${minimum}`);
}

test("installed framework and authentication packages match the patched lock", async () => {
  const minimums = {
    next: "16.4.1",
    react: "19.2.9",
    "react-dom": "19.2.9",
    "react-server-dom-webpack": "19.2.9",
    "better-auth": "1.7.7",
    auth: "1.7.7",
    "drizzle-orm": "0.45.2",
  };
  for (const [name, minimum] of Object.entries(minimums)) {
    const installed = JSON.parse(await readFile(new URL(`node_modules/${name}/package.json`, root), "utf8"));
    const declared = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
    assertPatched(installed.version, minimum, name);
    assert.equal(installed.version, declared, `${name}: installed version must match the exact manifest pin`);
    assert.equal(lock.packages[`node_modules/${name}`].version, installed.version, `${name}: lock and installed version`);
  }
  assert.equal(manifest.dependencies.react, manifest.dependencies["react-dom"]);
  assert.equal(manifest.dependencies.react, manifest.devDependencies["react-server-dom-webpack"]);
  assert.equal(manifest.dependencies.next, manifest.devDependencies["eslint-config-next"]);
});

test("both upload and Next image optimization resolve patched Sharp and native SVG libraries", () => {
  const nextRequire = createRequire(require.resolve("next/package.json"));
  for (const [owner, resolve] of [["uploads", require], ["Next image optimizer", nextRequire]]) {
    const sharp = resolve("sharp");
    assertPatched(sharp.versions.sharp, "0.35.5", `${owner} Sharp`);
    assertPatched(sharp.versions.rsvg, "2.63.2", `${owner} librsvg`);
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (location.endsWith("/sharp") && entry.dev !== true) {
      assertPatched(entry.version, "0.35.5", location);
    }
  }
  for (const platform of ["linux-x64", "linux-arm64", "win32-x64"]) {
    assertPatched(lock.packages[`node_modules/@img/sharp-${platform}`].version, "0.35.5", platform);
  }
});

test("updated native image stack decodes SVG and preserves image conversion dimensions", async () => {
  const sharp = require("sharp");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="#5899ce"/></svg>');
  const png = await sharp(svg).png().toBuffer();
  const webp = await sharp(png).resize({ width: 16 }).webp().toBuffer();
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 12);
  await assert.rejects(sharp(Buffer.from("invalid image")).toBuffer(), /unsupported image format/i);
});
