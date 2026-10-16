"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./gallery.module.css";

/** Contact labels identify the two account channels without changing stored content. */
export function contactCopyLabel(label: string, value: string): string | null {
  if (!value.trim()) return null;
  const channel = label.trim().toLowerCase();
  if (/^qq(?:号|号码)?$/.test(channel)) return "复制QQ号";
  if (/^(?:微信(?:号|号码)?|wechat|weixin)$/.test(channel)) return "复制微信号";
  return null;
}

export default function ContactCopy({ label, value }: { label: string; value: string }) {
  const buttonLabel = contactCopyLabel(label, value);
  const [feedback, setFeedback] = useState<"" | "copied" | "failed">("");
  const [copying, setCopying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  if (!buttonLabel) return null;
  return <div className={styles.contactCopyArea}>
    <button type="button" className={styles.contactCopy} aria-label={buttonLabel} disabled={copying}
      onClick={async () => {
        if (timer.current) clearTimeout(timer.current);
        setCopying(true);
        setFeedback("");
        try {
          await navigator.clipboard.writeText(value.trim());
          if (!mounted.current) return;
          setFeedback("copied");
          timer.current = setTimeout(() => setFeedback(""), 2500);
        } catch {
          if (mounted.current) setFeedback("failed");
        } finally {
          if (mounted.current) setCopying(false);
        }
      }}>{copying ? "正在复制…" : feedback === "copied" ? "已复制 ✓" : buttonLabel}</button>
    <span className={styles.contactCopyFeedback} role="status" aria-live="polite" aria-atomic="true">
      {feedback === "copied" ? `${label}已复制` : feedback === "failed" ? "无法自动复制，请长按或选中上方账号手动复制。" : ""}
    </span>
  </div>;
}
