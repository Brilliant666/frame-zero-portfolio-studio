import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./research/better-auth-cloudflare-poc/drizzle",
  schema: "./research/better-auth-cloudflare-poc/schema.generated.ts",
  dialect: "sqlite",
});
