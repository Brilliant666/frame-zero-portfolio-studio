import { accountRequestAllowed, getAccountRuntime, readSiteForPrincipal } from './http.mjs';
import { isSiteSlug } from './site-slug.mjs';
import { unpublishedAcceptanceRedirect } from './local-acceptance.mjs';
import { siteEntryStyle } from './site-entry-style.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function page(title, body, status = 200) {
  const content = title === '站点后台' ? body : `<div class="message">${body}</div>`;
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)}｜摄影作品集平台</title><style>${siteEntryStyle}</style></head><body><header class="top"><nav class="top-inner" aria-label="平台导航"><a class="brand" href="/">✦ 摄影作品集平台</a><a href="/login">账号与登录</a></nav></header><main><p class="eyebrow">PORTFOLIO WORKSPACE</p><h1>${escape(title)}</h1>${content}</main></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export async function handleSiteEntry(request, slug, admin = false) {
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
      return page('站点后台', `<p class="lead">选择你要编辑的作品集。这里是本站的工作台；登录用于确认身份，工作台用于管理属于你的内容。</p><section class="dashboard" data-site-admin="true"><div class="workspace-heading"><div><h2>${escape(account.site.slug)} 的作品集</h2><p>当前账号：${escape(account.user.username)} · 站点归属已验证</p></div><a class="button" href="/${escape(slug)}">查看站点公开状态 <span aria-hidden="true">↗</span></a></div><div class="spaces"><article class="space"><div class="space-top"><span class="space-number">01 / BASIC</span><span class="badge">基础模板：${account.templates.basic.length} 套</span></div><h2>基础版作品集</h2><p>使用基础模板与对应的素材排版，管理这套作品集自己的内容。</p><ul><li>摄影师资料、模板与素材排版</li><li>拍摄套餐、联系方式与页面文案</li><li>独立保存基础版草稿</li></ul><a class="button primary" href="/${escape(slug)}/admin/basic/profile">编辑基础版草稿 <span aria-hidden="true">→</span></a></article><article class="space"><div class="space-top"><span class="space-number">02 / POLAROID</span><span class="badge${account.templates.premium.includes('premium-polaroid') ? '' : ' muted'}">${account.templates.premium.includes('premium-polaroid') ? '高级拍立得（已授权）' : '尚未授权'}</span></div><h2>高级拍立得</h2><p>以图集为中心组织作品，编辑拍立得页面并管理发布版本。</p><ul><li>图集、封面与图集内照片</li><li>独立的主页资料、套餐与联系信息</li><li>草稿预览与显式发布</li></ul>${account.templates.premium.includes('premium-polaroid') ? `<a class="button primary" href="/${escape(slug)}/admin/premium-polaroid">编辑高级拍立得草稿 <span aria-hidden="true">→</span></a>` : '<span class="unavailable">当前账号尚未开通此内容空间</span>'}</article></div><aside class="explanation"><h2>保存草稿，不等于发布</h2><p>两套内容独立保存。保存只更新私人草稿，不会发布或同步到另一套内容。本站私有素材可在两套后台复用，业务草稿各自保存；不会自动读取或导入旧版全局照片。</p></aside><footer>工作台地址属于当前站点，不是另一套登录入口。</footer></section>`);
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
