"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { primaryPhotoRatioForDimensions } from "../../photo-ratio-policy";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import PlatformAccounts from "../shared/platform-accounts";
import { useTemplateSectionNavigation } from "../shared/use-template-section-navigation";
import { getOrbitalPortalObjectPosition } from "./portal-focus";
import styles from "./template.module.css";

const ORBIT_RATIOS = getTemplateSlotRatios("orbital-portal");
const ORBIT_VIEW_HASHES = {
  works: "#portal-works",
  packages: "#portal-modes",
  contact: "#portal-contact",
} as const;
const ORBIT_VIEW_ALIASES = [{ hash: "#portal-top", view: "works" }] as const;

export default function OrbitalPortalTemplate({ content, works, packages, bookingTemplate, copiedKey, isPreview, onCopy, onBeforeViewChange, onOpenWork }: TemplateProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { activeView, handleInternalLinkClick } = useTemplateSectionNavigation({
    aliases: ORBIT_VIEW_ALIASES,
    hashes: ORBIT_VIEW_HASHES,
    isPreview,
    onBeforeViewChange,
  });
  const orbitSlots = useMemo(
    () => buildPhotoSlots(works, ORBIT_RATIOS, { templateId: "orbital-portal" }),
    [works],
  );
  const filledOrbitSlots = useMemo(() => orbitSlots.filter((slot) => slot.work), [orbitSlots]);
  const safeActiveIndex = filledOrbitSlots.length === 0 ? 0 : Math.min(activeIndex, filledOrbitSlots.length - 1);
  const activeSlot = filledOrbitSlots[safeActiveIndex] ?? orbitSlots[0];
  const activeWork = activeSlot.work;
  const activePortalRatio = activeWork
    ? primaryPhotoRatioForDimensions(activeWork.previewWidth, activeWork.previewHeight) ?? "3:2"
    : activeSlot.ratio === "2:3" ? "2:3" : "3:2";
  const activePortalObjectPosition = activeWork ? getOrbitalPortalObjectPosition(activeWork) : undefined;
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
    <main
      className={styles.shell}
      data-template="orbital-portal"
      data-template-active-view={activeView}
      onClick={handleInternalLinkClick}
    >
      <header className={styles.header}>
        <a href="#portal-top" className={styles.brand}><b>{content.profile.mark}</b><span>{content.profile.brand}<small>ORBITAL OPTICAL LAB</small></span></a>
        <nav aria-label="轨道门户模板导航"><a href="#portal-works" aria-current={activeView === "works" ? "page" : undefined}>作品</a><a href="#portal-modes" aria-current={activeView === "packages" ? "page" : undefined}>拍摄套餐</a><a href="#portal-contact" aria-current={activeView === "contact" ? "page" : undefined}>联系约拍</a></nav>
        <span className={styles.status}><i /> {content.profile.city}</span>
      </header>

      <section id="portal-top" className={styles.hero} data-template-view="works" hidden={activeView !== "works"} tabIndex={-1}>
        <div className={styles.stars} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <small>VISUAL GATE / 00—{String(ORBIT_RATIOS.length).padStart(2, "0")}</small>
          <h1>ENTER<br /><em>THE ROLE</em></h1>
          <p>{content.profile.photographer} · {content.profile.role}</p>
          <p>{content.profile.intro} {content.hero.services}</p>
          <a href="#portal-works">开启视觉轨道 <span>↘</span></a>
        </div>

        <div className={styles.portalStage} data-portal-ratio={activePortalRatio}>
          <div className={styles.aperture} aria-hidden="true"><i /><i /><i /></div>
          {activeWork ? (
            <button type="button" className={styles.portalImage} onClick={() => onOpenWork(activeWork)} aria-label={`打开作品 ${activeWork.title}`}>
              <img
                key={activeWork.image}
                src={activeWork.preview}
                srcSet={`${activeWork.preview} ${activeWork.previewWidth}w, ${activeWork.image} ${activeWork.fullWidth}w`}
                sizes={activePortalRatio === "2:3"
                  ? "(max-width: 650px) 55vw, (max-width: 1000px) 31vw, 26vw"
                  : "(max-width: 650px) 82vw, (max-width: 1000px) 46vw, 38vw"}
                width={activeWork.previewWidth}
                height={activeWork.previewHeight}
                alt={activeWork.subtitle}
                style={{ objectPosition: activePortalObjectPosition }}
                data-portal-focus={activePortalObjectPosition === activeWork.position ? "source" : "portrait-safe-default"}
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

      <section id="portal-works" className={styles.orbitSection} data-template-view="works" hidden={activeView !== "works"} tabIndex={-1}>
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

      <section id="portal-modes" className={styles.missions} data-template-view="packages" hidden={activeView !== "packages"} tabIndex={-1}>
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

      <section id="portal-contact" className={styles.contact} data-template-view="contact" hidden={activeView !== "contact"} tabIndex={-1}>
        <div className={styles.contactCopy}>
          <small>03 / TRANSMIT REQUEST</small>
          <h2>把角色坐标<br />发送给我。</h2>
          <p>{content.contact.note}</p>
          <button type="button" onClick={() => void onCopy(content.contact.wechat, "portal-wechat")}>
            <span>WECHAT CHANNEL</span><strong>{copiedKey === "portal-wechat" ? "已复制 ✓" : content.contact.wechat}</strong>
          </button>
          <a href={`mailto:${content.contact.email}`}><span>EMAIL SIGNAL</span><strong>{content.contact.email}</strong></a>
          <PlatformAccounts accounts={content.social} tone="dark" />
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
