CREATE TABLE "site_content_drafts" (
	"site_id" uuid NOT NULL,
	"space" text NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_content_drafts_site_id_space_pk" PRIMARY KEY("site_id","space"),
	CONSTRAINT "known_content_space" CHECK ("site_content_drafts"."space" IN ('basic', 'premium-polaroid')),
	CONSTRAINT "positive_draft_revision" CHECK ("site_content_drafts"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "site_content_drafts" ADD CONSTRAINT "site_content_drafts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;