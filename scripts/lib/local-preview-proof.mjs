export const LOCAL_PROOF_HEADER = "x-frame-zero-preview-proof";
export const LOCAL_ORIGIN_HEADER = "x-frame-zero-preview-origin";
const removedHeaders = new Set([LOCAL_PROOF_HEADER, LOCAL_ORIGIN_HEADER, "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"]);

/** Only socket peer + exact Host establish trust; client forwarded headers never do. */
export function stampLocalPreviewRequest(request, { origin, secret }) {
  for (const key of Object.keys(request.headers)) if (removedHeaders.has(key.toLowerCase())) delete request.headers[key];
  request.rawHeaders = request.rawHeaders.filter((_, index, raw) => !removedHeaders.has(raw[index - index % 2].toLowerCase()));
  const port=/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(origin)?.[1];
  if (!port || Number(port)>65535 || typeof secret !== "string" || secret.length < 48) return false;
  if (!["127.0.0.1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) return false;
  if (request.headers.host !== new URL(origin).host) return false;
  if (request.headers.origin && request.headers.origin !== origin) return false;
  if (request.headers["sec-fetch-site"] && !["none", "same-origin"].includes(request.headers["sec-fetch-site"])) return false;
  request.headers[LOCAL_PROOF_HEADER] = secret;
  request.headers[LOCAL_ORIGIN_HEADER] = origin;
  request.rawHeaders.push(LOCAL_PROOF_HEADER, secret, LOCAL_ORIGIN_HEADER, origin);
  return true;
}
