import { defineConfig } from "drizzle-kit";
import { readAccountConfig } from "./scripts/lib/account-config.mjs";

// Load the chosen ignored environment explicitly with Node --env-file.
const config = readAccountConfig();
export default defineConfig({
  out: "./drizzle-accounts",
  schema: "./db/accounts/schema.mjs",
  dialect: "postgresql",
  dbCredentials: { url: config.databaseUrl },
});
