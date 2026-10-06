import { readFile } from "node:fs/promises";
import path from "node:path";
import { requirePreviewWorkspace } from "../../../../preview-workspace/server";

export const dynamic = "force-dynamic";
const files: Record<string, { width: number; height: number; color: string }> = {
  background: { width: 1536, height: 1024, color: "#536956" },
  portrait: { width: 1024, height: 1536, color: "#b3a48d" },
  closeup: { width: 1024, height: 1024, color: "#66827c" },
};
const sizes: Record<string, number> = { thumbnail: 320, card: 720, full: 1536 };
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (process.env.FRAME_ZERO_ADMIN_DESIGN_PROOF !== "1" || !await requirePreviewWorkspace(request)) return new Response(null, { status: 404 });
  const { key } = await params;
  const size = new URL(request.url).searchParams.get("size") ?? "card";
  if (!Object.hasOwn(files, key) || !Object.hasOwn(sizes, size)) return new Response(null, { status: 404 });
  const info = files[key];
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const root = process.env.FRAME_ZERO_ADMIN_DESIGN_ASSET_ROOT;
  if (root) {
    try {
      const data = await readFile(path.join(root, `${key}-${size}.webp`));
      return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Type": "image/webp" } });
    } catch { return new Response(null, { status: 404 }); }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><rect width="100%" height="100%" fill="${info.color}"/><circle cx="65%" cy="30%" r="180" fill="#e7d9b9"/><path d="M0 ${info.height} L${info.width / 2} ${info.height / 3} L${info.width} ${info.height}Z" fill="#233f38"/></svg>`;
  return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
