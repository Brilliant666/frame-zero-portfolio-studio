import type { Metadata } from "next";
import Link from "next/link";
import styles from "./platform-shell.module.css";

export const metadata: Metadata = {
  title: "摄影作品集平台",
  description: "为摄影师建立独立的作品集与服务展示空间。",
  openGraph: { title: "摄影作品集平台", description: "为摄影师建立独立的作品集与服务展示空间。", siteName: "摄影作品集平台" },
  twitter: { title: "摄影作品集平台", description: "为摄影师建立独立的作品集与服务展示空间。" },
};

export default function PlatformHome() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span aria-hidden="true">✦</span> 摄影作品集平台</Link>
        <Link className={styles.secondaryButton} href="/login">账号登录</Link>
      </header>
      <div className={styles.homeContent}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>为摄影创作，留一处自己的空间</p>
          <h1>让作品拥有<br />自己的空间</h1>
          <p className={styles.lead}>整理照片与图集，呈现拍摄服务，让每一次分享都通向你的摄影主页。</p>
          <Link className={styles.primaryButton} href="/login">登录并进入我的工作台 <span aria-hidden="true">→</span></Link>
          <p className={styles.hint}>受邀账号使用 · 暂不开放公众注册</p>
        </section>
        <section className={styles.workflow} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>从创作到展示</p><h2 id="workflow-title">内容在后台整理，作品在主页被看见</h2></div>
          <div className={styles.steps}>
            <article><span>01</span><h3>进入自己的站点</h3><p>使用统一账号登录，进入只属于你的站点后台。</p></article>
            <article><span>02</span><h3>整理作品与服务</h3><p>在基础版或高级拍立得中，独立编辑图集、资料、套餐与联系信息。</p></article>
            <article><span>03</span><h3>预览，再发布</h3><p>保存保留你的草稿。已接入发布的内容空间，由你确认后更新公开主页。</p></article>
          </div>
        </section>
        <footer className={styles.footer}>
          <p>摄影作品集平台 · 本地验收版本</p>
          <details className={styles.internalTools}><summary>内部测试与预览</summary><nav aria-label="内部验证入口"><Link href="/test">内部模板测试区</Link><Link href="/preview">新版摄影作品集预览</Link></nav><p>仅供本地内部验证，不代表已上线的用户服务。</p></details>
        </footer>
      </div>
    </main>
  );
}
