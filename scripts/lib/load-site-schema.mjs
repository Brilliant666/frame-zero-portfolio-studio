import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Operator tooling reuses the actual strict schemas; it does not invent a
// permissive migration schema or depend on a running HTTP editor.
export async function loadSiteContentSchema() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'site-import-schema-'));
  try {
    for (const [name, sourcePath] of [['catalog', 'templates/catalog'], ['document', 'preview-workspace/document'], ['flow', 'site-editor/flow-gallery-document'], ['schema', 'site-editor/content-schema']]) {
      const source = await readFile(new URL(`../../app/${sourcePath}.ts`, import.meta.url), 'utf8');
      const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
        .replaceAll('"../site-config"', '"./catalog.mjs"').replaceAll('"../preview-workspace/document"', '"./document.mjs"').replaceAll('"./flow-gallery-document"', '"./flow.mjs"');
      await writeFile(path.join(directory, `${name}.mjs`), js, { flag: 'wx', mode: 0o600 });
    }
    return { ...await import(pathToFileURL(path.join(directory, 'schema.mjs'))), dispose: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
