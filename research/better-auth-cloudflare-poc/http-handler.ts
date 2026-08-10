import { AUTH_POC_BASE_PATH } from "./auth-options";

type AuthHandler = (request: Request) => Promise<Response>;

function forbiddenOriginResponse() {
  return Response.json(
    { code: "UNTRUSTED_ORIGIN", message: "The request origin is not trusted." },
    { status: 403 },
  );
}

/**
 * Better Auth 1.6.25's Username plugin does not attach the core
 * `formCsrfMiddleware` to its first-login endpoint. Keep this narrow adapter
 * at the HTTP boundary until upstream provides equivalent protection.
 */
export function createAuthPocHttpHandler(input: {
  handler: AuthHandler;
  trustedOrigins: readonly string[];
}) {
  const trustedOrigins = new Set(input.trustedOrigins);

  return async function handleAuthRequest(request: Request) {
    const url = new URL(request.url);
    if (
      request.method === "POST" &&
      url.pathname === `${AUTH_POC_BASE_PATH}/sign-in/username`
    ) {
      const origin = request.headers.get("origin");
      const fetchSite = request.headers.get("sec-fetch-site");
      if (
        !origin ||
        !trustedOrigins.has(origin) ||
        (fetchSite !== null && fetchSite !== "same-origin")
      ) {
        return forbiddenOriginResponse();
      }
    }

    return input.handler(request);
  };
}
