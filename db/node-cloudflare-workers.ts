/**
 * Standard Next.js Node compatibility adapter for the legacy Cloudflare
 * binding import. Stage B will provide the target PostgreSQL repository; this
 * Stage A lane must not pretend that a D1 database exists in Node.
 */
export const env: Readonly<Record<string, unknown>> = Object.freeze({});
