/* eslint-disable @next/next/no-img-element -- uploaded platform cards retain their original dimensions. */

import type { SiteContent } from "../../site-config";
import { getPlatformQrAssetPath } from "../../platform-qr";
import { getSafeSocialUrl } from "../../social-links";
import styles from "./platform-accounts.module.css";

type PlatformAccountsProps = Readonly<{
  accounts: SiteContent["social"];
  tone?: "light" | "dark";
}>;

export default function PlatformAccounts({ accounts, tone = "light" }: PlatformAccountsProps) {
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
    <section className={styles.accounts} data-tone={tone} aria-label="平台账号与分享卡片">
      <div className={styles.heading}>
        <h3>平台账号</h3>
        <p>填写主页链接时可直接打开；如已上传分享卡片，可展开查看完整图片。</p>
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
              <details className={styles.shareCard}>
                <summary>查看{account.label}分享卡片</summary>
                <div className={styles.shareCardPanel}>
                  <a
                    className={styles.fullImageLink}
                    href={account.qrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`打开${account.label}分享卡片原图`}
                  >
                    <img
                      src={account.qrUrl}
                      alt={`${account.label}平台分享卡片`}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>打开原图 ↗</span>
                  </a>
                </div>
              </details>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
