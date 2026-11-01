"use client";

import { useState } from "react";
import { formatFocusPosition } from "../../photo-library";
import styles from "../admin-v2.module.css";

export function normalizeFocusInput(value: string): string | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? formatFocusPosition(x, y) : null;
}

export default function FocusPositionField({
  value,
  onCommit,
}: Readonly<{
  value: string;
  onCommit: (value: string) => void;
}>) {
  // An unfinished percentage belongs to this input, not the autosaved document.
  // Keep it even when another field's save replaces the provider's content.
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const commit = (input: string) => {
    const normalized = normalizeFocusInput(input);
    setDraft(null);
    if (normalized === null) {
      setMessage("格式无效，已恢复上次有效值。请输入两个百分比，例如 50% 50%。");
      return;
    }
    setMessage("");
    if (normalized !== value) onCommit(normalized);
  };

  return (
    <label className={styles.field}>
      <span>画面焦点</span>
      <input
        value={draft ?? value}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setMessage("");
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          // Blur is the single commit path, so Enter cannot submit twice.
          event.currentTarget.blur();
        }}
      />
      <small>输入横向、纵向两个百分比，例如 50% 50%。失焦或按 Enter 后更新草稿；数值限制在 0–100，小数保留两位。无效输入会恢复上次有效值。</small>
      {message ? <small role="status">{message}</small> : null}
    </label>
  );
}
