"use client";

/* eslint-disable @next/next/no-img-element -- responsive WebP variants are provided by the local portfolio library. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Work } from "../../site-config";
import type { TemplateProps } from "../types";
import styles from "./archive-os.module.css";

const FILTERS = [
  { id: "all", label: "全部档案", marker: "◎" },
  { id: "story", label: "角色叙事", marker: "◇" },
  { id: "night", label: "夜景霓虹", marker: "◐" },
  { id: "studio", label: "影棚布景", marker: "▣" },
  { id: "dream", label: "梦境东方", marker: "✦" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type ViewMode = "grid" | "list";
type MobilePane = "folders" | "library" | "inspector";

function workTags(work: Work, index: number) {
  const source = `${work.title} ${work.subtitle}`.toLowerCase();
  const tags = new Set<Exclude<FilterId, "all">>();

  if (/战|叙事|场景|角色|battle|story/.test(source)) tags.add("story");
  if (/霓虹|夜|蓝|赛博|neon|blue/.test(source)) tags.add("night");
  if (/棚|室内|布景|礼服|studio|room/.test(source)) tags.add("studio");
  if (/梦|花|东方|柔光|清透|dream|garden|crystal/.test(source)) tags.add("dream");

  // Every record remains discoverable through at least one smart collection.
  tags.add((["story", "night", "studio", "dream"] as const)[index % 4]);
  return tags;
}

export default function ArchiveOsTemplate({
  templateId,
  content,
  works,
  packages,
  bookingTemplate,
  copiedKey,
  onCopy,
  onOpenWork,
}: TemplateProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedCode, setSelectedCode] = useState(works[0]?.code ?? "");
  const [mobilePane, setMobilePane] = useState<MobilePane>("library");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const filteredWorks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return works.filter((work, index) => {
      const matchesCollection = filter === "all" || workTags(work, index).has(filter);
      const matchesQuery = !needle || `${work.code} ${work.title} ${work.subtitle}`.toLowerCase().includes(needle);
      return matchesCollection && matchesQuery;
    });
  }, [filter, query, works]);

  const selectedWork = filteredWorks.find((work) => work.code === selectedCode) ?? filteredWorks[0];

  const collectionCount = (id: FilterId) => id === "all"
    ? works.length
    : works.filter((work, index) => workTags(work, index).has(id)).length;

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(filteredWorks.length - 1, index + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = filteredWorks.length - 1;

    if (event.key === "Enter" && filteredWorks[index]) {
      event.preventDefault();
      onOpenWork(filteredWorks[index]);
      return;
    }

    if (nextIndex === index) return;
    event.preventDefault();
    const nextWork = filteredWorks[nextIndex];
    if (!nextWork) return;
    setSelectedCode(nextWork.code);
    document.getElementById(`archive-asset-${nextIndex}`)?.focus();
  };

  return (
    <main className={styles.shell} data-template={templateId}>
      <a className={styles.skipLink} href="#archive-library">跳到作品资料库</a>

      <section className={styles.desktopWindow} aria-label="FRAME ZERO 摄影档案系统">
        <header className={styles.titlebar}>
          <div className={styles.windowControls} aria-hidden="true"><i /><i /><i /></div>
          <a className={styles.brand} href="#archive-library">
            <strong>{content.profile.mark}</strong>
            <span>{content.profile.brand} <small>ARCHIVE OS</small></span>
          </a>
          <div className={styles.path}><span>LIBRARY</span><i>/</i><strong>SELECTED_WORKS</strong></div>
          <div className={styles.sync}><i /> LOCAL ARCHIVE · {String(works.length).padStart(3, "0")} ITEMS</div>
        </header>

        <div className={styles.commandbar}>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <span className={styles.srOnly}>搜索作品</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索编号、标题或风格…"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className={styles.commandMeta}><span>{filteredWorks.length} RESULTS</span><span>UPDATED / 2026.07</span></div>
          <div className={styles.viewSwitch} aria-label="作品显示方式">
            <button type="button" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")} title="网格视图">▦</button>
            <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} title="列表视图">☷</button>
          </div>
        </div>

        <div className={styles.workspace} data-mobile-pane={mobilePane}>
          <aside className={styles.sidebar} data-pane="folders" aria-label="档案分类">
            <div className={styles.sidebarSection}>
              <p>SMART COLLECTIONS</p>
              <div className={styles.filterTree}>
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => { setFilter(item.id); setMobilePane("library"); }}
                  >
                    <span><i>{item.marker}</i>{item.label}</span>
                    <small>{String(collectionCount(item.id)).padStart(2, "0")}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.sidebarSection}>
              <p>SHOOTING STATUS</p>
              <dl className={styles.statusList}>
                {content.trustItems.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
              </dl>
            </div>

            <div className={styles.storageCard}>
              <span>ARCHIVE STORAGE</span>
              <div><i /></div>
              <small>{works.length} SELECTED / 40 CAPACITY</small>
            </div>
          </aside>

          <section className={styles.library} id="archive-library" data-pane="library" aria-labelledby="library-heading">
            <div className={styles.libraryHeading}>
              <div><p>FRAME//ZERO / {FILTERS.find((item) => item.id === filter)?.label}</p><h1 id="library-heading">摄影作品档案</h1></div>
              <span>{content.hero.eyebrow}</span>
            </div>

            {filteredWorks.length > 0 ? (
              <div className={viewMode === "grid" ? styles.assetGrid : styles.assetList} role="listbox" aria-label="作品列表">
                {filteredWorks.map((work, index) => {
                  const selected = selectedWork?.code === work.code;
                  return (
                    <button
                      id={`archive-asset-${index}`}
                      className={styles.asset}
                      key={work.code}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { setSelectedCode(work.code); setMobilePane("inspector"); }}
                      onDoubleClick={() => onOpenWork(work)}
                      onKeyDown={(event) => moveSelection(event, index)}
                    >
                      <span className={styles.assetImage}>
                        <img
                          src={work.preview}
                          srcSet={`${work.preview} ${work.previewWidth}w, ${work.image} ${work.fullWidth}w`}
                          sizes={viewMode === "grid" ? "(max-width: 760px) 44vw, (max-width: 1200px) 28vw, 18vw" : "8rem"}
                          width={work.previewWidth}
                          height={work.previewHeight}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={{ objectPosition: work.position }}
                        />
                        <i aria-hidden="true">{selected ? "SELECTED" : "RAW+"}</i>
                      </span>
                      <span className={styles.assetMeta}>
                        <strong>{work.title}</strong>
                        <small>{work.subtitle}</small>
                        <em>{work.code} · WEBP</em>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState} role="status"><span>⌕</span><strong>没有匹配的档案</strong><p>尝试更换分类或缩短搜索关键词。</p></div>
            )}
          </section>

          <aside className={styles.inspector} data-pane="inspector" aria-label="作品检查器">
            <div className={styles.inspectorTitle}><span>INSPECTOR</span><small>⌘ I</small></div>
            {selectedWork ? (
              <>
                <button className={styles.inspectorImage} type="button" onClick={() => onOpenWork(selectedWork)} aria-label={`Quick Look ${selectedWork.title}`}>
                  <img
                    src={selectedWork.preview}
                    srcSet={`${selectedWork.preview} ${selectedWork.previewWidth}w, ${selectedWork.image} ${selectedWork.fullWidth}w`}
                    sizes="(max-width: 760px) 92vw, 20rem"
                    width={selectedWork.previewWidth}
                    height={selectedWork.previewHeight}
                    alt={selectedWork.subtitle}
                    decoding="async"
                    style={{ objectPosition: selectedWork.position }}
                  />
                  <span>QUICK LOOK</span>
                </button>
                <div className={styles.inspectorName}><small>{selectedWork.code}</small><h2>{selectedWork.title}</h2><p>{selectedWork.subtitle}</p></div>
                <dl className={styles.metadata}>
                  <div><dt>FORMAT</dt><dd>WEBP / RGB</dd></div>
                  <div><dt>DIMENSIONS</dt><dd>{selectedWork.fullWidth} PX</dd></div>
                  <div><dt>FOCUS</dt><dd>{selectedWork.position}</dd></div>
                  <div><dt>STATUS</dt><dd><i /> PUBLISHED</dd></div>
                </dl>
                <button className={styles.quickLook} type="button" onClick={() => onOpenWork(selectedWork)}>打开 Quick Look <span>↗</span></button>
              </>
            ) : <div className={styles.inspectorEmpty}>选择一个档案查看信息</div>}
          </aside>
        </div>

        <div className={styles.mobileTabs} aria-label="移动端档案导航">
          <button type="button" aria-pressed={mobilePane === "folders"} onClick={() => setMobilePane("folders")}><span>⌘</span>分类</button>
          <button type="button" aria-pressed={mobilePane === "library"} onClick={() => setMobilePane("library")}><span>▦</span>档案</button>
          <button type="button" aria-pressed={mobilePane === "inspector"} onClick={() => setMobilePane("inspector")}><span>ⓘ</span>检查器</button>
          <a href="#archive-booking"><span>＋</span>约拍</a>
        </div>
      </section>

      <section className={styles.services} aria-labelledby="archive-services-heading">
        <div className={styles.sectionHeading}>
          <span>02 / SERVICE MODULES</span>
          <h2 id="archive-services-heading">拍摄服务目录</h2>
          <p>选定制作模式后，把角色、档期和参考资料发来，剩下的流程会像整理档案一样清晰。</p>
        </div>
        <div className={styles.packageGrid}>
          {packages.map((item) => (
            <article className={styles.packageCard} key={item.number}>
              <div className={styles.packageHead}><span>MODULE_{item.number}</span><i>READY</i></div>
              <small>{item.english} · {item.duration}</small>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <ul>{item.deliverables.map((entry) => <li key={entry}>{entry}</li>)}</ul>
              <div><strong>{item.price}</strong><a href="#archive-booking">SELECT →</a></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.booking} id="archive-booking" aria-labelledby="archive-booking-heading">
        <div className={styles.bookingIntro}>
          <span>03 / NEW PROJECT REQUEST</span>
          <h2 id="archive-booking-heading">创建一条新的<br />拍摄任务。</h2>
          <p>{content.profile.intro} 告诉我角色与画面目标，我们从同一份清晰的任务档案开始。</p>
          <div className={styles.contactActions}>
            <button type="button" onClick={() => void onCopy(content.contact.wechat, "archive-wechat")}>
              <small>WECHAT / COPY ID</small><strong>{content.contact.wechat}</strong><span>{copiedKey === "archive-wechat" ? "COPIED ✓" : "COPY ↗"}</span>
            </button>
            <a href={`mailto:${content.contact.email}`}><small>EMAIL / NEW MESSAGE</small><strong>{content.contact.email}</strong><span>OPEN ↗</span></a>
          </div>
          <p className={styles.note}>{content.contact.note}</p>
        </div>

        <div className={styles.requestWindow}>
          <div className={styles.requestTitle}><span>MISSION_REQUEST.TXT</span><i>UNSAVED</i></div>
          <pre>{bookingTemplate}</pre>
          <button type="button" onClick={() => void onCopy(bookingTemplate, "archive-request")}>
            {copiedKey === "archive-request" ? "任务档案已复制 ✓" : "复制任务档案"}
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <strong>{content.profile.brand} / ARCHIVE OS</strong>
        <div>{content.social.map((item) => <span key={item.label}>{item.label} · {item.handle}</span>)}</div>
        <small>© 2026 · ALL SYSTEMS OPERATIONAL</small>
      </footer>
    </main>
  );
}
