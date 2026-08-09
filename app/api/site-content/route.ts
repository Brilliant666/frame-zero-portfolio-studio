import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { siteSettings } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureSiteSettingsTable, readSiteContent, SITE_SETTINGS_ID } from "../../site-content-read";
import { normalizeSiteContent } from "../../site-config";

export const dynamic = "force-dynamic";

const MAX_CONTENT_BYTES = 256_000;

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

async function canWrite(request: Request) {
  if (isLocalRequest(request)) return true;
  return Boolean(await getChatGPTUser());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET() {
  return Response.json(await readSiteContent());
}

export async function PUT(request: Request) {
  if (!(await canWrite(request))) {
    return Response.json({ error: "请先登录后再保存后台内容。" }, { status: 401 });
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_CONTENT_BYTES) {
      return Response.json({ error: "内容超过 256 KB 限制。" }, { status: 413 });
    }

    const payload = JSON.parse(raw) as { content?: unknown };
    const content = normalizeSiteContent(payload.content);
    const serialized = JSON.stringify(content);

    await ensureSiteSettingsTable();
    const db = getDb();
    await db
      .insert(siteSettings)
      .values({ id: SITE_SETTINGS_ID, content: serialized })
      .onConflictDoUpdate({
        target: siteSettings.id,
        set: { content: serialized, updatedAt: sql`CURRENT_TIMESTAMP` },
      });

    const [saved] = await db.select().from(siteSettings).where(eq(siteSettings.id, SITE_SETTINGS_ID)).limit(1);
    return Response.json({ content, updatedAt: saved?.updatedAt ?? null });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}
