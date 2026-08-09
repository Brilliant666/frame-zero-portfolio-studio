import "server-only";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { siteSettings } from "../db/schema";
import { normalizeSiteContent, siteConfig, type SiteContent } from "./site-config";

export const SITE_SETTINGS_ID = 1;

export type SiteContentReadResult = Readonly<{
  content: SiteContent;
  updatedAt: string | null;
  warning?: string;
}>;

export async function ensureSiteSettingsTable() {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  ).run();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

/**
 * Reads the single legacy SiteContent record without mutating it.
 *
 * The demo configuration remains the compatibility fallback for an empty or
 * unavailable database, matching the public API's existing behavior.
 */
export async function readSiteContent(): Promise<SiteContentReadResult> {
  try {
    await ensureSiteSettingsTable();
    const db = getDb();
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, SITE_SETTINGS_ID))
      .limit(1);

    if (!row) return { content: siteConfig, updatedAt: null };

    return {
      content: normalizeSiteContent(JSON.parse(row.content)),
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    return {
      content: siteConfig,
      updatedAt: null,
      warning: errorMessage(error),
    };
  }
}
