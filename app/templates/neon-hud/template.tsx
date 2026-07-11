"use client";

/* eslint-disable @next/next/no-img-element -- portfolio assets include local responsive WebP derivatives. */

import { useCallback, useEffect, useState } from "react";
import { buildPhotoSlots, getPhotoSlotStyle, PhotoPlaceholder } from "../shared/photo-slots";
import type { TemplateProps } from "../types";
import styles from "./template.module.css";

const neonRatios = ["16:9", "3:2", "2:3", "3:2", "3:2", "16:9", "3:2", "3:2", "16:9"] as const;

export default function NeonHudTemplate({
  content,
  works,
  packages,
  bookingTemplate,
  booted,
  copiedKey,
  onCopy,
  onOpenWork,
}: TemplateProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const photoSlots = buildPhotoSlots(works, neonRatios);
  const safeIndex = Math.min(Math.max(activeIndex, 0), photoSlots.length - 1);
  const activeSlot = photoSlots[safeIndex];
  const activeWork = activeSlot.work;

  const move = useCallback((direction: -1 | 1) => {
    setActiveIndex((index) => (index + direction + photoSlots.length) % photoSlots.length);
  }, [photoSlots.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  const frameNumber = String(safeIndex + 1).padStart(2, "0");
  const frameTotal = String(photoSlots.length).padStart(2, "0");
  const progress = `${((safeIndex + 1) / photoSlots.length) * 100}%`;

  return (
    <main className={styles.root} data-template="neon-hud">
      <div className={`${styles.boot} ${booted ? styles.bootComplete : ""}`} aria-hidden="true">
        <div className={styles.bootReticle}><span /></div>
        <p>{content.profile.mark} / OPTICAL LINK</p>
        <div className={styles.bootLine}><span /></div>
        <small>CALIBRATING {String(works.length).padStart(3, "0")} VISUAL FILES</small>
      </div>

      <header className={styles.header}>
        <a className={styles.brand} href="#hud-top" aria-label="返回霓虹取景器首页">
          <span className={styles.brandMark}>{content.profile.mark}</span>
          <span>
            <strong>{content.profile.brand}</strong>
            <small>OPTICAL ARCHIVE / {content.profile.photographer}</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#hud-archive">ARCHIVE</a>
          <a href="#hud-services">MODES</a>
          <a href="#hud-contact">BOOKING</a>
        </nav>
        <div className={styles.headerStatus}>
          <span className={styles.liveDot} />
          <span>{content.profile.availability}</span>
        </div>
      </header>

      <section id="hud-top" className={styles.hero} aria-label="主作品取景器">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroIntro}>
          <p>{content.hero.eyebrow}</p>
          <h1>{content.hero.title}</h1>
          <div className={styles.introLine}>
            <span>VISUAL OPS / {content.profile.city}</span>
            <span>{content.hero.services}</span>
          </div>
        </div>

        <div className={styles.viewportShell}>
          <div className={styles.viewportTopbar}>
            <span><i /> LIVE VIEW</span>
            <span>FRAME {frameNumber} / {frameTotal}</span>
            <span>RAW + JPG</span>
          </div>

          <div className={styles.viewportBody}>
            <div className={styles.stage}>
              {activeWork ? (
                <button
                  className={styles.stageButton}
                  type="button"
                  onClick={() => onOpenWork(activeWork)}
                  aria-label={`打开作品 ${activeWork.title}`}
                >
                  <img
                    key={activeWork.code}
                    src={activeWork.preview}
                    srcSet={`${activeWork.preview} ${activeWork.previewWidth}w, ${activeWork.image} ${activeWork.fullWidth}w`}
                    sizes="(max-width: 760px) 100vw, (max-width: 1180px) 72vw, 76vw"
                    width={activeWork.previewWidth}
                    height={activeWork.previewHeight}
                    alt={activeWork.subtitle}
                    decoding="async"
                    fetchPriority={safeIndex === 0 ? "high" : "auto"}
                    style={{ objectPosition: activeWork.position }}
                  />
                  <span className={styles.stageShade} />
                  <span className={styles.stageOpen}>OPEN FULL FRAME ↗</span>
                </button>
              ) : (
                <PhotoPlaceholder slot={activeSlot} className={styles.emptyStage} tone="dark" label="信号位待接入" />
              )}

              <div className={styles.reticle} aria-hidden="true">
                <span className={styles.reticleBox} />
                <span className={styles.reticleHorizontal} />
                <span className={styles.reticleVertical} />
              </div>
              <div className={styles.stageTelemetry} aria-hidden="true">
                <span>4K 60</span>
                <span>AF-C</span>
                <span>+0.3 EV</span>
              </div>
              <button className={`${styles.arrow} ${styles.arrowLeft}`} type="button" onClick={() => move(-1)} aria-label="上一张作品">←</button>
              <button className={`${styles.arrow} ${styles.arrowRight}`} type="button" onClick={() => move(1)} aria-label="下一张作品">→</button>
            </div>

            <aside className={styles.hudPanel} aria-label="当前作品信息">
              <div className={styles.hudSection}>
                <span className={styles.hudLabel}>TARGET ID</span>
                <strong className={styles.targetCode}>{activeWork?.code ?? "OFFLINE"}</strong>
                <p aria-live="polite" aria-atomic="true">
                  <b>{activeWork?.title ?? "NO TARGET"}</b>
                  <span>{activeWork?.subtitle ?? "请先在后台启用作品"}</span>
                </p>
              </div>

              <div className={styles.exposureGrid} aria-label="视觉参数">
                <span><small>ISO</small><strong>{String(200 + safeIndex * 100)}</strong></span>
                <span><small>SHUTTER</small><strong>1/{125 + safeIndex * 25}</strong></span>
                <span><small>APERTURE</small><strong>F2.8</strong></span>
                <span><small>PROFILE</small><strong>CINE-{String.fromCharCode(65 + (safeIndex % 4))}</strong></span>
              </div>

              <div className={styles.waveform} aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => (
                  <span key={index} style={{ height: `${18 + ((index * 17 + safeIndex * 11) % 66)}%` }} />
                ))}
              </div>

              <div className={styles.hudReadout}>
                <span><small>OPERATOR</small>{content.profile.photographer}</span>
                <span><small>BASE</small>{content.profile.city}</span>
                <span><small>STATUS</small><b>LOCKED</b></span>
              </div>

              <a className={styles.missionButton} href="#hud-contact">
                REQUEST A MISSION <span>↗</span>
              </a>
            </aside>
          </div>

          <div className={styles.dockArea}>
            <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: progress }} /></div>
            <div className={styles.dock} aria-label="选择主作品">
              {photoSlots.map((slot, index) => slot.work ? (
                <button
                  key={slot.work.code}
                  className={`${styles.dockItem} ${index === safeIndex ? styles.dockActive : ""}`}
                  data-photo-slot={index + 1}
                  data-photo-ratio={slot.ratio}
                  style={getPhotoSlotStyle(slot)}
                  type="button"
                  aria-pressed={index === safeIndex}
                  aria-label={`${index + 1}：${slot.work.title}`}
                  onClick={() => setActiveIndex(index)}
                >
                  <img
                    src={slot.work.preview}
                    width={slot.work.previewWidth}
                    height={slot.work.previewHeight}
                    alt=""
                    loading={index < 5 ? "eager" : "lazy"}
                    decoding="async"
                    style={{ objectPosition: slot.work.position }}
                  />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </button>
              ) : (
                <div
                  className={styles.dockPlaceholder}
                  data-photo-slot={index + 1}
                  data-photo-ratio={slot.ratio}
                  key={`hud-dock-placeholder-${index}`}
                  style={getPhotoSlotStyle(slot)}
                >
                  <PhotoPlaceholder slot={slot} compact tone="dark" label="OFFLINE" />
                </div>
              ))}
            </div>
            <p>← / → KEYBOARD CONTROL</p>
          </div>
        </div>
      </section>

      <section className={styles.telemetryStrip} aria-label="约拍关键信息">
        {content.trustItems.map((item, index) => (
          <div key={`${item.label}-${index}`}>
            <span>0{index + 1}</span>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section id="hud-archive" className={styles.archive}>
        <div className={styles.sectionHead}>
          <div>
            <p>{"// 01 · TARGET ARCHIVE"}</p>
            <h2>已锁定的<br /><em>角色信号</em></h2>
          </div>
          <div className={styles.sectionSummary}>
            <span>{frameTotal} VISUAL RECORDS ONLINE</span>
            <p>{content.profile.intro} 每一个档案都保留角色的光线、空间与情绪坐标。</p>
          </div>
        </div>

        <div className={styles.archiveGrid}>
          {photoSlots.map((slot, index) => {
            const work = slot.work;
            if (!work) {
              return (
                <div
                  className={`${styles.archiveCard} ${styles.archivePlaceholder}`}
                  data-photo-slot={index + 1}
                  data-photo-ratio={slot.ratio}
                  key={`hud-archive-placeholder-${index}`}
                  style={getPhotoSlotStyle(slot)}
                >
                  <PhotoPlaceholder slot={slot} tone="dark" label="等待角色信号" />
                </div>
              );
            }

            return (
              <button
                className={styles.archiveCard}
                data-photo-slot={index + 1}
                data-photo-ratio={slot.ratio}
                key={work.code}
                style={getPhotoSlotStyle(slot)}
                type="button"
                onClick={() => onOpenWork(work)}
                aria-label={`查看作品 ${work.title}`}
              >
                <img
                  src={work.preview}
                  srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                  sizes={slot.ratio === "16:9" ? "(max-width: 1080px) 94vw, 94vw" : "(max-width: 1080px) 94vw, 41vw"}
                  width={work.previewWidth}
                  height={work.previewHeight}
                  alt={work.subtitle}
                  loading="lazy"
                  decoding="async"
                  style={{ objectPosition: work.position }}
                />
                <span className={styles.cardShade} />
                <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.cardInfo}>
                  <small>{work.code} / TARGET LOCK</small>
                  <strong>{work.title}</strong>
                  <em>{work.subtitle}</em>
                </span>
                <span className={styles.cardOpen}>EXPAND ↗</span>
              </button>
            );
          })}
        </div>
      </section>

      <section id="hud-services" className={styles.services}>
        <div className={styles.sectionHead}>
          <div>
            <p>{"// 02 · CAPTURE MODES"}</p>
            <h2>选择你的<br /><em>作战模式</em></h2>
          </div>
          <div className={styles.modeLegend}>
            <span><i /> LIGHT / READY</span>
            <span><i /> COLOR / CALIBRATED</span>
            <span><i /> STORY / ARMED</span>
          </div>
        </div>

        <div className={styles.packageGrid}>
          {packages.map((item, index) => (
            <article className={styles.packageCard} key={`${item.number}-${item.name}`}>
              <div className={styles.packageTopline}>
                <span>MODE {item.number}</span>
                <span>0{index + 1} / 0{packages.length}</span>
              </div>
              <p>{item.english}</p>
              <h3>{item.name}</h3>
              <div className={styles.packagePrice}>
                <strong>{item.price}</strong>
                <span>{item.duration}</span>
              </div>
              <p className={styles.packageDescription}>{item.description}</p>
              <ul>
                {item.deliverables.map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
              <a href="#hud-contact">SELECT MODE <span>↗</span></a>
            </article>
          ))}
        </div>
        <p className={styles.serviceNote}>* 当前为演示价格与交付内容，后台修改后此处会同步更新。</p>
      </section>

      <section className={styles.manifesto}>
        {works[1] && (
          <img
            src={works[1].preview}
            srcSet={`${works[1].preview} ${works[1].previewWidth}w, ${works[1].image} ${works[1].fullWidth}w`}
            sizes="100vw"
            width={works[1].previewWidth}
            height={works[1].previewHeight}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ objectPosition: works[1].position }}
          />
        )}
        <div className={styles.manifestoGrid} aria-hidden="true" />
        <div className={styles.manifestoCopy}>
          <p>{content.statement.eyebrow}</p>
          <h2>{content.statement.lineOne}<br /><span>{content.statement.lineTwo}</span></h2>
          <small>{content.profile.brand} / VISUAL RECONSTRUCTION UNIT</small>
        </div>
      </section>

      <section id="hud-contact" className={styles.booking}>
        <div className={styles.bookingHead}>
          <p>{"// 03 · TRANSMISSION CHANNEL"}</p>
          <h2>建立连接，<br /><em>发起约拍任务。</em></h2>
          <span>{content.contact.note}</span>
        </div>

        <div className={styles.bookingGrid}>
          <div className={styles.contactPanel}>
            <div className={styles.panelBar}><span>DIRECT_CHANNELS.SYS</span><i>ONLINE</i></div>
            <button type="button" onClick={() => void onCopy(content.contact.wechat, "hud-wechat")}>
              <span><small>WECHAT / 点击复制</small><strong>{content.contact.wechat}</strong></span>
              <b aria-live="polite">{copiedKey === "hud-wechat" ? "COPIED ✓" : "COPY ↗"}</b>
            </button>
            <a href={`mailto:${content.contact.email}`}>
              <span><small>EMAIL / 发送邮件</small><strong>{content.contact.email}</strong></span>
              <b>OPEN ↗</b>
            </a>
            <div className={styles.socialLinks}>
              {content.social.map((item) => (
                <span key={`${item.label}-${item.handle}`}><small>{item.label}</small><strong>{item.handle}</strong></span>
              ))}
            </div>
          </div>

          <div className={styles.terminal}>
            <div className={styles.panelBar}><span>MISSION_REQUEST.TXT</span><i>EDITABLE COPY</i></div>
            <pre>{bookingTemplate}</pre>
            <button type="button" onClick={() => void onCopy(bookingTemplate, "hud-template")}>
              <span aria-live="polite">{copiedKey === "hud-template" ? "任务清单已复制 ✓" : "复制约拍任务清单"}</span>
              <b>CTRL + C</b>
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          <strong>{content.profile.brand}</strong>
          <span>{content.profile.photographer} · {content.profile.role}</span>
          <span>{content.profile.city}</span>
          <small>© 2026 ALL VISUALS RESERVED.</small>
        </footer>
      </section>

      <div className={styles.mobileBar} aria-label="手机快捷约拍">
        <button type="button" onClick={() => void onCopy(content.contact.wechat, "hud-mobile")}>{copiedKey === "hud-mobile" ? "微信号已复制 ✓" : "复制微信号"}</button>
        <a href="#hud-contact">启动约拍任务 ↗</a>
      </div>
    </main>
  );
}
