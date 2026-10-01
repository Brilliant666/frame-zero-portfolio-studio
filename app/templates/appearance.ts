import type { TemplateId } from "./catalog";

/** Basic template interface colors. Photo stages retain their own materials. */
export const templateAppearances = {
  "cinematic-light": { tone: "light", background: "#f8f5f0", foreground: "#19130f" },
  "neon-hud": { tone: "dark", background: "#050914", foreground: "#edf6ff" },
  "film-rail": { tone: "light", background: "#f2eadb", foreground: "#191613" },
  "manga-panels": { tone: "light", background: "#f4f0e6", foreground: "#11100e" },
  "prism-liquid": { tone: "light", background: "#fbfbff", foreground: "#15121d" },
  "orbital-portal": { tone: "dark", background: "#05070b", foreground: "#f7f3ed" },
  "archive-os": { tone: "light", background: "#e7e8e5", foreground: "#171819" },
  "editorial-duet": { tone: "light", background: "#f2efe8", foreground: "#151411" },
  "polaroid-field": { tone: "light", background: "#eee7d8", foreground: "#182227" },
  "character-select": { tone: "dark", background: "#0c0e16", foreground: "#f7f7f2" },
  "museum-depth": { tone: "light", background: "#f2f0eb", foreground: "#171716" },
} as const satisfies Record<TemplateId, { tone: "light" | "dark"; background: string; foreground: string }>;
