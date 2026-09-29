"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site image variants. */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Collection } from "../templates/polaroid-field/collection-model";
import type { SiteAsset } from "../site-editor/assets-client";
import { moveCollectionMember, moveCollectionMembers, rememberMemberMove, undoMemberMove, type MemberMoveUndo } from "./collection-member-order";
import styles from "./collection-member-editor.module.css";

export type CollectionMemberEditorProps = {
  mode?: "sort" | "manage";
  collection: Collection;
  assets: readonly SiteAsset[];
  onChange: (next: Collection) => void;
  onView: (asset: SiteAsset) => void;
};
type Drag = { id: string; target: string; side: "before" | "after"; x: number; y: number; startX: number; startY: number; active: boolean; pointerId: number; original: Collection };
type DragView = { id: string; target: string; side: "before" | "after"; x: number; y: number };

export default function CollectionMemberEditor({ collection, assets, onChange, onView, mode = "sort" }: CollectionMemberEditorProps) {
  const helpId = useId();
  const list = useRef<HTMLOListElement>(null);
  const cards = useRef(new Map<string, HTMLLIElement>());
  const [selection, setSelection] = useState<{ collectionId: string; ids: string[] }>({ collectionId: collection.id, ids: [] });
  const selectedIds = selection.collectionId === collection.id ? collection.assetIds.filter(id => selection.ids.includes(id)) : [];
  const [undo, setUndo] = useState<MemberMoveUndo | null>(null);
  const canUndo = undoMemberMove(collection, undo) !== collection;
  const toggle = (id: string) => setSelection({ collectionId: collection.id, ids: selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id] });
  const drag = useRef<Drag | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragView, setDragView] = useState<DragView | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const assetMap = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets]);
  const restoreFocus = useCallback((id: string) => requestAnimationFrame(() => cards.current.get(id)?.focus({ preventScroll: true })), []);
  const clearHold = useCallback(() => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; }, []);
  const cancelDrag = useCallback(() => {
    clearHold();
    const active = drag.current; drag.current = null; setDragView(null);
    if (active?.active) { setAnnouncement("已取消拖动，照片顺序未改变。"); restoreFocus(active.id); }
  }, [clearHold, restoreFocus]);
  const track = useCallback((x: number, y: number) => {
    const active = drag.current;
    if (!active) return;
    active.x = x; active.y = y;
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-member-id]");
    if (target && list.current?.contains(target) && target.dataset.memberId) {
      active.target = target.dataset.memberId;
      const rect = target.getBoundingClientRect();
      active.side = x < rect.left + rect.width / 2 ? "before" : "after";
    } else active.target = active.id;
    if (active.active) setDragView({ id: active.id, target: active.target, side: active.side, x, y });
  }, []);
  const activate = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    active.active = true;
    cards.current.get(active.id)?.focus({ preventScroll: true });
    track(active.x, active.y);
    setAnnouncement("拖到照片左侧插入之前，右侧插入之后；松手完成，Escape 取消。");
  }, [track]);
  const begin = useCallback((id: string, x: number, y: number, pointerId: number) => {
    clearHold();
    drag.current = { id, target: id, side: "before", x, y, startX: x, startY: y, active: false, pointerId, original: collection };
  }, [clearHold, collection]);
  const finish = useCallback((x: number, y: number) => {
    clearHold();
    const active = drag.current;
    if (!active) return;
    track(x, y);
    drag.current = null; setDragView(null);
    if (!active.active) return;
    if (active.original !== collection) { setAnnouncement("图集已变化，已取消本次拖动。请重新排序。"); restoreFocus(active.id); return; }
    const next = moveCollectionMembers(collection, [active.id], { kind: "relative", targetId: active.target, side: active.side });
    if (next !== collection) { setUndo(rememberMemberMove(collection, next)); onChange(next); setAnnouncement(`照片已移到第 ${next.assetIds.indexOf(active.id) + 1} 位；尚未保存。`); }
    else setAnnouncement("位置未改变。");
    restoreFocus(active.id);
  }, [clearHold, collection, onChange, restoreFocus, track]);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); cancelDrag(); } };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancelDrag);
    return () => { clearHold(); window.removeEventListener("keydown", key); window.removeEventListener("blur", cancelDrag); };
  }, [cancelDrag, clearHold]);
  // Native non-passive touch listeners allow scrolling until the hold has completed.
  // Changing CSS touch-action after a gesture begins cannot cancel that gesture's scroll.
  useEffect(() => {
    const node = list.current;
    if (!node || mode !== "sort") return;
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancelDrag(); return; }
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("button")) return;
      const card = element?.closest<HTMLElement>("[data-member-id]");
      if (!card?.dataset.memberId || !node.contains(card)) return;
      const touch = event.touches[0];
      begin(card.dataset.memberId, touch.clientX, touch.clientY, touch.identifier);
      holdTimer.current = setTimeout(activate, 350);
    };
    const move = (event: TouchEvent) => {
      const active = drag.current;
      if (!active) return;
      if (event.touches.length !== 1) { cancelDrag(); return; }
      const touch = [...event.touches].find(item => item.identifier === active.pointerId);
      if (!touch) { cancelDrag(); return; }
      if (!active.active) {
        if (Math.hypot(touch.clientX - active.startX, touch.clientY - active.startY) > 8) cancelDrag();
        return;
      }
      event.preventDefault(); track(touch.clientX, touch.clientY);
    };
    const end = (event: TouchEvent) => {
      const active = drag.current;
      if (!active) return;
      const touch = [...event.changedTouches].find(item => item.identifier === active.pointerId);
      if (!touch) return;
      if (active.active) event.preventDefault();
      finish(touch.clientX, touch.clientY);
    };
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("touchend", end, { passive: false });
    node.addEventListener("touchcancel", cancelDrag);
    return () => { clearHold(); node.removeEventListener("touchstart", start); node.removeEventListener("touchmove", move); node.removeEventListener("touchend", end); node.removeEventListener("touchcancel", cancelDrag); };
  }, [activate, begin, cancelDrag, clearHold, finish, mode, track]);
  useEffect(() => {
    if (!dragView) return;
    let frame = 0;
    const scroll = () => {
      const active = drag.current;
      if (!active?.active) return;
      const edge = 100;
      const delta = active.y < edge ? -Math.ceil((edge - active.y) / 8) : active.y > innerHeight - edge ? Math.ceil((active.y - innerHeight + edge) / 8) : 0;
      if (delta) { window.scrollBy(0, delta); track(active.x, active.y); }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [dragView, track]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 12000);
    return () => clearTimeout(timer);
  }, [undo]);
  function keyboard(event: KeyboardEvent<HTMLLIElement>, id: string, index: number) {
    if (event.target !== event.currentTarget || drag.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nodes = [...(list.current?.children ?? [])] as HTMLElement[];
    const firstTop = nodes[0]?.getBoundingClientRect().top;
    const columns = Math.max(1, nodes.filter(card => Math.abs(card.getBoundingClientRect().top - (firstTop ?? 0)) < 2).length);
    const destination = event.key === "Home" ? 0 : event.key === "End" ? collection.assetIds.length - 1 : index + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : columns);
    const next = moveCollectionMember(collection, id, Math.min(collection.assetIds.length - 1, Math.max(0, destination)));
    if (next !== collection) { setUndo(rememberMemberMove(collection, next)); onChange(next); setAnnouncement(`照片已移到第 ${next.assetIds.indexOf(id) + 1} 位；尚未保存。`); }
    restoreFocus(id);
    requestAnimationFrame(() => cards.current.get(id)?.scrollIntoView({ block: "nearest" }));
  }
  function startPointer(event: PointerEvent<HTMLLIElement>, id: string) {
    if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    begin(id, event.clientX, event.clientY, event.pointerId);
  }
  function movePointer(event: PointerEvent<HTMLLIElement>) {
    const active = drag.current;
    if (event.pointerType === "touch" || !active || active.pointerId !== event.pointerId) return;
    if (!active.active && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= 5) activate();
    track(event.clientX, event.clientY);
  }
  function endPointer(event: PointerEvent<HTMLLIElement>) {
    if (event.pointerType === "touch" || drag.current?.pointerId !== event.pointerId) return;
    finish(event.clientX, event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <section className={styles.editor} aria-label={mode === "sort" ? "图集照片排序" : "图集成员管理"}>
    {mode === "manage" && <div className={styles.toolbar} data-active={selectedIds.length > 0 || undefined}>
      <strong>已选 {selectedIds.length} / {collection.assetIds.length} 张</strong>
      <button type="button" onClick={() => setSelection({ collectionId: collection.id, ids: [...collection.assetIds] })} disabled={!collection.assetIds.length}>全选</button>
      <button type="button" onClick={() => setSelection({ collectionId: collection.id, ids: [] })} disabled={!selectedIds.length}>清空选择</button>
      <button type="button" disabled={selectedIds.length !== 1 || !assetMap.has(selectedIds[0])} onClick={() => { onChange({ ...collection, coverAssetId: selectedIds[0] }); setAnnouncement("所选照片已设为独立封面；尚未保存。"); }}>将所选照片设为封面</button>
      <button type="button" disabled={!selectedIds.length} onClick={() => { onChange({ ...collection, assetIds: collection.assetIds.filter(id => !selectedIds.includes(id)), focusAssetId: collection.focusAssetId && selectedIds.includes(collection.focusAssetId) ? null : collection.focusAssetId }); setSelection({ collectionId: collection.id, ids: [] }); setAnnouncement(`已移出 ${selectedIds.length} 张，素材未删除；尚未保存。`); }}>移出所选照片</button>
    </div>}
    <p id={helpId} className={styles.help}>{mode === "sort" ? "拖动整张照片调整顺序，手机长按后拖动；拖到屏幕边缘可滚动。键盘支持方向键和 Home / End，Escape 取消。" : "选择照片后统一移出；选择一张可设为封面。移出不删除本站素材。"}</p>
    <p className={styles.live} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    {mode === "sort" && canUndo && <div className={styles.feedback}><span>已调整顺序</span><button type="button" onClick={() => { const previous = undoMemberMove(collection, undo); if (previous !== collection) { onChange(previous); setAnnouncement("已撤销最近一次移动；尚未保存。"); } setUndo(null); }}>撤销最近移动</button></div>}
    {!collection.assetIds.length && <p>图集还没有照片，请从图库选片。</p>}
    <ol className={styles.grid} ref={list}>{collection.assetIds.map((id, index) => {
      const asset = assetMap.get(id);
      return <li className={styles.card} key={id} ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id); }} data-member-id={id} data-sort-card={mode === "sort" || undefined} tabIndex={mode === "sort" ? 0 : undefined} aria-label={mode === "sort" ? `照片 ${index + 1}，拖动调整顺序` : undefined} aria-describedby={mode === "sort" ? helpId : undefined} data-selected={mode === "manage" && selectedIds.includes(id) || undefined} data-dragging={dragView?.id === id || undefined} data-drop-target={dragView?.target === id && dragView.id !== id || undefined} data-drop-side={dragView?.target === id && dragView.id !== id ? dragView.side : undefined}
        onKeyDown={mode === "sort" ? event => keyboard(event, id, index) : undefined} onPointerDown={mode === "sort" ? event => startPointer(event, id) : undefined} onPointerMove={mode === "sort" ? movePointer : undefined} onPointerUp={mode === "sort" ? endPointer : undefined} onPointerCancel={event => { if (event.pointerType !== "touch") cancelDrag(); }} onLostPointerCapture={event => { if (event.pointerType !== "touch" && drag.current?.id === id) cancelDrag(); }} onContextMenu={mode === "sort" ? event => event.preventDefault() : undefined}>
        {mode === "sort" ? <><div className={styles.photo}>{asset ? <img src={asset.variants.thumbnail.src} alt="" loading="lazy" draggable={false} /> : <span>素材暂不可用<br />引用保留</span>}<span className={styles.number}>{index + 1}</span></div><button type="button" className={styles.zoom} disabled={!asset} aria-label={`查看成员 ${index + 1} 大图`} onClick={() => { if (asset) onView(asset); }}>⤢</button></> : <>
          <button type="button" className={styles.photo} disabled={!asset} aria-label={`查看成员 ${index + 1} 大图`} onClick={() => { if (asset) onView(asset); }}>{asset ? <img src={asset.variants.thumbnail.src} alt="" loading="lazy" draggable={false} /> : <span>素材暂不可用<br />引用保留</span>}<span className={styles.number}>{index + 1}</span>{collection.coverAssetId === id && <span className={styles.view}>封面</span>}</button>
          <div className={styles.cardBar}><label className={styles.select}><input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggle(id)} aria-label={`选择成员 ${index + 1}`} /><span>选择</span></label></div>
        </>}
      </li>;
    })}</ol>
    {dragView && createPortal(<div className={styles.dragGhost} aria-hidden="true" style={{ left: Math.min(dragView.x + 16, innerWidth - 116), top: Math.min(dragView.y + 16, innerHeight - 116) }}>{assetMap.has(dragView.id) && <img src={assetMap.get(dragView.id)!.variants.thumbnail.src} alt="" draggable={false} />}</div>, document.body)}
  </section>;
}
