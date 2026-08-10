function isExactHttpOrigin(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("*") ||
    value.includes("?")
  ) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1")) &&
      parsed.origin === value &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

/**
 * The executable POC deliberately supports one environment-specific origin
 * per auth instance. Better Auth treats `*` and `?` as wildcard syntax, so
 * accepting arbitrary URL-shaped strings here would not be an exact allowlist.
 */
export function parseAuthPocTrustedOrigins(
  serialized: string,
  baseURL: string,
): [string] {
  if (!isExactHttpOrigin(baseURL)) {
    throw new Error("AUTH_POC_BASE_URL must be one exact HTTP(S) origin.");
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("AUTH_POC_TRUSTED_ORIGINS must be a JSON array.");
  }

  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    value[0] !== baseURL ||
    !isExactHttpOrigin(value[0])
  ) {
    throw new Error(
      "AUTH_POC_TRUSTED_ORIGINS must contain only AUTH_POC_BASE_URL.",
    );
  }

  return [baseURL];
}
