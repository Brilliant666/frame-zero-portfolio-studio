import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Local runner/dev middleware only. Never imported by the deployed application.
export function createLocalPreviewPhotoHandler({ root }) {
  const cache = new Map();
  let bytes = 0;
  return async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const isResizeRequest = url.pathname === "/__local-preview-photo";
    const src = isResizeRequest ? url.searchParams.get("src") : url.pathname;
    if (!isResizeRequest && !src?.startsWith("/photos/")) return false;
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end(); return true;
    }
    const manifest = !isResizeRequest && src === "/photos/library-manifest.json";
    if (!manifest && !/^\/photos\/library\/[a-zA-Z0-9_/-]+\.webp$/.test(src ?? "")) {
      response.writeHead(404).end(); return true;
    }
    const width = isResizeRequest ? Number(url.searchParams.get("w")) : 0;
    if (isResizeRequest && ![600, 1100, 2200].includes(width)) { response.writeHead(400).end(); return true; }
    try {
      // The library may intentionally be a symlink. Lexical traversal is forbidden;
      // reading this explicitly authorized library is allowed, writing it is not.
      const file = path.join(root, "public", src.slice(1));
      const key = `${src}:${width}`;
      let body = isResizeRequest ? cache.get(key) : undefined;
      if (!body) {
        const input = await fs.readFile(file);
        body = isResizeRequest ? await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer() : input;
        if (isResizeRequest) {
          while (bytes + body.length > 32 * 1024 * 1024 && cache.size) {
            const oldest = cache.keys().next().value; bytes -= cache.get(oldest).length; cache.delete(oldest);
          }
          if (body.length <= 32 * 1024 * 1024) { cache.set(key, body); bytes += body.length; }
        }
      }
      response.writeHead(200, { "Content-Type": manifest ? "application/json" : "image/webp", "Content-Length": body.length,
        "Cache-Control": manifest ? "no-store, private" : "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch { response.writeHead(404).end(); }
    return true;
  };
}
