"use client";

import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { resolveBrandIdentity, withBrandPrefix } from "../brand-identity";
import PhotoFallbackController from "../photo-fallback-controller";
import type { TemplateId } from "./catalog";
import type { TemplateProps } from "./types";

type TemplateModule = { default: ComponentType<TemplateProps> };
type TemplateLoader = () => Promise<TemplateModule>;

// Keep every path explicit. Vite can then emit one lazy entry per template,
// while future template branches only need to replace their own directory.
const templateLoaders = {
  "cinematic-light": () => import("./cinematic-light/template"),
  "neon-hud": () => import("./neon-hud/template"),
  "film-rail": () => import("./film-rail/template"),
  "manga-panels": () => import("./manga-panels/template"),
  "prism-liquid": () => import("./prism-liquid/template"),
  "orbital-portal": () => import("./orbital-portal/template"),
  "archive-os": () => import("./archive-os/template"),
  "editorial-duet": () => import("./editorial-duet/template"),
  "polaroid-field": () => import("./polaroid-field/template"),
  "character-select": () => import("./character-select/template"),
  "museum-depth": () => import("./museum-depth/template"),
} satisfies Record<TemplateId, TemplateLoader>;

const templates = Object.fromEntries(
  Object.entries(templateLoaders).map(([id, loader]) => [id, lazy(loader)]),
) as Record<TemplateId, LazyExoticComponent<ComponentType<TemplateProps>>>;

export default function TemplateRenderer(props: TemplateProps) {
  const Template = templates[props.templateId] ?? templates["cinematic-light"];
  const brand = resolveBrandIdentity(props.content.profile);

  return (
    <Suspense fallback={<TemplateLoading brand={brand.name} />}>
      <Template key={props.templateId} {...props} />
      <PhotoFallbackController />
    </Suspense>
  );
}

function TemplateLoading({ brand }: { brand: string }) {
  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        background: "#f8f5f0",
        color: "#17120f",
        fontFamily: "var(--font-geist-mono), monospace",
        letterSpacing: ".12em",
      }}
    >
      <span>{withBrandPrefix(brand, "LOADING VISUAL SYSTEM")}</span>
    </main>
  );
}
