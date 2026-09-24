import vinext from "vinext";
import { defineConfig, type ViteDevServer } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import { randomBytes } from "node:crypto";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
const LOCAL_PHOTO_IMPORT_ORIGIN_ENV =
  "FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function getLocalPhotoImportWorkerOrigin(
  command: "build" | "serve",
  isPreview: boolean | undefined,
) {
  if (command !== "serve" || isPreview === true) return null;
  const value = process.env[LOCAL_PHOTO_IMPORT_ORIGIN_ENV];
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(value ?? "");
  return match && Number(match[1]) <= 65_535 ? value : null;
}

export default defineConfig(async ({ command, isPreview }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const localPhotoImportOrigin = getLocalPhotoImportWorkerOrigin(command, isPreview);
  const previewWorkspaceSecret = command === "serve" && !isPreview && process.env.FRAME_ZERO_PREVIEW_WORKSPACE_ENABLED === "1"
    ? randomBytes(32).toString("hex") : null;

  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: "site-creator-d1",
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
    // Cloudflare's development RSC runs in workerd. Forward only this
    // non-secret loopback origin; production builds never receive it.
  };

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      {
        name: "local-preview-workspace-proof",
        enforce: "pre",
        configureServer(server: ViteDevServer) {
          server.middlewares.use((request, response, next) => {
            delete request.headers["x-frame-zero-preview-proof"];
            delete request.headers["x-frame-zero-preview-origin"];
            // Cloudflare's Fetch adapter consumes rawHeaders, not headers.
            request.rawHeaders = request.rawHeaders.filter((_, index, raw) => !["x-frame-zero-preview-proof", "x-frame-zero-preview-origin"].includes(raw[index - index % 2].toLowerCase()));
            const remote = request.socket.remoteAddress;
            const host = request.headers.host ?? "";
            if (previewWorkspaceSecret && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote ?? "") && /^(127\.0\.0\.1|localhost|\[::1\]):3001$/.test(host)) {
              request.headers["x-frame-zero-preview-proof"] = previewWorkspaceSecret;
              request.headers["x-frame-zero-preview-origin"] = `http://${host}`;
              request.rawHeaders.push("x-frame-zero-preview-proof", previewWorkspaceSecret, "x-frame-zero-preview-origin", `http://${host}`);
            }
            if (/^\/(?:preview(?:\/|\?|$)|api\/preview(?:\/|\?|$))/.test(request.url ?? "")) response.setHeader("Cache-Control", "no-store, private");
            next();
          });
        },
      },
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: (resolvedConfig) => ({
          ...localBindingConfig,
          ...(localPhotoImportOrigin || previewWorkspaceSecret
            ? {
                vars: {
                  ...resolvedConfig.vars,
                  ...(localPhotoImportOrigin ? { [LOCAL_PHOTO_IMPORT_ORIGIN_ENV]: localPhotoImportOrigin } : {}),
                  ...(previewWorkspaceSecret ? { FRAME_ZERO_PREVIEW_WORKSPACE_SECRET: previewWorkspaceSecret } : {}),
                },
              }
            : {}),
        }),
      }),
    ],
  };
});
