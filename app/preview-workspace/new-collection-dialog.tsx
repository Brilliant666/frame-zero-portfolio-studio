"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";

export default function NewCollectionDialog({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={styles.createDialog} aria-labelledby="new-collection-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
      <h2 id="new-collection-title">新建图集</h2>
      <p>填写名称，下一步从图库选择照片。创建后仍需保存；公开展示需保存并发布。</p>
      <label className={styles.field}><span>图集名称</span><input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="例如：秋日人像" /></label>
      <div className={styles.row}><button type="button" onClick={onClose}>取消新建</button><button className={styles.primary} type="submit" disabled={!name.trim()}>创建并选片</button></div>
    </form>
  </dialog>;
}
