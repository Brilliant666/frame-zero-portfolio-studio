import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { pgTable, text } from 'drizzle-orm/pg-core';
import * as schema from '../db/accounts/schema.mjs';
import { checkAccountMigrations } from '../scripts/check-account-migrations.mjs';

const migrations = fileURLToPath(new URL('../drizzle-accounts', import.meta.url));
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'frame-zero-snapshot-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(migrations, directory, { recursive: true });
  const edit = async (name, change) => {
    const filename = path.join(directory, name);
    const value = JSON.parse(await readFile(filename, 'utf8'));
    change(value); await writeFile(filename, JSON.stringify(value));
  };
  return { directory, edit };
}

test('account migration history is complete and two offline generate passes are unchanged', async () => {
  await checkAccountMigrations();
});

test('missing snapshots or SQL, invalid JSON and broken IDs fail closed', async t => {
  const cases = [
    ['missing latest snapshot', async f => rm(path.join(f.directory, 'meta/0006_snapshot.json'))],
    ['missing historical SQL', async f => rm(path.join(f.directory, '0002_site_assets.sql'))],
    ['invalid JSON', async f => writeFile(path.join(f.directory, 'meta/0004_snapshot.json'), '{')],
    ['unsupported version', f => f.edit('meta/0006_snapshot.json', s => { s.version = '99'; })],
    ['broken predecessor', f => f.edit('meta/0006_snapshot.json', s => { s.prevId = '00000000-0000-0000-0000-000000000000'; })],
    ['duplicate ID', async f => {
      const previous = JSON.parse(await readFile(path.join(f.directory, 'meta/0005_snapshot.json'), 'utf8'));
      await f.edit('meta/0006_snapshot.json', s => { s.id = previous.id; });
    }],
    ['changed constraint', f => f.edit('meta/0006_snapshot.json', s => { s.tables['public.site_assets'].checkConstraints.site_assets_width_check.value = 'width > 99'; })],
  ];
  for (const [name, mutate] of cases) await t.test(name, async t => {
    const f = await fixture(t); await mutate(f);
    await assert.rejects(checkAccountMigrations({ directory: f.directory, cli: false }));
  });
});

test('new schema objects require an explicit migration', async () => {
  await assert.rejects(checkAccountMigrations({ schemaExports: { ...schema, added: pgTable('metadata_probe', { label: text('label') }) }, cli: false }), /unexpected migration/);
});

test('snapshots preserve physical unique constraints, foreign keys and history ordering', async () => {
  const snapshot = JSON.parse(await readFile(path.join(migrations, 'meta/0006_snapshot.json'), 'utf8'));
  const assets = snapshot.tables['public.site_assets'];
  assert.deepEqual(Object.keys(assets.uniqueConstraints), ['site_assets_site_id_digest_key']);
  assert.deepEqual(Object.keys(assets.foreignKeys), ['site_assets_site_id_fkey']);
  const revisions = snapshot.tables['public.site_publication_revisions'];
  assert.deepEqual(Object.keys(revisions.uniqueConstraints), ['site_publication_revisions_site_id_id_key']);
  assert.deepEqual(revisions.indexes.publication_history_site_order.columns.slice(2).map(c => [c.asc, c.nulls]), [[false, 'first'], [false, 'first']]);
  const third = JSON.parse(await readFile(path.join(migrations, 'meta/0003_snapshot.json'), 'utf8'));
  assert.deepEqual(Object.keys(third.tables['public.site_publication_revisions'].indexes), []);
  assert.match(third.tables['public.site_publication_revisions'].checkConstraints.site_publication_revisions_space_check.value, /= 'premium-polaroid'/);
});
