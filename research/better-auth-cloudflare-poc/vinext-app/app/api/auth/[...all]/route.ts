import { env } from "cloudflare:workers";
import type { AnyD1Database } from "drizzle-orm/d1";

import { createAuthPoc } from "../../../../../auth";
import { createAuthPocHttpHandler } from "../../../../../http-handler";
import { parseAuthPocTrustedOrigins } from "../../../../../origin-policy";

type AuthPocRuntimeEnv = {
  AUTH_POC_DB: AnyD1Database;
  AUTH_POC_BASE_URL: string;
  AUTH_POC_SECRET: string;
  AUTH_POC_TRUSTED_ORIGINS: string;
};

const runtimeEnv = env as unknown as AuthPocRuntimeEnv;
const trustedOrigins = parseAuthPocTrustedOrigins(
  runtimeEnv.AUTH_POC_TRUSTED_ORIGINS,
  runtimeEnv.AUTH_POC_BASE_URL,
);
const [baseURL] = trustedOrigins;

if (runtimeEnv.AUTH_POC_SECRET.length < 32) {
  throw new Error("AUTH_POC_SECRET must contain at least 32 characters.");
}

const auth = createAuthPoc({
  database: runtimeEnv.AUTH_POC_DB,
  baseURL,
  secret: runtimeEnv.AUTH_POC_SECRET,
  trustedOrigins,
});

const handler = createAuthPocHttpHandler({
  handler: auth.handler,
  trustedOrigins,
});

export const DELETE = handler;
export const GET = handler;
export const PATCH = handler;
export const POST = handler;
export const PUT = handler;
