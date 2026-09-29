"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site image variants. */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Collection } from "../templates/polaroid-field/collection-model";
import type { SiteAsset } from "../site-editor/assets-client";
import { moveCollectionMember } from "./collection-member-order";
import styles from "./collection-member-editor.module.css";

export type CollectionMemberEditorProps = {
  collection: Collection;
  assets: readonly SiteAsset[];
  onChange: (next: Collection) => void;
  onView: (asset: SiteAsset) => void;
};
type Drag = { id: string; target: string; pointerId: number; x: number; y: number; collectionId: string; originalIds: string[] };

export default function CollectionMemberEditor({ collection, assets, onChange, onView }: CollectionMemberEditorProps) {
  const helpId = useId();
  const list = useRef<HTMLOListElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const positions = useRef(new Map<string, HTMLInputElement>());
  const drag = useRef<Drag | null>(null);
  const [dragView, setDragView] = useState<{ id: string; target: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const assetMap = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets]);
  const restoreFocus = useCallback((id: string) => requestAnimationFrame(() => handles.current.get(id)?.focus()), []);
  const cancelDrag = useCallback(() => { const active = drag.current; drag.current = null; setDragView(null); if (active) { setAnnouncement("已取消拖动，照片顺序未改变。"); restoreFocus(active.id); } }, [restoreFocus]);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); cancelDrag(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cancelDrag]);
  useEffect(() => {
    if (!dragView) return;
    let frame = 0;
    const scroll = () => {
      const active = drag.current;
      if (!active) return;
      const edge = 100;
      const delta = active.y < edge ? -Math.ceil((edge - active.y) / 8) : active.y > innerHeight - edge ? Math.ceil((active.y - innerHeight + edge) / 8) : 0;
      if (delta) {
        window.scrollBy(0, delta);
        const target = document.elementFromPoint(active.x, active.y)?.closest<HTMLElement>("[data-member-id]");
        if (target && list.current?.contains(target) && target.dataset.memberId && active.target !== target.dataset.memberId) {
          active.target = target.dataset.memberId;
          setDragView({ id: active.id, target: active.target });
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [dragView]);
  function move(id: string, position: number) {
    const next = moveCollectionMember(collection, id, position);
    if (next !== collection) { onChange(next); setAnnouncement(`照片已移到第 ${position + 1} 位，共 ${next.assetIds.length} 张；尚未保存。`); }
    else setAnnouncement("位置未改变。");
    restoreFocus(id);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, id: string, index: number) {
    if (drag.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const cards = [...(list.current?.children ?? [])] as HTMLElement[];
    const firstTop = cards[0]?.getBoundingClientRect().top;
    const columns = Math.max(1, cards.filter(card => Math.abs(card.getBoundingClientRect().top - (firstTop ?? 0)) < 2).length);
    const destination = event.key === "Home" ? 0 : event.key === "End" ? collection.assetIds.length - 1 : index + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : columns);
    move(id, Math.min(collection.assetIds.length - 1, Math.max(0, destination)));
  }
  function start(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, target: id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, collectionId: collection.id, originalIds: [...collection.assetIds] };
    setDragView({ id, target: id });
    setAnnouncement("拖到目标照片后松开，或按 Escape 取消。");
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.x = event.clientX; active.y = event.clientY;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-id]");
    if (target && list.current?.contains(target) && target.dataset.memberId) {
      active.target = target.dataset.memberId;
      setDragView({ id: active.id, target: active.target });
    } else {
      active.target = active.id; setDragView({ id: active.id, target: active.id });
    }
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-id]");
    if (!target || !list.current?.contains(target) || !target.dataset.memberId) {
      cancelDrag();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    active.target = target.dataset.memberId;
    drag.current = null; setDragView(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.collectionId !== collection.id || active.originalIds.join("\0") !== collection.assetIds.join("\0")) {
      setAnnouncement("图集已变化，已取消本次拖动。请重新排序。"); restoreFocus(active.id); return;
    }
    move(active.id, collection.assetIds.indexOf(active.target));
  }
  return <section className={styles.editor} aria-label="图集照片排序">
    <p id={helpId} className={styles.help}>拖动照片下方手柄调整顺序；键盘可用方向键、Home / End。排序会立即更新当前编辑效果，保存后才保留。</p>
    <p className={styles.live} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    {!collection.assetIds.length && <p>图集还没有照片，请从本站图库选片。</p>}
    <ol className={styles.grid} ref={list}>{collection.assetIds.map((id, index) => {
      const asset = assetMap.get(id);
      return <li className={styles.card} key={id} data-member-id={id} data-dragging={dragView?.id === id || undefined} data-drop-target={dragView?.target === id && dragView.id !== id || undefined}>
        <button type="button" className={styles.photo} disabled={!asset} aria-label={`查看成员 ${index + 1} 大图`} onClick={() => { if (asset) onView(asset); }}>{asset ? <img src={asset.variants.thumbnail.src} alt="" loading="lazy" draggable={false} /> : <span>素材暂不可用<br />引用保留</span>}<span className={styles.number}>{index + 1}</span>{asset && <span className={styles.view}>查看大图</span>}</button>
        <button type="button" className={styles.handle} ref={node => { if (node) handles.current.set(id, node); else handles.current.delete(id); }} aria-label={`拖动成员 ${index + 1} 调整顺序`} aria-describedby={helpId} onKeyDown={event => keyboard(event, id, index)} onPointerDown={event => start(event, id)} onPointerMove={pointerMove} onPointerUp={finish} onPointerCancel={cancelDrag} onLostPointerCapture={() => { if (drag.current?.id === id) cancelDrag(); }}>⠿ 拖动排序</button>
        <div className={styles.actions}><button type="button" disabled={!asset || collection.coverAssetId === id} onClick={() => { onChange({ ...collection, coverAssetId: id }); setAnnouncement(`第 ${index + 1} 张已设为独立封面；尚未保存。`); }}>{collection.coverAssetId === id ? "当前封面" : "设为封面"}</button><button type="button" aria-label={`移出成员 ${index + 1}`} onClick={() => { onChange({ ...collection, assetIds: collection.assetIds.filter(entry => entry !== id), focusAssetId: collection.focusAssetId === id ? null : collection.focusAssetId }); setAnnouncement(`已移出第 ${index + 1} 张，素材未删除；尚未保存。`); restoreFocus(collection.assetIds[index + 1] ?? collection.assetIds[index - 1]); }}>移出</button></div>
        <details className={styles.position}><summary>移到指定位置</summary><label>目标位置<input type="number" min={1} max={collection.assetIds.length} defaultValue={index + 1} key={index} ref={node => { if (node) positions.current.set(id, node); else positions.current.delete(id); }} aria-label={`成员 ${index + 1} 目标位置`} /></label><button type="button" onClick={() => { const value = Number(positions.current.get(id)?.value); if (!Number.isInteger(value) || value < 1 || value > collection.assetIds.length) { setAnnouncement(`请输入 1 到 ${collection.assetIds.length} 的整数。`); positions.current.get(id)?.focus(); return; } move(id, value - 1); }}>确认移动</button></details>
      </li>;
    })}</ol>
  </section>;
}
