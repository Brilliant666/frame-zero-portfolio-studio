import handler from "vinext/server/app-router-entry";
import type { AnyD1Database } from "drizzle-orm/d1";

import { AUTH_POC_HOSTED_ORIGIN } from "../auth-options";
import { createAuthPoc } from "../auth";
import { createAuthPocHttpHandler } from "../http-handler";
import { provisionAuthUser } from "../portfolio-adapter";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface WorkerEnvironment {
  AUTH_POC_BASE_URL?: string;
  AUTH_POC_DB: AnyD1Database;
  AUTH_POC_HARNESS_TOKEN?: string;
  AUTH_POC_SECRET?: string;
  ASSETS?: {
    fetch(request: Request): Promise<Response> | Response;
  };
}

const ALLOWED_SYNTHETIC_USERS = new Set(["alice", "operator", "star"]);

function isHarnessRuntimeEnabled(
  request: Request,
  environment: WorkerEnvironment,
): environment is WorkerEnvironment & {
  AUTH_POC_BASE_URL: string;
  AUTH_POC_HARNESS_TOKEN: string;
  AUTH_POC_SECRET: string;
} {
  if (
    !environment.AUTH_POC_BASE_URL ||
    !environment.AUTH_POC_HARNESS_TOKEN ||
    environment.AUTH_POC_HARNESS_TOKEN.length < 32 ||
    !environment.AUTH_POC_SECRET ||
    environment.AUTH_POC_SECRET.length < 32
  ) {
    return false;
  }

  try {
    const configuredOrigin = new URL(environment.AUTH_POC_BASE_URL);
    return (
      configuredOrigin.origin === environment.AUTH_POC_BASE_URL &&
      configuredOrigin.protocol === "http:" &&
      configuredOrigin.hostname === "127.0.0.1" &&
      configuredOrigin.port !== "" &&
      new URL(request.url).origin === configuredOrigin.origin
    );
  } catch {
    return false;
  }
}

function safeJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function hasHarnessAuthorization(
  request: Request,
  expectedToken: string,
) {
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const encoder = new TextEncoder();
  const [suppliedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(suppliedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
  ]);
  const left = new Uint8Array(suppliedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function readSmallJson(request: Request) {
  const text = await request.text();
  if (text.length === 0 || text.length > 8_192) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isProvisionInput(value: unknown): value is {
  email: string;
  password: string;
  role: "admin" | "user";
  username: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.username === "string" &&
    ALLOWED_SYNTHETIC_USERS.has(input.username) &&
    typeof input.email === "string" &&
    input.email === `${input.username}@auth-poc.example` &&
    typeof input.password === "string" &&
    input.password.length >= 12 &&
    (input.role === "admin" || input.role === "user") &&
    (input.username === "operator" ? input.role === "admin" : input.role === "user")
  );
}

function isHostedCookieInput(
  value: unknown,
): value is { password: string; username: "star" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    input.username === "star" &&
    typeof input.password === "string" &&
    input.password.length >= 12
  );
}

async function handleHarnessRequest(
  request: Request,
  environment: WorkerEnvironment,
) {
  if (!isHarnessRuntimeEnabled(request, environment)) {
    return safeJson({ ok: false, code: "disabled" }, 404);
  }
  if (
    request.method !== "POST" ||
    !(await hasHarnessAuthorization(request, environment.AUTH_POC_HARNESS_TOKEN))
  ) {
    return safeJson({ ok: false, code: "forbidden" }, 403);
  }

  const body = await readSmallJson(request);
  const auth = createAuthPoc({
    database: environment.AUTH_POC_DB,
    baseURL: environment.AUTH_POC_BASE_URL,
    secret: environment.AUTH_POC_SECRET,
    trustedOrigins: [environment.AUTH_POC_BASE_URL],
  });
  const pathname = new URL(request.url).pathname;

  if (pathname === "/_poc/provision") {
    if (!isProvisionInput(body)) {
      return safeJson({ ok: false, code: "invalid_input" }, 400);
    }
    try {
      const result = await provisionAuthUser(auth.api, body);
      return safeJson({
        ok: true,
        user: {
          email: result.user.email,
          id: result.user.id,
          username: result.user.username,
        },
      });
    } catch {
      return safeJson({ ok: false, code: "provision_failed" }, 409);
    }
  }

  if (
    pathname === "/_poc/hosted-cookie" ||
    pathname === "/_poc/raw-username-origin-probe"
  ) {
    if (!isHostedCookieInput(body)) {
      return safeJson({ ok: false, code: "invalid_input" }, 400);
    }
    const probeOrigin = pathname === "/_poc/hosted-cookie"
      ? AUTH_POC_HOSTED_ORIGIN
      : "https://evil.example";
    const probeAuth = pathname === "/_poc/hosted-cookie"
      ? createAuthPoc({
      database: environment.AUTH_POC_DB,
      baseURL: AUTH_POC_HOSTED_ORIGIN,
      secret: environment.AUTH_POC_SECRET,
      trustedOrigins: [AUTH_POC_HOSTED_ORIGIN],
    })
      : auth;
    const probeHandler = pathname === "/_poc/hosted-cookie"
      ? createAuthPocHttpHandler({
          handler: probeAuth.handler,
          trustedOrigins: [AUTH_POC_HOSTED_ORIGIN],
        })
      : probeAuth.handler;
    const requestOrigin = pathname === "/_poc/hosted-cookie"
      ? AUTH_POC_HOSTED_ORIGIN
      : environment.AUTH_POC_BASE_URL;
    const response = await probeHandler(
      new Request(`${requestOrigin}/api/auth/sign-in/username`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          origin: probeOrigin,
          "sec-fetch-site": pathname === "/_poc/hosted-cookie"
            ? "same-origin"
            : "cross-site",
        },
        method: "POST",
      }),
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    const cookieName = setCookie.split("=", 1)[0] ?? "";
    return safeJson({
      ok: response.ok,
      status: response.status,
      setCookie: Boolean(setCookie),
      cookie: {
        httpOnly: /(?:^|;)\s*HttpOnly(?:;|$)/i.test(setCookie),
        name: cookieName,
        pathRoot: /(?:^|;)\s*Path=\/(?:;|$)/i.test(setCookie),
        sameSiteLax: /(?:^|;)\s*SameSite=Lax(?:;|$)/i.test(setCookie),
        secure: /(?:^|;)\s*Secure(?:;|$)/i.test(setCookie),
      },
    });
  }

  return safeJson({ ok: false, code: "not_found" }, 404);
}

const worker = {
  fetch(
    request: Request,
    environment: WorkerEnvironment,
    context: ExecutionContext,
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/_poc/")) {
      if (!isHarnessRuntimeEnabled(request, environment)) {
        return Promise.resolve(safeJson({ ok: false, code: "disabled" }, 404));
      }
      return handleHarnessRequest(request, environment);
    }
    return handler.fetch(request, environment, context);
  },
};

export default worker;
