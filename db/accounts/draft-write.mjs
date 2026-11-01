// Repeat owner, current account status, provisioning and grant checks in the
// write statement, after request parsing and any potentially slow body read.
const ownership = `EXISTS (SELECT 1 FROM sites s JOIN portfolio_users p ON p.id=s.owner_id
 JOIN "user" u ON u.id=p.auth_user_id AND u.banned IS NOT TRUE
 JOIN account_provisioning op ON op.id=p.provisioning_id AND op.completed_at IS NOT NULL
 WHERE s.id=$1::uuid AND p.auth_user_id=$3::uuid
 AND ($2='basic' OR EXISTS (SELECT 1 FROM site_template_grants g WHERE g.site_id=s.id AND g.product=$2)))`;

export { ownership as draftOwnership };

export function writeOwnedDraft(db, { siteId, space, userId, content, expectedRevision }) {
  const values = [siteId, space, userId, JSON.stringify(content)];
  return expectedRevision === 0
    ? db.query(`INSERT INTO site_content_drafts(site_id,space,content,revision)
        SELECT $1::uuid,$2,$4::jsonb,1 WHERE ${ownership}
        ON CONFLICT (site_id,space) DO NOTHING RETURNING content,revision,updated_at`, values)
    : db.query(`UPDATE site_content_drafts SET content=$4::jsonb,revision=revision+1,updated_at=now()
        WHERE site_id=$1::uuid AND space=$2 AND revision=$5 AND ${ownership}
        RETURNING content,revision,updated_at`, [...values, expectedRevision]);
}
