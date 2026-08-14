"use client";

/* eslint-disable @next/next/no-img-element -- responsive WebP variants are generated locally for this portfolio. */

import { useMemo, type CSSProperties } from "react";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder, type PhotoSlot } from "../shared/photo-slots";
import { groupSourceOrientationSlots, justifiedPhotoColumns } from "../shared/source-orientation-layout";
import type { TemplateProps } from "../types";
import { splitCinematicLightSlots } from "./slot-plan";

const cinematicRatios = getTemplateSlotRatios("cinematic-light");

type CinematicArchiveRowStyle = CSSProperties & { "--cinematic-archive-columns": string };

function cinematicArchiveRowStyle(slots: readonly PhotoSlot[]): CinematicArchiveRowStyle {
  return { "--cinematic-archive-columns": justifiedPhotoColumns(slots) };
}

export default function CinematicLightTemplate({
  templateId,
  content,
  works,
  packages,
  bookingTemplate,
  booted,
  copiedKey,
  onCopy,
  onOpenWork,
}: TemplateProps) {
  const heroTitle = content.hero.title.trim().split(/\s+/);
  const heroTitleLead = heroTitle.shift() ?? "";
  const photoSlots = useMemo(
    () => buildPhotoSlots(works, cinematicRatios, { templateId: "cinematic-light" }),
    [works],
  );
  const cinematicSlots = useMemo(() => splitCinematicLightSlots(photoSlots), [photoSlots]);
  const {
    hero: heroSlot,
    archive: archiveSlots,
    statement: statementSlot,
  } = cinematicSlots;
  const archiveRows = useMemo(() => groupSourceOrientationSlots(archiveSlots), [archiveSlots]);
  const heroWork = heroSlot.work;
  const statementWork = statementSlot.work;

  return (
    <main className="site-shell" data-template={templateId}>
      <div className={`boot-screen ${booted ? "is-complete" : ""}`} aria-hidden="true">
        <div className="boot-crosshair" />
        <p>{content.profile.brand} OPTICAL SYSTEM</p>
        <div className="boot-progress"><span /></div>
        <small>CALIBRATING VISUAL UNIT · {String(works.length).padStart(4, "0")} FILES READY</small>
      </div>

      <header className="topbar">
        <a className="brand" href="#top" aria-label="返回首页">
          <span className="brand-mark">{content.profile.mark}</span>
          <span className="brand-name">
            {content.profile.brand}
            <small>{content.profile.photographer} · 摄影</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#archive">ARCHIVE</a>
          <a href="#services">SERVICES</a>
          <a href="#booking">BOOKING</a>
        </nav>
        <div className="system-state"><i /> {content.profile.city}</div>
      </header>

      <section
        id="top"
        className="hero"
        data-cinematic-photo-role="hero"
        data-photo-slot={heroSlot.index + 1}
      >
        {heroWork ? (
          <picture className="hero-media" data-photo-slot={heroSlot.index + 1} data-photo-ratio={heroSlot.ratio}>
            <source media="(max-width: 600px)" srcSet={heroWork.preview} />
            <img
              className="hero-image"
              src={heroWork.image}
              srcSet={`${heroWork.preview} ${heroWork.previewWidth}w, ${heroWork.image} ${heroWork.fullWidth}w`}
              sizes="100vw"
              width={heroWork.fullWidth}
              height={Math.round(heroWork.fullWidth * heroWork.previewHeight / heroWork.previewWidth)}
              alt={heroWork.subtitle}
              decoding="async"
              fetchPriority="high"
              style={{ objectPosition: heroWork.position }}
            />
          </picture>
        ) : (
          <div className="hero-media" data-photo-slot={heroSlot.index + 1} data-photo-ratio={heroSlot.ratio}>
            <PhotoPlaceholder slot={heroSlot} label="待补充主视觉" />
          </div>
        )}
        <div className="hero-vignette" />
        <div className="hero-grid" aria-hidden="true" />

        <div className="hud hud-top-left">
          <span>REC ●</span>
          <span>4K / 60FPS</span>
        </div>
        <div className="hud hud-top-right">
          <span>ISO 400</span>
          <span>1/250</span>
          <span>F 2.8</span>
        </div>
        <div className="focus-frame" aria-hidden="true"><span /></div>

        <div className="hero-copy">
          <p className="eyebrow">{content.hero.eyebrow}</p>
          <h1 className="glitch" data-text={content.hero.title}>
            {heroTitleLead}<br />{heroTitle.join(" ")}
          </h1>
          <div className="hero-bottomline">
            <p>
              <strong>{content.profile.photographer} · {content.profile.role}</strong><br />
              {content.profile.intro}<br className="hero-copy-break" /> {content.hero.services}
            </p>
            <div className="hero-actions">
              <a className="action action-primary" href="#archive">进入作品库 <span>↘</span></a>
              <a className="action action-ghost" href="#booking">启动约拍 <span>+</span></a>
            </div>
          </div>
        </div>

        <div className="hero-index">
          <span>VISUAL ARCHIVE</span>
          <strong>001—{String(works.length).padStart(3, "0")}</strong>
        </div>
        <div className="scroll-signal"><span /> SCROLL TO DECODE</div>
      </section>

      <div className="signal-strip" aria-hidden="true">
        <div>
          COSPLAY · CHARACTER · LIGHT · COLOR · STORY · COSPLAY · CHARACTER · LIGHT · COLOR · STORY ·&nbsp;
          COSPLAY · CHARACTER · LIGHT · COLOR · STORY ·
        </div>
      </div>

      <section className="trust-strip" aria-label="约拍关键信息">
        {content.trustItems.map((item) => (
          <div key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section id="archive" className="archive section-wrap">
        <div className="section-heading">
          <div>
            <p className="section-code">[ 01 / SELECTED ARCHIVE ]</p>
            <h2>角色影像档案</h2>
          </div>
          <p className="section-intro">不复制角色，而是寻找角色真正存在时应有的光线、空间与呼吸。</p>
        </div>

        <div className="work-grid">
          {archiveRows.map((row, rowIndex) => (
            <div
              className="cinematic-archive-row"
              data-cinematic-archive-row={rowIndex + 1}
              key={`cinematic-archive-row-${rowIndex}`}
              role="presentation"
              style={cinematicArchiveRowStyle(row)}
            >
              {row.map((slot) => {
                const work = slot.work;
                const archiveIndex = archiveSlots.indexOf(slot);
                const archivePosition = archiveIndex + 1;
                const cardStyle = {
                  "--index": archiveIndex,
                  ...getPhotoSlotStyle(slot),
                } as CSSProperties;
                if (!work) {
                  return (
                    <div
                      className="work-card work-card-placeholder"
                      data-cinematic-photo-role="archive"
                      data-cinematic-archive-position={archivePosition}
                      data-photo-slot={slot.index + 1}
                      data-photo-ratio={slot.ratio}
                      key={`cinematic-placeholder-${slot.index}`}
                      style={cardStyle}
                    >
                      <PhotoPlaceholder slot={slot} tone="light" label="待补充电影画面" />
                    </div>
                  );
                }

                return (
                  <button
                    className="work-card"
                    data-cinematic-photo-role="archive"
                    data-cinematic-archive-position={archivePosition}
                    data-photo-slot={slot.index + 1}
                    data-photo-ratio={slot.ratio}
                    key={`cinematic-archive-${slot.index}`}
                    onClick={() => onOpenWork(work)}
                    style={cardStyle}
                    aria-label={`查看作品 ${work.title}`}
                  >
                    <img
                      src={work.preview}
                      srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                      sizes={slot.ratio === "2:3"
                        ? "(max-width: 900px) 68vw, 38vw"
                        : "(max-width: 900px) 92vw, 38vw"}
                      width={work.previewWidth}
                      height={work.previewHeight}
                      alt={work.subtitle}
                      loading="lazy"
                      decoding="async"
                      style={{ objectPosition: work.position }}
                    />
                    <span className="work-scan" aria-hidden="true" />
                    <span className="work-meta">
                      <small>{work.code}</small>
                      <strong>{work.title}</strong>
                      <em>{work.subtitle}</em>
                    </span>
                    <span className="work-open">OPEN FILE ↗</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="archive-footer">
          <span>{archiveSlots.length} CURATED FRAMES</span>
          <span>COLOR PROFILE / CUSTOM</span>
          <span>STATUS / EXPANDING</span>
        </div>
      </section>

      <section id="services" className="services section-wrap">
        <div className="section-heading services-heading">
          <div>
            <p className="section-code">[ 02 / VISUAL MODES ]</p>
            <h2>选择拍摄模式</h2>
          </div>
          <span className="giant-code">03</span>
        </div>

        <div className="mode-list">
          {packages.map((item) => (
            <article className="mode-card" key={item.number}>
              <span className="mode-number">{item.number}</span>
              <div className="mode-title">
                <small>{item.english}</small>
                <h3>{item.name}</h3>
              </div>
              <p>{item.description}</p>
              <div className="package-offer">
                <strong>{item.price}</strong>
                <small>{item.duration}</small>
                <ul>
                  {item.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}
                </ul>
              </div>
              <a className="mode-arrow" href="#booking" aria-label={`咨询${item.name}`}>↗</a>
            </article>
          ))}
        </div>
        <p className="pricing-note">示例价格用于首版展示；服装、影棚、妆造与跨城交通费用另计。</p>
      </section>

      <section
        className="statement"
        data-cinematic-photo-role="statement"
        data-photo-slot={statementSlot.index + 1}
      >
        {statementWork ? (
          <img
            src={statementWork.image}
            srcSet={`${statementWork.preview} ${statementWork.previewWidth}w, ${statementWork.image} ${statementWork.fullWidth}w`}
            sizes="100vw"
            width={statementWork.fullWidth}
            height={Math.round(statementWork.fullWidth * statementWork.previewHeight / statementWork.previewWidth)}
            alt={statementWork.subtitle}
            loading="lazy"
            decoding="async"
            style={{ objectPosition: statementWork.position }}
          />
        ) : (
          <PhotoPlaceholder slot={statementSlot} tone="light" label="待补充宣言画面" />
        )}
        <div className="statement-overlay" />
        <div className="statement-copy">
          <p>{content.statement.eyebrow}</p>
          <h2>{content.statement.lineOne}<br />{content.statement.lineTwo}</h2>
          <span>{content.profile.brand} · PERSONAL VISUAL ARCHIVE</span>
        </div>
      </section>

      <section id="booking" className="booking section-wrap">
        <div className="booking-panel">
          <div className="booking-copy">
            <p className="section-code">[ 03 / REQUEST A MISSION ]</p>
            <h2>发起一次<br /><span>约拍任务</span></h2>
            <p className="booking-intro">告诉我角色、日期和你脑中的那一幕。复制约拍清单后，通过微信或邮箱发送即可完成首次沟通。</p>

            <div className="quick-contact">
              <button type="button" onClick={() => void onCopy(content.contact.wechat, "wechat")}>
                <small>WECHAT / 点击复制</small>
                <strong>{content.contact.wechat}</strong>
                <span aria-live="polite">{copiedKey === "wechat" ? "已复制 ✓" : "COPY ↗"}</span>
              </button>
              <a href={`mailto:${content.contact.email}`}>
                <small>EMAIL / 示例邮箱</small>
                <strong>{content.contact.email}</strong>
                <span>OPEN ↗</span>
              </a>
            </div>
            <p className="demo-note">{content.contact.note}</p>
          </div>

          <div className="booking-terminal">
            <div className="terminal-bar">
              <span>MISSION_REQUEST.TXT</span>
              <span>● ● ●</span>
            </div>
            <pre>{bookingTemplate}</pre>
            <button className="copy-button" onClick={() => void onCopy(bookingTemplate, "template")}>
              <span aria-live="polite">{copiedKey === "template" ? "已复制到剪贴板 ✓" : "复制约拍清单"}</span>
            </button>
          </div>
        </div>

        <footer>
          <div className="footer-brand">{content.profile.brand}</div>
          <p>{content.profile.photographer} · {content.profile.role}</p>
          <div className="footer-links">
            {content.social.map((item) => <span key={item.label}>{item.label} / {item.handle}</span>)}
          </div>
          <small>© 2026 ALL VISUALS RESERVED.</small>
        </footer>
      </section>

      <div className="mobile-booking-bar" aria-label="快速约拍">
        <button type="button" onClick={() => void onCopy(content.contact.wechat, "mobile-wechat")}>
          {copiedKey === "mobile-wechat" ? "微信号已复制 ✓" : "复制微信号"}
        </button>
        <a href="#booking">查看套餐并约拍 ↗</a>
      </div>

    </main>
  );
}
