/** Isolated visual fixture. Never reads application data or starts Next/Postgres.
 * Build: node tests/display-fixes-fixture.mjs build --out=<private evidence directory> --revision=HEAD
 * Build current files: same command without --revision (writes /after).
 * Serve both: node tests/display-fixes-fixture.mjs serve --out=<same directory> --port=3004
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const destination = option("out");
if (!destination || !path.isAbsolute(destination)) throw new Error("Pass an explicit absolute --out evidence directory.");
const output = path.resolve(destination);
if (output === root || output.startsWith(root + path.sep)) throw new Error("Evidence output must be outside the repository.");
const command = process.argv[2];
if (command === "build") {
  const revision = option("revision");
  if (revision && !/^[\w./-]+$/.test(revision)) throw new Error("Invalid revision.");
  const target = path.join(output, revision ? "before" : "after");
  try { await fs.access(path.join(target, "index.html")); throw new Error("Refusing to overwrite existing evidence. Use another explicit output directory."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await build({
    configFile: false, root: path.join(root, "tests/fixtures/display-fixes"), publicDir: false, base: "./",
    define: { "process.env.NEXT_PUBLIC_FRAME_ZERO_SITE_EDITOR": JSON.stringify("1") },
    plugins: [revision && { name: "read-baseline-app-source", enforce: "pre", load(id) {
      const relative = path.relative(root, id.split("?")[0]).replaceAll("\\", "/");
      if (relative.startsWith("app/") && /\.(tsx?|css)$/.test(relative)) return execFileSync("git", ["show", `${revision}:${relative}`], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    } }, react()].filter(Boolean),
    build: { outDir: target, emptyOutDir: false, sourcemap: false },
  });
  await fs.writeFile(path.join(target, "source.json"), JSON.stringify({ revision: revision ?? "working-tree", head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() }, null, 2));
} else if (command === "serve") {
  const port = Number(option("port") ?? 3004);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port.");
  const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
  // Only the nine anonymous images authored by this fixture are accepted.
  // This is not an image proxy: no path reads, remote fetches or arbitrary SVG.
  const anonymousImages = new Set(Array.from({ length: 9 }, (_, index) => {
    const portrait = [1, 4, 7].includes(index), width = portrait ? 400 : 600, height = portrait ? 600 : 400;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${index * 39 + 150} 35% 38%)"/><circle cx="50%" cy="42%" r="85" fill="white" opacity=".18"/><text x="50%" y="58%" text-anchor="middle" fill="white" font-size="45">${index + 1}</text></svg>`;
  }));
  http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === "/__local-preview-photo") {
        const source = url.searchParams.get("src") ?? "", prefix = "data:image/svg+xml,";
        if (source.length > 4096 || !source.startsWith(prefix)) throw new Error("Not an anonymous fixture image");
        const svg = decodeURIComponent(source.slice(prefix.length));
        if (!anonymousImages.has(svg)) throw new Error("Unknown fixture image");
        response.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        response.end(svg);
        return;
      }
      const font = pathname.startsWith("/fonts/");
      const base = font ? path.join(root, "public/fonts") : output;
      const relative = font ? pathname.slice(7) : pathname.replace(/^\//, "");
      const target = path.resolve(base, relative + (pathname.endsWith("/") ? "index.html" : ""));
      if (!target.startsWith(base + path.sep)) throw new Error("Outside fixture root");
      const body = await fs.readFile(target);
      response.writeHead(200, { "Content-Type": mime[path.extname(target)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(body);
    } catch { response.writeHead(404); response.end("Fixture file not found"); }
  }).listen(port, "127.0.0.1", () => console.log(`Fixture only: http://127.0.0.1:${port}/after/`));
} else throw new Error("Expected build or serve.");
