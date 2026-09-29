"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated Site image variants. */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
type Drag = { id: string; target: string; side: "before" | "after"; pointerId: number; x: number; y: number; collectionId: string; originalIds: string[] };

export default function CollectionMemberEditor({ collection, assets, onChange, onView, mode = "sort" }: CollectionMemberEditorProps) {
  const helpId = useId();
  const list = useRef<HTMLOListElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [selection, setSelection] = useState<{ collectionId: string; ids: string[] }>({ collectionId: collection.id, ids: [] });
  const selectedIds = selection.collectionId === collection.id ? collection.assetIds.filter(id => selection.ids.includes(id)) : [];
  const [destination, setDestination] = useState<"position" | "before" | "after">("position");
  const [targetNumber, setTargetNumber] = useState("1");
  const [undo, setUndo] = useState<MemberMoveUndo | null>(null);
  const canUndo = undoMemberMove(collection, undo) !== collection;
  const toggle = (id: string) => setSelection({ collectionId: collection.id, ids: selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id] });
  const drag = useRef<Drag | null>(null);
  const [dragView, setDragView] = useState<{ id: string; target: string; side: "before" | "after" } | null>(null);
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
          active.side = active.x < target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2 ? "before" : "after";
          setDragView({ id: active.id, target: active.target, side: active.side });
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [dragView]);
  function move(id: string, position: number) {
    const next = moveCollectionMember(collection, id, position);
    if (next !== collection) { setUndo(rememberMemberMove(collection, next)); onChange(next); setAnnouncement(`照片已移到第 ${position + 1} 位，共 ${next.assetIds.length} 张；尚未保存。`); }
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
    drag.current = { id, target: id, side: "before", pointerId: event.pointerId, x: event.clientX, y: event.clientY, collectionId: collection.id, originalIds: [...collection.assetIds] };
    setDragView({ id, target: id, side: "before" });
    setAnnouncement("拖到目标照片左半侧放在它之前，右半侧放在它之后；Escape 取消。");
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.x = event.clientX; active.y = event.clientY;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-id]");
    if (target && list.current?.contains(target) && target.dataset.memberId) {
      active.target = target.dataset.memberId;
      active.side = event.clientX < target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2 ? "before" : "after";
      setDragView({ id: active.id, target: active.target, side: active.side });
    } else {
      active.target = active.id; setDragView({ id: active.id, target: active.id, side: active.side });
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
    const side = event.clientX < target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2 ? "before" : "after";
    const next = moveCollectionMembers(collection, [active.id], { kind: "relative", targetId: active.target, side });
    if (next !== collection) { setUndo(rememberMemberMove(collection, next)); onChange(next); setAnnouncement(`照片已移到第 ${next.assetIds.indexOf(active.id) + 1} 位；尚未保存。`); }
    restoreFocus(active.id);
  }
  function moveSelected() {
    const number = Number(targetNumber);
    const maximum = destination === "position" ? collection.assetIds.length - selectedIds.length + 1 : collection.assetIds.length;
    if (!selectedIds.length || !Number.isInteger(number) || number < 1 || number > maximum) { setAnnouncement(`请选择照片，并输入 1 到 ${maximum} 的整数。`); return; }
    const targetId = collection.assetIds[number - 1];
    if (destination !== "position" && selectedIds.includes(targetId)) { setAnnouncement("目标照片不能属于本次选中照片，请换一个目标序号。"); return; }
    const next = moveCollectionMembers(collection, selectedIds, destination === "position" ? { kind: "position", position: number - 1 } : { kind: "relative", targetId, side: destination });
    if (next !== collection) { setUndo(rememberMemberMove(collection, next)); onChange(next); setAnnouncement(`已移动 ${selectedIds.length} 张，保持原有相对顺序；尚未保存。`); requestAnimationFrame(() => handles.current.get(selectedIds[0])?.scrollIntoView({ block: "center" })); }
    else setAnnouncement("顺序未改变。");
  }
  return <section className={styles.editor} aria-label={mode === "sort" ? "图集照片排序" : "图集成员管理"}>
    <div className={styles.toolbar} data-active={selectedIds.length > 0 || canUndo || undefined}>
      <strong>已选 {selectedIds.length} / {collection.assetIds.length} 张</strong>
      <button type="button" onClick={() => setSelection({ collectionId: collection.id, ids: [...collection.assetIds] })} disabled={!collection.assetIds.length}>全选</button>
      <button type="button" onClick={() => setSelection({ collectionId: collection.id, ids: [] })} disabled={!selectedIds.length}>清空选择</button>
      {mode === "sort" ? <>
        <label>移动方式<select value={destination} onChange={event => setDestination(event.target.value as typeof destination)}><option value="position">移到目标序号</option><option value="before">放到目标照片之前</option><option value="after">放到目标照片之后</option></select></label>
        <label>{destination === "position" ? "移动后起始序号" : "当前目标照片序号"}<input type="number" min={1} max={destination === "position" ? collection.assetIds.length - selectedIds.length + 1 : collection.assetIds.length} value={targetNumber} onChange={event => setTargetNumber(event.target.value)} /></label>
        <button type="button" disabled={!selectedIds.length} onClick={moveSelected}>移动选中照片</button>
        <button type="button" disabled={!canUndo} onClick={() => { const previous = undoMemberMove(collection, undo); if (previous !== collection) { onChange(previous); setAnnouncement("已撤销最近一次移动；尚未保存。"); } setUndo(null); }}>撤销最近移动</button>
      </> : <>
        <button type="button" disabled={selectedIds.length !== 1 || !assetMap.has(selectedIds[0])} onClick={() => { onChange({ ...collection, coverAssetId: selectedIds[0] }); setAnnouncement("所选照片已设为独立封面；尚未保存。"); }}>将所选照片设为封面</button>
        <button type="button" disabled={!selectedIds.length} onClick={() => { onChange({ ...collection, assetIds: collection.assetIds.filter(id => !selectedIds.includes(id)), focusAssetId: collection.focusAssetId && selectedIds.includes(collection.focusAssetId) ? null : collection.focusAssetId }); setSelection({ collectionId: collection.id, ids: [] }); setAnnouncement(`已移出 ${selectedIds.length} 张，素材未删除；尚未保存。`); }}>移出所选照片</button>
      </>}
    </div>
    <p id={helpId} className={styles.help}>{mode === "sort" ? "跨行移动可多选后输入目标序号；选中照片保持原有相对顺序。手柄拖动只移动这一张，插入线标明前后；键盘支持方向键和 Home / End。" : "选择照片后统一移出；选择一张可设为封面。移出不删除本站素材。"}</p>
    <p className={styles.live} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    {!collection.assetIds.length && <p>图集还没有照片，请从图库选片。</p>}
    <ol className={styles.grid} ref={list}>{collection.assetIds.map((id, index) => {
      const asset = assetMap.get(id);
      return <li className={styles.card} key={id} data-member-id={id} data-selected={selectedIds.includes(id) || undefined} data-dragging={dragView?.id === id || undefined} data-drop-target={dragView?.target === id && dragView.id !== id || undefined} data-drop-side={dragView?.target === id && dragView.id !== id ? dragView.side : undefined}>
        <button type="button" className={styles.photo} disabled={!asset} aria-label={`查看成员 ${index + 1} 大图`} onClick={() => { if (asset) onView(asset); }}>{asset ? <img src={asset.variants.thumbnail.src} alt="" loading="lazy" draggable={false} /> : <span>素材暂不可用<br />引用保留</span>}<span className={styles.number}>{index + 1}</span>{mode === "manage" && collection.coverAssetId === id && <span className={styles.view}>封面</span>}</button>
        <div className={styles.cardBar}><label className={styles.select}><input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggle(id)} aria-label={`选择成员 ${index + 1}`} /><span>选择</span></label>
        {mode === "sort" && <button type="button" className={styles.handle} ref={node => { if (node) handles.current.set(id, node); else handles.current.delete(id); }} aria-label={`拖动成员 ${index + 1} 调整顺序`} aria-describedby={helpId} onKeyDown={event => keyboard(event, id, index)} onPointerDown={event => start(event, id)} onPointerMove={pointerMove} onPointerUp={finish} onPointerCancel={cancelDrag} onLostPointerCapture={() => { if (drag.current?.id === id) cancelDrag(); }}>⠿</button>}</div>
      </li>;
    })}</ol>
  </section>;
}
