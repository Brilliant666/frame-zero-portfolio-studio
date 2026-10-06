import type { Metadata } from "next";
import Link from "next/link";
import styles from "./platform-shell.module.css";
import showcase from "./platform-showcase.module.css";

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
        <section className={showcase.showcase} aria-labelledby="showcase-title">
          <div className={showcase.heading}>
            <div><p className={styles.eyebrow}>画面有自己的表达</p><h2 id="showcase-title">从电影感到漫画分镜，<br />让展示方式贴近你的作品。</h2></div>
            <p>基础版提供十一种视觉风格。图集、拍摄服务与联系信息一起组成完整作品集。</p>
          </div>
          <div className={showcase.examples}>
            {[
              ["film-rail", "胶片长廊", "按画面比例编排，保留胶片与帧号的阅读节奏。"],
              ["manga-panels", "漫画分镜", "以章节和分镜组织作品，把照片连成故事。"],
              ["museum-depth", "深度展厅", "放慢浏览，让每一幅作品获得独立的观看空间。"],
            ].map(([id, name, description]) => <figure key={id}>
              {/* Public, repository-generated structure diagrams contain no customer photographs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/template-structure-previews/${id}.webp`} width={1200} height={675} loading="lazy" alt={`${name}的页面布局示意`} />
              <figcaption><h3>{name}</h3><p>{description}</p></figcaption>
            </figure>)}
          </div>
          <p className={showcase.note}>基础模板布局示意 · 照片与文字由你填写</p>
          <dl className={showcase.spaces}>
            <div><dt>基础版</dt><dd>一个内容空间，十一种视觉风格。</dd></div>
            <div><dt>高级拍立得</dt><dd>独立图集，以拍立得封面进入作品。</dd></div>
            <div><dt>流影视廊</dt><dd>独立分类，以双轨速览进入完整画廊。</dd></div>
          </dl>
          <p className={showcase.note}>三套内容独立编辑，共用本站图库。一个主页地址，展示你最后发布的版本。</p>
        </section>
        <section className={styles.workflow} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>从创作到展示</p><h2 id="workflow-title">内容在后台整理，作品在主页被看见</h2></div>
          <div className={styles.steps}>
            <article><span>01</span><h3>进入自己的站点</h3><p>使用统一账号登录，进入只属于你的站点后台。</p></article>
            <article><span>02</span><h3>整理作品与服务</h3><p>选择基础版、高级拍立得或流影视廊，编辑各自的作品、资料、服务与联系信息。</p></article>
            <article><span>03</span><h3>查看效果，保存并发布</h3><p>仅保存草稿可以继续编辑；保存并发布后，本站唯一主页展示这次发布的内容。</p></article>
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
