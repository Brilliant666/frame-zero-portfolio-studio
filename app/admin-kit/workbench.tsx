"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Select } from "./select";
import { Chip } from "./chip";
import { setAutosavePreference, useAutosavePreference } from "./autosave";
import styles from "./workbench.module.css";

export type WorkbenchSpace = "basic" | "premium-polaroid" | "premium-flow-gallery";
export const WORKBENCH_SPACES: Record<WorkbenchSpace, { name: string; description: string; accent: string }> = {
  basic: { name: "基础版", description: "单页模板，按模板槽位排版", accent: "#3d4a5c" },
  "premium-polaroid": { name: "星轨", description: "星空与拍立得图集", accent: "#4c4fc4" },
  "premium-flow-gallery": { name: "流影视廊", description: "背景大图与双轨道作品流", accent: "#3e6b4c" },
};

/** Workbench colour tokens for one content space; shared controls read them through CSS variables. */
export function workbenchStyle(space: WorkbenchSpace) {
  return { "--kit-accent": WORKBENCH_SPACES[space].accent } as React.CSSProperties;
}

type BarProps = {
  space: WorkbenchSpace;
  siteSlug: string;
  /** Spaces this account may edit; the switcher never offers others. */
  spaces?: readonly WorkbenchSpace[];
  /** Read-only publication summary endpoint for this space (its sibling spaces share the shape). */
  publicationEndpoint?: string;
  title: ReactNode;
  status?: ReactNode;
  /** Same-tab navigation guard; return false to stay (e.g. unsaved edits). */
  confirmLeave?: () => boolean;
  /** Show the per-browser 自动保存 switch (Site editors only). */
  autosave?: boolean;
  /** Extra controls at the bar's end, e.g. the live preview toggle. */
  actions?: ReactNode;
  /** The title is the page heading (h1) only for editors without their own module h1. */
  titleIsPageHeading?: boolean;
};

/** One top bar for every Site editor: where you are, which template, and whether it is live. */
export function WorkbenchBar({ space, siteSlug, spaces = [space], publicationEndpoint, title, status, confirmLeave, autosave, actions, titleIsPageHeading }: BarProps) {
  const [live, setLive] = useState<WorkbenchSpace | null | undefined>(undefined);
  useEffect(() => {
    if (!publicationEndpoint) return;
    const controller = new AbortController();
    // Read-only: the same summary PublicationControls reads. Failure only hides the live chip.
    void fetch(publicationEndpoint, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((body: { current?: { space?: string } | null } | null) => {
        const value = body?.current?.space;
        setLive(value && value in WORKBENCH_SPACES ? value as WorkbenchSpace : body ? null : undefined);
      }, () => {});
    return () => controller.abort();
  }, [publicationEndpoint]);
  const adminRoot = `/${encodeURIComponent(siteSlug)}/admin`;
  const chip = (key: WorkbenchSpace) => live === undefined ? undefined : live === key ? <Chip tone="live">公开中</Chip> : <Chip>草稿</Chip>;
  const go = (href: string) => { if (!confirmLeave || confirmLeave()) window.location.assign(href); };
  return <header className={styles.bar} data-workbench-bar data-admin-kit="bar" data-photo-scroll-header>
    <a className={styles.home} href={adminRoot} onClick={event => { if (confirmLeave && !confirmLeave()) event.preventDefault(); }} aria-label="返回站点工作台">
      <span className={styles.mark} aria-hidden="true">{siteSlug.slice(0, 1).toUpperCase()}</span>
      <span className={styles.homeText}><strong>{siteSlug}</strong><small>站点工作台</small></span>
    </a>
    <div className={styles.switcher}>
      <Select<WorkbenchSpace> label="切换编辑的模板" value={space} minWidth={340}
        onChange={next => go(`${adminRoot}/${next}`)}
        trailing={chip(space)}
        options={spaces.map(key => ({ value: key, label: WORKBENCH_SPACES[key].name, description: WORKBENCH_SPACES[key].description, color: WORKBENCH_SPACES[key].accent, chip: chip(key) }))} />
    </div>
    {titleIsPageHeading ? <h1 className={styles.title}>{title}</h1> : <p className={styles.title}>{title}</p>}
    {status && <div className={styles.status}>{status}</div>}
    {autosave && <AutosaveSwitch />}
    {actions}
  </header>;
}

function AutosaveSwitch() {
  const enabled = useAutosavePreference();
  return <label className={styles.autosave} title="开启后，停止输入约 1.5 秒自动保存草稿；不会发布。">
    <button type="button" role="switch" aria-checked={enabled} aria-label="自动保存草稿" className={styles.switch} onClick={() => setAutosavePreference(!enabled)} />
    <span aria-hidden="true">自动保存</span>
  </label>;
}

export type WorkbenchNavItem = {
  id: string;
  label: string;
  icon?: WorkbenchIcon;
  current: boolean;
  count?: number;
  href?: string;
  onSelect?: () => void;
  /** Extra attributes kept for existing hooks (e.g. data-flow-section). */
  attributes?: Record<string, string>;
  hint?: string;
};

/** Shared navigation: icons, counts and a two-row grid on phones (every entry visible, 44px targets). */
export function WorkbenchNav({ label, groups, note, onSelect, onNavigate }: { label: string; groups: readonly { heading?: string; items: readonly WorkbenchNavItem[] }[]; note?: ReactNode; onSelect?: (id: string) => void; onNavigate?: (event: React.MouseEvent<HTMLAnchorElement>, item: WorkbenchNavItem) => void }) {
  return <div className={styles.side} data-admin-kit="nav">
    <nav aria-label={label} className={styles.nav} data-count={groups.reduce((sum, group) => sum + group.items.length, 0)}>
      {groups.map((group, index) => <div className={styles.group} key={group.heading ?? index}>
        {group.heading && <p className={styles.heading} aria-hidden="true">{group.heading}</p>}
        {group.items.map(item => {
          const content = <>{item.icon && <Icon name={item.icon} />}<span className={styles.label}>{item.label}{item.hint && <small>{item.hint}</small>}</span>{item.count !== undefined && <span className={styles.count} aria-hidden="true">{item.count}</span>}</>;
          return item.href
            ? <a key={item.id} href={item.href} aria-current={item.current ? "page" : undefined} className={styles.item} {...item.attributes} onClick={event => onNavigate?.(event, item)}>{content}</a>
            : <button key={item.id} type="button" aria-current={item.current ? "page" : undefined} className={styles.item} {...item.attributes} onClick={() => item.onSelect ? item.onSelect() : onSelect?.(item.id)}>{content}</button>;
        })}
      </div>)}
    </nav>
    {note && <p className={styles.note}>{note}</p>}
  </div>;
}

export type WorkbenchIcon = "library" | "albums" | "home" | "profile" | "packages" | "contact" | "template" | "layout" | "advanced";
const ICONS: Record<WorkbenchIcon, ReactNode> = {
  library: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-5-5L5 19" /></>,
  albums: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  packages: <><path d="M20 12V7l-8-4-8 4v10l8 4 3-1.5" /><path d="m4 7 8 4 8-4M12 11v10" /><path d="M17 17h5M19.5 14.5v5" /></>,
  contact: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  template: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  layout: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><path d="M17 13v8M13 17h8" /></>,
  advanced: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
};
function Icon({ name }: { name: WorkbenchIcon }) {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;
}
