import { readFile } from "node:fs/promises";
import path from "node:path";
import { requirePreviewWorkspace } from "../../../../preview-workspace/server";

export const dynamic = "force-dynamic";
const assets: Record<string, { file: string; width: number; height: number; color: string }> = {
  background: { file: "background.png", width: 1536, height: 1024, color: "#314840" },
  portrait: { file: "portrait.png", width: 1024, height: 1536, color: "#bdad8a" },
  closeup: { file: "closeup.png", width: 1024, height: 1024, color: "#587270" },
};

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (process.env.FRAME_ZERO_FLOW_GALLERY_PROOF !== "1" || !await requirePreviewWorkspace(request)) return new Response(null, { status: 404 });
  const { key } = await params;
  const asset = Object.hasOwn(assets, key) ? assets[key] : undefined;
  if (!asset) return new Response(null, { status: 404 });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const root = process.env.FRAME_ZERO_FLOW_GALLERY_ASSET_ROOT;
  if (root) {
    try {
      const data = await readFile(path.join(root, asset.file));
      return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Type": "image/png" } });
    } catch { return new Response(null, { status: 404 }); }
  }
  // Repository-only fixtures are deliberately geometric, not third-party photos.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" viewBox="0 0 ${asset.width} ${asset.height}"><rect width="100%" height="100%" fill="${asset.color}"/><circle cx="65%" cy="30%" r="180" fill="#e7d9b9"/><path d="M0 ${asset.height} L${asset.width / 2} ${asset.height / 3} L${asset.width} ${asset.height}Z" fill="#233f38"/><text x="7%" y="92%" fill="white" font-size="38">ANONYMOUS LAYOUT FIXTURE</text></svg>`;
  return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
