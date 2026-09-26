/**
 * Standard Next.js Node compatibility adapter for the legacy Cloudflare
 * binding import. Stage B will provide the target PostgreSQL repository; this
 * Stage A lane must not pretend that a D1 database exists in Node.
 */
const localPreview = process.env.NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW === "1"
  && process.env.FRAME_ZERO_LOCAL_PREVIEW_SERVER === "1";
// No D1 adapter or data binding is enabled. Only the explicitly local build's
// loopback runner can prove preview requests using its per-process random token.
export const env: Readonly<Record<string, unknown>> = Object.freeze(localPreview ? {
  FRAME_ZERO_PREVIEW_WORKSPACE_SECRET: process.env.FRAME_ZERO_PREVIEW_WORKSPACE_SECRET,
  FRAME_ZERO_LOCAL_PREVIEW_ORIGIN: process.env.FRAME_ZERO_LOCAL_PREVIEW_ORIGIN,
} : {});
