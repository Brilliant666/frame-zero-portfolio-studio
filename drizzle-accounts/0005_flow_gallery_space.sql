-- Widen only the known products/spaces. No grants, drafts, immutable snapshots,
-- resource ownership or the single Published pointer are changed by this migration.
-- Drizzle applies the journal entry once in its migration transaction; repeating
-- this SQL also leaves the same constraints in place without duplicating rows.
ALTER TABLE site_template_grants DROP CONSTRAINT IF EXISTS known_template_product;
--> statement-breakpoint
ALTER TABLE site_template_grants ADD CONSTRAINT known_template_product CHECK (product IN ('premium-polaroid', 'premium-flow-gallery'));
--> statement-breakpoint
ALTER TABLE site_content_drafts DROP CONSTRAINT IF EXISTS known_content_space;
--> statement-breakpoint
ALTER TABLE site_content_drafts ADD CONSTRAINT known_content_space CHECK (space IN ('basic', 'premium-polaroid', 'premium-flow-gallery'));
--> statement-breakpoint
ALTER TABLE site_publication_revisions DROP CONSTRAINT IF EXISTS publication_known_space;
--> statement-breakpoint
ALTER TABLE site_publication_revisions ADD CONSTRAINT publication_known_space CHECK (space IN ('basic', 'premium-polaroid', 'premium-flow-gallery'));
