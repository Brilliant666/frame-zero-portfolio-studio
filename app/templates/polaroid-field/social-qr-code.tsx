"use client";

/* eslint-disable @next/next/no-img-element -- the QR code is generated locally as a transient data URL. */

import { useEffect, useId, useState, type SyntheticEvent } from "react";
import styles from "./polaroid-field.module.css";

type QrState =
  | { status: "idle" | "loading"; src: null }
  | { status: "ready"; src: string }
  | { status: "error"; src: null };

export default function SocialQrCode({ href, label }: Readonly<{ href: string; label: string }>) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [qrState, setQrState] = useState<QrState>({ status: "idle", src: null });

  useEffect(() => {
    if (!open || qrState.status !== "loading") return;
    let cancelled = false;

    void import("qrcode")
      .then(({ toDataURL }) => toDataURL(href, {
        width: 192,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#182227", light: "#fffdf7" },
      }))
      .then((src) => {
        if (!cancelled) setQrState({ status: "ready", src });
      })
      .catch(() => {
        if (!cancelled) setQrState({ status: "error", src: null });
      });

    return () => {
      cancelled = true;
    };
  }, [href, open, qrState.status]);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen) {
      setQrState((current) => current.status === "ready" ? current : { status: "loading", src: null });
    }
  };

  return (
    <details className={styles.socialQr} onToggle={handleToggle}>
      <summary aria-controls={panelId}>显示{label}二维码</summary>
      <div id={panelId} className={styles.socialQrPanel} aria-live="polite">
        {qrState.status === "loading" ? <span>正在本地生成二维码…</span> : null}
        {qrState.status === "error" ? <span>二维码生成失败，请直接打开主页链接。</span> : null}
        {qrState.status === "ready" ? (
          <img src={qrState.src} width={192} height={192} alt={`${label}主页二维码`} />
        ) : null}
      </div>
    </details>
  );
}
