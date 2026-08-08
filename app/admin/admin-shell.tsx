"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_SECTIONS, getAdminSection } from "./admin-navigation";
import { formatSavedAt, useAdmin } from "./admin-provider";
import styles from "./admin-v2.module.css";

function statusLabel(phase: ReturnType<typeof useAdmin>["phase"], dirty: boolean) {
  if (phase === "loading") return "正在读取";
  if (phase === "saving") return "正在保存";
  if (phase === "error") return "保存失败";
  if (dirty) return "未保存";
  if (phase === "success") return "保存成功";
  return "已保存";
}

function statusTone(phase: ReturnType<typeof useAdmin>["phase"], dirty: boolean) {
  if (phase === "error") return "error";
  if (phase === "saving" || phase === "loading") return "busy";
  if (dirty) return "dirty";
  if (phase === "success") return "success";
  return "saved";
}

export default function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const current = getAdminSection(pathname);
  const { content, dirty, editorLabel, message, phase, save, updatedAt } = useAdmin();
  const savedAt = formatSavedAt(updatedAt);
  const label = statusLabel(phase, dirty);
  const tone = statusTone(phase, dirty);
  const saveDisabled = !dirty || phase === "loading" || phase === "saving";

  return (
    <div className={styles.shell} data-admin-v2="true">
      <a className={styles.skipLink} href="#admin-main">跳到当前编辑区域</a>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <span>FRAME//ZERO</span>
          <strong>ADMIN</strong>
        </div>

        <div className={styles.currentSection}>
          <span>当前分区</span>
          <h1>{current.label}</h1>
        </div>

        <div className={styles.topbarActions}>
          <div className={styles.saveStatus} data-tone={tone} aria-live="polite">
            <strong>{label}</strong>
            <span>{phase === "error" ? message : savedAt ? `上次保存 ${savedAt}` : editorLabel}</span>
          </div>
          <a
            className={styles.previewLink}
            href={`/?template=${content.activeTemplate}`}
            target="_blank"
            rel="noreferrer"
          >
            预览当前主页 <span aria-hidden="true">↗</span>
          </a>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => void save()}
            disabled={saveDisabled}
            title={!dirty && phase !== "loading" ? "没有需要保存的修改" : undefined}
          >
            {phase === "saving" ? "正在保存…" : "保存"}
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
          {phase === "error" ? <div className={styles.errorSummary} role="alert">{message}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
