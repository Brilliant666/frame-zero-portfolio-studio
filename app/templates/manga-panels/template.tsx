"use client";

/* eslint-disable @next/next/no-img-element -- local portfolio assets provide responsive WebP derivatives. */

import type { CSSProperties } from "react";
import { getTemplateSlotRatios } from "../catalog";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import type { TemplateProps } from "../types";
import styles from "./manga-panels.module.css";

const panelSfx = ["咔嚓!", "显影", "CUT!", "登场", "瞬间", "锁定", "光!", "定格", "续章"];
const mangaRatios = getTemplateSlotRatios("manga-panels");

export default function MangaPanelsTemplate({
  templateId,
  content,
  works,
  packages,
  bookingTemplate,
  booted,
  copiedKey,
  isPreview,
  onCopy,
  onOpenWork,
}: TemplateProps) {
  const storyboardSlots = buildPhotoSlots(works, mangaRatios);
  const leadSlot = storyboardSlots[0];
  const leadWork = leadSlot.work;

  return (
    <main
      id="top"
      className={`${styles.shell} ${booted ? styles.ready : ""}`}
      data-template={templateId}
    >
      <a className={styles.skipLink} href="#manga-works">跳到作品分镜</a>

      <header className={styles.cover}>
        <div className={styles.masthead}>
          <a className={styles.brand} href="#top" aria-label="返回漫画封面">
            <span>{content.profile.mark}</span>
            <strong>{content.profile.brand}</strong>
          </a>
          <p>角色影像志</p>
          <div className={styles.issue}>
            <span>{isPreview ? "TEMPLATE PREVIEW" : content.profile.availability}</span>
            <strong>VOL. 01</strong>
          </div>
        </div>

        <div className={styles.coverGrid}>
          <section className={styles.coverCopy} aria-labelledby="manga-title">
            <p className={styles.kicker}>COSPLAY PHOTOGRAPHY / 漫画分镜快</p>
            <h1 id="manga-title">
              角色
              <span>显现录</span>
            </h1>
            <div className={styles.titleSlash} aria-hidden="true">壱</div>
            <p className={styles.coverEnglish}>{content.hero.title}</p>
            <p className={styles.intro}>
              <strong>{content.profile.photographer} · {content.profile.role}</strong>
              {content.profile.intro} {content.hero.services}
            </p>
            <div className={styles.coverActions}>
              <a href="#manga-works">开始阅读 <span>↓</span></a>
              <a href="#manga-booking">发起约拍 <span>↗</span></a>
            </div>
          </section>

          <div className={styles.coverVisual}>
            <div className={styles.speedBurst} aria-hidden="true" />
            <div className={styles.redBlock} aria-hidden="true">FRAME<br />ZERO</div>
            {leadWork ? (
              <button
                type="button"
                className={styles.leadPanel}
                onClick={() => onOpenWork(leadWork)}
                aria-label={`查看封面作品 ${leadWork.title}`}
              >
                <img
                  src={leadWork.preview}
                  srcSet={`${leadWork.preview} ${leadWork.previewWidth}w, ${leadWork.image} ${leadWork.fullWidth}w`}
                  sizes="(max-width: 760px) 92vw, 52vw"
                  width={leadWork.previewWidth}
                  height={leadWork.previewHeight}
                  alt={leadWork.subtitle}
                  decoding="async"
                  fetchPriority="high"
                  style={{ objectPosition: leadWork.position }}
                />
                <span className={styles.leadCaption}>
                  <small>封面 / {leadWork.code}</small>
                  <strong>{leadWork.title}</strong>
                </span>
              </button>
            ) : (
              <div className={`${styles.leadPanel} ${styles.leadPlaceholder}`}>
                <PhotoPlaceholder slot={leadSlot} tone="light" label="待补充封面" />
              </div>
            )}
            <span className={styles.coverSfx} aria-hidden="true">破!</span>
          </div>
        </div>

        <nav className={styles.contents} aria-label="章节目录">
          <p>目次 / CONTENTS</p>
          <ol>
            <li><a href="#manga-works"><b>01</b><span>第一话</span><strong>角色分镜</strong></a></li>
            <li><a href="#manga-packages"><b>02</b><span>第二话</span><strong>拍摄模式</strong></a></li>
            <li><a href="#manga-booking"><b>03</b><span>第三话</span><strong>约拍作战</strong></a></li>
          </ol>
        </nav>

        <div className={styles.factStrip} aria-label="约拍关键信息">
          {content.trustItems.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </header>

      <section id="manga-works" className={`${styles.chapter} ${styles.worksChapter}`} aria-labelledby="works-title">
        <ChapterHeading
          number="01"
          eyebrow="第一话 / SELECTED STORYBOARD"
          title="角色分镜"
          note={`全 ${String(storyboardSlots.length).padStart(2, "0")} 格 · 点击画格展开原片`}
        />

        <div className={styles.storyboard}>
          {storyboardSlots.map((slot, index) => {
            const work = slot.work;
            const slotStyle = { "--panel-index": index, ...getPhotoSlotStyle(slot) } as CSSProperties;

            if (!work) {
              return (
                <div
                  className={`${styles.panel} ${styles.panelPlaceholder}`}
                  data-panel={String(index + 1)}
                  data-photo-slot={index + 1}
                  data-photo-ratio={slot.ratio}
                  key={`manga-placeholder-${index}`}
                  style={slotStyle}
                >
                  <PhotoPlaceholder slot={slot} tone="light" label="待续分镜" />
                  <span className={styles.panelSfx} aria-hidden="true">{panelSfx[index]}</span>
                </div>
              );
            }

            return (
              <button
                type="button"
                className={styles.panel}
                data-panel={String(index + 1)}
                data-photo-slot={index + 1}
                data-photo-ratio={slot.ratio}
                key={`${work.code}-${index}`}
                onClick={() => onOpenWork(work)}
                aria-label={`打开作品 ${work.title}`}
                style={slotStyle}
              >
                <img
                  src={work.preview}
                  srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                  sizes={slot.ratio === "16:9" ? "(max-width: 720px) 92vw, 92vw" : "(max-width: 720px) 92vw, 41vw"}
                  width={work.previewWidth}
                  height={work.previewHeight}
                  alt={work.subtitle || work.title}
                  loading={index < 2 ? "eager" : "lazy"}
                  decoding="async"
                  style={{ objectPosition: work.position }}
                />
                <span className={styles.dotScreen} aria-hidden="true" />
                <span className={styles.panelNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.panelMeta}>
                  <small>{work.code} / {work.subtitle}</small>
                  <strong>{work.title}</strong>
                </span>
                <span className={styles.panelSfx} aria-hidden="true">{panelSfx[index]}</span>
              </button>
            );
          })}
        </div>

        <aside className={styles.interlude}>
          <span aria-hidden="true">次</span>
          <div>
            <p>{content.statement.eyebrow}</p>
            <h2>{content.statement.lineOne}<br />{content.statement.lineTwo}</h2>
          </div>
          <small>— TO BE CONTINUED —</small>
        </aside>
      </section>

      <section id="manga-packages" className={`${styles.chapter} ${styles.packageChapter}`} aria-labelledby="packages-title">
        <ChapterHeading
          number="02"
          eyebrow="第二话 / SHOOTING MODES"
          title="选择作战模式"
          note="不同篇幅，同样认真完成角色的高光时刻"
          id="packages-title"
        />

        <div className={styles.packageGrid}>
          {packages.map((item, index) => (
            <article className={styles.packageCard} key={`${item.number}-${item.english}`}>
              <div className={styles.packageTopline}>
                <span>CASE {item.number}</span>
                <small>{item.english}</small>
              </div>
              <div className={styles.packageTitle}>
                <b aria-hidden="true">{String(index + 1).padStart(2, "0")}</b>
                <div>
                  <small>拍摄篇章</small>
                  <h3>{item.name}</h3>
                </div>
              </div>
              <p>{item.description}</p>
              <div className={styles.packagePrice}>
                <strong>{item.price}</strong>
                <span>{item.duration}</span>
              </div>
              <ul>
                {item.deliverables.map((deliverable) => (
                  <li key={deliverable}><span>✓</span>{deliverable}</li>
                ))}
              </ul>
              <a href="#manga-booking">选择本篇 <span>↗</span></a>
            </article>
          ))}
        </div>
        <p className={styles.packageNote}>※ 页面价格为展示信息；妆造、服装、场地与跨城交通费用请在约拍前单独确认。</p>
      </section>

      <section id="manga-booking" className={`${styles.chapter} ${styles.bookingChapter}`} aria-labelledby="booking-title">
        <ChapterHeading
          number="03"
          eyebrow="第三话 / START A NEW STORY"
          title="下一话，由你登场"
          note="复制约拍清单，把角色、日期与想象中的画面告诉我"
          id="booking-title"
        />

        <div className={styles.bookingGrid}>
          <div className={styles.contactPanel}>
            <p className={styles.bubble}>准备好打破次元壁了吗？</p>
            <div className={styles.contactHeadline}>
              <span aria-hidden="true">约</span>
              <div>
                <small>REQUEST A MISSION</small>
                <h3>发起一次<br />角色约拍</h3>
              </div>
            </div>
            <p className={styles.contactIntro}>{content.contact.note}</p>

            <button
              type="button"
              className={styles.contactAction}
              onClick={() => void onCopy(content.contact.wechat, "manga-wechat")}
            >
              <span>微信 / WECHAT</span>
              <strong>{content.contact.wechat}</strong>
              <b aria-live="polite">{copiedKey === "manga-wechat" ? "已复制 ✓" : "复制 ↗"}</b>
            </button>
            <a className={styles.contactAction} href={`mailto:${content.contact.email}`}>
              <span>邮箱 / EMAIL</span>
              <strong>{content.contact.email}</strong>
              <b>写信 ↗</b>
            </a>

            <div className={styles.socials}>
              {content.social.map((item) => (
                <span key={`${item.label}-${item.handle}`}><b>{item.label}</b>{item.handle}</span>
              ))}
            </div>
          </div>

          <div className={styles.requestPanel}>
            <div className={styles.requestHeader}>
              <span>分镜脚本 / MISSION REQUEST</span>
              <strong>编辑部用</strong>
            </div>
            <pre>{bookingTemplate}</pre>
            <button
              type="button"
              onClick={() => void onCopy(bookingTemplate, "manga-template")}
            >
              <span aria-live="polite">
                {copiedKey === "manga-template" ? "约拍清单已复制 ✓" : "复制完整约拍清单"}
              </span>
              <b>CTRL + C</b>
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          <div>
            <strong>{content.profile.brand}</strong>
            <span>{content.profile.photographer} · {content.profile.city}</span>
          </div>
          <p>摄影不是证明。它是角色存在过的证据。</p>
          <small>© 2026 / END OF VOLUME ONE</small>
        </footer>
      </section>

      <div className={styles.mobileCta} aria-label="快速约拍">
        <button type="button" onClick={() => void onCopy(content.contact.wechat, "manga-mobile") }>
          {copiedKey === "manga-mobile" ? "微信已复制 ✓" : "复制微信"}
        </button>
        <a href="#manga-booking">进入下一话 ↗</a>
      </div>
    </main>
  );
}

function ChapterHeading({
  number,
  eyebrow,
  title,
  note,
  id,
}: {
  number: string;
  eyebrow: string;
  title: string;
  note: string;
  id?: string;
}) {
  const headingId = id ?? (number === "01" ? "works-title" : undefined);

  return (
    <div className={styles.chapterHeading}>
      <div className={styles.chapterNumber} aria-hidden="true">{number}</div>
      <div>
        <p>{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
      </div>
      <span>{note}</span>
    </div>
  );
}
