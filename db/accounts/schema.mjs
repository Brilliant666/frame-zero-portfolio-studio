import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, check, uniqueIndex, integer, jsonb, primaryKey, foreignKey } from 'drizzle-orm/pg-core';
import { user } from './auth-schema.mjs';
export * from './auth-schema.mjs';

export const provisioning = pgTable('account_provisioning', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  slug: text('slug').notNull().unique(),
  premium: boolean('premium').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [check('provisioning_username_normalized', sql`${table.username} = lower(${table.username})`), check('provisioning_email_normalized', sql`${table.email} = lower(${table.email})`)]);

export const portfolioUsers = pgTable('portfolio_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  authUserId: uuid('auth_user_id').notNull().unique().references(() => user.id),
  provisioningId: uuid('provisioning_id').notNull().unique().references(() => provisioning.id),
});
export const sites = pgTable('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  ownerId: uuid('owner_id').notNull().unique().references(() => portfolioUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [check('site_slug_normalized', sql`${table.slug} = lower(${table.slug})`)]);
export const templateGrants = pgTable('site_template_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  product: text('product').notNull(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('site_product_unique').on(table.siteId, table.product), check('known_template_product', sql`${table.product} IN ('premium-polaroid', 'premium-flow-gallery')`), check('known_grant_source', sql`${table.source} = 'operator-test'`)]);

export const contentDrafts = pgTable('site_content_drafts', {
  siteId: uuid('site_id').notNull().references(() => sites.id),
  space: text('space').notNull(),
  revision: integer('revision').notNull(),
  content: jsonb('content').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.siteId, table.space] }),
  check('known_content_space', sql`${table.space} IN ('basic', 'premium-polaroid', 'premium-flow-gallery')`),
  check('positive_draft_revision', sql`${table.revision} > 0`)]);

export const siteAssets = pgTable('site_assets', {
  id: uuid('id').primaryKey(), siteId: uuid('site_id').notNull().references(() => sites.id),
  digest: text('digest').notNull(), originalType: text('original_type').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(),
  variants: jsonb('variants').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('site_assets_site_digest_unique').on(table.siteId, table.digest),
  check('asset_digest_sha256', sql`${table.digest} ~ '^[a-f0-9]{64}$'`),
  check('asset_width_positive', sql`${table.width} > 0`), check('asset_height_positive', sql`${table.height} > 0`)]);

export const siteLegacyImports = pgTable('site_legacy_imports', {
  id: uuid('id').primaryKey(), siteId: uuid('site_id').notNull().references(() => sites.id),
  fingerprint: text('fingerprint').notNull(), evidence: jsonb('evidence').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('site_legacy_import_unique').on(table.siteId, table.fingerprint)]);

// SQL migration also enforces immutable rows and the composite Site/revision FK.
export const publicationRevisions = pgTable('site_publication_revisions', {
  id: uuid('id').defaultRandom().primaryKey(), siteId: uuid('site_id').notNull().references(() => sites.id),
  space: text('space').notNull(), draftRevision: integer('draft_revision').notNull(),
  content: jsonb('content').notNull(), assetIds: uuid('asset_ids').array().notNull(),
  publishedAt: timestamp('published_at', {withTimezone:true}).defaultNow().notNull(),
}, table => [uniqueIndex('publication_site_revision_unique').on(table.siteId,table.id),
  check('publication_known_space',sql`${table.space} IN ('basic', 'premium-polaroid', 'premium-flow-gallery')`),
  check('publication_positive_revision',sql`${table.draftRevision} > 0`)]);
export const publications = pgTable('site_publications', {
  siteId: uuid('site_id').primaryKey().references(() => sites.id),
  revisionId: uuid('revision_id').notNull(),
}, table => [foreignKey({columns:[table.siteId,table.revisionId],foreignColumns:[publicationRevisions.siteId,publicationRevisions.id]})]);
