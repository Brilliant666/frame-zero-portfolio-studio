"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import styles from "./template.module.css";

const ORBIT_RATIOS = getTemplateSlotRatios("orbital-portal");

export default function OrbitalPortalTemplate({ content, works, packages, bookingTemplate, copiedKey, onCopy, onOpenWork }: TemplateProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const orbitSlots = useMemo(() => buildPhotoSlots(works, ORBIT_RATIOS), [works]);
  const filledOrbitSlots = useMemo(() => orbitSlots.filter((slot) => slot.work), [orbitSlots]);
  const safeActiveIndex = filledOrbitSlots.length === 0 ? 0 : Math.min(activeIndex, filledOrbitSlots.length - 1);
  const activeSlot = filledOrbitSlots[safeActiveIndex] ?? orbitSlots[0];
  const activeWork = activeSlot.work;
  const move = useCallback((direction: -1 | 1) => {
    if (filledOrbitSlots.length === 0) return;
    setActiveIndex((index) => (Math.min(index, filledOrbitSlots.length - 1) + direction + filledOrbitSlots.length) % filledOrbitSlots.length);
  }, [filledOrbitSlots.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  return (
    <main className={styles.shell} data-template="orbital-portal">
      <header className={styles.header}>
        <a href="#portal-top" className={styles.brand}><b>{content.profile.mark}</b><span>{content.profile.brand}<small>ORBITAL OPTICAL LAB</small></span></a>
        <nav aria-label="轨道门户模板导航"><a href="#portal-works">ORBIT</a><a href="#portal-modes">MISSIONS</a><a href="#portal-contact">CONTACT</a></nav>
        <span className={styles.status}><i /> {content.profile.city}</span>
      </header>

      <section id="portal-top" className={styles.hero}>
        <div className={styles.stars} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <small>VISUAL GATE / 00—{String(ORBIT_RATIOS.length).padStart(2, "0")}</small>
          <h1>ENTER<br /><em>THE ROLE</em></h1>
          <p>{content.profile.photographer} · {content.profile.role}</p>
          <p>{content.profile.intro} {content.hero.services}</p>
          <a href="#portal-works">开启视觉轨道 <span>↘</span></a>
        </div>

        <div className={styles.portalStage}>
          <div className={styles.aperture} aria-hidden="true"><i /><i /><i /></div>
          {activeWork ? (
            <button type="button" className={styles.portalImage} onClick={() => onOpenWork(activeWork)} aria-label={`打开作品 ${activeWork.title}`}>
              <img
                key={activeWork.image}
                src={activeWork.preview}
                srcSet={`${activeWork.preview} ${activeWork.previewWidth}w, ${activeWork.image} ${activeWork.fullWidth}w`}
                sizes="(max-width: 700px) 76vw, 38vw"
                width={activeWork.previewWidth}
                height={activeWork.previewHeight}
                alt={activeWork.subtitle}
                style={{ objectPosition: activeWork.position }}
                fetchPriority="high"
              />
            </button>
          ) : (
            <div className={`${styles.portalImage} ${styles.portalImagePlaceholder}`}>
              <PhotoPlaceholder slot={activeSlot} label="AWAITING SIGNAL" compact />
            </div>
          )}
          <div className={styles.coordinate} aria-hidden="true"><span>AZ {activeIndex * 37 + 12}°</span><span>EL 42°</span><span>DST 0.{activeIndex + 3} AU</span></div>
          <div className={styles.portalControls}>
            <button type="button" onClick={() => move(-1)} aria-label="上一张作品" disabled={filledOrbitSlots.length < 2}>←</button>
            <span>{filledOrbitSlots.length ? String(safeActiveIndex + 1).padStart(2, "0") : "00"} / {String(ORBIT_RATIOS.length).padStart(2, "0")}</span>
            <button type="button" onClick={() => move(1)} aria-label="下一张作品" disabled={filledOrbitSlots.length < 2}>→</button>
          </div>
        </div>

        <aside className={styles.activeMeta}>
          <span>{activeWork?.code ?? "SIGNAL 00"}</span><strong>{activeWork?.title ?? "AWAITING IMAGE"}</strong><small>{activeWork?.subtitle ?? "Upload a 2:3 photograph in Admin"}</small>
          <div>{content.trustItems.map((item) => <p key={item.label}><b>{item.label}</b>{item.value}</p>)}</div>
        </aside>
      </section>

      <section id="portal-works" className={styles.orbitSection}>
        <div className={styles.sectionHead}>
          <span>01 / CHARACTER ORBIT</span>
          <h2>每个角色，<br />都有自己的引力。</h2>
          <p>点击轨道上的影像，进入完整画幅。</p>
        </div>
        <div className={styles.orbitScene}>
          <div className={styles.orbitCore}><span>{content.profile.mark}</span><small>SELECT A SIGNAL</small></div>
          {orbitSlots.map((slot) => {
            const slotStyle = {
              "--orbit-index": slot.index,
              "--orbit-count": ORBIT_RATIOS.length,
              ...getPhotoSlotStyle(slot),
            } as CSSProperties;

            return slot.work ? (
              <button
                type="button"
                key={slot.work.code}
                className={styles.orbitCard}
                data-photo-slot={slot.index + 1}
                data-photo-ratio={slot.ratio}
                style={slotStyle}
                onClick={() => onOpenWork(slot.work!)}
                aria-label={`查看 ${slot.work.title}`}
              >
                <img src={slot.work.preview} width={slot.work.previewWidth} height={slot.work.previewHeight} alt={slot.work.subtitle} loading="lazy" style={{ objectPosition: slot.work.position }} />
                <span><b>{slot.work.code}</b><strong>{slot.work.title}</strong></span>
              </button>
            ) : (
              <div
                key={`empty-${slot.index}`}
                className={`${styles.orbitCard} ${styles.orbitPlaceholder}`}
                data-photo-slot={slot.index + 1}
                data-photo-ratio={slot.ratio}
                style={slotStyle}
              >
                <PhotoPlaceholder slot={slot} label="NO SIGNAL" compact />
              </div>
            );
          })}
        </div>
      </section>

      <section id="portal-modes" className={styles.missions}>
        <div className={styles.sectionHead}><span>02 / MISSION LEVEL</span><h2>选择进入方式</h2><p>{content.profile.availability}</p></div>
        <div className={styles.missionGrid}>
          {packages.map((item, index) => (
            <article key={item.number}>
              <div className={styles.missionHalo} style={{ "--mission-index": index } as CSSProperties} aria-hidden="true" />
              <span>LEVEL {item.number}</span><small>{item.english}</small><h3>{item.name}</h3><p>{item.description}</p>
              <div><strong>{item.price}</strong><em>{item.duration}</em></div>
              <ul>{item.deliverables.map((entry) => <li key={entry}>{entry}</li>)}</ul>
              <a href="#portal-contact">INITIATE ↗</a>
            </article>
          ))}
        </div>
      </section>

      <section id="portal-contact" className={styles.contact}>
        <div className={styles.contactCopy}>
          <small>03 / TRANSMIT REQUEST</small>
          <h2>把角色坐标<br />发送给我。</h2>
          <p>{content.contact.note}</p>
          <button type="button" onClick={() => void onCopy(content.contact.wechat, "portal-wechat")}>
            <span>WECHAT CHANNEL</span><strong>{copiedKey === "portal-wechat" ? "已复制 ✓" : content.contact.wechat}</strong>
          </button>
          <a href={`mailto:${content.contact.email}`}><span>EMAIL SIGNAL</span><strong>{content.contact.email}</strong></a>
        </div>
        <div className={styles.console}>
          <div><span>PORTAL_REQUEST.SYS</span><i /><i /><i /></div>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "portal-request")}>
            {copiedKey === "portal-request" ? "传输清单已复制 ✓" : "复制约拍坐标 →"}
          </button>
        </div>
      </section>

      <footer className={styles.footer}><strong>{content.profile.brand}</strong><span>{content.statement.eyebrow}</span><span>© 2026 ORBITAL ARCHIVE</span></footer>
    </main>
  );
}
