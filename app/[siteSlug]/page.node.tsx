import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { publicSite } from "../site-editor/public-server";
import { SitePortfolioView } from "../site-editor/premium-view";
import { PREVIEW_THEME_BOOTSTRAP_CSS, PREVIEW_THEME_KEY } from "../preview-workspace/preview-theme";
import { getClientVisiblePortfolioTitle } from "../client-visible-title";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ siteSlug: string }> }): Promise<Metadata> {
  const result = await publicSite((await params).siteSlug);
  if (!result?.snapshot) return { title: "作品集尚未发布", robots: { index: false, follow: false } };
  const { profile } = result.snapshot.content;
  const title = getClientVisiblePortfolioTitle(profile);
  return { title, description: profile.intro, openGraph: { title, description: profile.intro }, twitter: { card: "summary", title, description: profile.intro } };
}
export default async function PublicPortfolio({ params }: { params: Promise<{ siteSlug: string }> }) {
  const result = await publicSite((await params).siteSlug);
  if (!result) notFound();
  if (!result.snapshot && result.acceptanceHref) redirect(result.acceptanceHref);
  if (!result.snapshot) return <main><h1>作品集尚未发布</h1><section data-site-state="unpublished"><p>摄影师尚未发布作品集，请稍后再来。</p><a href="/login">站点所有者登录</a></section></main>;
  return <><style dangerouslySetInnerHTML={{ __html: PREVIEW_THEME_BOOTSTRAP_CSS }} /><script dangerouslySetInnerHTML={{ __html: `(function(){var t='paper';try{if(localStorage.getItem('${PREVIEW_THEME_KEY}')==='night')t='night'}catch(e){}document.documentElement.dataset.previewTheme=t;document.documentElement.dataset.starTheme=t;document.documentElement.dataset.publicPortfolio='premium-polaroid'})()` }} /><SitePortfolioView document={result.snapshot.content} assets={result.assets} /></>;
}
