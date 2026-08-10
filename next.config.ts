import type { NextConfig } from "next";

const isStandardNodeParityBuild =
  process.env.FRAME_ZERO_NEXT_NODE_PARITY_BUILD === "1";

const nextConfig: NextConfig = isStandardNodeParityBuild
  ? {
      output: "standalone",
      turbopack: {
        resolveAlias: {
          // Stage A keeps the existing Cloudflare/D1 lane as a rollback
          // reference. Only the explicit Node parity build receives this
          // fail-closed workerd compatibility adapter.
          "cloudflare:workers": "./db/node-cloudflare-workers.ts",
        },
      },
    }
  : {};

export default nextConfig;
