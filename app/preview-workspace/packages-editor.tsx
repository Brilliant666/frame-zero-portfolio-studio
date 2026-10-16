"use client";

import { useEffect, useRef, useState } from "react";
import { addPackage, changePackage, createPackageEditorState, movePackageUp, reconcilePackageEditorState, removePackage, type EditablePackage, type PackageEditorState } from "./package-editor-state";
import styles from "./admin.module.css";

const textFields = [["number", "编号"], ["english", "英文标题"], ["name", "名称"], ["description", "介绍"], ["price", "价格"], ["duration", "拍摄时长"]] as const;
type FocusRequest = { key: number | null; control: "up" | "name" | "summary" | "add" };

export default function PackagesEditor({ value, onChange }: { value: EditablePackage[]; onChange: (value: EditablePackage[]) => void }) {
  const [stored, setStored] = useState(() => createPackageEditorState(value));
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLElement>(null);
  // Edits carry keys; equal save acknowledgements preserve the editing surface.
  const state = reconcilePackageEditorState(stored, value);
  if (state !== stored) setStored(state);

  useEffect(() => {
    if (!focusRequest) return;
    const row = focusRequest.key === null ? null : root.current?.querySelector<HTMLDetailsElement>(`[data-package-key="${focusRequest.key}"]`);
    if (focusRequest.control === "name" && row) row.open = true;
    const requested = focusRequest.control === "add"
      ? root.current?.querySelector<HTMLButtonElement>("[data-package-add]")
      : row?.querySelector<HTMLElement>(`[data-package-control="${focusRequest.control}"]`);
    const target = requested instanceof HTMLButtonElement && requested.disabled ? row?.querySelector<HTMLElement>("summary") : requested;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [focusRequest]);

  const commit = (next: PackageEditorState) => {
    if (next === state) return;
    setStored(next);
    onChange(next.items);
  };

  return <section className={styles.panel} ref={root}>
    <h2>拍摄套餐</h2>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {state.items.map((item, index) => {
      const key = state.keys[index];
      const title = item.name || `套餐 ${index + 1}`;
      const update = (patch: Partial<EditablePackage>) => commit(changePackage(state, key, patch));
      return <details className={styles.lowFrequency} key={key} data-package-key={key}>
        <summary data-package-control="summary"><strong>{title}</strong><span>{item.price || "未填价格"} · {item.duration || "未填时长"} · {item.enabled ? "显示" : "隐藏"}</span><small>编辑套餐详情</small></summary>
        <div>
          <div className={styles.grid}>{textFields.map(([field, label]) => <label className={styles.field} key={field}>
            <span>{`套餐 ${index + 1} · ${label}`}</span>
            {field === "description"
              ? <textarea value={item[field]} maxLength={2000} onChange={event => update({ [field]: event.target.value })} />
              : <input data-package-control={field === "name" ? "name" : undefined} value={item[field]} maxLength={2000} onChange={event => update({ [field]: event.target.value })} />}
          </label>)}</div>
          <label className={styles.field}><span>交付内容（每行一条）</span><textarea value={item.deliverables.join("\n")} maxLength={2000} onChange={event => update({ deliverables: event.target.value === "" ? [] : event.target.value.split("\n") })} /></label>
          <div className={styles.row}>
            <label><input type="checkbox" checked={item.enabled} onChange={event => update({ enabled: event.target.checked })} /> 显示套餐</label>
            <button type="button" data-package-control="up" disabled={index === 0} onClick={() => {
              commit(movePackageUp(state, key));
              setFocusRequest({ key, control: "up" });
              setAnnouncement(`${title}已移至第 ${index} 位。`);
            }}>上移</button>
            <button type="button" onClick={() => {
              if (!confirm("从新版草稿移除此套餐？")) return;
              const next = removePackage(state, key);
              commit(next);
              const neighbor = next.keys[Math.min(index, next.keys.length - 1)];
              setFocusRequest(neighbor === undefined ? { key: null, control: "add" } : { key: neighbor, control: "summary" });
              setAnnouncement(`已移除${title}。`);
            }}>移除套餐</button>
          </div>
        </div>
      </details>;
    })}
    <button type="button" data-package-add disabled={state.items.length >= 12} onClick={() => {
      const next = addPackage(state);
      commit(next);
      setFocusRequest({ key: next.keys[next.keys.length - 1], control: "name" });
      setAnnouncement(`已添加第 ${next.items.length} 个套餐，请填写名称。`);
    }}>添加套餐</button>
  </section>;
}
