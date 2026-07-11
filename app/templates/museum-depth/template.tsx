"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets already provide responsive derivatives. */

import { useMemo, type CSSProperties } from "react";
import type { TemplateProps } from "../types";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder, type PhotoRatio } from "../shared/photo-slots";
import styles from "./template.module.css";

const MUSEUM_RATIOS = ["3:2", "3:2", "2:3", "16:9", "3:2", "3:2", "16:9"] as const satisfies readonly PhotoRatio[];

export default function MuseumDepthTemplate({ content, works, packages, bookingTemplate, copiedKey, onCopy, onOpenWork }: TemplateProps) {
  const photoSlots = useMemo(() => buildPhotoSlots(works, MUSEUM_RATIOS), [works]);
  const heroSlot = photoSlots[0];
  const heroWork = heroSlot.work;
  const exhibitSlots = photoSlots.slice(1);

  return (
    <main className={styles.shell} data-template="museum-depth">
      <header className={styles.header}>
        <a href="#museum-top" className={styles.brand}>{content.profile.brand}<small>VIRTUAL EXHIBITION</small></a>
        <nav aria-label="深度展厅模板导航"><a href="#museum-exhibition">EXHIBITION</a><a href="#museum-tickets">TICKETS</a><a href="#museum-visit">VISIT</a></nav>
        <span>{content.profile.city}</span>
      </header>

      <section id="museum-top" className={styles.hero}>
        <div className={styles.heroNumber}>01</div>
        <div className={styles.heroCopy}>
          <small>FRAME//ZERO PRESENTS · EXHIBITION 2026</small>
          <h1>THE ROLE<br /><em>IN DEPTH</em></h1>
          <p>{content.profile.photographer} 的角色影像展。沿着光线前行，每一幅作品都是通往另一重现实的展框。</p>
          <a href="#museum-exhibition">进入展厅 ↓</a>
        </div>
        {heroWork ? (
          <button
            type="button"
            className={styles.heroFrame}
            data-photo-slot={heroSlot.index}
            data-photo-ratio={heroSlot.ratio}
            style={getPhotoSlotStyle(heroSlot)}
            onClick={() => onOpenWork(heroWork)}
            aria-label={`查看展览主视觉 ${heroWork.title}`}
          >
            <img
              src={heroWork.preview}
              srcSet={`${heroWork.preview} ${heroWork.previewWidth}w, ${heroWork.image} ${heroWork.fullWidth}w`}
              sizes="(max-width: 700px) 88vw, 44vw"
              width={heroWork.previewWidth}
              height={heroWork.previewHeight}
              alt={heroWork.subtitle}
              style={{ objectPosition: heroWork.position }}
              fetchPriority="high"
            />
            <span><b>ROOM 01</b><small>角色存在过的证据</small></span>
          </button>
        ) : (
          <div className={`${styles.heroFrame} ${styles.heroPlaceholder}`} data-photo-slot={heroSlot.index} data-photo-ratio={heroSlot.ratio} style={getPhotoSlotStyle(heroSlot)}>
            <PhotoPlaceholder slot={heroSlot} tone="light" label="HERO ART PENDING" />
            <span><b>ROOM 01</b><small>CURATOR&apos;S NOTE / IMAGE PENDING</small></span>
          </div>
        )}
        <div className={styles.heroInfo}>{content.trustItems.map((item) => <p key={item.label}><small>{item.label}</small><strong>{item.value}</strong></p>)}</div>
      </section>

      <section id="museum-exhibition" className={styles.exhibition}>
        <div className={styles.corridorLines} aria-hidden="true"><i /><i /><i /><i /></div>
        <div className={styles.exhibitionIntro}><span>CURATED ARCHIVE / {exhibitSlots.length} ROOMS</span><h2>向展厅深处<br />缓慢行进。</h2><p>点击任意展框查看完整画幅。滚动时，作品会从空间深处靠近。</p></div>
        <div className={styles.exhibitList}>
          {exhibitSlots.map((slot, index) => {
            const work = slot.work;
            return (
            <article className={styles.exhibit} key={`museum-slot-${slot.index}`} data-photo-slot={slot.index} data-photo-ratio={slot.ratio} style={{ "--exhibit-index": index } as CSSProperties}>
              <div className={styles.wallLabel}>
                <span>{String(index + 2).padStart(2, "0")}</span><small>ROOM / {work?.code ?? "PENDING"}</small><strong>{work?.title ?? `GALLERY ${String(index + 2).padStart(2, "0")}`}</strong><p>{work?.subtitle ?? "IMAGE PENDING / CURATOR’S NOTE"}</p>
              </div>
              {work ? (
                <button type="button" className={styles.artFrame} data-ratio={slot.ratio} style={getPhotoSlotStyle(slot)} onClick={() => onOpenWork(work)} aria-label={`查看展品 ${work.title}`}>
                  <span className={styles.frameTop} aria-hidden="true" />
                  <img src={work.preview} srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`} sizes="(max-width: 700px) 86vw, 56vw" width={work.previewWidth} height={work.previewHeight} alt={work.subtitle} loading="lazy" style={{ objectPosition: work.position }} />
                  <span className={styles.frameLight} aria-hidden="true" />
                </button>
              ) : (
                <div className={`${styles.artFrame} ${styles.artPlaceholder}`} data-ratio={slot.ratio} style={getPhotoSlotStyle(slot)}>
                  <span className={styles.frameTop} aria-hidden="true" />
                  <PhotoPlaceholder slot={slot} label="EXHIBIT IMAGE PENDING" />
                  <span className={styles.frameLight} aria-hidden="true" />
                </div>
              )}
              <div className={styles.floorMark}>FRAME ZERO COLLECTION · ACQ. 2026</div>
            </article>
            );
          })}
        </div>
      </section>

      <section id="museum-tickets" className={styles.tickets}>
        <div className={styles.sectionHead}><span>02 / PRIVATE SESSION</span><h2>选择你的参观方式</h2><p>{content.hero.services}</p></div>
        <div className={styles.ticketGrid}>
          {packages.map((item) => (
            <article key={item.number}>
              <div><span>ADMISSION {item.number}</span><small>{item.english}</small></div>
              <h3>{item.name}</h3><p>{item.description}</p>
              <ul>{item.deliverables.map((entry) => <li key={entry}>{entry}</li>)}</ul>
              <div className={styles.ticketBottom}><strong>{item.price}</strong><em>{item.duration}</em><a href="#museum-visit">RESERVE ↗</a></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.statement}>
        <span>{content.statement.eyebrow}</span><h2>{content.statement.lineOne}<br />{content.statement.lineTwo}</h2><p>{content.profile.brand} · PERMANENT COLLECTION</p>
      </section>

      <section id="museum-visit" className={styles.visit}>
        <div className={styles.visitCopy}>
          <span>03 / PLAN YOUR VISIT</span><h2>预约一次<br />私人展览。</h2><p>{content.contact.note}</p>
          <button type="button" onClick={() => void onCopy(content.contact.wechat, "museum-wechat")}><small>WECHAT / 点击复制</small><strong>{copiedKey === "museum-wechat" ? "已复制 ✓" : content.contact.wechat}</strong></button>
          <a href={`mailto:${content.contact.email}`}><small>EMAIL</small><strong>{content.contact.email}</strong></a>
        </div>
        <div className={styles.requestForm}>
          <div><span>VISITOR REQUEST</span><small>OPEN / 10:00—22:00</small></div>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "museum-request")}>
            {copiedKey === "museum-request" ? "参观资料已复制 ✓" : "复制预约资料"}
          </button>
        </div>
      </section>

      <footer className={styles.footer}><strong>{content.profile.brand}</strong><span>{content.profile.photographer} · {content.profile.role}</span><span>© 2026 VIRTUAL MUSEUM</span></footer>
    </main>
  );
}
