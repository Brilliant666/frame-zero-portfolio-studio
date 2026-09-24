"use client";

/* eslint-disable @next/next/no-img-element -- saved local card variants. */
import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import type { SiteContent } from "../../site-config";
import type { SceneCard } from "./collection-scene";
import styles from "./motion-home.module.css";

export type MotionHomeProps = {
  cards: readonly SceneCard[];
  content: SiteContent;
  onOpen: (id: string) => void;
  restoreFocusId?: string | null;
};

function resetTilt(event: PointerEvent<HTMLButtonElement>) {
  event.currentTarget.style.setProperty("--rx", "0deg");
  event.currentTarget.style.setProperty("--ry", "0deg");
}

function tilt(event: PointerEvent<HTMLButtonElement>) {
  if (event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--rx", `${-(event.clientY - box.top - box.height / 2) / box.height * 9}deg`);
  event.currentTarget.style.setProperty("--ry", `${(event.clientX - box.left - box.width / 2) / box.width * 11}deg`);
}

export default function MotionHome({ cards, content, onOpen, restoreFocusId }: MotionHomeProps) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!restoreFocusId) return;
    const button = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("[data-motion-cover]") ?? []).find((node) => node.dataset.motionCover === restoreFocusId);
    button?.focus({ preventScroll: true });
  }, [restoreFocusId]);
  const name = content.profile.photographer || content.profile.brand || "摄影作品";
  const cover = (card: SceneCard, index: number) => {
    const ratio = card.fit === "fill" ? 4 / 3 : card.asset?.aspectRatio || 4 / 3;
    return <button type="button" key={card.id} data-motion-cover={card.id} className={styles.cover}
      aria-label={`进入图集：${card.title}，${card.subtitle}`} onClick={() => onOpen(card.id)}
      onPointerMove={tilt} onPointerLeave={resetTilt} onPointerCancel={resetTilt}
      style={{ "--rotation": `${[-8, 7, -4][index % 3]}deg`, "--delay": `${180 + Math.min(index, 8) * 140}ms`, "--bob-delay": `${index * -2.3}s`, "--photo-ratio": ratio, "--natural-width": `${320 * ratio}px` } as CSSProperties}>
      <span className={styles.bob}><span className={styles.sheet}>
        <span className={styles.photo}>{card.asset ? <img src={card.asset.variants.card.src} width={card.asset.variants.card.width} height={card.asset.variants.card.height} alt="" loading={index < 3 ? "eager" : "lazy"} draggable={false}
          style={{ objectFit: card.fit === "fill" ? "cover" : "contain", objectPosition: `${card.focusX ?? 50}% ${card.focusY ?? 50}%` }} /> : <span className={styles.emptyPhoto}>尚未设置封面</span>}</span>
        <span className={styles.caption}><span><strong>{card.title}</strong><small>{card.subtitle}</small></span><span aria-hidden="true">↗</span></span>
      </span><svg className={styles.pin} viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-11L2.8-2.8 11 0 2.8 2.8 0 11-2.8 2.8-11 0-2.8-2.8Z" /></svg></span>
    </button>;
  };
  return <section ref={root} className={styles.home} aria-label="摄影图集首页" data-motion-home>
    <div className={styles.opening}>
      <div className={styles.hero}>
        <p className={styles.kicker}>{content.profile.role && <span>{content.profile.role}</span>}{content.profile.city && <span>{content.profile.city}</span>}</p>
        <h1 className={styles.title}><span>{name}</span><i aria-hidden="true">✦</i></h1>
        <div className={styles.lede}>{content.profile.intro && <p>{content.profile.intro}</p>}{content.hero.services && <p><strong>{content.hero.services}</strong></p>}</div>
        <div className={styles.actions}>{cards.slice(0, 2).map((card, index) => <button key={card.id} type="button" data-primary={index === 0} onClick={() => onOpen(card.id)}>{card.title}<span aria-hidden="true">→</span></button>)}</div>
        {cards.length === 0 && <p className={styles.empty}>还没有可展示的图集。</p>}
      </div>
      <div className={styles.covers} data-count={Math.min(cards.length, 3)} aria-label="图集封面">{cards.slice(0, 3).map(cover)}</div>
    </div>
    {cards.length > 3 && <div className={styles.more} aria-label="更多图集">{cards.slice(3).map((card, index) => cover(card, index + 3))}</div>}
  </section>;
}
