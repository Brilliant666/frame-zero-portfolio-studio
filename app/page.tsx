"use client";

import { useEffect, useMemo, useState } from "react";
import { getClientVisiblePortfolioTitle } from "./client-visible-title";
import { isSourceOrientationAdaptiveTemplate } from "./photo-ratio-policy";
import { isTemplateId, normalizeSiteContent, siteConfig, type SiteContent, type TemplateId } from "./site-config";
import { getTemplateCatalogItem } from "./templates/catalog";
import Lightbox from "./templates/shared/lightbox";
import { buildPhotoSlots } from "./templates/shared/photo-slots";
import { useTemplateInteractions } from "./templates/shared/use-template-interactions";
import TemplateRenderer from "./templates/template-renderer";

export default function Home() {
  const [content, setContent] = useState<SiteContent>(siteConfig);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateId | null>(null);
  const [booted, setBooted] = useState(false);
  const templateId = previewTemplate ?? content.activeTemplate;
  const templatePlan = getTemplateCatalogItem(templateId);
  const works = useMemo(() => {
    const selected = content.templateWorks[templateId];
    if (selected !== undefined) {
      return selected
        .filter((work) => work.enabled)
        .sort((left, right) => (left.slotIndex ?? 999) - (right.slotIndex ?? 999))
        .slice(0, templatePlan.photoSlots);
    }

    return buildPhotoSlots(
      content.works.filter((work) => work.enabled),
      templatePlan.slotRatios,
      { adaptiveToSourceOrientation: isSourceOrientationAdaptiveTemplate(templateId) },
    ).flatMap((slot) => slot.work ? [{ ...slot.work, slotIndex: slot.index }] : []);
  }, [content.templateWorks, content.works, templateId, templatePlan.photoSlots, templatePlan.slotRatios]);
  const {
    activeWork,
    closeButtonRef,
    copiedKey,
    copyText,
    lightboxRef,
    moveActiveWork,
    setActiveWork,
  } = useTemplateInteractions(works);
  const packages = useMemo(() => content.packages.filter((item) => item.enabled), [content.packages]);
  const bookingTemplate = useMemo(
    () => ["【约拍任务申请】", ...content.bookingFields].join("\n"),
    [content.bookingFields],
  );

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("template");
    const previewTimer = isTemplateId(candidate)
      ? window.setTimeout(() => setPreviewTemplate(candidate), 0)
      : undefined;
    const controller = new AbortController();

    fetch("/api/site-content", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { content?: unknown } | null) => {
        if (!result?.content) return;
        const nextContent = normalizeSiteContent(result.content);
        setContent(nextContent);
        document.title = getClientVisiblePortfolioTitle(nextContent.profile);
        setActiveWork(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => {
      if (previewTimer !== undefined) window.clearTimeout(previewTimer);
      controller.abort();
    };
  }, [setActiveWork]);

  useEffect(() => {
    let skipBoot = window.matchMedia("(max-width: 560px)").matches;

    try {
      skipBoot ||= window.sessionStorage.getItem("framezero-booted") === "1";
    } catch {
      // Session storage can be unavailable in private browsing contexts.
    }

    if (skipBoot) {
      const skipTimer = window.setTimeout(() => setBooted(true), 0);
      return () => window.clearTimeout(skipTimer);
    }

    const timer = window.setTimeout(() => {
      setBooted(true);
      try {
        window.sessionStorage.setItem("framezero-booted", "1");
      } catch {
        // The visual intro still completes when storage is unavailable.
      }
    }, 360);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {previewTemplate && (
        <div className="template-preview-ribbon" role="status">
          <span>模板预览模式 · 不会修改主页设置</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">退出预览 ×</a>
        </div>
      )}
      <TemplateRenderer
        key={templateId}
        templateId={templateId}
        content={content}
        works={works}
        packages={packages}
        bookingTemplate={bookingTemplate}
        booted={booted}
        copiedKey={copiedKey}
        isPreview={previewTemplate !== null}
        onCopy={copyText}
        onOpenWork={(work) => setActiveWork(work)}
      />
      {activeWork && (
        <Lightbox
          work={activeWork}
          works={works}
          frameRef={lightboxRef}
          closeButtonRef={closeButtonRef}
          onMove={moveActiveWork}
          onClose={() => setActiveWork(null)}
        />
      )}
    </>
  );
}
