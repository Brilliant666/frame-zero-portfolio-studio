import type { NextConfig } from "next";

const isStandardNodeBuild =
  process.env.FRAME_ZERO_NEXT_NODE_PARITY_BUILD === "1";

const nextConfig: NextConfig = isStandardNodeBuild
  ? {
      output: "standalone",
      turbopack: {
        resolveAlias: {
          // Stage B owns the PostgreSQL repository. Until then, the Standard
          // Next.js Node artifact must fail closed instead of pretending a D1
          // binding exists. The vinext lane receives its real Worker binding.
          "cloudflare:workers": "./db/node-cloudflare-workers.ts",
        },
      },
    }
  : {};

export default nextConfig;
