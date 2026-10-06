import { readAssetVariant } from './assets.mjs';
export class PublicationError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
const publicationSpaces = new Set(['basic', 'premium-polaroid', 'premium-flow-gallery']);
const summary = row => ({ id: row.id, space: row.space, templateId: row.space === 'basic' ? row.content.activeTemplate : row.space, draftRevision: row.draft_revision, publishedAt: row.published_at });
async function validateAssets(client,siteId,ids) {
  const assets=await client.query('SELECT * FROM site_assets WHERE site_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[siteId,ids]);
  if(assets.rowCount!==ids.length)throw new PublicationError('发布资源不存在或不属于本站',422);
  try { for(const row of assets.rows)for(const variant of ['thumbnail','card','full'])await readAssetVariant(row,variant); }
  catch {throw new PublicationError('发布所需的展示图片不可读，未改变公开版本',422);}
}
export async function publicationHistory(pool, siteId, options = /** @type {{authorizedSpaces?: string[], allowedSpaces?: string[], allowPremium?: boolean}} */ ({})) {
  const { authorizedSpaces, allowedSpaces, allowPremium = false } = options;
  // The old boolean grants only the old product; adding a premium template must
  // never broaden that existing authorization into access to all premium spaces.
  const explicit = authorizedSpaces ?? allowedSpaces;
  const permitted = new Set(['basic']);
  if (explicit !== undefined) {
    for (const space of explicit) if (publicationSpaces.has(space)) permitted.add(space);
  } else if (allowPremium) permitted.add('premium-polaroid');
  // Recheck grants in the same database snapshot as the history read. A grant
  // revoked after page/request authorization cannot expose that product's history.
  // Keep the current Published summary available even when its grant was revoked.
  const grant = `(r.space='basic' OR EXISTS (SELECT 1 FROM site_template_grants g WHERE g.site_id=r.site_id AND g.product=r.space))`;
  const rows = await pool.query(`SELECT r.*,p.revision_id AS current_id,${grant} AS has_current_grant FROM site_publication_revisions r
    LEFT JOIN site_publications p ON p.site_id=r.site_id WHERE r.site_id=$1
    AND (r.id=p.revision_id OR (r.space=ANY($2::text[]) AND ${grant}))
    ORDER BY r.published_at DESC,r.id DESC`, [siteId, [...permitted]]);
  return { current: rows.rows.find(r => r.id === r.current_id) ? summary(rows.rows.find(r => r.id === r.current_id)) : null, history: rows.rows.filter(row => permitted.has(row.space) && row.has_current_grant === true).map(summary) };
}
export async function readPublished(pool, slug) {
  const result = await pool.query(`SELECT r.*,s.slug FROM sites s JOIN site_publications p ON p.site_id=s.id
    JOIN site_publication_revisions r ON r.site_id=s.id AND r.id=p.revision_id WHERE s.slug=$1`, [slug]);
  const r = result.rows[0];
  return r ? { ...summary(r), siteId:r.site_id, slug:r.slug, content:r.content, assetIds:r.asset_ids } : null;
}
export async function readPublishedAssets(pool, snapshot) {
  const result = await pool.query('SELECT * FROM site_assets WHERE site_id=$1 AND id=ANY($2::uuid[])', [snapshot.siteId,snapshot.assetIds]);
  return result.rows;
}
// Lock the Site, ownership/grant and draft for the complete publication operation.
// Competing Publish/Rollback requests serialize; expected pointer prevents lost intent.
export async function changePublication(pool, {siteId,userId,space,payload,prepare}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!publicationSpaces.has(space)) throw new PublicationError('内容空间不可发布',422);
    if (!['publish', 'rollback'].includes(payload.action)) throw new PublicationError('发布操作无效',400);
    const owner = await client.query(`SELECT s.id FROM sites s JOIN portfolio_users u ON u.id=s.owner_id
      JOIN account_provisioning op ON op.id=u.provisioning_id AND op.completed_at IS NOT NULL
      WHERE s.id=$1 AND u.auth_user_id=$2 FOR UPDATE OF s FOR SHARE OF u,op`, [siteId,userId]);
    if (!owner.rowCount) throw new PublicationError('站点授权已变化',403);
    if (space !== 'basic') {
      const grant = await client.query('SELECT id FROM site_template_grants WHERE site_id=$1 AND product=$2 FOR SHARE', [siteId,space]);
      if (!grant.rowCount) throw new PublicationError('高级授权已变化',403);
    }
    const pointer = await client.query('SELECT revision_id FROM site_publications WHERE site_id=$1',[siteId]);
    if ((pointer.rows[0]?.revision_id ?? null) !== payload.expectedPublicationId) throw new PublicationError('发布状态已变化，请重新读取后确认');
    let row;
    if (payload.action === 'publish') {
      const draft = await client.query('SELECT * FROM site_content_drafts WHERE site_id=$1 AND space=$2 FOR UPDATE',[siteId,space]);
      if (!draft.rowCount || draft.rows[0].revision !== payload.expectedDraftRevision) throw new PublicationError('草稿版本已变化，请先保存并重新读取');
      let prepared;
      try { prepared=prepare(draft.rows[0].content); }catch{throw new PublicationError('草稿结构不合法，未发布',422);}
      const {content,assetIds}=prepared;
      await validateAssets(client,siteId,assetIds);
      const inserted = await client.query(`INSERT INTO site_publication_revisions(site_id,space,draft_revision,content,asset_ids)
        VALUES($1,$2,$3,$4::jsonb,$5::uuid[]) RETURNING *`,[siteId,space,draft.rows[0].revision,JSON.stringify(content),assetIds]);
      row = inserted.rows[0];
    } else {
      const target = await client.query('SELECT * FROM site_publication_revisions WHERE site_id=$1 AND space=$2 AND id=$3',[siteId,space,payload.revisionId]);
      if (!target.rowCount) throw new PublicationError('历史版本不存在',404);
      row=target.rows[0];
      await validateAssets(client,siteId,row.asset_ids);
    }
    await client.query(`INSERT INTO site_publications(site_id,revision_id) VALUES($1,$2)
      ON CONFLICT(site_id) DO UPDATE SET revision_id=EXCLUDED.revision_id`,[siteId,row.id]);
    await client.query('COMMIT');
    return summary(row);
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
