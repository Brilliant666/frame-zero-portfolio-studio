// Operator-only, local migration. Never imported by a browser or HTTP route.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, copyFile, writeFile, link, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { assetPath, insertPreparedAsset, UUID } from './assets.mjs';
import { legacyImportSourceGate, assertLegacyOperatorApplyAllowed } from '../../scripts/lib/legacy-import-source-gate.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const fail = code => { throw new Error(code); };
async function digestFile(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(s => !s || s === '.' || s === '..') || path.isAbsolute(relative)) fail('UNSAFE_SOURCE_PATH');
  const base = await realpath(root), file = await realpath(path.join(base, ...relative.split('/')));
  if (!file.startsWith(`${base}${path.sep}`)) fail('SOURCE_ESCAPES_ROOT');
  if (!(await stat(file)).isFile()) fail('SOURCE_NOT_FILE');
  return file;
}
async function imageEvidence(file) {
  const size = (await stat(file)).size;
  if (size < 1 || size > 100 * 1024 * 1024) fail('SOURCE_IMAGE_SIZE');
  const metadata = await sharp(await readFile(file), { limitInputPixels: 100_000_000, failOn: 'warning' }).metadata();
  if (!MIME[metadata.format] || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) fail('SOURCE_IMAGE_FORMAT');
  return { sha256: await digestFile(file), bytes: size, width: metadata.width, height: metadata.height, type: MIME[metadata.format], extension: metadata.format };
}

/** VACUUM INTO creates a consistent SQLite snapshot including WAL state,
 * unlike copying .db. It is available through Node 22.13's DatabaseSync;
 * node:sqlite.backup was introduced later and is intentionally not required.
 * Sources are never modified. A new directory is required; an incomplete export
 * remains clearly incomplete (snapshot.json is written last).
 */
export async function exportLegacySnapshot({ sqlitePath, photosRoot, qrRoot, outputDirectory }) {
  const { DatabaseSync } = await import('node:sqlite');
  await mkdir(outputDirectory, { mode: 0o700 });
  const source = new DatabaseSync(sqlitePath, { readOnly: true });
  let db;
  try {
    const selectRows = database => database.prepare('SELECT id, content, updated_at FROM site_settings WHERE id IN (1,2601) ORDER BY id').all();
    const before = selectRows(source);
    source.prepare('VACUUM INTO ?').run(path.join(outputDirectory, 'source.sqlite'));
    db = new DatabaseSync(path.join(outputDirectory, 'source.sqlite'), { readOnly: true });
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('SOURCE_BACKUP_INTEGRITY');
    const rows = selectRows(db);
    if (jsonHash(before) !== jsonHash(rows) || jsonHash(selectRows(source)) !== jsonHash(rows)) fail('SOURCE_CHANGED_DURING_BACKUP');
    if (rows.length !== 2) fail('SOURCE_RECORD_MISSING');
    const basic = rows.find(r => r.id === 1), premium = rows.find(r => r.id === 2601);
    const envelope = JSON.parse(premium.content);
    if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 1 || !envelope.content) fail('SOURCE_PREMIUM_ENVELOPE');
    const manifestText = await readFile(await inside(photosRoot, 'library-manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    if (manifest.version !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length > 10000) fail('SOURCE_MANIFEST');
    const records = {
      basic: { sourceId: 1, content: JSON.parse(basic.content), revision: null, updatedAt: basic.updated_at },
      'premium-polaroid': { sourceId: 2601, content: envelope.content, revision: envelope.revision, updatedAt: premium.updated_at },
    };
    const assets = [];
    const seen = new Set();
    await mkdir(path.join(outputDirectory, 'files'), { mode: 0o700 });
    async function preserve(file) {
      const evidence = await imageEvidence(file);
      const relative = `files/${evidence.sha256}.${evidence.extension}`;
      const target = path.join(outputDirectory, relative);
      try { await copyFile(file, target, 1); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      if (await digestFile(target) !== evidence.sha256) fail('COPY_HASH_MISMATCH');
      return { ...evidence, file: relative };
    }
    for (const asset of manifest.assets) {
      if (typeof asset.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(asset.id) || seen.has(asset.id)) fail('SOURCE_ASSET_ID');
      seen.add(asset.id);
      const variants = {};
      for (const name of ['thumbnail', 'card', 'full']) {
        const variant = asset.variants?.[name];
        if (typeof variant?.src !== 'string' || !variant.src.startsWith('/photos/library/')) fail('SOURCE_VARIANT_PATH');
        variants[name] = await preserve(await inside(photosRoot, variant.src.slice('/photos/'.length)));
        if (variants[name].bytes !== variant.bytes || variants[name].width !== variant.width || variants[name].height !== variant.height) fail('SOURCE_VARIANT_CHANGED');
      }
      assets.push({ sourceKey: `photo:${asset.id}`, provenance: 'legacy-derived-only', variants });
    }
    const qrIds = new Set(Object.values(records).flatMap(r => (r.content.social ?? []).map(s => s.qrAssetId).filter(Boolean)));
    for (const id of qrIds) {
      if (!/^[a-f0-9]{64}$/.test(id)) fail('SOURCE_PLATFORM_CARD_ID');
      const evidence = await preserve(await inside(qrRoot, `${id}.png`));
      if (evidence.sha256 !== id) fail('SOURCE_PLATFORM_CARD_CHANGED');
      assets.push({ sourceKey: `qr:${id}`, provenance: 'legacy-derived-only', variants: { thumbnail: evidence, card: evidence, full: evidence } });
    }
    // A mutable manifest changing during the copy invalidates this export.
    if (await readFile(await inside(photosRoot, 'library-manifest.json'), 'utf8') !== manifestText) fail('SOURCE_MANIFEST_CHANGED');
    const snapshot = { version: 1, records, rawRows: rows, manifest, assets, capturedAt: new Date().toISOString() };
    snapshot.fingerprint = snapshotFingerprint(snapshot);
    await writeFile(path.join(outputDirectory, 'snapshot.json'), JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
    return snapshot;
  } finally { db?.close(); source.close(); }
}

export function snapshotFingerprint(snapshot) {
  return jsonHash({ version: snapshot.version, records: snapshot.records, rawRows: snapshot.rawRows, manifest: snapshot.manifest, assets: snapshot.assets });
}

export async function verifyLegacySourceUnchanged({ snapshot, sqlitePath, photosRoot, qrRoot }) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    if (jsonHash(db.prepare('SELECT id,content,updated_at FROM site_settings WHERE id IN (1,2601) ORDER BY id').all()) !== jsonHash(snapshot.rawRows)) fail('SOURCE_RECORD_CHANGED');
  } finally { db.close(); }
  const manifest = JSON.parse(await readFile(await inside(photosRoot, 'library-manifest.json'), 'utf8'));
  if (jsonHash(manifest) !== jsonHash(snapshot.manifest)) fail('SOURCE_MANIFEST_CHANGED');
  for (const source of snapshot.assets) {
    if (source.sourceKey.startsWith('photo:')) {
      const item = manifest.assets.find(a => `photo:${a.id}` === source.sourceKey);
      if (!item) fail('SOURCE_REFERENCE_CHANGED');
      for (const name of ['thumbnail', 'card', 'full']) {
        const file = await inside(photosRoot, item.variants[name].src.slice('/photos/'.length));
        if (await digestFile(file) !== source.variants[name].sha256) fail('SOURCE_FILE_CHANGED');
      }
    } else if (source.sourceKey.startsWith('qr:')) {
      if (await digestFile(await inside(qrRoot, `${source.sourceKey.slice(3)}.png`)) !== source.variants.full.sha256) fail('SOURCE_CARD_CHANGED');
    } else fail('SOURCE_REFERENCE_CHANGED');
  }
  return true;
}

/** Dry-run is pure: it generates no target files or database writes. Persist the
 * returned plan once before apply; random IDs never derive from content hashes.
 */
export function planLegacyImport({ snapshot, siteId, siteSlug, previousPlan, approvedBasicOmissions }) {
  if (!UUID.test(siteId) || !/^[a-z][a-z0-9-]{2,31}$/.test(siteSlug)) fail('INVALID_TARGET');
  if (snapshot.version !== 1 || snapshot.fingerprint !== snapshotFingerprint(snapshot)) fail('SNAPSHOT_CHANGED');
  const omissions = [];
  if (approvedBasicOmissions !== undefined) {
    if (approvedBasicOmissions.sourceFingerprint !== snapshot.fingerprint || !Array.isArray(approvedBasicOmissions.workDigests) || !approvedBasicOmissions.workDigests.length || new Set(approvedBasicOmissions.workDigests).size !== approvedBasicOmissions.workDigests.length) fail('OMISSION_APPROVAL_MISMATCH');
    for (const digest of approvedBasicOmissions.workDigests) {
      const matches = snapshot.records.basic.content.works.flatMap((work, index) => jsonHash(work) === digest ? [{ index, work }] : []);
      if (matches.length !== 1 || matches[0].work.assetId || !/^\/photos\/photo-\d+-full\.webp$/.test(matches[0].work.image) || !/^\/photos\/photo-\d+-card\.webp$/.test(matches[0].work.preview)) fail('OMISSION_APPROVAL_MISMATCH');
      omissions.push({ digest, ...structuredClone(matches[0]), reason: 'USER_APPROVED_MISSING_LEGACY_BASIC_REFERENCE' });
    }
  }
  if (previousPlan) {
    if (previousPlan.siteId !== siteId || previousPlan.siteSlug !== siteSlug || previousPlan.sourceFingerprint !== snapshot.fingerprint || previousPlan.fingerprint !== planFingerprint(previousPlan) || jsonHash(previousPlan.approvedBasicOmissions ?? []) !== jsonHash(omissions)) fail('PLAN_CONFLICT');
    return structuredClone(previousPlan);
  }
  const mapping = {}, assets = [], byDigest = new Map();
  for (const source of snapshot.assets) {
    const digest = source.variants.original?.sha256 ?? source.variants.full.sha256;
    const existing = byDigest.get(digest);
    if (existing) {
      // Equal full bytes do not justify losing a different existing variant.
      if (jsonHash(existing.sourceVariants) !== jsonHash(source.variants)) fail('AMBIGUOUS_DUPLICATE_VARIANTS');
      mapping[source.sourceKey] = existing.id;
      continue;
    }
    const id = randomUUID(); mapping[source.sourceKey] = id;
    const variants = Object.fromEntries(Object.entries(source.variants).map(([name, v]) => [name, {
      key: `${siteId}/${id}/${name}.${v.extension}`, width: v.width, height: v.height, bytes: v.bytes, type: v.type,
    }]));
    const entry = { id, siteId, digest, originalType: source.variants.original?.type ?? source.variants.full.type, width: variants.full.width, height: variants.full.height, variants, sourceVariants: source.variants, provenance: source.provenance };
    assets.push(entry); byDigest.set(digest, entry);
  }
  const mapped = (id, kind = 'photo') => {
    if (!id) return id;
    return mapping[`${kind}:${id}`] ?? fail('UNRESOLVED_SOURCE_REFERENCE');
  };
  const contents = structuredClone(Object.fromEntries(Object.entries(snapshot.records).map(([space, value]) => [space, value.content])));
  const mapWork = work => {
    // Missing legacy asset identity is ambiguous; do not silently discard it.
    const id = mapped(work.assetId);
    if (!id) fail('WORK_WITHOUT_ASSET_ID');
    // Resolved URLs belong to the authorized asset DTO, not stored content.
    return { ...work, assetId: id, image: '', preview: '' };
  };
  const omittedIndexes = new Set(omissions.map(item => item.index));
  contents.basic.works = contents.basic.works.filter((_work, index) => !omittedIndexes.has(index)).map(mapWork);
  contents.basic.templateWorks = Object.fromEntries(Object.entries(contents.basic.templateWorks).map(([key, works]) => [key, works.map(mapWork)]));
  for (const collection of contents['premium-polaroid'].collections) {
    collection.assetIds = collection.assetIds.map(id => mapped(id));
    collection.coverAssetId = mapped(collection.coverAssetId);
    collection.focusAssetId = mapped(collection.focusAssetId);
  }
  for (const content of Object.values(contents)) for (const social of content.social) if (social.qrAssetId) social.qrAssetId = mapped(social.qrAssetId, 'qr');
  const plan = { version: 1, id: randomUUID(), siteId, siteSlug, sourceFingerprint: snapshot.fingerprint, mapping, assets, contents, approvedBasicOmissions: omissions,
    sourceEvidence: Object.fromEntries(Object.entries(snapshot.records).map(([space, r]) => [space, { sourceId: r.sourceId, revision: r.revision, updatedAt: r.updatedAt }])) };
  plan.fingerprint = planFingerprint(plan);
  return plan;
}
export async function verifyApprovedOmissionsMissing({ plan, photosRoot }) {
  for (const item of plan.approvedBasicOmissions ?? []) for (const src of [item.work.image, item.work.preview]) {
    if (!/^\/photos\/photo-\d+-(?:full|card)\.webp$/.test(src)) fail('OMISSION_SOURCE_PATH');
    try { await stat(path.join(photosRoot, src.slice('/photos/'.length))); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    fail('OMITTED_SOURCE_NOW_EXISTS');
  }
}
export function planFingerprint(plan) {
  const value = { ...plan }; delete value.fingerprint;
  return jsonHash(value);
}

function contentAssetIds(contents) {
  const ids = new Set();
  for (const [space, content] of Object.entries(contents)) {
    for (const social of content.social) if (social.qrAssetId) ids.add(social.qrAssetId);
    if (space === 'basic') {
      for (const work of [...content.works, ...Object.values(content.templateWorks).flat()]) ids.add(work.assetId);
    } else for (const collection of content.collections) {
      for (const id of collection.assetIds) ids.add(id);
      if (collection.coverAssetId) ids.add(collection.coverAssetId);
      if (collection.focusAssetId) ids.add(collection.focusAssetId);
    }
  }
  if ([...ids].some(id => !UUID.test(id))) fail('INVALID_CONTENT_ASSET_REFERENCE');
  return [...ids];
}

async function assertOwnedReferences(db, siteId, ids) {
  const found = await db.query('SELECT id FROM site_assets WHERE site_id=$1 AND id=ANY($2::uuid[])', [siteId, ids]);
  const owned = new Set(found.rows.map(row => row.id));
  if (ids.some(id => !owned.has(id))) fail('CONTENT_ASSET_NOT_OWNED');
}

/** Shared read-only dry-run/apply gate. No DB or filesystem writes. A verified
 * plan proves actual backup bytes, lossless parsing, identity, grant and scope,
 * not merely well-formed JSON. Apply repeats this inside its transaction.
 */
export async function preflightLegacyImport({ db, plan, snapshotRoot, validateContent, lockTarget = false }) {
  if (plan.fingerprint !== planFingerprint(plan) || !UUID.test(plan.siteId) || !UUID.test(plan.id) || typeof validateContent !== 'function' || Object.keys(plan.contents).sort().join() !== 'basic,premium-polaroid') fail('INVALID_IMPORT_PLAN');
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  const contents = {}, preparedIds = new Set();
  for (const [space, content] of Object.entries(plan.contents)) {
    contents[space] = await validateContent(space, content);
    if (jsonHash(canonical(contents[space])) !== jsonHash(canonical(content))) fail('LOSSY_CONTENT_ADAPTER');
  }
  for (const asset of plan.assets) {
    if (asset.siteId !== plan.siteId || !UUID.test(asset.id) || preparedIds.has(asset.id)) fail('ASSET_SCOPE_MISMATCH');
    preparedIds.add(asset.id);
    if (!['thumbnail', 'card', 'full'].every(name => asset.variants[name])) fail('INCOMPLETE_PREPARED_ASSET');
    for (const [name, variant] of Object.entries(asset.variants)) {
      if (!['original', 'thumbnail', 'card', 'full'].includes(name) || !variant.key.startsWith(`${plan.siteId}/${asset.id}/${name}.`)) fail('ASSET_KEY_SCOPE_MISMATCH');
      assetPath(snapshotRoot, variant.key); // Exact key grammar, including UUIDs.
      const evidence = asset.sourceVariants[name];
      if (!evidence || variant.bytes !== evidence.bytes || variant.width !== evidence.width || variant.height !== evidence.height || variant.type !== evidence.type) fail('PREPARED_VARIANT_MISMATCH');
      const file = await inside(snapshotRoot, evidence.file);
      if ((await stat(file)).size !== evidence.bytes || await digestFile(file) !== evidence.sha256) fail('SNAPSHOT_FILE_CHANGED');
    }
    if (asset.digest !== (asset.sourceVariants.original?.sha256 ?? asset.sourceVariants.full.sha256)) fail('PREPARED_DIGEST_MISMATCH');
  }
  const target = await db.query(`SELECT s.id FROM sites s JOIN portfolio_users p ON p.id=s.owner_id
    JOIN account_provisioning op ON op.id=p.provisioning_id WHERE s.id=$1 AND s.slug=$2 AND op.username=$2 AND op.completed_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM site_template_grants g WHERE g.site_id=s.id AND g.product='premium-polaroid')${lockTarget ? ' FOR UPDATE OF s' : ''}`, [plan.siteId, plan.siteSlug]);
  if (target.rowCount !== 1) fail('TARGET_IDENTITY_OR_GRANT_CONFLICT');
  const ids = contentAssetIds(contents);
  await assertOwnedReferences(db, plan.siteId, ids.filter(id => !preparedIds.has(id)));
  const existing = await db.query('SELECT space,revision,content FROM site_content_drafts WHERE site_id=$1', [plan.siteId]);
  const receipt = await db.query('SELECT fingerprint FROM site_legacy_imports WHERE site_id=$1 AND id=$2', [plan.siteId, plan.id]);
  if (receipt.rowCount) {
    if (receipt.rows[0].fingerprint !== plan.fingerprint) fail('IMPORT_RECEIPT_CONFLICT');
    await assertOwnedReferences(db, plan.siteId, ids);
    return { contents, ids, alreadyImported: true };
  }
  if (existing.rowCount) fail('TARGET_CONTENT_NOT_EMPTY');
  for (const asset of plan.assets) {
    const collision = await db.query('SELECT id FROM site_assets WHERE site_id=$1 AND (id=$2 OR digest=$3)', [plan.siteId, asset.id, asset.digest]);
    if (collision.rowCount) fail('TARGET_ASSET_CONFLICT');
  }
  return { contents, ids, alreadyImported: false };
}

/** Prepare complete, verified copies BEFORE making any references visible.
 * Files remain on transaction failure for an exact-plan retry. No recursive
 * cleanup is performed and sources are never deleted or recompressed.
 */
export async function applyLegacyImport({ pool, plan, snapshotRoot, privateRoot, validateContent, operatorMode = null }) {
  if (operatorMode !== null && !['complete', 'display-acceptance'].includes(operatorMode)) fail('INVALID_IMPORT_MODE');
  if (operatorMode !== null) assertLegacyOperatorApplyAllowed(legacyImportSourceGate(plan, operatorMode));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`legacy-import:${plan.siteId}`]);
    const { contents, ids, alreadyImported } = await preflightLegacyImport({ db: client, plan, snapshotRoot, validateContent, lockTarget: true });
    if (alreadyImported) {
      // Completion is historical; later edits are preserved, never reset.
      await client.query('COMMIT'); return { status: 'ALREADY_IMPORTED', mapping: plan.mapping };
    }
    await mkdir(privateRoot, { recursive: true, mode: 0o700 });
    const realRoot = await realpath(privateRoot);
    for (const asset of plan.assets) {
      for (const [name, variant] of Object.entries(asset.variants)) {
        const evidence = asset.sourceVariants[name];
        const from = await inside(snapshotRoot, evidence.file);
        if (await digestFile(from) !== evidence.sha256) fail('SNAPSHOT_FILE_CHANGED');
        const to = assetPath(realRoot, variant.key);
        await mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
        if (!(await realpath(path.dirname(to))).startsWith(`${realRoot}${path.sep}`)) fail('TARGET_ESCAPES_ROOT');
        const pending = `${to}.pending-${randomUUID()}`;
        try {
          await copyFile(from, pending, 1);
          if (await digestFile(pending) !== evidence.sha256) fail('SNAPSHOT_FILE_CHANGED');
          // Atomic no-clobber publish on the same filesystem. Interrupted copies
          // never occupy the final key; exact-plan retries reuse complete files.
          await link(pending, to);
        } catch (error) { if (error.code !== 'EEXIST') throw error; }
        finally { await rm(pending, { force: true }); }
        if (!(await realpath(to)).startsWith(`${realRoot}${path.sep}`) || await digestFile(to) !== evidence.sha256 || (await stat(to)).size !== evidence.bytes) fail('TARGET_FILE_CONFLICT');
      }
      const result = await insertPreparedAsset(client, asset);
      if (!result.created || result.row.id !== asset.id) fail('TARGET_ASSET_CONFLICT');
    }
    await assertOwnedReferences(client, plan.siteId, ids);
    for (const [space, content] of Object.entries(contents)) await client.query('INSERT INTO site_content_drafts(site_id,space,content,revision) VALUES($1,$2,$3::jsonb,1)', [plan.siteId, space, JSON.stringify(content)]);
    await client.query('INSERT INTO site_legacy_imports(id,site_id,fingerprint,evidence) VALUES($1,$2,$3,$4::jsonb)', [plan.id, plan.siteId, plan.fingerprint, JSON.stringify({ operatorMode, approvedBasicOmissions: plan.approvedBasicOmissions ?? [], sourceFingerprint: plan.sourceFingerprint, mapping: plan.mapping, sourceEvidence: plan.sourceEvidence, assets: plan.assets.map(a => ({ id: a.id, provenance: a.provenance, originalStatus: a.sourceVariants.original ? 'mapped' : 'unavailable/not-mapped', variants: a.sourceVariants })) })]);
    await client.query('COMMIT');
    return { status: 'IMPORTED', mapping: plan.mapping };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
