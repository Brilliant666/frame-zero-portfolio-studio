"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { useCallback, useEffect, useState } from "react";
import type { TemplateProps } from "../types";
import styles from "./template.module.css";

export default function PrismLiquidTemplate({ content, works, packages, bookingTemplate, copiedKey, onCopy, onOpenWork }: TemplateProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeWork = works[activeIndex] ?? works[0];

  const move = useCallback((direction: -1 | 1) => {
    if (works.length === 0) return;
    setActiveIndex((index) => (index + direction + works.length) % works.length);
  }, [works.length]);

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

        {activeWork && (
          <div className={styles.stage}>
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
            <div className={styles.stageMeta}>
              <span>{activeWork.code}</span>
              <strong>{activeWork.title}</strong>
              <small>{activeWork.subtitle}</small>
            </div>
            <div className={styles.stageControls}>
              <button type="button" onClick={() => move(-1)} aria-label="上一张作品">←</button>
              <span>{String(activeIndex + 1).padStart(2, "0")} / {String(works.length).padStart(2, "0")}</span>
              <button type="button" onClick={() => move(1)} aria-label="下一张作品">→</button>
            </div>
          </div>
        )}

        <div className={styles.colorRail} aria-label="选择主视觉作品">
          {works.map((work, index) => (
            <button
              type="button"
              key={work.code}
              className={index === activeIndex ? styles.isActive : ""}
              onClick={() => setActiveIndex(index)}
              aria-label={`切换到 ${work.title}`}
              aria-pressed={index === activeIndex}
            ><span>{String(index + 1).padStart(2, "0")}</span></button>
          ))}
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
          {works.map((work, index) => (
            <button type="button" key={work.code} onClick={() => onOpenWork(work)} className={index % 4 === 0 ? styles.galleryWide : ""}>
              <img src={work.preview} width={work.previewWidth} height={work.previewHeight} alt={work.subtitle} loading="lazy" style={{ objectPosition: work.position }} />
              <span><small>{work.code}</small><strong>{work.title}</strong><em>{work.subtitle}</em></span>
            </button>
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
