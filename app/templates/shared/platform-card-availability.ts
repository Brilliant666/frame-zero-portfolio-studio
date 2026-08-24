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
    return response.ok && contentType === "image/png";
  } catch {
    return false;
  }
}
