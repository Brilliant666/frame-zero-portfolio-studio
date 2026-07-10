"use client";

/* eslint-disable @next/next/no-img-element -- responsive WebP variants are generated locally for this portfolio. */

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeSiteContent, siteConfig, type SiteContent, type Work } from "./site-config";

export default function Home() {
  const [content, setContent] = useState<SiteContent>(siteConfig);
  const [activeWork, setActiveWork] = useState<Work | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isLightboxOpen = activeWork !== null;
  const works = useMemo(() => content.works.filter((work) => work.enabled), [content.works]);
  const packages = useMemo(() => content.packages.filter((item) => item.enabled), [content.packages]);
  const heroTitle = content.hero.title.trim().split(/\s+/);
  const heroTitleLead = heroTitle.shift() ?? "";

  const bookingTemplate = useMemo(
    () => ["【约拍任务申请】", ...content.bookingFields].join("\n"),
    [content.bookingFields],
  );

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/site-content", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { content?: unknown } | null) => {
        if (!result?.content) return;
        setContent(normalizeSiteContent(result.content));
        setActiveWork(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let skipBoot = window.matchMedia("(max-width: 560px)").matches;

    try {
      skipBoot ||= window.sessionStorage.getItem("framezero-booted") === "1";
    } catch {
      // Session storage can be unavailable in private browsing contexts.
    }

    if (skipBoot) {
      const skipTimer = window.setTimeout(() => setBooted(true), 0);
      return () => window.clearTimeout(skipTimer);
    }

    const timer = window.setTimeout(() => {
      setBooted(true);
      try {
        window.sessionStorage.setItem("framezero-booted", "1");
      } catch {
        // The visual intro still completes when storage is unavailable.
      }
    }, 360);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isLightboxOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const moveWork = (direction: number) => {
      setActiveWork((current) => {
        if (!current) return current;
        const index = works.findIndex((work) => work.code === current.code);
        return works[(index + direction + works.length) % works.length];
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveWork(null);
      if (event.key === "ArrowLeft") moveWork(-1);
      if (event.key === "ArrowRight") moveWork(1);

      if (event.key === "Tab" && lightboxRef.current) {
        const focusable = Array.from(
          lightboxRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"),
        ).filter((element) => !element.hasAttribute("disabled"));

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.body.classList.add("is-locked");
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.classList.remove("is-locked");
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isLightboxOpen, works]);

  const copyText = async (value: string, key: string) => {
    let didCopy = false;

    try {
      await navigator.clipboard.writeText(value);
      didCopy = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      didCopy = document.execCommand("copy");
      textarea.remove();
    }

    if (!didCopy) return;
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2200);
  };

  const moveActiveWork = (direction: number) => {
    setActiveWork((current) => {
      if (!current) return current;
      const index = works.findIndex((work) => work.code === current.code);
      return works[(index + direction + works.length) % works.length];
    });
  };

  return (
    <main className="site-shell" data-template={content.activeTemplate}>
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

      <section id="top" className="hero">
        <picture className="hero-media">
          <source media="(max-width: 600px)" srcSet="/photos/photo-01-card.webp" />
          <img
            className="hero-image"
            src="/photos/photo-01-full.webp"
            srcSet="/photos/photo-01-card.webp 1100w, /photos/photo-01-full.webp 2200w"
            sizes="100vw"
            width="2200"
            height="1466"
            alt="赛博风格Cosplay摄影作品"
            decoding="async"
            fetchPriority="high"
          />
        </picture>
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
          {works.map((work, index) => {
            const isWide = index === 0 || index === 5 || index === 8;
            return (
              <button
                className="work-card"
                key={work.code}
                onClick={() => setActiveWork(work)}
                style={{ "--index": index } as React.CSSProperties}
                aria-label={`查看作品 ${work.title}`}
              >
                <img
                  src={work.preview}
                  srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                  sizes={isWide ? "(max-width: 900px) 92vw, 92vw" : "(max-width: 560px) 92vw, 46vw"}
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

        <div className="archive-footer">
          <span>{works.length} SELECTED FRAMES</span>
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

      <section className="statement">
        <img
          src="/photos/photo-11-full.webp"
          srcSet="/photos/photo-11-card.webp 1100w, /photos/photo-11-full.webp 2200w"
          sizes="100vw"
          width="2200"
          height="1467"
          alt="暖白电影感Cosplay摄影作品"
          loading="lazy"
          decoding="async"
        />
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
              <button type="button" onClick={() => copyText(content.contact.wechat, "wechat")}>
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
            <button className="copy-button" onClick={() => copyText(bookingTemplate, "template")}>
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
        <button type="button" onClick={() => copyText(content.contact.wechat, "mobile-wechat")}>
          {copiedKey === "mobile-wechat" ? "微信号已复制 ✓" : "复制微信号"}
        </button>
        <a href="#booking">查看套餐并约拍 ↗</a>
      </div>

      {activeWork && (
        <div
          ref={lightboxRef}
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeWork.title} 作品预览`}
        >
          <button className="lightbox-backdrop" onClick={() => setActiveWork(null)} aria-label="关闭作品预览" />
          <div className="lightbox-frame">
            <div className="lightbox-stage">
              <button className="lightbox-nav lightbox-prev" onClick={() => moveActiveWork(-1)} aria-label="上一张作品">←</button>
              <img
                src={activeWork.image}
                srcSet={`${activeWork.preview} ${activeWork.previewWidth}w, ${activeWork.image} ${activeWork.fullWidth}w`}
                sizes="92vw"
                alt={activeWork.subtitle}
                decoding="async"
              />
              <button className="lightbox-nav lightbox-next" onClick={() => moveActiveWork(1)} aria-label="下一张作品">→</button>
            </div>
            <div className="lightbox-info">
              <span>{activeWork.code}</span>
              <div><strong>{activeWork.title}</strong><small>{activeWork.subtitle}</small></div>
              <div className="lightbox-controls">
                <span>{works.findIndex((work) => work.code === activeWork.code) + 1} / {works.length}</span>
                <button ref={closeButtonRef} onClick={() => setActiveWork(null)}>CLOSE ×</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
