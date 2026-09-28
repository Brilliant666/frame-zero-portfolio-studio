CREATE TABLE site_assets (
 id uuid PRIMARY KEY,
 site_id uuid NOT NULL REFERENCES sites(id),
 digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
 original_type text NOT NULL,
 width integer NOT NULL CHECK (width > 0),
 height integer NOT NULL CHECK (height > 0),
 variants jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,digest)
);
--> statement-breakpoint
CREATE TABLE site_legacy_imports (
 id uuid PRIMARY KEY,
 site_id uuid NOT NULL REFERENCES sites(id),
 fingerprint text NOT NULL,
 evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,fingerprint)
);
