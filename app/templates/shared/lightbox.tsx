"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { useState, type RefObject } from "react";
import type { Work } from "../../site-config";

type LightboxProps = {
  work: Work;
  works: Work[];
  frameRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
  theme?: "light" | "dark";
  safeMissingImage?: boolean;
};

export default function Lightbox({ work, works, frameRef, closeButtonRef, onMove, onClose, theme = "dark", safeMissingImage = false }: LightboxProps) {
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const index = works.findIndex((item) => item.assetId === work.assetId && item.code === work.code);
  return (
    <div
      ref={frameRef}
      className={`lightbox ${theme === "light" ? "lightbox-light" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={theme === "light" ? `第 ${index + 1} 张照片预览` : `${work.title} 作品预览`}
    >
      <button className="lightbox-backdrop" onClick={onClose} aria-label="关闭作品预览" />
      <div className="lightbox-frame">
        <div className="lightbox-stage">
          {(theme !== "light" || works.length > 1) && <button className="lightbox-nav lightbox-prev" onClick={() => onMove(-1)} aria-label="上一张作品">←</button>}
          {safeMissingImage && unavailable.includes(work.image) ? <p role="status">照片暂时不可用。已保存的图集引用仍保留，可关闭或查看其他照片。</p> : <img
            src={work.image}
            srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
            sizes="92vw"
            alt={theme === "light" ? `第 ${index + 1} 张照片` : work.subtitle}
            decoding="async"
            onError={safeMissingImage ? () => setUnavailable((current) => [...current, work.image]) : undefined}
          />}
          {(theme !== "light" || works.length > 1) && <button className="lightbox-nav lightbox-next" onClick={() => onMove(1)} aria-label="下一张作品">→</button>}
        </div>
        <div className="lightbox-info">
          <span>{theme === "light" ? "照片" : work.code}</span>
          <div><strong>{theme === "light" ? `第 ${index + 1} 张照片` : work.title}</strong>{theme !== "light" && <small>{work.subtitle}</small>}</div>
          <div className="lightbox-controls">
            <span>{index + 1} / {works.length}</span>
            <button ref={closeButtonRef} onClick={onClose}>{theme === "light" ? "关闭 ×" : "CLOSE ×"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
