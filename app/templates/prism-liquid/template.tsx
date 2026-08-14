"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder, type PhotoSlot } from "../shared/photo-slots";
import { justifiedPhotoColumns } from "../shared/source-orientation-layout";
import styles from "./template.module.css";

const PRISM_RATIOS = getTemplateSlotRatios("prism-liquid");

type PrismTriptychStyle = CSSProperties & { "--prism-triptych-columns": string };

function prismTriptychRowStyle(slots: readonly PhotoSlot[]): PrismTriptychStyle {
  return { "--prism-triptych-columns": justifiedPhotoColumns(slots) };
}

export default function PrismLiquidTemplate({ content, works, packages, bookingTemplate, copiedKey, onCopy, onOpenWork }: TemplateProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const gallerySlots = useMemo(
    () => buildPhotoSlots(works, PRISM_RATIOS, { templateId: "prism-liquid" }),
    [works],
  );
  const displayedSlots = useMemo(() => gallerySlots.filter((slot) => slot.work), [gallerySlots]);
  const displayedWorks = useMemo(() => displayedSlots.map((slot) => slot.work!), [displayedSlots]);
  const safeActiveIndex = displayedSlots.length === 0 ? 0 : Math.min(activeIndex, displayedSlots.length - 1);
  const heroSlot = displayedSlots[safeActiveIndex] ?? gallerySlots[0];
  const activeWork = heroSlot.work;

  const move = useCallback((direction: -1 | 1) => {
    if (displayedWorks.length === 0) return;
    setActiveIndex((index) => (Math.min(index, displayedWorks.length - 1) + direction + displayedWorks.length) % displayedWorks.length);
  }, [displayedWorks.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  return (
    <main className={styles.shell} data-template="prism-liquid">
      <header className={styles.header}>
        <a href="#prism-top" className={styles.brand}>{content.profile.mark}<span>{content.profile.brand}</span></a>
        <nav aria-label="流体棱镜模板导航">
          <a href="#prism-gallery">WORKS</a>
          <a href="#prism-services">MODES</a>
          <a href="#prism-booking">BOOKING</a>
        </nav>
        <span className={styles.availability}>{content.profile.availability}</span>
      </header>

      <section id="prism-top" className={styles.hero}>
        <div className={styles.liquidField} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.heroCopy}>
          <small>PRISM / LIQUID · COSPLAY PHOTOGRAPHY</small>
          <h1>COLOR<br /><em>IS A PORTAL.</em></h1>
          <p>{content.profile.photographer} · {content.profile.role}<br />{content.profile.intro}</p>
        </div>

        <div className={styles.stage}>
          {activeWork ? (
            <button type="button" className={styles.mainImage} onClick={() => onOpenWork(activeWork)} aria-label={`打开作品 ${activeWork.title}`}>
              <img
                key={activeWork.image}
                src={activeWork.preview}
                srcSet={`${activeWork.preview} ${activeWork.previewWidth}w, ${activeWork.image} ${activeWork.fullWidth}w`}
                sizes="(max-width: 700px) 88vw, 52vw"
                width={activeWork.previewWidth}
                height={activeWork.previewHeight}
                alt={activeWork.subtitle}
                style={{ objectPosition: activeWork.position }}
                fetchPriority="high"
              />
              <span className={styles.prismEdge} aria-hidden="true" />
            </button>
          ) : (
            <div className={`${styles.mainImage} ${styles.heroPlaceholder}`}>
              <PhotoPlaceholder slot={heroSlot} tone="light" label="AWAITING HERO IMAGE" />
            </div>
          )}
          {activeWork ? (
            <div className={styles.stageMeta}>
              <span>{activeWork.code}</span>
              <strong>{activeWork.title}</strong>
              <small>{activeWork.subtitle}</small>
            </div>
          ) : (
            <div className={styles.stageMeta}><span>FRAME 00</span><strong>AWAITING IMAGE</strong><small>Upload a 3:2 photograph in Admin</small></div>
          )}
            <div className={styles.stageControls}>
              <button type="button" onClick={() => move(-1)} aria-label="上一张作品" disabled={displayedWorks.length < 2}>←</button>
              <span>{displayedWorks.length ? String(safeActiveIndex + 1).padStart(2, "0") : "00"} / {String(PRISM_RATIOS.length).padStart(2, "0")}</span>
              <button type="button" onClick={() => move(1)} aria-label="下一张作品" disabled={displayedWorks.length < 2}>→</button>
            </div>
        </div>

        <div className={styles.colorRail} aria-label="选择主视觉作品">
          {gallerySlots.map((slot) => {
            if (!slot.work) return <span className={styles.colorRailPlaceholder} key={`empty-${slot.index}`}><span>--</span></span>;
            const workIndex = displayedWorks.findIndex((work) => work.code === slot.work?.code);
            const isActive = activeWork?.code === slot.work.code;
            return (
              <button
                type="button"
                key={slot.work.code}
                className={isActive ? styles.isActive : ""}
                onClick={() => setActiveIndex(workIndex)}
                aria-label={`切换到 ${slot.work.title}`}
                aria-pressed={isActive}
              ><span>{String(slot.index + 1).padStart(2, "0")}</span></button>
            );
          })}
        </div>
        <a className={styles.scrollCue} href="#prism-gallery">EXPLORE THE SPECTRUM ↓</a>
      </section>

      <section id="prism-gallery" className={styles.gallery}>
        <div className={styles.sectionTitle}>
          <small>01 / REFRACTED ARCHIVE</small>
          <h2>九种角色，<br />九束不同的光。</h2>
          <p>{content.hero.services}</p>
        </div>
        <div className={styles.galleryGrid}>
          {[
            { className: styles.galleryFeatureRow, slots: gallerySlots.slice(0, 2), justified: false },
            { className: styles.galleryTriptych, slots: gallerySlots.slice(2, 5), justified: true },
            { className: styles.galleryPanorama, slots: gallerySlots.slice(5, 6), justified: false },
            { className: styles.galleryTriptych, slots: gallerySlots.slice(6, 9), justified: true },
          ].map((group, groupIndex) => (
            <div
              className={group.className}
              data-prism-justified-row={group.justified ? groupIndex : undefined}
              key={`gallery-group-${groupIndex}`}
              style={group.justified ? prismTriptychRowStyle(group.slots) : undefined}
            >
              {group.slots.map((slot) => slot.work ? (
                <button
                  type="button"
                  key={slot.work.code}
                  onClick={() => onOpenWork(slot.work!)}
                  className={styles.galleryCard}
                  data-photo-slot={slot.index + 1}
                  data-photo-ratio={slot.ratio}
                  style={getPhotoSlotStyle(slot)}
                >
                  <img src={slot.work.preview} width={slot.work.previewWidth} height={slot.work.previewHeight} alt={slot.work.subtitle} loading="lazy" style={{ objectPosition: slot.work.position }} />
                  <span><small>{slot.work.code}</small><strong>{slot.work.title}</strong><em>{slot.work.subtitle}</em></span>
                </button>
              ) : (
                <div
                  className={`${styles.galleryCard} ${styles.galleryPlaceholder}`}
                  key={`empty-${slot.index}`}
                  data-photo-slot={slot.index + 1}
                  data-photo-ratio={slot.ratio}
                  style={getPhotoSlotStyle(slot)}
                >
                  <PhotoPlaceholder slot={slot} tone="light" label="AWAITING IMAGE" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section id="prism-services" className={styles.services}>
        <div className={styles.sectionTitle}>
          <small>02 / CHOOSE A FREQUENCY</small>
          <h2>拍摄模式</h2>
        </div>
        <div className={styles.packageGrid}>
          {packages.map((item, index) => (
            <article key={item.number} style={{ "--package-index": index } as React.CSSProperties}>
              <span>{item.number}</span><small>{item.english}</small><h3>{item.name}</h3>
              <p>{item.description}</p>
              <strong>{item.price}</strong><em>{item.duration}</em>
              <ul>{item.deliverables.map((entry) => <li key={entry}>{entry}</li>)}</ul>
              <a href="#prism-booking">SELECT ↗</a>
            </article>
          ))}
        </div>
      </section>

      <section id="prism-booking" className={styles.booking}>
        <div className={styles.bookingGlow} aria-hidden="true" />
        <div className={styles.bookingCopy}>
          <small>03 / OPEN A NEW PORTAL</small>
          <h2>{content.statement.lineOne}<br />{content.statement.lineTwo}</h2>
          <p>告诉我角色、时间和你想抵达的世界，我会把它变成一组完整影像。</p>
          <div className={styles.contactActions}>
            <button type="button" onClick={() => void onCopy(content.contact.wechat, "prism-wechat")}>
              <span>WECHAT</span><strong>{copiedKey === "prism-wechat" ? "已复制 ✓" : content.contact.wechat}</strong>
            </button>
            <a href={`mailto:${content.contact.email}`}><span>EMAIL</span><strong>{content.contact.email}</strong></a>
          </div>
        </div>
        <div className={styles.requestCard}>
          <span>MISSION / REQUEST</span>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "prism-request")}>
            {copiedKey === "prism-request" ? "约拍清单已复制 ✓" : "复制约拍清单 ↗"}
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <strong>{content.profile.brand}</strong><span>{content.profile.city}</span><span>© 2026 REFRACTED VISUALS</span>
      </footer>
    </main>
  );
}
