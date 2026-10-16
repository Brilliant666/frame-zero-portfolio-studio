"use client";

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import SiteContactCard from "./contact-card";
import { FLOW_GALLERY_LIMITS, type FlowGalleryDocumentV1 } from "./flow-gallery-document";
import styles from "./flow-commercial-editor.module.css";

type Pricing = FlowGalleryDocumentV1["pricing"];
type Contact = FlowGalleryDocumentV1["contact"];
type Package = Pricing["packages"][number];
type ContactItem = Contact["items"][number];
type PreviewProps = {
  onPreview: (trigger: HTMLButtonElement) => void;
  previewDisabled?: boolean;
  /** A one-time focus request for the item restored by undo. */
  restoredItemId?: string;
  onRestoredItemFocus: (id: string) => void;
};

export type FlowPricingEditorProps = PreviewProps & {
  value: Pricing;
  onPageChange: (patch: Partial<Omit<Pricing, "packages">>) => void;
  onItemChange: (id: string, patch: Partial<Omit<Package, "id">>) => void;
  onAdd: () => string;
  onRemove: (id: string) => void;
};

export type FlowContactEditorProps = PreviewProps & {
  value: Contact;
  assetsEndpoint: string;
  onPageChange: (patch: Partial<Omit<Contact, "items">>) => void;
  onItemChange: (id: string, patch: Partial<Omit<ContactItem, "id" | "qrAssetId">>) => void;
  onQrChange: (id: string, assetId: string | undefined) => void;
  onAdd: () => string;
  onRemove: (id: string) => void;
};

function SectionHeader({ title, enabled, onToggle, onPreview, previewDisabled }: Pick<PreviewProps, "onPreview" | "previewDisabled"> & { title: string; enabled: boolean; onToggle: (enabled: boolean) => void }) {
  const moduleId = title === "联系" ? "contact" : "pricing";
  return <header className={styles.sectionHeader}>
    <div className={styles.sectionContext}><label className={styles.pageSwitch}><input type="checkbox" aria-label={`展示${title}页面`} aria-describedby={`flow-${moduleId}-page-switch-hint`} checked={enabled} onChange={event => onToggle(event.target.checked)} /><span>展示{title}页面</span><small id={`flow-${moduleId}-page-switch-hint`}>{enabled ? "发布后出现在导航中" : "页面隐藏，编辑内容保留"}</small></label><p>显示位置 · {title}页面；预览使用当前编辑。</p></div>
    <button type="button" className={styles.previewButton} data-flow-module-preview={moduleId} disabled={previewDisabled} onClick={event => onPreview(event.currentTarget)}>{title === "联系" ? "联系" : "价格"}页面效果 <span aria-hidden="true">↗</span></button>
  </header>;
}

function useRestoredItemFocus(restoredItemId: string | undefined, visibleItemId: string | undefined, prefix: string, setSelectedId: Dispatch<SetStateAction<string | null>>, onRestoredItemFocus: (id: string) => void) {
  useEffect(() => {
    if (!restoredItemId) return;
    const frame = requestAnimationFrame(() => setSelectedId(restoredItemId));
    return () => cancelAnimationFrame(frame);
  }, [restoredItemId, setSelectedId]);
  useLayoutEffect(() => {
    if (!restoredItemId || visibleItemId !== restoredItemId) return;
    const frame = requestAnimationFrame(() => {
      const entry = document.getElementById(`${prefix}${restoredItemId}`);
      if (entry?.isConnected) {
        entry.scrollIntoView({ block: "nearest" });
        entry.focus({ preventScroll: true });
        if (document.activeElement === entry) onRestoredItemFocus(restoredItemId);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [restoredItemId, visibleItemId, prefix, onRestoredItemFocus]);
}

function useSelectedItemInView(selectedId: string | undefined) {
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const list = navigation.current;
    const button = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !button) return;
    const listBounds = list.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const left = list.scrollWidth > list.clientWidth ? buttonBounds.left < listBounds.left ? buttonBounds.left - listBounds.left : buttonBounds.right > listBounds.right ? buttonBounds.right - listBounds.right : 0 : 0;
    const top = list.scrollHeight > list.clientHeight ? buttonBounds.top < listBounds.top ? buttonBounds.top - listBounds.top : buttonBounds.bottom > listBounds.bottom ? buttonBounds.bottom - listBounds.bottom : 0 : 0;
    if (left || top) list.scrollBy({ left, top });
  }, [selectedId]);
  return navigation;
}

export function FlowPricingEditor({ value, onPageChange, onItemChange, onAdd, onRemove, onPreview, previewDisabled, restoredItemId, onRestoredItemFocus }: FlowPricingEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(value.packages[0]?.id ?? null);
  const selected = value.packages.find(item => item.id === selectedId) ?? value.packages[0];
  const selectedIndex = selected ? value.packages.findIndex(item => item.id === selected.id) : -1;
  const navigation = useSelectedItemInView(selected?.id);
  useRestoredItemFocus(restoredItemId, selected?.id, "flow-price-", setSelectedId, onRestoredItemFocus);

  return <section className={styles.editor} aria-label="价格与活动编辑">
    <SectionHeader title="价格与活动" enabled={value.enabled} onToggle={enabled => onPageChange({ enabled })} onPreview={onPreview} previewDisabled={previewDisabled} />
    <div className={styles.workspace}>
      <aside className={styles.itemList} aria-label="价格项目列表">
        <div className={styles.listHeading}><h3>价格项目</h3><span>{value.packages.length} / {FLOW_GALLERY_LIMITS.packages}</span><button type="button" className={styles.addButton} disabled={value.packages.length >= FLOW_GALLERY_LIMITS.packages} onClick={() => setSelectedId(onAdd())}><span aria-hidden="true">＋ </span>新增价格项目</button></div>
        <nav ref={navigation} aria-label="价格项目定位">{value.packages.map((item, index) => <button type="button" key={item.id} className={styles.itemButton} aria-current={selected?.id === item.id ? "true" : undefined} onClick={() => setSelectedId(item.id)}><span className={styles.itemNumber}>{String(index + 1).padStart(2, "0")}</span><span className={styles.itemSummary}><strong>{item.name || "未命名价格项目"}</strong><span>{item.price || "尚未填写价格说明"}</span><small data-enabled={item.enabled || undefined}>{item.enabled ? "展示" : "隐藏"} · {item.details.length} 条细则</small></span><span className={styles.itemArrow} aria-hidden="true">→</span></button>)}</nav>
        {!value.packages.length && <p className={styles.listEmpty}>添加第一个项目，填写套餐或活动内容。</p>}
      </aside>
      {selected ? <article className={styles.itemEditor} id={`flow-price-${selected.id}`} tabIndex={-1}>
        <div className={styles.itemHeading}><div><p className={styles.eyebrow}>PROJECT {String(selectedIndex + 1).padStart(2, "0")}</p><h3>{selected.name || "编辑价格项目"}</h3></div><label className={styles.itemSwitch}><input type="checkbox" checked={selected.enabled} onChange={event => onItemChange(selected.id, { enabled: event.target.checked })} />展示此项目</label></div>
        <div className={styles.twoFields}><label className={styles.field}>名称<input maxLength={120} value={selected.name} onChange={event => onItemChange(selected.id, { name: event.target.value })} /></label><label className={styles.field}>价格说明<input aria-label="价格说明" maxLength={200} value={selected.price} onChange={event => onItemChange(selected.id, { price: event.target.value })} /><small>可填写价格、起价或活动信息。</small></label></div>
        <label className={styles.field}>内容说明<textarea rows={4} maxLength={2000} value={selected.description} onChange={event => onItemChange(selected.id, { description: event.target.value })} /></label>
        <label className={styles.field}>服务内容与细则<textarea aria-label="细则（每行一条，最多 30 条）" rows={6} value={selected.details.join("\n")} onChange={event => onItemChange(selected.id, { details: event.target.value.split("\n") })} /><small>每行一条，最多 {FLOW_GALLERY_LIMITS.details} 条；按填写顺序显示在项目下方。</small></label>
        <footer className={styles.itemFooter}><p>移除后可通过页面上的「撤销最近移除」恢复。</p><button type="button" className={styles.removeButton} onClick={() => onRemove(selected.id)}>移除此项目</button></footer>
      </article> : <div className={styles.emptyEditor}><span aria-hidden="true">＋</span><h3>整理你的价格与活动</h3><p>创建项目后，核心字段会完整显示在这里。</p></div>}
    </div>
    <div className={styles.pageSettings}>
      <h3>页面标题与介绍</h3><p>显示在「价格与活动」页面顶部。</p>
      <div className={styles.pageFields}>
        <label className={styles.field}>页面标题<input maxLength={500} value={value.heading} onChange={event => onPageChange({ heading: event.target.value })} /></label>
        <label className={styles.field}>介绍<textarea rows={3} maxLength={2000} value={value.introduction} onChange={event => onPageChange({ introduction: event.target.value })} /></label>
      </div>
    </div>
  </section>;
}

export function FlowContactEditor({ value, assetsEndpoint, onPageChange, onItemChange, onQrChange, onAdd, onRemove, onPreview, previewDisabled, restoredItemId, onRestoredItemFocus }: FlowContactEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(value.items[0]?.id ?? null);
  const selected = value.items.find(item => item.id === selectedId) ?? value.items[0];
  const selectedIndex = selected ? value.items.findIndex(item => item.id === selected.id) : -1;
  const navigation = useSelectedItemInView(selected?.id);
  useRestoredItemFocus(restoredItemId, selected?.id, "flow-contact-", setSelectedId, onRestoredItemFocus);

  return <section className={styles.editor} aria-label="联系编辑">
    <SectionHeader title="联系" enabled={value.enabled} onToggle={enabled => onPageChange({ enabled })} onPreview={onPreview} previewDisabled={previewDisabled} />
    <div className={styles.workspace}>
      <aside className={styles.itemList} aria-label="联系方式列表">
        <div className={styles.listHeading}><h3>联系方式</h3><span>{value.items.length} / {FLOW_GALLERY_LIMITS.contacts}</span><button type="button" className={styles.addButton} disabled={value.items.length >= FLOW_GALLERY_LIMITS.contacts} onClick={() => setSelectedId(onAdd())}><span aria-hidden="true">＋ </span>新增联系方式</button></div>
        <nav ref={navigation} aria-label="联系方式定位">{value.items.map((item, index) => <button type="button" key={item.id} className={styles.itemButton} aria-current={selected?.id === item.id ? "true" : undefined} onClick={() => setSelectedId(item.id)}><span className={styles.itemNumber}>{String(index + 1).padStart(2, "0")}</span><span className={styles.itemSummary}><strong>{item.label || "未命名联系方式"}</strong><span>{item.value || "尚未填写账号或说明"}</span><small>{item.qrAssetId ? "已选用二维码" : "文字联系"}{item.href ? " · 附有链接" : ""}</small></span><span className={styles.itemArrow} aria-hidden="true">→</span></button>)}</nav>
        {!value.items.length && <p className={styles.listEmpty}>添加联系方式，让访客知道如何预约或咨询。</p>}
      </aside>
      {selected ? <article className={styles.itemEditor} id={`flow-contact-${selected.id}`} tabIndex={-1}>
        <div className={styles.itemHeading}><div><p className={styles.eyebrow}>CONTACT {String(selectedIndex + 1).padStart(2, "0")}</p><h3>{selected.label || "编辑联系方式"}</h3></div><span className={styles.optionalBadge}>二维码可选</span></div>
        <label className={`${styles.field} ${styles.shortField}`}>联系名称<input aria-label="联系名称" maxLength={100} value={selected.label} onChange={event => onItemChange(selected.id, { label: event.target.value })} /><small>例如微信、邮箱或预约咨询。</small></label>
        <label className={styles.field}>账号或说明<textarea rows={3} maxLength={2000} value={selected.value} onChange={event => onItemChange(selected.id, { value: event.target.value })} /></label>
        <label className={styles.field}>链接 <span>可选</span><input aria-label="链接（可选，http / https / mailto）" maxLength={2000} type="text" inputMode="url" value={selected.href} onChange={event => onItemChange(selected.id, { href: event.target.value })} /><small>支持完整 http / https 网址或 mailto 邮箱链接。</small></label>
        <div className={styles.contactCard}><SiteContactCard key={selected.id} assetsEndpoint={assetsEndpoint} targetKey={selected.id} assetId={selected.qrAssetId} onChange={assetId => onQrChange(selected.id, assetId)} /></div>
        <footer className={styles.itemFooter}><p>移除只改变当前草稿，图库中的二维码资源保留。</p><button type="button" className={styles.removeButton} onClick={() => onRemove(selected.id)}>移除此联系方式</button></footer>
      </article> : <div className={styles.emptyEditor}><span aria-hidden="true">↗</span><h3>让联系更直接</h3><p>文字、链接或二维码，选择适合你的联系形式。</p></div>}
    </div>
    <div className={styles.pageSettings}>
      <h3>页面标题与介绍</h3><p>显示在「联系」页面顶部。</p>
      <div className={styles.pageFields}>
        <label className={styles.field}>页面标题<input maxLength={500} value={value.heading} onChange={event => onPageChange({ heading: event.target.value })} /></label>
        <label className={styles.field}>介绍<textarea rows={3} maxLength={2000} value={value.intro} onChange={event => onPageChange({ intro: event.target.value })} /></label>
      </div>
    </div>
  </section>;
}
