-- Installing the retention policy changes no existing draft, snapshot or pointer.
-- Cleanup is an explicit operation or part of an authorized Publish/Rollback.
CREATE INDEX IF NOT EXISTS publication_history_site_order
 ON site_publication_revisions(site_id,space,published_at DESC,id DESC);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION publication_retention_candidates(target_site uuid)
RETURNS TABLE(revision_id uuid, duplicate_rank bigint, distinct_rank bigint) LANGUAGE sql STABLE AS $$
 WITH canonical AS (
   SELECT r.*,p.revision_id AS current_id,
     ARRAY(SELECT DISTINCT value FROM unnest(r.asset_ids) AS value ORDER BY value) AS asset_set
   FROM site_publication_revisions r LEFT JOIN site_publications p ON p.site_id=r.site_id
   WHERE r.site_id=target_site
 ), duplicates AS (
   SELECT c.*,row_number() OVER (
     PARTITION BY space,content,asset_set
     ORDER BY (id=current_id) DESC NULLS LAST,published_at DESC,id DESC
   ) AS duplicate_rank
   FROM canonical c
 ), distinct_versions AS (
   -- The protected current representative retains its original immutable time.
   -- A recent duplicate must not make that old representative look newly published.
   SELECT space,content,asset_set,row_number() OVER (PARTITION BY space ORDER BY published_at DESC,id DESC) AS distinct_rank
   FROM duplicates WHERE duplicate_rank=1
 )
 SELECT d.id,d.duplicate_rank,v.distinct_rank FROM duplicates d JOIN distinct_versions v USING(space,content,asset_set)
 WHERE d.id IS DISTINCT FROM d.current_id AND (d.duplicate_rank>1 OR v.distinct_rank>10);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_publication_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND current_setting('portfolio.publication_retention_site',true)=OLD.site_id::text THEN
   PERFORM id FROM sites WHERE id=OLD.site_id FOR UPDATE;
   IF NOT EXISTS (SELECT 1 FROM site_publications WHERE site_id=OLD.site_id AND revision_id=OLD.id)
      AND EXISTS (SELECT 1 FROM publication_retention_candidates(OLD.site_id) WHERE revision_id=OLD.id)
   THEN RETURN OLD;
   END IF;
 END IF;
 RAISE EXCEPTION 'Publication revisions are immutable outside bounded history retention';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prune_site_publication_history(target_site uuid, target_space text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE previous_scope text; removed integer; duplicates_removed integer;
BEGIN
 -- Serialize with normal Publish/Rollback and re-evaluate eligibility in SQL.
 PERFORM id FROM sites WHERE id=target_site FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 previous_scope := current_setting('portfolio.publication_retention_site',true);
 PERFORM set_config('portfolio.publication_retention_site',target_site::text,true);
 -- Remove old groups first, then duplicates; the chosen representatives and
 -- their immutable timestamps remain stable during both operations.
 DELETE FROM site_publication_revisions
 WHERE site_id=target_site AND (target_space IS NULL OR space=target_space)
 AND id IN (SELECT revision_id FROM publication_retention_candidates(target_site) WHERE distinct_rank>10);
 GET DIAGNOSTICS removed = ROW_COUNT;
 DELETE FROM site_publication_revisions
 WHERE site_id=target_site AND (target_space IS NULL OR space=target_space)
 AND id IN (SELECT revision_id FROM publication_retention_candidates(target_site) WHERE duplicate_rank>1);
 GET DIAGNOSTICS duplicates_removed = ROW_COUNT;
 PERFORM set_config('portfolio.publication_retention_site',coalesce(previous_scope,''),true);
 RETURN removed+duplicates_removed;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('portfolio.publication_retention_site',coalesce(previous_scope,''),true);
 RAISE;
END;
$$;
