"use client";

/* eslint-disable @next/next/no-img-element -- portfolio assets include local responsive WebP derivatives. */

import { useEffect, useMemo, useRef, useState } from "react";
import type { TemplateProps } from "../types";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import { useTemplateSectionNavigation } from "../shared/use-template-section-navigation";
import styles from "./template.module.css";

const EDITORIAL_RATIOS = getTemplateSlotRatios("editorial-duet");
const EDITORIAL_VIEW_HASHES = {
  works: "#editorial-folio",
  packages: "#editorial-rates",
  contact: "#editorial-booking",
} as const;
const EDITORIAL_VIEW_ALIASES = [{ hash: "#editorial-top", view: "works" }] as const;

export default function EditorialDuetTemplate({
  content,
  works,
  packages,
  bookingTemplate,
  booted,
  copiedKey,
  isPreview,
  onCopy,
  onBeforeViewChange,
  onOpenWork,
}: TemplateProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { activeView, handleInternalLinkClick } = useTemplateSectionNavigation({
    aliases: EDITORIAL_VIEW_ALIASES,
    hashes: EDITORIAL_VIEW_HASHES,
    isPreview,
    onBeforeViewChange,
  });
  const photoSlots = useMemo(
    () => buildPhotoSlots(works, EDITORIAL_RATIOS, { templateId: "editorial-duet" }),
    [works],
  );
  const coverSlot = photoSlots[0];
  const chapterSlots = photoSlots.slice(1);
  const safeIndex = Math.min(activeIndex, chapterSlots.length - 1);
  const activeSlot = chapterSlots[safeIndex];
  const activeWork = activeSlot?.work;
  const coverWork = coverSlot.work;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-editorial-work]"));
    const observer = new IntersectionObserver((entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!current) return;

      const nextIndex = Number((current.target as HTMLElement).dataset.editorialWork);
      if (Number.isInteger(nextIndex)) setActiveIndex(nextIndex);
    }, {
      rootMargin: "-18% 0px -38%",
      threshold: [0.18, 0.38, 0.62],
    });

    chapters.forEach((chapter) => observer.observe(chapter));
    return () => observer.disconnect();
  }, [chapterSlots.length]);

  return (
    <main
      ref={rootRef}
      className={styles.root}
      data-template="editorial-duet"
      data-template-active-view={activeView}
      onClick={handleInternalLinkClick}
    >
      <div className={`${styles.curtain} ${booted ? styles.curtainDone : ""}`} aria-hidden="true">
        <span>{content.profile.brand}</span>
        <i />
      </div>

      <header className={styles.header}>
        <a className={styles.brand} href="#editorial-top" aria-label="返回双页时装刊首页">
          <strong>{content.profile.brand}</strong>
          <span>{content.profile.photographer} / PORTRAIT &amp; COSPLAY</span>
        </a>
        <nav aria-label="主导航">
          <a href="#editorial-folio" aria-current={activeView === "works" ? "page" : undefined}>作品</a>
          <a href="#editorial-rates" aria-current={activeView === "packages" ? "page" : undefined}>拍摄套餐</a>
          <a href="#editorial-booking" aria-current={activeView === "contact" ? "page" : undefined}>联系约拍</a>
        </nav>
        <span className={styles.issue}>ISSUE 01 · 2026</span>
      </header>

      <section id="editorial-top" className={styles.cover} data-template-view="works" hidden={activeView !== "works"} tabIndex={-1}>
        <div className={styles.coverCopy}>
          <p>{content.hero.eyebrow}</p>
          <h1>{content.hero.title}</h1>
          <div className={styles.coverDeck}>
            <span>PHOTOGRAPHY BY<br /><strong>{content.profile.photographer}</strong></span>
            <p>{content.profile.intro}<br />{content.hero.services}</p>
          </div>
          <a className={styles.coverLink} href="#editorial-folio">ENTER THE EDITION <span>↓</span></a>
        </div>

        <div className={styles.coverVisual}>
          {coverWork ? (
            <button
              type="button"
              data-ratio={coverSlot.ratio}
              data-photo-slot={coverSlot.index}
              data-photo-ratio={coverSlot.ratio}
              style={getPhotoSlotStyle(coverSlot)}
              onClick={() => onOpenWork(coverWork)}
              aria-label={`打开封面作品 ${coverWork.title}`}
            >
              <img
                src={coverWork.preview}
                srcSet={`${coverWork.preview} ${coverWork.previewWidth}w, ${coverWork.image} ${coverWork.fullWidth}w`}
                sizes="(max-width: 760px) 100vw, 54vw"
                width={coverWork.previewWidth}
                height={coverWork.previewHeight}
                alt={coverWork.subtitle}
                decoding="async"
                fetchPriority="high"
                style={{ objectPosition: coverWork.position }}
              />
              <span>OPEN COVER ↗</span>
            </button>
          ) : (
            <div className={styles.coverEmpty} data-ratio={coverSlot.ratio} data-photo-slot={coverSlot.index} data-photo-ratio={coverSlot.ratio} style={getPhotoSlotStyle(coverSlot)}>
              <PhotoPlaceholder slot={coverSlot} tone="light" label="COVER IMAGE PENDING" />
            </div>
          )}
          <div className={styles.coverCaption}>
            <span>01 / COVER STORY</span>
            <strong>{coverWork?.title ?? "UNTITLED"}</strong>
          </div>
          <div className={styles.coverStamp}>NEW<br />VISUAL<br />STORY</div>
        </div>

        <div className={styles.coverFolio} aria-hidden="true">FOLIO · {String(photoSlots.length).padStart(2, "0")}</div>
      </section>

      <section id="editorial-folio" className={styles.folio} data-template-view="works" hidden={activeView !== "works"} tabIndex={-1}>
        <aside className={styles.stickyPage} aria-label="当前作品章节">
          <div className={styles.stickyKicker}>
            <span>SELECTED WORKS</span>
            <span>{String(safeIndex + 1).padStart(2, "0")} / {String(chapterSlots.length).padStart(2, "0")}</span>
          </div>

          <div className={styles.chapterCopy} aria-live="polite" aria-atomic="true">
            <span className={styles.chapterCode}>{activeWork?.code ?? "—"}</span>
            <h2>{activeWork?.title ?? "NO WORKS"}</h2>
            <p>{activeWork?.subtitle ?? "请在后台启用至少一组摄影作品。"}</p>
          </div>

          <div className={styles.editorialNote}>
            <small>EDITOR&apos;S NOTE</small>
            <p>不是复刻角色，而是在真实世界里为角色寻找一次准确的呼吸。</p>
            <span>{content.profile.photographer}<br />{content.profile.role}</span>
          </div>

          <nav className={styles.chapterNav} aria-label="作品章节跳转">
            {chapterSlots.map((slot, index) => (
              <a
                key={`editorial-nav-${slot.index}`}
                className={index === safeIndex ? styles.chapterActive : ""}
                href={`#editorial-work-${index}`}
                aria-label={`跳转到作品 ${slot.work?.title ?? `PHOTO SLOT ${slot.index + 1}`}`}
                aria-current={index === safeIndex ? "true" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <i />
              </a>
            ))}
          </nav>
        </aside>

        <div className={styles.photoScroll}>
          {chapterSlots.map((slot, index) => {
            const work = slot.work;
            return (
            <article
              id={`editorial-work-${index}`}
              className={styles.photoChapter}
              key={`editorial-slot-${slot.index}`}
              data-editorial-work={index}
              data-ratio={slot.ratio}
              data-photo-slot={slot.index}
              data-photo-ratio={slot.ratio}
            >
              {work ? (
                <button type="button" style={getPhotoSlotStyle(slot)} onClick={() => onOpenWork(work)} aria-label={`打开作品 ${work.title}`}>
                  <img
                    src={work.preview}
                    srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                    sizes="(max-width: 760px) 100vw, 56vw"
                    width={work.previewWidth}
                    height={work.previewHeight}
                    alt={work.subtitle}
                    loading={index < 2 ? "eager" : "lazy"}
                    decoding="async"
                    style={{ objectPosition: work.position }}
                  />
                  <span className={styles.photoIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.photoExpand}>VIEW FULL FRAME ↗</span>
                </button>
              ) : (
                <div className={styles.photoPlaceholderFrame} style={getPhotoSlotStyle(slot)}>
                  <PhotoPlaceholder slot={slot} tone="light" label="CHAPTER IMAGE PENDING" />
                </div>
              )}
              <div className={styles.mobileChapterCopy}>
                <span>{work?.code ?? "PENDING"} / {String(index + 1).padStart(2, "0")}</span>
                <h2>{work?.title ?? `CHAPTER ${String(index + 1).padStart(2, "0")}`}</h2>
                <p>{work?.subtitle ?? "IMAGE PENDING / WAITING FOR THE NEXT VISUAL STORY."}</p>
              </div>
            </article>
            );
          })}
          <div className={styles.endMark}>
            <span>END OF EDITION 01</span>
            <a href="#editorial-rates">CONTINUE TO COMMISSION ↓</a>
          </div>
        </div>
      </section>

      <section className={styles.interlude} data-template-view="works" hidden={activeView !== "works"}>
        <p>{content.statement.eyebrow}</p>
        <h2>{content.statement.lineOne}<br /><em>{content.statement.lineTwo}</em></h2>
        <span>{content.profile.brand} · PERSONAL VISUAL ARCHIVE</span>
      </section>

      <section id="editorial-rates" className={styles.rates} data-template-view="packages" hidden={activeView !== "packages"} tabIndex={-1}>
        <div className={styles.sectionTitle}>
          <p>02 / COMMISSION</p>
          <h2>Three ways to<br /><em>enter the frame.</em></h2>
          <span>以下为示例套餐。价格、时长和交付内容均可在后台统一调整。</span>
        </div>

        <div className={styles.rateList}>
          {packages.map((item, index) => (
            <article key={`${item.number}-${item.name}`}>
              <div className={styles.rateNumber}>{item.number}</div>
              <div className={styles.rateName}>
                <small>{item.english}</small>
                <h3>{item.name}</h3>
              </div>
              <p>{item.description}</p>
              <div className={styles.rateTerms}>
                <strong>{item.price}</strong>
                <span>{item.duration}</span>
                <ul>{item.deliverables.map((entry) => <li key={entry}>{entry}</li>)}</ul>
              </div>
              <a href="#editorial-booking" aria-label={`咨询${item.name}`}>{String(index + 1).padStart(2, "0")} ↗</a>
            </article>
          ))}
        </div>
      </section>

      <section id="editorial-booking" className={styles.booking} data-template-view="contact" hidden={activeView !== "contact"} tabIndex={-1}>
        <div className={styles.bookingLead}>
          <p>03 / GET IN TOUCH</p>
          <h2>Let&apos;s make<br /><em>the unreal real.</em></h2>
          <p className={styles.bookingIntro}>告诉我角色、日期和你脑海里的那一幕。复制清单并通过微信或邮箱发送，即可开始第一次沟通。</p>

          <div className={styles.directContact}>
            <button type="button" onClick={() => void onCopy(content.contact.wechat, "editorial-wechat")}>
              <span>WECHAT</span>
              <strong>{content.contact.wechat}</strong>
              <b aria-live="polite">{copiedKey === "editorial-wechat" ? "COPIED ✓" : "COPY ↗"}</b>
            </button>
            <a href={`mailto:${content.contact.email}`}>
              <span>EMAIL</span>
              <strong>{content.contact.email}</strong>
              <b>WRITE ↗</b>
            </a>
          </div>
          <small className={styles.contactNote}>{content.contact.note}</small>
        </div>

        <div className={styles.bookingSheet}>
          <div className={styles.sheetHead}>
            <span>COMMISSION REQUEST</span>
            <span>FRAME//ZERO · 2026</span>
          </div>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "editorial-template")}>
            <span aria-live="polite">{copiedKey === "editorial-template" ? "约拍清单已复制 ✓" : "复制完整约拍清单"}</span>
            <b>⌘ C / CTRL C</b>
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <strong>{content.profile.brand}</strong>
        <div>{content.social.map((item) => <span key={`${item.label}-${item.handle}`}>{item.label} / {item.handle}</span>)}</div>
        <span>{content.profile.city}</span>
        <small>© 2026 ALL VISUALS RESERVED.</small>
      </footer>

      <div className={styles.mobileBar} aria-label="手机快捷约拍">
        <button type="button" onClick={() => void onCopy(content.contact.wechat, "editorial-mobile")}>{copiedKey === "editorial-mobile" ? "微信号已复制 ✓" : "复制微信号"}</button>
        <a href="#editorial-booking">开始约拍 ↗</a>
      </div>
    </main>
  );
}
