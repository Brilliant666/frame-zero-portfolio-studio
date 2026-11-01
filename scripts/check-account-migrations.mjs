import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import * as schema from '../db/accounts/schema.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const initialId = '00000000-0000-0000-0000-000000000000';
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
async function contents(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await contents(path.join(directory, entry.name), name + '/'));
    else result[name] = (await readFile(path.join(directory, entry.name))).toString('base64');
  }
  return result;
}

// This validates generator metadata, not the live database or hand-written functions.
export async function checkAccountMigrations({ directory = path.join(root, 'drizzle-accounts'), schemaExports = schema, cli = true } = {}) {
  const journal = await json(path.join(directory, 'meta/_journal.json'));
  assert.equal(journal.version, '7');
  assert.equal(journal.dialect, 'postgresql');
  assert.ok(journal.entries.length > 0, 'Migration journal is empty');
  const names = journal.entries.map((entry, index) => {
    assert.equal(entry.idx, index, 'Journal entries must be consecutive');
    assert.equal(entry.version, '7');
    assert.match(entry.tag, new RegExp(`^${String(index).padStart(4, '0')}_[a-z0-9_]+$`));
    return `${String(index).padStart(4, '0')}_snapshot.json`;
  });
  assert.deepEqual((await readdir(path.join(directory, 'meta'))).filter(name => name.endsWith('_snapshot.json')).sort(), names, 'Every SQL migration needs its historical snapshot');
  let previousId = initialId, latest;
  const ids = new Set();
  for (const [index, name] of names.entries()) {
    await readFile(path.join(directory, journal.entries[index].tag + '.sql'));
    const snapshot = await json(path.join(directory, 'meta', name));
    assert.equal(snapshot.version, '7');
    assert.equal(snapshot.dialect, 'postgresql');
    assert.match(snapshot.id, uuid);
    assert.ok(!ids.has(snapshot.id), 'Duplicate snapshot ID');
    assert.equal(snapshot.prevId, previousId, 'Snapshot chain is not consecutive');
    ids.add(snapshot.id); previousId = snapshot.id; latest = snapshot;
  }
  const current = JSON.parse(JSON.stringify(generateDrizzleJson(schemaExports, latest.id)));
  assert.deepEqual(await generateMigration(latest, current), [], 'Schema would generate an unexpected migration');
  const { id: lastId, prevId: lastPrevId, ...stored } = latest;
  const { id: currentId, prevId: currentPrevId, ...generated } = current;
  void lastId; void lastPrevId; void currentId; void currentPrevId;
  assert.deepEqual(stored, generated, 'Snapshot metadata differs from the current schema');
  if (!cli) return;
  const temporary = await mkdtemp(path.join(tmpdir(), 'frame-zero-migration-check-'));
  try {
    const output = path.join(temporary, 'drizzle-accounts');
    await cp(directory, output, { recursive: true });
    const before = await contents(output);
    await writeFile(path.join(temporary, 'drizzle-check.config.cjs'), `module.exports = ${JSON.stringify({ dialect: 'postgresql', schema: path.join(root, 'db/accounts/schema.mjs').split(path.sep).join('/'), out: './drizzle-accounts' })};\n`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(FRAME_ZERO_|PG|DATABASE_URL$|NODE_OPTIONS$|NODE_PATH$)/i.test(name)));
    for (let run = 0; run < 2; run++) {
      const pending = exec(process.execPath, [path.join(root, 'node_modules/drizzle-kit/bin.cjs'), 'generate', '--config=./drizzle-check.config.cjs'], {
        cwd: temporary, env, timeout: 30_000, maxBuffer: 1024 * 1024,
      });
      pending.child.stdin.end();
      const result = await pending;
      assert.match(result.stdout, /No schema changes/, 'Generator did not report a clean schema');
      assert.deepEqual(await contents(output), before, 'Generator changed migration files or metadata');
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkAccountMigrations();
  console.log('Account migration metadata and two offline generation passes are unchanged.');
}
