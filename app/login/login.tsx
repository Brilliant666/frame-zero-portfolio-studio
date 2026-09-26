'use client';
import { useEffect, useState, type FormEvent } from 'react';
type Account = { user: { username: string; email: string; emailVerified: boolean }; site: { slug: string }; templates: { basic: string[]; premium: string[] } };
export default function Login() {
  const [account,setAccount] = useState<Account | null>(null);
  const [message,setMessage] = useState('正在读取登录状态…');
  const [busy,setBusy] = useState(false);
  async function refresh() {
    try { const r = await fetch('/api/account/site', { cache: 'no-store' });
      if (r.ok) { setAccount(await r.json()); setMessage('已登录本地账号'); }
      else { setAccount(null); setMessage(r.status === 503 ? '本地账号服务未就绪，请检查数据库。' : '请使用受邀账号登录'); }
    } catch { setMessage('无法连接本地账号服务'); }
  }
  useEffect(() => {
    let active = true;
    fetch('/api/account/site', { cache: 'no-store' }).then(async r => {
      const value = r.ok ? await r.json() : null;
      if (!active) return;
      setAccount(value);
      setMessage(r.ok ? '已登录本地账号' : r.status === 503 ? '本地账号服务未就绪，请检查数据库。' : '请使用受邀账号登录');
    }).catch(() => { if (active) setMessage('无法连接本地账号服务'); });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget, data = new FormData(form);
    try {
      const r = await fetch('/api/auth/sign-in/username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) });
      form.reset();
      if (r.ok) await refresh();
      else setMessage(r.status === 429 ? '尝试过于频繁，请稍后重试。' : r.status === 503 ? '账号服务未就绪' : '用户名或密码不正确');
    } catch { setMessage('无法连接本地账号服务'); } finally { setBusy(false); }
  }
  async function logout(all = false) {
    setBusy(true);
    try {
      const r = await fetch(all ? '/api/auth/revoke-sessions' : '/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) { setMessage('退出失败，请重试'); return; }
      await refresh();
    } catch { setMessage('退出失败，请重试'); } finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 600, margin: '64px auto', padding: 24 }}>
    <h1>本地账号登录</h1><p>本轮仅验证身份和站点归属，尚未连接作品集后台。</p>
    <p role="status">{message}</p>
    {account ? <section><h2>{account.user.username}</h2><p>登录邮箱：{account.user.email}（{account.user.emailVerified ? '已验证' : '未验证'}）</p><p>站点：{account.site.slug}</p>
      <p>基础模板：{account.templates.basic.length} 套</p><p>高级产品：{account.templates.premium.join('、') || '未授权'}</p>
      <button disabled={busy} onClick={() => void logout()}>退出登录</button>{' '}<button disabled={busy} onClick={() => void logout(true)}>撤销全部会话</button>
    </section> : <form onSubmit={submit}><p><label>用户名 <input name="username" autoComplete="username" required maxLength={30} /></label></p><p><label>密码 <input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label></p><button disabled={busy} type="submit">{busy ? '登录中…' : '登录'}</button></form>}
  </main>;
}
