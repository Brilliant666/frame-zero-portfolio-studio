/** Build/serve anonymous source pages for public screenshot assets.
 * No account runtime, private roots, remote requests or database.
 * node scripts/generate-premium-showcase.mjs build --out=<absolute evidence root>
 * node scripts/generate-premium-showcase.mjs serve --out=<same root> --port=3004
 * Capture /premium-source/?subject=star and ?subject=flow at 1440x900.
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createServer } from "node:http";
import { readFile, access, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const destination = option("out");
if (!destination || !path.isAbsolute(destination)) throw new Error("Pass an explicit absolute --out evidence directory.");
const output = path.resolve(destination), source = path.join(output, "premium-source");
if (output === root || output.startsWith(root + path.sep)) throw new Error("Evidence must stay outside the repository.");

// These six illustrations are authored here; they are not client photographs.
export function showcaseArtwork(number) {
  const portrait = [1, 3, 5].includes(number), width = portrait ? 800 : 1200, height = portrait ? 1200 : 800;
  const palettes = [
    ["#ded7c6", "#7d877b", "#394e4a", "#c49a73"],
    ["#e6d8c6", "#b5a28c", "#705d4d", "#f0cf92"],
    ["#d9e4df", "#92aba6", "#46666c", "#d7b58e"],
    ["#c5d2d4", "#7e9d9e", "#3e646c", "#ded3a8"],
    ["#dbd5cc", "#ad8c78", "#615c58", "#ead0a1"],
    ["#d5d1bd", "#9b9e85", "#435e53", "#d1b17b"],
  ];
  const [paper, mid, dark, light] = palettes[number - 1];
  let body;
  if ([1, 6].includes(number)) {
    body = `<rect width="1200" height="1200" fill="${paper}"/><path d="M0 920 1200 760v440H0Z" fill="${mid}"/>
      <path d="M120 900V360a280 280 0 0 1 560 0v540Z" fill="${dark}"/>
      <path d="M185 900V370a215 215 0 0 1 430 0v530Z" fill="url(#sky)"/>
      <path d="M185 700 615 630v270H185Z" fill="${mid}"/>
      <path d="m185 900 430-65 480 365H0Z" fill="${light}" opacity=".58"/>
      <path d="M680 0h60v1200h-60ZM895 0h22v1200h-22" fill="${dark}" opacity=".19"/>
      <path d="M0 980 1200 830M0 1060 1200 890M0 1140 1200 950" stroke="${dark}" stroke-opacity=".18" stroke-width="2"/>
      <path d="M800 850q-65-170 18-260m-18 160q60-110 125-112m-110 20q-90-70-107-134" stroke="${dark}" fill="none" stroke-width="9"/>
      <ellipse cx="828" cy="539" rx="27" ry="72" fill="${dark}" transform="rotate(28 828 539)"/>
      <ellipse cx="918" cy="632" rx="24" ry="66" fill="${dark}" transform="rotate(62 918 632)"/>
      <path d="M755 820h138l-23 155h-92Z" fill="${dark}"/>`;
  } else if ([2, 5].includes(number)) {
    body = `<rect width="1200" height="1200" fill="${paper}"/><path d="M0 660h1200v540H0Z" fill="${mid}"/>
      <path d="m0 0 650 0 550 800-250 100Z" fill="${light}" opacity=".6"/>
      <ellipse cx="645" cy="880" rx="410" ry="55" fill="${dark}" opacity=".2"/>
      <path d="M330 440q-65 180 10 230t-5 200h240q-75-130-5-200t0-230Z" fill="url(#vase)"/>
      <ellipse cx="450" cy="440" rx="120" ry="29" fill="${dark}"/><ellipse cx="450" cy="436" rx="93" ry="17" fill="${mid}"/>
      <path d="M430 430q80-240 185-330M448 430q-100-160-145-230M454 395q145-90 270-55" stroke="${dark}" stroke-width="6" fill="none"/>
      <path d="M584 150q115-75 50 68-52 6-50-68ZM330 250q-99-89-62-101 97-18 62 101ZM650 340q83-82 124 15-52 56-124-15Z" fill="${dark}"/>
      <circle cx="818" cy="773" r="96" fill="${light}"/><path d="M725 786q84 35 185-25" stroke="${mid}" stroke-width="3" fill="none"/>
      <path d="M1000 110 1170 110v550h-170Z" fill="${dark}" opacity=".16"/>`;
  } else {
    body = `<rect width="1200" height="1200" fill="url(#sky)"/><circle cx="840" cy="210" r="90" fill="${light}" opacity=".8"/>
      <path d="M0 650 250 320 490 600 710 240 1200 660v540H0Z" fill="${mid}"/>
      <path d="M0 805 320 520 570 740 860 420 1200 710v490H0Z" fill="${dark}" opacity=".75"/>
      <path d="M0 830q300-160 600 15t600-30v385H0Z" fill="${paper}"/>
      <path d="M0 900q400-120 1200-10M100 972q400-65 1050-10M0 1060q600-80 1200-15" stroke="${mid}" stroke-width="5" fill="none" opacity=".5"/>
      <path d="M820 960q40-130 65-300m-54 215q-75-70-95-110m126 0q80-40 102-110" stroke="${dark}" stroke-width="9" fill="none"/>
      <path d="M0 1110 340 1040l250 160H0Z" fill="${dark}" opacity=".65"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${portrait ? 800 : 1200} ${portrait ? 1200 : 800}"><defs>
    <linearGradient id="sky" x2=".2" y2="1"><stop stop-color="${paper}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
    <linearGradient id="vase"><stop stop-color="${dark}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".09"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>
    </defs><g filter="url(#grain)">${body}</g></svg>`;
}

if (process.argv[2] === "build") {
  if (await access(path.join(source, "index.html")).then(() => true, () => false)) throw new Error("Refusing to overwrite existing evidence.");
  await build({ configFile: false, root: path.join(root, "tests/fixtures/launch-showcase"), publicDir: false, base: "./",
    plugins: [react()], define: { "process.env.NEXT_PUBLIC_FRAME_ZERO_SITE_EDITOR": JSON.stringify("1") },
    build: { outDir: source, emptyOutDir: false, sourcemap: false },
  });
} else if (process.argv[2] === "serve") {
  const port = Number(option("port") ?? 3004);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3001) throw new Error("Use an isolated non-daily port.");
  const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405); response.end(); return; }
    if (!["127.0.0.1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress) || request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403); response.end(); return; }
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      const asset = url.pathname.match(/^\/api\/public-sites\/showcase\/assets\/30000000-0000-4000-8000-00000000000([1-6])\/(?:thumbnail|card|full)$/);
      if (asset) { response.writeHead(200, { "Content-Type": "image/svg+xml" }); response.end(request.method === "HEAD" ? undefined : showcaseArtwork(Number(asset[1]))); return; }
      const font = /^\/fonts\/[a-z0-9/-]+\.woff2$/.test(url.pathname);
      const staticSource = /^\/premium-source\/(?:assets\/[a-zA-Z0-9_.-]+\.(?:css|js)|index\.html)?$/.test(url.pathname);
      if (!font && !staticSource) { response.writeHead(404); response.end(); return; }
      const base = font ? path.join(root, "public/fonts") : source;
      const relative = font ? url.pathname.slice(7) : url.pathname.slice("/premium-source/".length) || "index.html";
      const file = await realpath(path.resolve(base, relative));
      if (!file.startsWith((await realpath(base)) + path.sep)) throw new Error("Outside source root");
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] });
      response.end(request.method === "HEAD" ? undefined : await readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  server.listen(port, "127.0.0.1", () => console.log(`Anonymous source only: http://127.0.0.1:${port}/premium-source/?subject=star and ?subject=flow`));
  const stop = () => server.close(); process.once("SIGINT", stop); process.once("SIGTERM", stop);
} else throw new Error("Expected build or serve.");
