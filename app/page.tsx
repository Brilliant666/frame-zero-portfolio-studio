import type { Metadata } from "next";
import Link from "next/link";
import styles from "./platform-shell.module.css";
import showcase from "./platform-showcase.module.css";
import PlatformTemplateShowcase from "./platform-template-showcase";
import { templateCatalog } from "./templates/catalog";
import { getTemplateStructurePreview } from "./templates/structure-previews";

export const metadata: Metadata = {
  title: "摄影作品集平台",
  description: "为摄影师建立独立的作品集与服务展示空间。",
  openGraph: { title: "摄影作品集平台", description: "为摄影师建立独立的作品集与服务展示空间。", siteName: "摄影作品集平台" },
  twitter: { title: "摄影作品集平台", description: "为摄影师建立独立的作品集与服务展示空间。" },
};

// Repository-generated layout diagrams contain no customer photographs.
function StructureImage({ id, alt, eager = false }: { id: string; alt: string; eager?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/template-structure-previews/${id}.webp`} width={1200} height={675} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} alt={alt} />;
}

export default function PlatformHome() {
  return (
    <main className={`${styles.shell} ${styles.homeShell}`}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span aria-hidden="true">✦</span> 摄影作品集平台</Link>
        <nav className={styles.homeNav} aria-label="平台导航">
          <a className={styles.homeExplore} href="#spaces">展示方式</a>
          <Link className={styles.secondaryButton} href="/login">账号登录 <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      <div className={styles.homeContent}>
        <section className={styles.homeHero} aria-labelledby="home-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span aria-hidden="true">—</span> 为摄影师而作的独立作品集</p>
            <h1 id="home-title">好作品，<br />值得被好好看见。</h1>
            <p className={styles.lead}>把照片、图集与拍摄服务，<br className={styles.desktopBreak} />整理成一页属于你的摄影主页。</p>
            <Link className={styles.primaryButton} href="/login">进入我的工作台 <span aria-hidden="true">→</span></Link>
            <p className={styles.hint}>受邀账号可登录 · 暂不开放公众注册</p>
          </div>
          <figure className={showcase.heroStage}>
            <div className={showcase.stageLabel}><span>PORTFOLIO / LAYOUT STUDY</span><span>01 — 11</span></div>
            <div className={showcase.stageMain}>
              <StructureImage id="film-rail" alt="基础版胶片长廊的布局示意：以胶片帧和不同画幅组织作品" eager />
            </div>
            <div className={showcase.stageCompanion} aria-hidden="true">
              <StructureImage id="editorial-duet" alt="" eager />
              <span>另一种叙事 / 杂志双人舞</span>
            </div>
            <figcaption className={showcase.stageCaption}><div><span>基础版 · 胶片长廊</span><strong>画面之间，也有节奏。</strong></div><span className={showcase.diagramTag}>模板布局示意</span></figcaption>
          </figure>
        </section>
        <section id="spaces" className={showcase.showcase} aria-labelledby="showcase-title">
          <div className={showcase.heading}>
            <div><p className={styles.eyebrow}>三种空间，各有表达</p><h2 id="showcase-title">选择适合作品的观看方式。</h2></div>
            <p>内容各自编辑，本站照片可复用。<br />一个主页地址，展示你最后发布的版本。</p>
          </div>
          <div className={showcase.tierHeading}>
            <div><p className={showcase.tierKicker}>01 / BASIC</p><h3>基础版</h3></div>
            <p>共11种风格，以下选展9套布局</p>
          </div>
          <PlatformTemplateShowcase previews={templateCatalog.slice(0, 9).map(({ id, name }) => ({ id, name, src: getTemplateStructurePreview(id).src }))} />
          <section className={showcase.premiumShowcase} aria-labelledby="premium-showcase-title">
            <div className={showcase.tierHeading}>
              <div><p className={showcase.tierKicker}>02 / PREMIUM</p><h3 id="premium-showcase-title">高级版</h3></div>
              <p>两个独立内容空间，按账号授权使用</p>
            </div>
            <div className={showcase.premiumSpaces}>
            <article className={showcase.space}>
              <div className={`${showcase.spaceVisual} ${showcase.premiumVisual} ${showcase.starDiagram}`} role="img" aria-label="星轨布局示意：连线串起拍立得图集封面">
                <svg viewBox="0 0 360 180" aria-hidden="true"><path d="M64 117 165 51 290 107" /><circle cx="64" cy="117" r="3" /><circle cx="165" cy="51" r="3" /><circle cx="290" cy="107" r="3" /></svg>
                <i className={showcase.paperOne} /><i className={showcase.paperTwo} /><i className={showcase.paperThree} />
                <span>图集封面 / 星座构图</span>
              </div>
              <div className={showcase.spaceTitle}><span>01 / STAR TRAIL</span><h4>星轨</h4><span>独立内容空间</span></div>
              <p>以拍立得封面进入图集，让照片在星座般的构图中展开。</p>
            </article>
            <article className={showcase.space}>
              <div className={`${showcase.spaceVisual} ${showcase.premiumVisual} ${showcase.flowDiagram}`} role="img" aria-label="流影视廊布局示意：双轨作品速览与分类画廊">
                <div><i /><i /><i /></div><div><i /><i /><i /></div><span>双轨速览 / 分类画廊</span>
              </div>
              <div className={showcase.spaceTitle}><span>02 / FLOW GALLERY</span><h4>流影视廊</h4><span>独立内容空间</span></div>
              <p>以流动双轨速览作品，再按分类进入完整画廊细看。</p>
            </article>
            </div>
          </section>
          <p className={showcase.note}>以上为布局示意，不含客户照片。内容空间的可用范围以账号授权为准。</p>
        </section>
        <section className={styles.homeWorkflow} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>从创作到展示</p><h2 id="workflow-title">整理在后台，分享在主页。</h2></div>
          <ol className={styles.homeSteps}>
            <li><span>01</span><div><h3>进入自己的站点</h3><p>受邀账号登录后，进入所属站点的工作台。</p></div></li>
            <li><span>02</span><div><h3>编辑一个内容空间</h3><p>整理照片与图集，补充拍摄服务和联系方式。</p></div></li>
            <li><span>03</span><div><h3>预览，再决定发布</h3><p>草稿只对你可见；保存并发布后，公开主页才会更新。</p></div></li>
          </ol>
        </section>
        <footer className={styles.footer}>
          <p>✦ 摄影作品集平台</p>
          <p>封闭测试中 · 暂不开放公众注册</p>
          <Link className={styles.textLink} href="/login">进入工作台 <span aria-hidden="true">↗</span></Link>
        </footer>
      </div>
    </main>
  );
}
