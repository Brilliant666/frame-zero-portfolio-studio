import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeOwnedDraft } from '../db/accounts/draft-write.mjs';
import { insertOwnedPreparedAsset, insertPreparedAsset, uploadAsset } from '../db/accounts/assets.mjs';
import { readSiteForPrincipal } from '../db/accounts/http.mjs';

// Runs in the dedicated PostgreSQL suite, after migrations and before HTTP startup.
export async function siteWriteAuthorizationIntegration({ runtime }) {
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
  const userId = randomUUID(), ownerId = randomUUID(), siteId = randomUUID(), operationId = randomUUID();
  const slug = `write${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await runtime.pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [userId, slug, `${slug}@example.invalid`]);
  await runtime.pool.query('INSERT INTO account_provisioning(id,username,email,slug,completed_at) VALUES($1,$2,$3,$2,now())', [operationId, slug, `${slug}@example.invalid`]);
  await runtime.pool.query('INSERT INTO portfolio_users(id,auth_user_id,provisioning_id) VALUES($1,$2,$3)', [ownerId, userId, operationId]);
  await runtime.pool.query('INSERT INTO sites(id,slug,owner_id) VALUES($1,$2,$3)', [siteId, slug, ownerId]);
  const content = { profile: { photographer: 'Before ban' }, works: [] };
  const write = (expectedRevision, value = content, actor = userId) => writeOwnedDraft(runtime.pool, { siteId, userId: actor, space: 'basic', content: value, expectedRevision });
  const asset = { id: randomUUID(), siteId, digest: 'a'.repeat(64), originalType: 'image/png', width: 1, height: 1, variants: {} };
  try {
    // Authorize first, then commit the ban before running the exact INSERT used
    // by the handler. A pre-request denial alone would not exercise this check.
    const principal = { id: userId, banned: false };
    assert.ok(await readSiteForPrincipal(runtime, principal, null, slug));
    await runtime.pool.query('UPDATE "user" SET banned=true WHERE id=$1', [userId]);
    assert.equal((await write(0)).rowCount, 0, 'Ban after authorization blocks first draft creation');
    await assert.rejects(insertOwnedPreparedAsset(runtime.pool, asset, userId), error => error.status === 403);
    await runtime.pool.query('UPDATE "user" SET banned=false WHERE id=$1', [userId]);
    assert.equal((await write(0)).rowCount, 1);
    assert.equal((await insertOwnedPreparedAsset(runtime.pool, asset, userId)).created, true);
    assert.ok(await readSiteForPrincipal(runtime, principal, null, slug));
    await runtime.pool.query('UPDATE "user" SET banned=true WHERE id=$1', [userId]);
    assert.equal((await write(1, { ...content, profile: { photographer: 'Must not persist' } })).rowCount, 0, 'Ban after authorization blocks existing draft update');
    await assert.rejects(insertOwnedPreparedAsset(runtime.pool, { ...asset, id: randomUUID() }, userId), error => error.status === 403);
    // Deduplication must also recheck the account before returning an existing asset.
    await assert.rejects(uploadAsset(new Request('http://fixture', { method: 'POST', headers: { 'content-type': 'image/png', 'x-file-name': 'fixture.png' }, body: 'fixture' }), runtime.pool, siteId, { userId }), error => error.status === 403);
    const saved = (await runtime.pool.query("SELECT content,revision FROM site_content_drafts WHERE site_id=$1 AND space='basic'", [siteId])).rows[0];
    assert.equal(saved.revision, 1); assert.deepEqual(saved.content, content);
    await runtime.pool.query('UPDATE "user" SET banned=false WHERE id=$1', [userId]);
    assert.equal((await write(1, content, randomUUID())).rowCount, 0, 'Foreign principal cannot write');
    await assert.rejects(insertOwnedPreparedAsset(runtime.pool, { ...asset, digest: 'b'.repeat(64) }, randomUUID()), error => error.status === 403);
    assert.equal((await write(1)).rows[0].revision, 2);
    assert.equal((await insertOwnedPreparedAsset(runtime.pool, { ...asset, id: randomUUID() }, userId)).created, false);
    await runtime.pool.query('UPDATE account_provisioning SET completed_at=NULL WHERE id=$1', [operationId]);
    assert.equal((await write(2)).rowCount, 0);
    await assert.rejects(insertOwnedPreparedAsset(runtime.pool, asset, userId), error => error.status === 403);
    await runtime.pool.query('UPDATE account_provisioning SET completed_at=now() WHERE id=$1', [operationId]);
    const holder = await runtime.pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('UPDATE "user" SET banned=true WHERE id=$1', [userId]);
      const pending = insertOwnedPreparedAsset(runtime.pool, { ...asset, id: randomUUID(), digest: 'd'.repeat(64) }, userId);
      // Attach the rejection assertion before releasing the conflicting row lock.
      const denied = assert.rejects(pending, error => error.status === 403);
      await holder.query('COMMIT');
      await denied;
    } finally { await holder.query('ROLLBACK'); holder.release(); }
    // An explicit, separately authorized operator import retains its existing API.
    assert.equal((await insertPreparedAsset(runtime.pool, { ...asset, id: randomUUID(), digest: 'c'.repeat(64) })).created, true);
  } finally {
    await runtime.pool.query('DELETE FROM site_assets WHERE site_id=$1', [siteId]);
    await runtime.pool.query('DELETE FROM site_content_drafts WHERE site_id=$1', [siteId]);
    await runtime.pool.query('DELETE FROM sites WHERE id=$1', [siteId]);
    await runtime.pool.query('DELETE FROM portfolio_users WHERE id=$1', [ownerId]);
    await runtime.pool.query('DELETE FROM "user" WHERE id=$1', [userId]);
    await runtime.pool.query('DELETE FROM account_provisioning WHERE id=$1', [operationId]);
  }
}
