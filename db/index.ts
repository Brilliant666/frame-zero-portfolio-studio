import { env } from "cloudflare:workers";
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getLegacyD1Database(): AnyD1Database {
  const database = env.DB as AnyD1Database | undefined;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return database;
}

export function getDb() {
  return drizzle(getLegacyD1Database(), { schema });
}
