"use client";

/* eslint-disable @next/next/no-img-element -- the portfolio supplies local responsive WebP derivatives. */

import { useRef } from "react";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import type { TemplateProps } from "../types";
import styles from "./film-rail.module.css";

const filmRatios = getTemplateSlotRatios("film-rail");

export default function FilmRailTemplate({
  templateId,
  content,
  works,
  packages,
  bookingTemplate,
  copiedKey,
  onCopy,
  onOpenWork,
}: TemplateProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const filmSlots = buildPhotoSlots(works, filmRatios);
  const leadSlot = filmSlots.find((slot) => slot.work) ?? filmSlots[0];
  const leadWork = leadSlot.work;

  const moveRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      left: direction * Math.max(280, rail.clientWidth * 0.78),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <main className={styles.shell} data-template={templateId}>
      <a className={styles.skipLink} href="#film-archive">跳到作品胶片</a>

      <header className={styles.header}>
        <a className={styles.brand} href="#film-top" aria-label="返回胶片主页顶部">
          <strong>{content.profile.mark}</strong>
          <span>{content.profile.brand}<small>MOTION PICTURE ARCHIVE</small></span>
        </a>
        <nav aria-label="胶片模板主导航">
          <a href="#film-archive">FILM</a>
          <a href="#film-services">SERVICES</a>
          <a href="#film-booking">BOOKING</a>
        </nav>
        <span className={styles.reelStatus}>ROLL 01 · {String(filmSlots.length).padStart(2, "0")} FRAMES</span>
      </header>

      <section className={styles.hero} id="film-top">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>FRAME//ZERO PRESENTS · COSPLAY PHOTOGRAPHY</p>
          <h1>
            <span>{content.hero.title}</span>
            <em>ONE FRAME<br />AT A TIME.</em>
          </h1>
          <div className={styles.heroLead}>
            <p>{content.profile.intro} {content.hero.services}，把每一次按下快门编进属于角色的电影。</p>
            <div className={styles.heroActions}>
              <a href="#film-archive">放映作品 <span>→</span></a>
              <a href="#film-booking">预约拍摄 <span>↘</span></a>
            </div>
          </div>
          <dl className={styles.heroFacts}>
            {content.trustItems.map((item) => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
            ))}
          </dl>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.heroFilm}>
            <span className={styles.filmEdge} aria-hidden="true" />
            {leadWork ? (
              <button type="button" onClick={() => onOpenWork(leadWork)} aria-label={`查看主视觉作品 ${leadWork.title}`}>
                <img
                  src={leadWork.image}
                  srcSet={`${leadWork.preview} ${leadWork.previewWidth}w, ${leadWork.image} ${leadWork.fullWidth}w`}
                  sizes="(max-width: 820px) 94vw, 48vw"
                  width={leadWork.fullWidth}
                  height={Math.round(leadWork.fullWidth * leadWork.previewHeight / leadWork.previewWidth)}
                  alt={leadWork.subtitle}
                  decoding="async"
                  fetchPriority="high"
                  style={{ objectPosition: leadWork.position }}
                />
              </button>
            ) : <PhotoPlaceholder slot={leadSlot} className={styles.emptyFrame} tone="dark" label="未曝光主画面" />}
            <div className={styles.heroCaption}>
              <span>35 MM / COLOR NEGATIVE</span>
              <strong>{leadWork?.title ?? content.profile.brand}</strong>
              <span>FRAME 001</span>
            </div>
          </div>
          <div className={styles.reelMark} aria-hidden="true"><i /><span>35</span></div>
        </div>
      </section>

      <section className={styles.archive} id="film-archive" aria-labelledby="film-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p>ROLL 01 / SELECTED NEGATIVES</p>
            <h2 id="film-heading">九格连续放映</h2>
          </div>
          <p>左右拖动胶片，或使用帧号时间轴定位。点击任意画面查看完整作品。</p>
          <div className={styles.railControls} aria-label="胶片轨道控制">
            <button type="button" onClick={() => moveRail(-1)} aria-controls="film-rail" aria-label="向前一帧">←</button>
            <button type="button" onClick={() => moveRail(1)} aria-controls="film-rail" aria-label="向后一帧">→</button>
          </div>
        </div>

        <div className={styles.filmStock}>
          <div className={styles.sprockets} aria-hidden="true" />
          <div className={styles.rail} id="film-rail" ref={railRef} tabIndex={0} aria-label="横向作品胶片">
            {filmSlots.map((slot, index) => {
              const work = slot.work;
              return (
              <article
                className={styles.frame}
                data-photo-slot={index + 1}
                data-photo-ratio={slot.ratio}
                id={`film-frame-${index + 1}`}
                key={work?.code ?? `film-placeholder-${index}`}
              >
                <div className={styles.frameTopline}>
                  <span>KODAK PORTRA 400</span>
                  <span>{String(index + 1).padStart(2, "0")} / {String(filmSlots.length).padStart(2, "0")}</span>
                  <span>{work?.code ?? "UNEXPOSED"}</span>
                </div>
                {work ? <button
                  type="button"
                  className={styles.frameImage}
                  style={getPhotoSlotStyle(slot)}
                  onClick={() => onOpenWork(work)}
                  aria-label={`打开作品 ${work.title}`}
                >
                  <img
                    src={work.preview}
                    srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                    sizes="(max-width: 700px) 86vw, 68vw"
                    width={work.previewWidth}
                    height={work.previewHeight}
                    alt={work.subtitle}
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: work.position }}
                  />
                  <span>OPEN FULL FRAME ↗</span>
                </button> : (
                  <PhotoPlaceholder slot={slot} className={styles.framePlaceholder} tone="dark" label="未曝光帧" />
                )}
                <div className={styles.frameCaption}>
                  <div><small>SCENE {String(index + 1).padStart(2, "0")}</small><h3>{work?.title ?? "FRAME RESERVED"}</h3></div>
                  <p>{work?.subtitle ?? "等待下一组角色影像写入胶片"}</p>
                </div>
              </article>
              );
            })}
            <div className={styles.endLeader} aria-hidden="true">
              <span>END OF ROLL</span><i /><span>FRAME//ZERO</span>
            </div>
          </div>
          <div className={`${styles.sprockets} ${styles.sprocketsBottom}`} aria-hidden="true" />
        </div>

        <nav className={styles.timeline} aria-label="作品帧号时间轴">
          <span>ROLL 01</span>
          <div>
            {filmSlots.map((slot, index) => slot.work ? (
              <a className={styles.timelineFrame} key={slot.work.code} href={`#film-frame-${index + 1}`} aria-label={`定位到第 ${index + 1} 帧 ${slot.work.title}`}>
                <i />
                <small>{String(index + 1).padStart(2, "0")}</small>
              </a>
            ) : (
              <span className={`${styles.timelineFrame} ${styles.timelinePlaceholder}`} key={`film-timeline-placeholder-${index}`} aria-label={`第 ${index + 1} 帧待补充`}>
                <i />
                <small>{String(index + 1).padStart(2, "0")}</small>
              </span>
            ))}
          </div>
          <span>END</span>
        </nav>
      </section>

      <section className={styles.intertitle} aria-label="摄影宣言">
        <p>{content.statement.eyebrow}</p>
        <h2>{content.statement.lineOne}<br /><em>{content.statement.lineTwo}</em></h2>
        <span>— {content.profile.photographer} / {content.profile.role}</span>
      </section>

      <section className={styles.services} id="film-services" aria-labelledby="services-heading">
        <div className={styles.sectionHeading}>
          <div><p>PRODUCTION MENU / 2026</p><h2 id="services-heading">选择你的拍摄卷</h2></div>
          <p>每一种套餐都是一卷独立制作：确认角色、拍摄、选片，再将完整叙事交到你手中。</p>
        </div>
        <div className={styles.tickets}>
          {packages.map((item) => (
            <article className={styles.ticket} key={item.number}>
              <div className={styles.ticketNumber}><span>ROLL</span><strong>{item.number}</strong></div>
              <div className={styles.ticketBody}>
                <small>{item.english} / {item.duration}</small>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <ul>{item.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}</ul>
              </div>
              <div className={styles.ticketPrice}><small>START FROM</small><strong>{item.price}</strong><a href="#film-booking">选择此卷 →</a></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.booking} id="film-booking" aria-labelledby="booking-heading">
        <div className={styles.bookingIntro}>
          <p>CASTING CALL / NOW OPEN</p>
          <h2 id="booking-heading">下一卷电影，<br />由你的角色主演。</h2>
          <span>{content.profile.availability} · {content.profile.city}</span>
          <div className={styles.contactCards}>
            <button type="button" onClick={() => void onCopy(content.contact.wechat, "film-wechat")}>
              <small>WECHAT / 点击复制</small>
              <strong>{content.contact.wechat}</strong>
              <span aria-live="polite">{copiedKey === "film-wechat" ? "已复制 ✓" : "COPY ↗"}</span>
            </button>
            <a href={`mailto:${content.contact.email}`}>
              <small>EMAIL / 发送企划</small>
              <strong>{content.contact.email}</strong>
              <span>WRITE ↗</span>
            </a>
          </div>
          <p className={styles.contactNote}>{content.contact.note}</p>
        </div>

        <div className={styles.callSheet}>
          <div className={styles.callSheetHead}><span>CALL_SHEET / 001</span><span>FRAME//ZERO</span></div>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "film-template")}>
            {copiedKey === "film-template" ? "约拍清单已复制 ✓" : "复制完整约拍清单"}
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <strong>{content.profile.brand}</strong>
        <div>{content.social.map((item) => <span key={item.label}>{item.label} / {item.handle}</span>)}</div>
        <small>© 2026 · END OF PRODUCTION</small>
      </footer>
    </main>
  );
}
