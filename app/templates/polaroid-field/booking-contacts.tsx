"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteContent } from "../../site-config";
import { getSafeSocialUrl } from "../../social-links";
import { readPolaroidSocial } from "../../preview-workspace/contact-channels";
import styles from "./booking-contacts.module.css";

function ContactRow({ label, value, platform = false }: { label: string; value: string; platform?: boolean }) {
  const [feedback, setFeedback] = useState<"" | "copied" | "failed">("");
  const [copying, setCopying] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!value.trim()) return null;
  const href = platform ? getSafeSocialUrl(value) : null;
  const contents = <><span className={styles.identity}><span className={styles.label}>{label}</span><strong>{href ? `查看${label}主页` : value}</strong></span><span className={styles.action} aria-hidden="true">{href ? "打开 ↗" : copying ? "复制中…" : feedback === "copied" ? "已复制 ✓" : "复制"}</span></>;
  return <div className={styles.entry}>
    {href ? <a className={styles.row} href={href} target="_blank" rel="noopener noreferrer" aria-label={`查看${label}主页（在新标签页打开）`}>{contents}</a>
      : <button className={styles.row} type="button" disabled={copying} aria-label={`复制${label}账号`} onClick={async () => {
        setCopying(true); setFeedback("");
        try { await navigator.clipboard.writeText(value.trim()); if (mounted.current) setFeedback("copied"); }
        catch { if (mounted.current) setFeedback("failed"); }
        finally { if (mounted.current) setCopying(false); }
      }}>{contents}</button>}
    {!href && <span className={styles.feedback} role="status" aria-live="polite">{feedback === "failed" ? "无法自动复制，请长按或选中上方账号手动复制。" : feedback === "copied" ? `${label}账号已复制` : ""}</span>}
  </div>;
}

/** Premium-only presentation. Values remain in this template's content space. */
export default function PolaroidBookingContacts({ contact, social }: Pick<SiteContent, "contact" | "social">) {
  const qq = readPolaroidSocial(social, "qq")?.handle ?? "";
  const douyin = readPolaroidSocial(social, "douyin")?.handle ?? "";
  const xiaohongshu = readPolaroidSocial(social, "xiaohongshu")?.handle ?? "";
  return <div className={styles.groups} data-polaroid-contact-channels>
    {(qq.trim() || contact.wechat.trim()) && <section className={styles.group} aria-label="联系方式"><h3>联系方式</h3>
      <ContactRow key={`qq:${qq}`} label="QQ" value={qq} />
      <ContactRow key={`wechat:${contact.wechat}`} label="Wechat" value={contact.wechat} />
    </section>}
    {(douyin.trim() || xiaohongshu.trim()) && <section className={styles.group} aria-label="平台账号"><h3>平台账号</h3>
      <ContactRow key={`douyin:${douyin}`} label="抖音" value={douyin} platform />
      <ContactRow key={`xiaohongshu:${xiaohongshu}`} label="小红书" value={xiaohongshu} platform />
    </section>}
  </div>;
}
