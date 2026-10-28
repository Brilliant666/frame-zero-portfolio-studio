export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.FRAME_ZERO_PRODUCTION_SITE !== undefined) {
    const { readAccountConfig } = await import("./scripts/lib/account-config.mjs");
    // Fail startup for missing or conflicting configuration. This deliberately
    // does not connect, migrate, provision, import, or create the asset root.
    readAccountConfig();
  }
}
