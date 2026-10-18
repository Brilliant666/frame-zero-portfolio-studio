"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_SECTIONS, getAdminSection } from "./admin-navigation";
import { formatSavedAt, useAdmin } from "./admin-provider";
import { getAdminStatus } from "./admin-state";
import styles from "./admin-v2.module.css";
import PublicationControls from "../site-editor/publication-controls";
import DraftTemplatePreviewTrigger from "./draft-preview";
import { Select } from "../admin-kit/select";
import { WorkbenchBar, WorkbenchNav, workbenchStyle, type WorkbenchIcon } from "../admin-kit/workbench";
import { LivePreviewPane, LivePreviewToggle, useLivePreviewOpen, useLivePreviewSource } from "../admin-kit/live-preview";

const BASIC_ICONS: Record<string, WorkbenchIcon> = { template: "template", profile: "profile", packages: "packages", layout: "layout", contact: "contact", advanced: "advanced" };

export default function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const internalTest = pathname.startsWith("/test/admin");
  const { dirty, editorLabel, loadState, message, reload, save, saveState, updatedAt, siteScope, conflict, revision, content, pendingSave, checkSave } = useAdmin();
  const sectionHref = (href: string) => siteScope ? `${siteScope.adminBasePath}${href.slice(6)}` : internalTest ? `/test${href}` : href;
  const current = getAdminSection(siteScope ? `/admin${pathname.slice(siteScope.adminBasePath.length)}` : internalTest ? pathname.slice(5) : pathname);
  const livePreviewOpen = useLivePreviewOpen();
  useLivePreviewSource("basic", content, Boolean(siteScope) && livePreviewOpen);
  const savedAt = formatSavedAt(updatedAt);
  const status = getAdminStatus(loadState, saveState, dirty);
  const saveDisabled = conflict || pendingSave || !dirty || loadState !== "ready" || saveState === "saving";
  const saveActionLabel = siteScope ? "仅保存草稿" : saveState === "saving"
    ? "正在保存修改"
    : saveState === "error"
      ? "重试保存"
      : "保存修改";
  const showStatusMessage = loadState !== "ready"
    || pendingSave
    || saveState === "error"
    || saveState === "saving"
    || saveState === "success";
  const statusDetail = showStatusMessage
    ? message
    : savedAt
      ? `上次保存 ${savedAt}`
      : siteScope ? "保存仅更新本站基础版草稿，不会公开发布" : "保存后，主页刷新即显示最新内容";
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "basic-draft.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={styles.shell} data-admin-v2="true" data-site-editor={siteScope ? "basic" : undefined} style={siteScope ? workbenchStyle("basic") : undefined}>
      <a className={styles.skipLink} href="#admin-main">跳到当前编辑区域</a>
      {siteScope ? <WorkbenchBar space="basic" titleIsPageHeading autosave actions={<LivePreviewToggle />} siteSlug={siteScope.adminBasePath.split("/")[1] ?? ""} spaces={siteScope.spaces} publicationEndpoint={siteScope.publicationEndpoint}
        title={current.id === "advanced" ? "兼容内容与工具" : current.label} status={status.label}
        confirmLeave={() => !dirty || window.confirm("当前基础版草稿尚未保存。离开后未保存修改会丢失，确认离开？")} /> : <header className={styles.topbar}>
        <div className={styles.adminTitleBlock} data-admin-title="true">
          <strong>{siteScope ? "基础版空间" : "ADMIN"}</strong>
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
            <span className={styles.saveStatusDetail}>{statusDetail}</span>
          </div>
          {!siteScope && (<button
            type="button"
            className={siteScope ? styles.draftButton : styles.saveButton}
            onClick={() => void save()}
            disabled={saveDisabled}
            aria-label={saveActionLabel}
            aria-keyshortcuts="Control+S Meta+S"
            aria-busy={saveState === "saving"}
            title={saveActionLabel}
          >
            <span className={styles.saveButtonFull} aria-hidden="true">{saveActionLabel}</span>
            <span className={styles.saveButtonCompact} aria-hidden="true">
              {saveState === "saving" ? "保存中…" : siteScope ? "仅存草稿" : saveState === "error" ? "重试" : "保存"}
            </span>
          </button>)}
        </div>
      </header>}

      <div className={styles.mobileSwitcher}>
        <label>
          <span>切换后台分区</span>
          <Select label="切换后台分区" value={sectionHref(current.href)} onChange={(href) => router.push(href)}
            options={ADMIN_SECTIONS.map((section) => ({ value: sectionHref(section.href), label: siteScope && section.id === "advanced" ? "更多 → 兼容内容与工具" : section.label, description: section.description }))} />
        </label>
      </div>

      <div className={styles.body}>
        {siteScope ? <aside className={styles.sidebar}>
          <WorkbenchNav label="后台主要分区" note={<>{editorLabel}<br />十一套基础模板共用本空间内容，与星轨、流影视廊独立。</>}
            onNavigate={(event, item) => { if (!item.href || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; event.preventDefault(); router.push(item.href); }}
            groups={[{ heading: "基础版的内容", items: ADMIN_SECTIONS.filter(section => section.id !== "advanced").map(section => ({ id: section.id, label: section.label, hint: section.description, icon: BASIC_ICONS[section.id], current: section.id === current.id, href: sectionHref(section.href) })) }]} />
        </aside> : <aside className={styles.sidebar}>
          <nav aria-label="后台主要分区">
            {ADMIN_SECTIONS.filter(section => !siteScope || section.id !== "advanced").map((section, index) => {
              const active = section.id === current.id;
              return (
                <Link href={sectionHref(section.href)} aria-current={active ? "page" : undefined} key={section.id}>
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
        </aside>}

        {siteScope && <LivePreviewPane src={`/${siteScope.adminBasePath.split("/")[1] ?? ""}/admin/live/basic`} label="基础版" />}
        <main id="admin-main" className={styles.main} tabIndex={-1}>
          {siteScope?.publicationEndpoint && siteScope.publicHref && <PublicationControls endpoint={siteScope.publicationEndpoint} publicHref={siteScope.publicHref} space="basic" templateId={content.activeTemplate} revision={revision} dirty={dirty} disabled={loadState !== "ready" || saveState === "saving" || conflict || pendingSave} saveDraft={save}
            draftStatus={status.label}
            presentation="basic"
            previewAction={loadState === "ready" && <DraftTemplatePreviewTrigger templateId={content.activeTemplate} scope="admin" label="预览效果" showIcon={false} />}
            savedPreviewHref={siteScope.previewHref}
            draftAction={<button
            type="button"
            className={siteScope ? styles.draftButton : styles.saveButton}
            onClick={() => void save()}
            disabled={saveDisabled}
            aria-label={saveActionLabel}
            aria-keyshortcuts="Control+S Meta+S"
            aria-busy={saveState === "saving"}
            title={saveActionLabel}
          >
            <span className={styles.saveButtonFull} aria-hidden="true">{saveActionLabel}</span>
            <span className={styles.saveButtonCompact} aria-hidden="true">
              {saveState === "saving" ? "保存中…" : siteScope ? "仅存草稿" : saveState === "error" ? "重试" : "保存"}
            </span>
          </button>}
            tools={<>
                <Link href={sectionHref("/admin/advanced")}>兼容内容与工具</Link>
                <a href={siteScope.adminBasePath.replace(/\/basic$/, "")} onClick={(event) => { if (dirty && !window.confirm("当前基础版草稿尚未保存。离开后未保存修改会丢失，确认返回内容空间选择？")) event.preventDefault(); }}>切换内容空间</a>
                <button type="button" onClick={exportDraft}>导出当前草稿</button>
                <button type="button" disabled={saveState === "saving"} onClick={() => { if ((!dirty && !pendingSave && !conflict) || window.confirm("重新读取会替换当前编辑。请先导出留存，确认继续？")) void reload(); }}>重新读取草稿</button>
                <small>十一套基础模板共用本空间内容，与高级版独立。Ctrl/Cmd+S 仅保存草稿。{savedAt && `上次保存 ${savedAt}`}</small>
            </>} />}
          {pendingSave && <div className={styles.errorSummary} role="alert"><span>{message || "保存结果待确认，请检查后继续。"}</span><button type="button" onClick={() => void checkSave()}>检查保存结果</button><button type="button" onClick={exportDraft}>导出当前草稿</button></div>}
          {loadState === "error" || loadState === "degraded" || conflict ? (
            <div className={styles.errorSummary} role="alert">
              <span>{message}</span>
              <button type="button" onClick={exportDraft}>导出当前草稿</button>
              <button type="button" onClick={() => { if (!dirty || window.confirm("重新读取会替换未保存草稿，请先备份并确认继续。")) void reload(); }}>重新读取</button>
            </div>
          ) : saveState === "error" ? <div className={styles.errorSummary} role="alert">{message}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
