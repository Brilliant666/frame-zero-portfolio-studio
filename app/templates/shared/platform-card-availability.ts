export type PlatformCardFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "headers" | "ok">>;

export async function probePlatformCardAvailability(
  url: string,
  options: Readonly<{
    fetchImpl?: PlatformCardFetch;
    signal?: AbortSignal;
  }> = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      method: "HEAD",
      signal: options.signal,
    });
    const contentType = response.headers.get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    return response.ok && (contentType === "image/png" || /^\/api\/sites\/[a-z0-9-]+\/assets\/[a-f0-9-]+\/(?:card|full|original)$/.test(url) && ["image/jpeg", "image/webp"].includes(contentType ?? ""));
  } catch {
    return false;
  }
}
