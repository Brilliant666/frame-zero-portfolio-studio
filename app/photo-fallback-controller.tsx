"use client";

import { useEffect } from "react";

export default function PhotoFallbackController() {
  useEffect(() => {
    const createdFallbacks: HTMLElement[] = [];

    const markMissing = (image: HTMLImageElement) => {
      const source = image.currentSrc || image.getAttribute("src") || "";
      if (!source.includes("/photos/") || image.dataset.photoFallbackHandled === "true") return;

      const mount = image.parentElement;
      if (!mount) return;

      image.dataset.photoFallbackHandled = "true";
      image.style.visibility = "hidden";
      mount.classList.add("runtime-photo-missing");

      const fallback = document.createElement("span");
      const slot = image.closest<HTMLElement>("[data-photo-slot]");
      const slotNumber = slot?.dataset.photoSlot;
      const ratio = slot?.dataset.photoRatio;
      const title = document.createElement("strong");
      const detail = document.createElement("small");

      fallback.className = "runtime-photo-fallback";
      fallback.setAttribute("role", "img");
      fallback.setAttribute("aria-label", "本地摄影图片未提供，当前显示文字占位");
      title.textContent = "IMAGE PENDING";
      detail.textContent = [slotNumber ? `SLOT ${String(slotNumber).padStart(2, "0")}` : "LOCAL PHOTO", ratio]
        .filter(Boolean)
        .join(" / ");
      fallback.append(title, detail);
      mount.append(fallback);
      createdFallbacks.push(fallback);
    };

    const handleImageError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) markMissing(event.target);
    };

    document.addEventListener("error", handleImageError, true);
    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLImageElement>('img[src*="/photos/"]').forEach((image) => {
        if (image.complete && image.naturalWidth === 0) markMissing(image);
      });
    });

    return () => {
      document.removeEventListener("error", handleImageError, true);
      window.cancelAnimationFrame(frame);
      for (const fallback of createdFallbacks) {
        const mount = fallback.parentElement;
        const image = mount?.querySelector<HTMLImageElement>("img[data-photo-fallback-handled]");
        if (image) {
          image.style.visibility = "";
          delete image.dataset.photoFallbackHandled;
        }
        fallback.remove();
        mount?.classList.remove("runtime-photo-missing");
      }
    };
  }, []);

  return null;
}
