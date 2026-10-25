import { accountRequestAllowed, getAccountRuntime, readSiteForPrincipal } from './http.mjs';
import { isSiteSlug } from './site-slug.mjs';
import { unpublishedAcceptanceRedirect } from './local-acceptance.mjs';
import { publicationHistory } from './publications.mjs';
import { siteEntryStyle } from './site-entry-style.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Only consume the Site and grants returned by the existing owner authorization.
// The destination is a current draft route, never a publication revision URL.
export function publishedDraftTarget(published, account, grantConfirmed = true) {
  if (!grantConfirmed || !published || !isSiteSlug(account?.site?.slug)) return null;
  const routes = { basic: 'basic/profile', 'premium-polaroid': 'premium-polaroid', 'premium-flow-gallery': 'premium-flow-gallery' };
  if (!Object.hasOwn(routes, published.space)) return null;
  const permitted = published.space === 'basic'
    ? account.templates?.basic?.length > 0
    : account.templates?.premium?.includes(published.space);
  return permitted ? `/${account.site.slug}/admin/${routes[published.space]}` : null;
}

export function publishedWorkspaceSummary(published, templateNames = {}, account = null, grantConfirmed = true) {
  if (published === undefined) return '<section class="publication-overview is-unknown" data-workspace-public="unknown"><div class="overview-label"><span class="status-pill neutral">状态待确认</span><span>公开主页</span></div><h2>公开状态暂未确认</h2><p>暂时无法读取公开版本。可进入草稿继续编辑，稍后重新核对。</p></section>';
  if (!published) return '<section class="publication-overview" data-workspace-public="unpublished"><div class="overview-label"><span class="status-pill neutral">未发布</span><span>公开主页</span></div><h2>本站尚未发布作品集</h2><p>从下方选择一个内容空间，编辑、预览后再保存并发布。</p></section>';
  const spaces = { basic: '基础版', 'premium-polaroid': '星轨', 'premium-flow-gallery': '流影视廊' };
  const template = published.space === 'basic' ? ` · ${escape(templateNames[published.templateId] ?? "基础模板")}` : '';
  const target = publishedDraftTarget(published, account, grantConfirmed);
  const shortcut = target
    ? `<div class="publication-draft-entry"><a class="button primary" data-published-draft-entry="${escape(published.space)}" href="${escape(target)}">编辑此空间草稿 <span aria-hidden="true">→</span></a></div>`
    : account ? '<p data-published-draft-unavailable="true">当前公开空间无法编辑，请核对内容空间授权；公开版本保持不变。</p>' : '';
  return `<section class="publication-overview" data-workspace-public="${escape(published.space)}"><div class="overview-label"><span class="status-pill"><i aria-hidden="true"></i>已发布</span><span>当前公开主页</span></div><h2>${escape(spaces[published.space] ?? published.space)}${template}</h2><p>访客看到这套作品集；编辑和保存草稿不会改变当前公开主页。</p>${shortcut}<p class="publication-meta">发布快照只读，来自草稿 v${escape(published.draftRevision)}，不代表当前草稿版本。</p></section>`;
}
const publicAttribute = (published, space) => published?.space === space ? ' data-current-public="true"' : '';

const workspaceSpaces = {
  basic: { name: '基础版', number: '01', code: 'BASIC', route: 'basic/profile', description: '以模板与素材排版，组织作品和个人资料。' },
  'premium-polaroid': { name: '星轨', number: '02', code: 'STAR TRAIL', route: 'premium-polaroid', description: '用拍立得封面与星座图集，串起每一组作品。' },
  'premium-flow-gallery': { name: '流影视廊', number: '03', code: 'FLOW GALLERY', route: 'premium-flow-gallery', description: '流动速览与分类画廊，让画面自然展开。' },
};

function workspaceCard(space, account, slug, published, grantConfirmed = true) {
  const item = workspaceSpaces[space];
  const accountGranted = space === 'basic' ? account.templates.basic.length > 0 : account.templates.premium.includes(space);
  const granted = accountGranted && !(published?.space === space && !grantConfirmed);
  const badge = space === 'basic' && granted ? `基础模板：${account.templates.basic.length} 套` : granted ? `${item.name}（已授权）` : '尚未授权';
  return `<article class="space"${publicAttribute(published, space)}><div class="space-visual visual-${item.number}" aria-hidden="true"><i></i><i></i><i></i></div><div class="space-copy"><div class="space-top"><span class="space-number">${item.number} / ${item.code}</span><span class="badge${granted ? '' : ' muted'}">${badge}</span></div><h2>${item.name}${published?.space === space ? '<span class="public-badge">当前公开</span>' : ''}</h2><p>${item.description}</p></div><div class="space-action">${granted ? `<a class="button space-link" aria-label="编辑${item.name}草稿" href="/${escape(slug)}/admin/${item.route}">编辑草稿 <span aria-hidden="true">→</span></a>` : '<span class="unavailable">当前账号尚未开通此内容空间</span>'}</div></article>`;
}

export function flowGalleryWorkspaceCard(account, slug, published = null, grantConfirmed = true) {
  return workspaceCard('premium-flow-gallery', account, slug, published, grantConfirmed);
}

// Rendering consumes only the account and publication already checked by handleSiteEntry.
// It does not resolve identity, grants, drafts or Published, and never writes business data.
export function renderSiteWorkspace(account, slug, published, templateNames = {}, grantConfirmed = true) {
  return `<section class="dashboard" data-site-admin="true"><div class="workspace-heading"><div><p class="eyebrow">MY PHOTOGRAPHY SITE</p><h1>${escape(account.site.slug)} <span class="site-title">的摄影站点</span></h1><p class="account-line">当前账号：${escape(account.user.username)}<span aria-hidden="true"> · </span><span>站点归属已验证</span></p></div><a class="button public-link" href="/${escape(slug)}">查看公开主页 <span aria-hidden="true">↗</span></a></div>${publishedWorkspaceSummary(published, templateNames, account, grantConfirmed)}<section class="workspace-spaces" aria-labelledby="spaces-title"><div class="spaces-heading"><div><p class="eyebrow">YOUR CONTENT SPACES</p><h2 id="spaces-title">内容空间</h2></div><p>分别编辑 · 共用本站图库</p></div><div class="spaces">${workspaceCard('basic', account, slug, published, grantConfirmed)}${workspaceCard('premium-polaroid', account, slug, published, grantConfirmed)}${flowGalleryWorkspaceCard(account, slug, published, grantConfirmed)}</div></section><details class="explanation"><summary>草稿与公开主页有什么关系？<span aria-hidden="true">＋</span></summary><div><p><strong>保存草稿，不等于发布。</strong>三套内容独立保存；切换编辑空间不会切换公开主页。</p><p>只有保存并发布，本站唯一主页才展示该次发布的内容。本站图库可在已授权空间复用，不会自动读取或导入旧版全局照片。</p></div></details><footer>这是当前站点的工作台。内容与发布，由你决定。</footer></section>`;
}

function page(title, body, status = 200) {
  const workspace = title === '站点后台' || title === '站点工作台';
  const content = workspace ? body : `<p class="eyebrow">PORTFOLIO WORKSPACE</p><h1>${escape(title)}</h1><div class="message">${body}</div>`;
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)}｜摄影作品集平台</title><style>${siteEntryStyle}</style></head><body><header class="top"><nav class="top-inner" aria-label="平台导航"><a class="brand" href="/">✦ 摄影作品集平台</a><a href="/login">账号与登录</a></nav></header><main>${content}</main></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export { page as siteEntryPage };

export async function handleSiteEntry(request, slug, admin = false, templateNames = {}) {
  if (!isSiteSlug(slug)) return page('页面不存在', '<p>请检查站点地址。</p>', 404);
  if (admin && (process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME !== '1' || process.env.FRAME_ZERO_LOCAL_ACCOUNTS !== '1')) return page('页面不存在', '<p>站点后台尚未启用。</p>', 404);
  if (new URL(request.url).search) return page('无效请求', '<p>站点归属不能通过查询参数指定。</p>', 400);
  try {
    const runtime = getAccountRuntime();
    if (!accountRequestAllowed(request, runtime.config)) return page('访问被拒绝', '<p>请求来源不被允许。</p>', 403);
    if (admin) {
      const session = await runtime.auth.api.getSession({ headers: request.headers });
      if (!session) return page('请先登录', '<p>请使用受邀账号登录后，从账号页面进入自己的站点后台。</p><a href="/login">前往登录</a>', 401);
      // Slug AND authenticated owner are part of the same SQL predicate. Never
      // load another owner's Site and check its identity afterward.
      const account = await readSiteForPrincipal(runtime, session.user, null, slug);
      if (!account) return page('无权访问此后台', '<p>请从账号页面进入自己拥有的站点。</p>', 403);
      let published, grantConfirmed = false;
      try {
        const result = await publicationHistory(runtime.pool, account.site.id, { authorizedSpaces: account.templates.premium });
        published = result.current;
        // The current summary survives revocation; editable history already
        // includes the query's grant recheck. Intersect both before offering a link.
        grantConfirmed = !!published && result.history.some(row => row.id === published.id && row.space === published.space);
      } catch { /* Unknown is not an unpublished state. */ }
      return page('站点工作台', renderSiteWorkspace(account, slug, published, templateNames, grantConfirmed));
    }
    const result = await runtime.pool.query(`SELECT s.slug FROM sites s
      JOIN portfolio_users p ON p.id=s.owner_id
      JOIN account_provisioning op ON op.id=p.provisioning_id AND op.completed_at IS NOT NULL
      WHERE s.slug=$1`, [slug]);
    if (!result.rowCount) return page('站点不存在', '<p>请检查摄影师主页地址。</p>', 404);
    // M1 has no Published repository yet. In particular, do not fall back to
    // site_settings 1/2601, profile defaults, or any draft to fill this page.
    const acceptance = await unpublishedAcceptanceRedirect(request, runtime, slug);
    if (acceptance) return acceptance;
    return page('作品集尚未发布', '<section data-site-state="unpublished"><p>摄影师尚未发布作品集，请稍后再来。</p><p>如果你是站点所有者，请登录查看自己的站点后台。</p></section>');
  } catch {
    return page('站点服务暂不可用', '<p>暂时无法读取站点。请稍后重试；现有本地作品集未被迁移或替换。</p>', 503);
  }
}
