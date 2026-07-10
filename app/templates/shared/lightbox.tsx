"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import type { RefObject } from "react";
import type { Work } from "../../site-config";

type LightboxProps = {
  work: Work;
  works: Work[];
  frameRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
};

export default function Lightbox({ work, works, frameRef, closeButtonRef, onMove, onClose }: LightboxProps) {
  return (
    <div
      ref={frameRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${work.title} 作品预览`}
    >
      <button className="lightbox-backdrop" onClick={onClose} aria-label="关闭作品预览" />
      <div className="lightbox-frame">
        <div className="lightbox-stage">
          <button className="lightbox-nav lightbox-prev" onClick={() => onMove(-1)} aria-label="上一张作品">←</button>
          <img
            src={work.image}
            srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
            sizes="92vw"
            alt={work.subtitle}
            decoding="async"
          />
          <button className="lightbox-nav lightbox-next" onClick={() => onMove(1)} aria-label="下一张作品">→</button>
        </div>
        <div className="lightbox-info">
          <span>{work.code}</span>
          <div><strong>{work.title}</strong><small>{work.subtitle}</small></div>
          <div className="lightbox-controls">
            <span>{works.findIndex((item) => item.code === work.code) + 1} / {works.length}</span>
            <button ref={closeButtonRef} onClick={onClose}>CLOSE ×</button>
          </div>
        </div>
      </div>
    </div>
  );
}
