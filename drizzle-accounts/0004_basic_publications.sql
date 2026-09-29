-- Existing premium snapshots and their immutable trigger remain untouched.
ALTER TABLE site_publication_revisions DROP CONSTRAINT site_publication_revisions_space_check;
--> statement-breakpoint
ALTER TABLE site_publication_revisions ADD CONSTRAINT publication_known_space CHECK (space IN ('basic', 'premium-polaroid'));
