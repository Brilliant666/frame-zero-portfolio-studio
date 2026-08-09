import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourcePath = new URL("../app/client-visible-title.ts", import.meta.url);

async function importClientVisibleTitle(t) {
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "client-visible-title.ts",
  }).outputText;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-zero-client-title-"));
  const modulePath = path.join(directory, "client-visible-title.mjs");
  await fs.writeFile(modulePath, compiled, "utf8");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
}

function profile(brand, photographer, mark = "IGNORED MARK") {
  return { brand, photographer, mark };
}

test("client-visible portfolio title follows the saved brand and photographer fallback rules", async (t) => {
  const { getClientVisiblePortfolioTitle } = await importClientVisibleTitle(t);

  assert.equal(getClientVisiblePortfolioTitle(profile("星空", "虚构摄影师")), "星空的作品集");
  assert.equal(getClientVisiblePortfolioTitle(profile(" 星空的作品集 ", "虚构摄影师")), "星空的作品集");
  assert.equal(getClientVisiblePortfolioTitle(profile("  ", " 星空 ")), "星空的作品集");
  assert.equal(getClientVisiblePortfolioTitle(profile("", "", "NOT A TITLE")), "摄影作品集");
});

test("the client-visible title helper contains no legacy brand or role fallback", async () => {
  const source = await fs.readFile(sourcePath, "utf8");

  assert.doesNotMatch(source, /FRAME\/\/ZERO|Cosplay 摄影师/u);
  assert.doesNotMatch(source, /profile\.mark/u);
});
