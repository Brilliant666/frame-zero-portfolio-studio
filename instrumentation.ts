export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.FRAME_ZERO_PRODUCTION_SITE !== undefined) {
    try {
      const { readAccountConfig } = await import("./scripts/lib/account-config.mjs");
      // This deliberately does not connect, migrate, provision, import, or
      // create the asset root.
      readAccountConfig();
    } catch {
      // Next catches prepare/register rejections while its listener remains
      // open. Invalid production configuration must instead terminate PID 1.
      // Synchronous fixed-code logging cannot truncate or expose config values.
      try {
        const { writeSync } = await import("node:fs");
        writeSync(2, "PRODUCTION_SITE_CONFIGURATION_INVALID\n");
      } finally {
        process.exit(1);
      }
    }
  }
}
