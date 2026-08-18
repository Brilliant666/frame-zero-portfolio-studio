"use client";

import { useEffect, useMemo, useState } from "react";
import type { SiteContent } from "../../site-config";
import type { TemplateId } from "../catalog";
import {
  getImmediateTemplateWorks,
  resolveTemplateWorkFallback,
  type TemplateWorkFallbackResolution,
} from "./template-work-fallback";

type VerifiedFallback = Readonly<{
  content: SiteContent;
  templateId: TemplateId;
  resolution: TemplateWorkFallbackResolution;
}>;

function probeImageSource(source: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    const finish = (available: boolean) => {
      image.onload = null;
      image.onerror = null;
      resolve(available);
    };
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = source;
  });
}

export function useTemplateWorks(content: SiteContent, templateId: TemplateId) {
  const immediate = useMemo(
    () => getImmediateTemplateWorks(content, templateId),
    [content, templateId],
  );
  const [verifiedFallback, setVerifiedFallback] = useState<VerifiedFallback | null>(null);

  useEffect(() => {
    if (immediate.status === "explicit") return;

    let active = true;
    void resolveTemplateWorkFallback(content, templateId, probeImageSource).then((resolution) => {
      if (active) setVerifiedFallback({ content, templateId, resolution });
    });

    return () => {
      active = false;
    };
  }, [content, immediate.status, templateId]);

  if (immediate.status === "explicit") return immediate;
  if (verifiedFallback?.content === content && verifiedFallback.templateId === templateId) {
    return verifiedFallback.resolution;
  }
  return immediate;
}
