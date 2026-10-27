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
  const gridTemplates = templateCatalog.slice(0, 9);
  const [companionTemplate, heroTemplate] = templateCatalog.slice(9);
  return (
    <main className={`${styles.shell} ${styles.homeShell}`}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span aria-hidden="true">✦</span> 摄影作品集平台</Link>
        <nav className={styles.homeNav} aria-label="平台导航">
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
            <div className={showcase.stageMain} data-template-layout={heroTemplate.id}>
              <StructureImage id={heroTemplate.id} alt={`${heroTemplate.name}的页面布局示意`} eager />
            </div>
            <div className={showcase.stageCompanion} data-template-layout={companionTemplate.id}>
              <StructureImage id={companionTemplate.id} alt={`${companionTemplate.name}的页面布局示意`} eager />
              <span>{companionTemplate.name}</span>
            </div>
            <figcaption className={showcase.stageCaption}><div><span>基础版 · {heroTemplate.name}</span><strong>不同构图，同样出众。</strong></div><span className={showcase.diagramTag}>模板布局示意</span></figcaption>
          </figure>
        </section>
        <section id="spaces" className={showcase.showcase} aria-labelledby="showcase-title">
          <div className={showcase.heading}>
            <div><p className={styles.eyebrow}>三种空间，各有表达</p><h2 id="showcase-title">选择适合作品的观看方式。</h2></div>
            <p>内容各自编辑，本站照片可复用。<br />一个主页地址，展示你最后发布的版本。</p>
          </div>
          <div className={showcase.tierHeading}>
            <div><p className={showcase.tierKicker}>01 / BASIC</p><h3>基础版</h3></div>
            <p>共11种风格 · 首屏2套，以下9套</p>
          </div>
          <PlatformTemplateShowcase previews={gridTemplates.map(({ id, name }) => ({ id, name, src: getTemplateStructurePreview(id).src }))} />
          <section className={showcase.premiumShowcase} aria-labelledby="premium-showcase-title">
            <div className={showcase.tierHeading}>
              <div><p className={showcase.tierKicker}>02 / PREMIUM</p><h3 id="premium-showcase-title">高级版</h3></div>
              <p>两个独立内容空间，按账号授权使用</p>
            </div>
            <div className={showcase.premiumSpaces}>
            <article className={showcase.space}>
              <div className={`${showcase.spaceVisual} ${showcase.premiumVisual}`}>
                {/* Actual template rendering with repository-authored anonymous artwork. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/template-showcase-previews/premium-polaroid.webp" width={1440} height={900} loading="lazy" alt="星轨实际模板示意：星图渐变画布、拍立得图集封面与作品导航；画面使用自绘匿名素材" />
              </div>
              <div className={showcase.spaceTitle}><span>01 / STAR TRAIL</span><h4>星轨</h4><span>独立内容空间</span></div>
              <p>以拍立得封面进入图集，让照片在星座般的构图中展开。</p>
            </article>
            <article className={showcase.space}>
              <div className={`${showcase.spaceVisual} ${showcase.premiumVisual}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/template-showcase-previews/premium-flow-gallery.webp" width={1440} height={900} loading="lazy" alt="流影视廊实际模板示意：全幅背景、透明导航与两条不同宽度的作品轨道；画面使用自绘匿名素材" />
              </div>
              <div className={showcase.spaceTitle}><span>02 / FLOW GALLERY</span><h4>流影视廊</h4><span>独立内容空间</span></div>
              <p>以流动双轨速览作品，再按分类进入完整画廊细看。</p>
            </article>
            </div>
          </section>
          <p className={showcase.note}>基础版为布局示意，高级版为真实模板搭配自绘素材的效果示意，不含客户照片。内容空间的可用范围以账号授权为准。</p>
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
        </footer>
      </div>
    </main>
  );
}
