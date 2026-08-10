import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";

import { createAuthPocBaseOptions } from "./auth-options";
import * as schema from "./schema.generated";

export type CreateAuthPocInput = {
  database: AnyD1Database;
  baseURL: string;
  secret: string;
  trustedOrigins: readonly [string, ...string[]];
};

/**
 * Creates the isolated auth instance used by both the workerd route and the
 * server-side provisioning harness. The D1 binding is injected deliberately;
 * this module never reaches into the production `DB` binding.
 */
export function createAuthPoc(input: CreateAuthPocInput) {
  const database = drizzle(input.database, { schema });

  return betterAuth({
    ...createAuthPocBaseOptions({
      baseURL: input.baseURL,
      secret: input.secret,
      trustedOrigins: input.trustedOrigins,
    }),
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema,
    }),
  });
}
