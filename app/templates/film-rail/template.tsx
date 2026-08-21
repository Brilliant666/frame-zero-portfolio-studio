"use client";

/* eslint-disable @next/next/no-img-element -- the portfolio supplies local responsive WebP derivatives. */

import { useCallback, useEffect, useRef, useState } from "react";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import PlatformAccounts from "../shared/platform-accounts";
import { useTemplateSectionNavigation } from "../shared/use-template-section-navigation";
import type { TemplateProps } from "../types";
import styles from "./film-rail.module.css";
import { splitFilmRailSlots } from "./slot-plan";

const filmRatios = getTemplateSlotRatios("film-rail");
const filmViewHashes = {
  works: "#film-archive",
  packages: "#film-services",
  contact: "#film-booking",
} as const;
const filmViewAliases = [{ hash: "#film-top", view: "works" }] as const;

export default function FilmRailTemplate({
  templateId,
  content,
  works,
  packages,
  bookingTemplate,
  copiedKey,
  isPreview,
  onCopy,
  onBeforeViewChange,
  onOpenWork,
}: TemplateProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [railEdges, setRailEdges] = useState({ atStart: true, atEnd: false });
  const photoSlots = buildPhotoSlots(works, filmRatios, { templateId: "film-rail" });
  const { hero: leadSlot, frames: filmSlots } = splitFilmRailSlots(photoSlots);
  const leadWork = leadSlot.work;
  const { activeView, handleInternalLinkClick } = useTemplateSectionNavigation({
    aliases: filmViewAliases,
    hashes: filmViewHashes,
    isPreview,
    onBeforeViewChange,
  });

  const syncRailEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail || rail.clientWidth === 0) return;

    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const nextEdges = {
      atStart: rail.scrollLeft <= 2,
      atEnd: maxScrollLeft <= 2 || rail.scrollLeft >= maxScrollLeft - 2,
    };
    setRailEdges((currentEdges) => (
      currentEdges.atStart === nextEdges.atStart && currentEdges.atEnd === nextEdges.atEnd
        ? currentEdges
        : nextEdges
    ));
  }, []);

  useEffect(() => {
    if (activeView !== "works") return;

    const rail = railRef.current;
    if (!rail) return;

    const frame = window.requestAnimationFrame(syncRailEdges);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncRailEdges);
    resizeObserver?.observe(rail);
    rail.addEventListener("scroll", syncRailEdges, { passive: true });
    window.addEventListener("resize", syncRailEdges);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      rail.removeEventListener("scroll", syncRailEdges);
      window.removeEventListener("resize", syncRailEdges);
    };
  }, [activeView, filmSlots.length, syncRailEdges]);

  const moveRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      left: direction * Math.max(280, rail.clientWidth * 0.78),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const handleRailMove = (direction: -1 | 1) => {
    const isAtRequestedEdge = direction === -1 ? railEdges.atStart : railEdges.atEnd;
    if (isAtRequestedEdge) return;
    moveRail(direction);
  };

  return (
    <main
      className={styles.shell}
      data-template={templateId}
      data-template-active-view={activeView}
      onClick={handleInternalLinkClick}
    >
      <a className={styles.skipLink} href="#film-archive">跳到作品胶片</a>

      <header className={styles.header}>
        <a className={styles.brand} href="#film-top" aria-label="返回胶片主页顶部">
          <strong>{content.profile.mark}</strong>
          <span>{content.profile.brand}<small>MOTION PICTURE ARCHIVE</small></span>
        </a>
        <nav aria-label="胶片模板主导航">
          <a href="#film-archive" aria-current={activeView === "works" ? "page" : undefined}>作品</a>
          <a href="#film-services" aria-current={activeView === "packages" ? "page" : undefined}>拍摄套餐</a>
          <a href="#film-booking" aria-current={activeView === "contact" ? "page" : undefined}>联系约拍</a>
        </nav>
        <span className={styles.reelStatus}>ROLL 01 · {String(filmSlots.length).padStart(2, "0")} FRAMES</span>
      </header>

      <section className={styles.hero} id="film-top" data-template-view="works" hidden={activeView !== "works"} tabIndex={-1}>
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

        <div
          className={styles.heroVisual}
          data-film-photo-role="hero"
          data-photo-slot={leadSlot.index + 1}
        >
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

      <section className={styles.archive} id="film-archive" data-template-view="works" hidden={activeView !== "works"} tabIndex={-1} aria-labelledby="film-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p>ROLL 01 / SELECTED NEGATIVES</p>
            <h2 id="film-heading">八格连续放映</h2>
          </div>
          <p>左右拖动胶片、使用两侧按钮，或通过帧号时间轴定位。点击任意画面查看完整作品。</p>
        </div>

        <div className={styles.filmStock}>
          <div className={styles.sprockets} aria-hidden="true" />
          <div className={styles.railControls} role="group" aria-label="胶片轨道控制">
            <button
              type="button"
              className={styles.railPrevious}
              onClick={() => handleRailMove(-1)}
              aria-controls="film-rail"
              aria-label="向左滑动胶片轨道"
              aria-disabled={railEdges.atStart}
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              type="button"
              className={styles.railNext}
              onClick={() => handleRailMove(1)}
              aria-controls="film-rail"
              aria-label="向右滑动胶片轨道"
              aria-disabled={railEdges.atEnd}
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className={styles.rail} id="film-rail" ref={railRef} tabIndex={0} aria-label="横向作品胶片">
            {filmSlots.map((slot, index) => {
              const work = slot.work;
              return (
              <article
                className={styles.frame}
                data-film-photo-role="frame"
                data-photo-slot={slot.index + 1}
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

      <section className={styles.intertitle} data-template-view="works" hidden={activeView !== "works"} aria-label="摄影宣言">
        <p>{content.statement.eyebrow}</p>
        <h2>{content.statement.lineOne}<br /><em>{content.statement.lineTwo}</em></h2>
        <span>— {content.profile.photographer} / {content.profile.role}</span>
      </section>

      <section className={styles.services} id="film-services" data-template-view="packages" hidden={activeView !== "packages"} tabIndex={-1} aria-labelledby="services-heading">
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

      <section className={styles.booking} id="film-booking" data-template-view="contact" hidden={activeView !== "contact"} tabIndex={-1} aria-labelledby="booking-heading">
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
          <PlatformAccounts accounts={content.social} tone="dark" />
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
        <span>{content.profile.city}</span>
        <small>© 2026 · END OF PRODUCTION</small>
      </footer>
    </main>
  );
}
