CREATE TABLE site_publication_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL REFERENCES sites(id),
 space text NOT NULL CHECK(space = 'premium-polaroid'),
 draft_revision integer NOT NULL CHECK(draft_revision > 0),
 content jsonb NOT NULL,
 asset_ids uuid[] NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,id)
);
--> statement-breakpoint
CREATE TABLE site_publications (
 site_id uuid PRIMARY KEY REFERENCES sites(id),
 revision_id uuid NOT NULL,
 FOREIGN KEY(site_id,revision_id) REFERENCES site_publication_revisions(site_id,id)
);
--> statement-breakpoint
CREATE FUNCTION protect_publication_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Publication revisions are immutable'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_publication_revision BEFORE UPDATE OR DELETE ON site_publication_revisions
 FOR EACH ROW EXECUTE FUNCTION protect_publication_revision();
