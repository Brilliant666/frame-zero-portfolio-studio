import { defineConfig } from "drizzle-kit";

// Generation is offline. Explicit migrations read their own runtime configuration.
export default defineConfig({
  out: "./drizzle-accounts",
  schema: "./db/accounts/schema.mjs",
  dialect: "postgresql",
});
