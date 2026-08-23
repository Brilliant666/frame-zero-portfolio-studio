/* eslint-disable @next/next/no-img-element -- uploaded platform cards retain their original dimensions. */

"use client";

import { useEffect, useState } from "react";
import type { SiteContent } from "../../site-config";
import { getPlatformQrAssetPath } from "../../platform-qr";
import { getSafeSocialUrl } from "../../social-links";
import { probePlatformCardAvailability } from "./platform-card-availability";
import styles from "./platform-accounts.module.css";

type PlatformAccountsProps = Readonly<{
  accounts: SiteContent["social"];
  layout?: "grid" | "stack";
  tone?: "light" | "dark";
}>;

function PlatformShareCard({ label, url }: Readonly<{ label: string; url: string }>) {
  const [status, setStatus] = useState<"checking" | "available" | "unavailable">("checking");

  useEffect(() => {
    const controller = new AbortController();
    void probePlatformCardAvailability(url, { signal: controller.signal })
      .then((available) => {
        if (!controller.signal.aborted) {
          setStatus(available ? "available" : "unavailable");
        }
      });
    return () => controller.abort();
  }, [url]);

  if (status !== "available") return null;

  return (
    <div className={styles.shareCard} role="group" aria-label={`${label}分享卡片`}>
      <a
        className={styles.fullImageLink}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开${label}分享卡片原图`}
      >
        <img
          src={url}
          alt={`${label}平台分享卡片`}
          loading="lazy"
          decoding="async"
          onError={() => setStatus("unavailable")}
        />
        <span>打开原图 ↗</span>
      </a>
    </div>
  );
}

export default function PlatformAccounts({ accounts, layout = "grid", tone = "light" }: PlatformAccountsProps) {
  const visibleAccounts = accounts.flatMap((account, index) => {
    const handle = account.handle.trim();
    const qrUrl = getPlatformQrAssetPath(account.qrAssetId);
    if (!handle && !qrUrl) return [];

    const label = account.label.trim() || `平台 ${index + 1}`;
    return [{
      handle,
      href: handle ? getSafeSocialUrl(handle) : null,
      label,
      qrUrl,
    }];
  });

  if (visibleAccounts.length === 0) return null;

  return (
    <section className={styles.accounts} data-layout={layout} data-tone={tone} aria-label="平台账号与分享卡片">
      <div className={styles.heading}>
        <h3>平台账号</h3>
        <p>填写主页链接时可直接打开；已上传的分享卡片会在下方完整显示。</p>
      </div>

      <div className={styles.grid}>
        {visibleAccounts.map((account, index) => (
          <article className={styles.account} key={`${account.label}-${account.handle}-${index}`}>
            <div className={styles.identity}>
              <strong>{account.label}</strong>
              <span>{account.handle || "已上传平台分享卡片"}</span>
            </div>

            {account.href ? (
              <a className={styles.profileLink} href={account.href} target="_blank" rel="noopener noreferrer">
                打开{account.label}主页 <span aria-hidden="true">↗</span>
              </a>
            ) : null}

            {account.qrUrl ? (
              <PlatformShareCard key={account.qrUrl} label={account.label} url={account.qrUrl} />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
