"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_SECTIONS, getAdminSection } from "./admin-navigation";
import { formatSavedAt, useAdmin } from "./admin-provider";
import { getAdminStatus } from "./admin-state";
import styles from "./admin-v2.module.css";

export default function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const current = getAdminSection(pathname);
  const { content, dirty, editorLabel, loadState, message, reload, save, saveState, updatedAt } = useAdmin();
  const savedAt = formatSavedAt(updatedAt);
  const status = getAdminStatus(loadState, saveState, dirty);
  const saveDisabled = !dirty || loadState !== "ready" || saveState === "saving";
  const saveActionLabel = saveState === "saving" ? "正在保存全部修改" : "保存全部修改";
  const showStatusMessage = loadState !== "ready"
    || saveState === "error"
    || saveState === "saving"
    || saveState === "success";

  return (
    <div className={styles.shell} data-admin-v2="true">
      <a className={styles.skipLink} href="#admin-main">跳到当前编辑区域</a>
      <header className={styles.topbar}>
        <div className={styles.adminTitleBlock} data-admin-title="true">
          <strong>ADMIN</strong>
          <span>内容管理</span>
        </div>

        <div className={styles.currentSection}>
          <span>当前分区</span>
          <h1>{current.label}</h1>
        </div>

        <div className={styles.topbarActions}>
          <div
            className={styles.saveStatus}
            data-tone={status.tone}
            data-save-state={saveState}
            data-dirty={dirty}
            role="status"
            aria-atomic="true"
          >
            <strong>{status.label}</strong>
            <span>{showStatusMessage ? message : savedAt ? `上次保存 ${savedAt}` : editorLabel}</span>
          </div>
          <a
            className={styles.previewLink}
            href={`/?template=${content.activeTemplate}`}
            target="_blank"
            rel="noreferrer"
            aria-label="在新标签页预览当前主页"
          >
            <span className={styles.previewText}>预览当前主页</span> <span aria-hidden="true">↗</span>
          </a>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => void save()}
            disabled={saveDisabled}
            aria-label={saveActionLabel}
            title={saveActionLabel}
          >
            <span className={styles.saveButtonFull} aria-hidden="true">{saveActionLabel}</span>
            <span className={styles.saveButtonCompact} aria-hidden="true">
              {saveState === "saving" ? "保存中…" : "保存"}
            </span>
          </button>
        </div>
      </header>

      <div className={styles.mobileSwitcher}>
        <label>
          <span>切换后台分区</span>
          <select value={current.href} onChange={(event) => router.push(event.target.value)}>
            {ADMIN_SECTIONS.map((section) => (
              <option value={section.href} key={section.id}>{section.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav aria-label="后台主要分区">
            {ADMIN_SECTIONS.map((section, index) => {
              const active = section.id === current.id;
              return (
                <Link href={section.href} aria-current={active ? "page" : undefined} key={section.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </Link>
              );
            })}
          </nav>
          <div className={styles.sidebarMeta}>
            <span>{editorLabel}</span>
            <small>桌面编辑优先 · 移动端完整可访问</small>
          </div>
        </aside>

        <main id="admin-main" className={styles.main} tabIndex={-1}>
          {loadState === "error" || loadState === "degraded" ? (
            <div className={styles.errorSummary} role="alert">
              <span>{message}</span>
              <button type="button" onClick={() => void reload()}>重新读取</button>
            </div>
          ) : saveState === "error" ? <div className={styles.errorSummary} role="alert">{message}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
