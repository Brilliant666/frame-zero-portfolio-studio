"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { resolveBrandIdentity } from "../../brand-identity";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import styles from "./template.module.css";

const CHARACTER_RATIOS = getTemplateSlotRatios("character-select");

export default function CharacterSelectTemplate({ content, works, packages, bookingTemplate, copiedKey, onCopy, onOpenWork }: TemplateProps) {
  const brand = resolveBrandIdentity(content.profile);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState(0);
  const photoSlots = useMemo(() => buildPhotoSlots(works, CHARACTER_RATIOS), [works]);
  const availableIndexes = useMemo(() => photoSlots.filter((slot) => slot.work).map((slot) => slot.index), [photoSlots]);
  const clampedActiveIndex = Math.min(Math.max(activeIndex, 0), photoSlots.length - 1);
  const safeActiveIndex = photoSlots[clampedActiveIndex]?.work || availableIndexes.length === 0
    ? clampedActiveIndex
    : availableIndexes[0];
  const activeSlot = photoSlots[safeActiveIndex] ?? photoSlots[0];
  const activeWork = activeSlot.work;
  const activePackage = packages[selectedPackage] ?? packages[0];
  const move = useCallback((direction: -1 | 1) => {
    if (availableIndexes.length === 0) return;
    setActiveIndex((index) => {
      const currentPosition = availableIndexes.indexOf(index);
      const normalizedPosition = currentPosition < 0 ? 0 : currentPosition;
      return availableIndexes[(normalizedPosition + direction + availableIndexes.length) % availableIndexes.length];
    });
  }, [availableIndexes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  return (
    <main className={styles.shell} data-template="character-select">
      <header className={styles.header}>
        {brand.hasIdentity && <a href="#select-top" className={styles.logo}>{brand.hasDistinctMark && <span>{brand.mark}</span>}{brand.name}</a>}
        <div className={styles.headerTitle}>CHARACTER CAPTURE SYSTEM <b>ONLINE</b></div>
        <nav aria-label="角色选择模板导航"><a href="#select-roster">ROSTER</a><a href="#select-loadout">LOADOUT</a><a href="#select-mission">MISSION</a></nav>
      </header>

      <section id="select-top" className={styles.hero}>
        <div className={styles.speedLines} aria-hidden="true" />
        <div className={styles.heroTopline}><span>PLAYER 01 / {content.profile.photographer}</span><strong>SELECT YOUR CHARACTER</strong><span>{content.profile.city}</span></div>

        <div className={styles.roster} id="select-roster" aria-label="选择角色作品">
          {photoSlots.map((slot, index) => {
            const work = slot.work;
            if (!work) {
              return (
                <div className={`${styles.rosterItem} ${styles.rosterPlaceholder}`} key={`roster-slot-${slot.index}`} data-photo-slot={slot.index} data-photo-ratio={slot.ratio} style={getPhotoSlotStyle(slot)}>
                  <PhotoPlaceholder slot={slot} compact label="LOCKED" />
                  <span>--</span>
                </div>
              );
            }

            return (
              <button
                type="button"
                key={`roster-slot-${slot.index}`}
                className={`${styles.rosterItem} ${index === safeActiveIndex ? styles.rosterActive : ""}`}
                data-photo-slot={slot.index}
                data-photo-ratio={slot.ratio}
                style={getPhotoSlotStyle(slot)}
                onClick={() => setActiveIndex(index)}
                aria-label={`选择 ${work.title}`}
                aria-pressed={index === safeActiveIndex}
              >
                <img src={work.preview} width={work.previewWidth} height={work.previewHeight} alt="" style={{ objectPosition: work.position }} />
                <span>{work.code}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.fighterStage}>
            <div className={styles.fighterName} aria-hidden="true">{activeWork?.title ?? "LOCKED"}</div>
            {activeWork ? (
            <button
              type="button"
              className={styles.fighterImage}
              data-photo-slot={activeSlot.index}
              data-photo-ratio={activeSlot.ratio}
              style={getPhotoSlotStyle(activeSlot)}
              onClick={() => onOpenWork(activeWork)}
              aria-label={`查看 ${activeWork.title} 完整作品`}
            >
              <img
                key={activeWork.image}
                src={activeWork.preview}
                srcSet={`${activeWork.preview} ${activeWork.previewWidth}w, ${activeWork.image} ${activeWork.fullWidth}w`}
                sizes="(max-width: 700px) 95vw, 58vw"
                width={activeWork.previewWidth}
                height={activeWork.previewHeight}
                alt={activeWork.subtitle}
                style={{ objectPosition: activeWork.position }}
                fetchPriority="high"
              />
            </button>
            ) : (
              <div className={`${styles.fighterImage} ${styles.fighterPlaceholder}`} data-photo-slot={activeSlot.index} data-photo-ratio={activeSlot.ratio} style={getPhotoSlotStyle(activeSlot)}>
                <PhotoPlaceholder slot={activeSlot} label="SELECT A CHARACTER" />
              </div>
            )}
            <span className={styles.slash} aria-hidden="true" />
          </div>

        <aside className={styles.profileCard}>
          <span>SELECTED / {String(safeActiveIndex + 1).padStart(2, "0")}</span>
          <h1>{activeWork?.title ?? "CHARACTER LOCKED"}</h1>
          <p>{activeWork?.subtitle ?? "UPLOAD A PHOTO TO UNLOCK THIS CHARACTER SLOT."}</p>
          <div className={styles.stats}>
            {content.trustItems.map((item, index) => (
              <div key={item.label}><small>{item.label}</small><i><b style={{ width: `${52 + index * 12}%` }} /></i><strong>{item.value}</strong></div>
            ))}
          </div>
          <div className={styles.arrowControls}>
            <button type="button" disabled={availableIndexes.length < 2} onClick={() => move(-1)} aria-label="上一个角色">← PREV</button>
            <button type="button" disabled={availableIndexes.length < 2} onClick={() => move(1)} aria-label="下一个角色">NEXT →</button>
          </div>
          <a href="#select-loadout" className={styles.confirm}>确认角色 / 选择拍摄 <span>START</span></a>
        </aside>

        <div className={styles.heroFooter}><span>{content.hero.services}</span><span>ARROW KEYS ENABLED</span><span>{content.profile.availability}</span></div>
      </section>

      <section id="select-loadout" className={styles.loadout}>
        <div className={styles.sectionTitle}><span>STAGE 02</span><h2>选择任务装备</h2><p>每种模式对应不同拍摄强度、时长与交付规格。</p></div>
        <div className={styles.loadoutLayout}>
          <div className={styles.packageTabs}>
            {packages.map((item, index) => (
              <button type="button" key={item.number} className={index === selectedPackage ? styles.packageActive : ""} onClick={() => setSelectedPackage(index)}>
                <span>{item.number}</span><strong>{item.name}</strong><small>{item.english}</small>
              </button>
            ))}
          </div>
          {activePackage && (
            <article className={styles.loadoutCard}>
              <div className={styles.rank}>RANK <b>{["A", "S", "SS"][selectedPackage] ?? "EX"}</b></div>
              <small>{activePackage.english} / LOADOUT {activePackage.number}</small>
              <h3>{activePackage.name}</h3><p>{activePackage.description}</p>
              <div className={styles.offer}><strong>{activePackage.price}</strong><span>{activePackage.duration}</span></div>
              <ul>{activePackage.deliverables.map((entry) => <li key={entry}><i />{entry}</li>)}</ul>
              <a href="#select-mission">装备此套餐 →</a>
            </article>
          )}
          <div className={styles.loadoutVisual} aria-hidden="true">
            {brand.mark && <span>{brand.mark}</span>}<i /><i /><i /><b>READY</b>
          </div>
        </div>
      </section>

      <section className={styles.archive}>
        <div className={styles.sectionTitle}><span>BONUS STAGE</span><h2>完整角色图鉴</h2><p>选择任意画面进入全屏查看。</p></div>
        <div className={styles.archiveGrid}>
          {photoSlots.map((slot, index) => {
            const work = slot.work;
            const slotStyle = { ...getPhotoSlotStyle(slot), "--card-index": index } as CSSProperties;
            if (!work) {
              return (
                <div className={`${styles.archiveCard} ${styles.archivePlaceholder}`} key={`archive-slot-${slot.index}`} data-photo-slot={slot.index} data-photo-ratio={slot.ratio} style={slotStyle}>
                  <PhotoPlaceholder slot={slot} label="ARCHIVE SLOT PENDING" />
                </div>
              );
            }
            return (
              <button type="button" className={styles.archiveCard} key={`archive-slot-${slot.index}`} data-photo-slot={slot.index} data-photo-ratio={slot.ratio} onClick={() => onOpenWork(work)} style={slotStyle}>
                <img src={work.preview} width={work.previewWidth} height={work.previewHeight} loading="lazy" alt={work.subtitle} style={{ objectPosition: work.position }} />
                <span><b>{work.code}</b><strong>{work.title}</strong><small>{work.subtitle}</small></span>
              </button>
            );
          })}
        </div>
      </section>

      <section id="select-mission" className={styles.mission}>
        <div className={styles.missionCopy}>
          <span>FINAL STAGE / REQUEST</span>
          <h2>READY?<br /><em>FIGHT FOR THE FRAME.</em></h2>
          <p>{content.contact.note}</p>
          <div className={styles.contactButtons}>
            <button type="button" onClick={() => void onCopy(content.contact.wechat, "select-wechat")}><small>WECHAT</small><strong>{copiedKey === "select-wechat" ? "已复制 ✓" : content.contact.wechat}</strong></button>
            <a href={`mailto:${content.contact.email}`}><small>EMAIL</small><strong>{content.contact.email}</strong></a>
          </div>
        </div>
        <div className={styles.missionPanel}>
          <div><span>MISSION DATA</span><b>● LIVE</b></div>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "select-request")}>
            {copiedKey === "select-request" ? "任务资料已复制 ✓" : "复制任务资料 / PRESS START"}
          </button>
        </div>
      </section>

      <footer className={styles.footer}>{brand.name && <strong>{brand.name}</strong>}<span>{content.statement.lineOne}{content.statement.lineTwo}</span><span>© 2026 CHARACTER SELECT</span></footer>
    </main>
  );
}
