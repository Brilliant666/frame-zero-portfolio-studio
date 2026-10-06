import { eq } from "drizzle-orm";
import { getDb, getLegacyD1Database } from "../../../db";
import { siteSettings } from "../../../db/schema";
import { normalizeSiteContent, siteConfig } from "../../site-config";

export const dynamic = "force-dynamic";

const SETTINGS_ID = 1;

async function ensureTable() {
  await getLegacyD1Database().prepare(
    "CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  ).run();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET() {
  try {
    await ensureTable();
    const db = getDb();
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.id, SETTINGS_ID)).limit(1);

    if (!row) return Response.json({ content: siteConfig, updatedAt: null });

    return Response.json({ content: normalizeSiteContent(JSON.parse(row.content)), updatedAt: row.updatedAt });
  } catch (error) {
    return Response.json({ content: siteConfig, updatedAt: null, warning: errorMessage(error) });
  }
}

export async function PUT() {
  // Global D1 content is a read-only legacy source. URL and identity headers
  // cannot authorize a write; current Site editors use their scoped API.
  return Response.json(
    { code: "LEGACY_WRITE_DISABLED", error: "旧版全局内容写入已停用，请使用本站后台保存。" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
