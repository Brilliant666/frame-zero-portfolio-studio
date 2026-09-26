import { accountRequestAllowed, getAccountRuntime, readSiteForPrincipal } from './http.mjs';
import { isSiteSlug } from './site-slug.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)}｜摄影作品集平台</title><style>body{margin:0;background:#f6f7f9;color:#202632;font:16px/1.7 system-ui,sans-serif}main{max-width:760px;margin:10vh auto;padding:28px}section{padding:24px;background:white;border:1px solid #dce0e7;border-radius:16px;margin:24px 0}a{color:#254fa4;text-underline-offset:4px}nav{display:flex;gap:24px;flex-wrap:wrap}h1{line-height:1.3}p{overflow-wrap:anywhere}</style></head><body><main><nav><a href="/">摄影作品集平台</a><a href="/login">账号与登录</a></nav><h1>${escape(title)}</h1>${body}</main></body></html>`, {
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
      return page('站点后台', `<section data-site-admin="true"><h2>${escape(account.site.slug)}</h2><p>当前账号：${escape(account.user.username)}</p><p>站点归属已验证。</p><p>基础模板：${account.templates.basic.length} 套</p><p>高级模板：${account.templates.premium.includes('premium-polaroid') ? '高级拍立得（已授权）' : '尚未授权'}</p><p>这是已鉴权的后台入口。本站点的独立内容编辑器尚未接入，因此目前不提供保存或发布操作。</p><p>不会读取或写入旧版全局内容，也不会自动导入现有照片。</p><a href="/${escape(slug)}">查看站点公开状态</a></section>`);
    }
    const result = await runtime.pool.query(`SELECT s.slug FROM sites s
      JOIN portfolio_users p ON p.id=s.owner_id
      JOIN account_provisioning op ON op.id=p.provisioning_id AND op.completed_at IS NOT NULL
      WHERE s.slug=$1`, [slug]);
    if (!result.rowCount) return page('站点不存在', '<p>请检查摄影师主页地址。</p>', 404);
    // M1 has no Published repository yet. In particular, do not fall back to
    // site_settings 1/2601, profile defaults, or any draft to fill this page.
    return page('作品集尚未发布', '<section data-site-state="unpublished"><p>摄影师尚未发布作品集，请稍后再来。</p><p>如果你是站点所有者，请登录查看自己的站点后台。</p></section>');
  } catch {
    return page('站点服务暂不可用', '<p>暂时无法读取站点。请稍后重试；现有本地作品集未被迁移或替换。</p>', 503);
  }
}
