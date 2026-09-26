import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, check, uniqueIndex } from 'drizzle-orm/pg-core';
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
}, table => [uniqueIndex('site_product_unique').on(table.siteId, table.product), check('known_template_product', sql`${table.product} = 'premium-polaroid'`), check('known_grant_source', sql`${table.source} = 'operator-test'`)]);
