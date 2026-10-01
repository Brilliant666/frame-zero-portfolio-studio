'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import styles from '../platform-shell.module.css';
type Account = { user: { username: string; email: string; emailVerified: boolean }; site: { slug: string }; templates: { basic: string[]; premium: string[] } };
export default function Login() {
  const [account,setAccount] = useState<Account | null>(null);
  const [message,setMessage] = useState('正在读取登录状态…');
  const [busy,setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
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
    event.preventDefault(); setBusy(true); setFailed(false);
    const form = event.currentTarget, data = new FormData(form);
    try {
      const r = await fetch('/api/auth/sign-in/username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) });
      if (r.ok) { form.reset(); await refresh(); }
      else { setFailed(true); setMessage(r.status === 429 ? '尝试过于频繁，请稍后重试。' : r.status === 503 ? '账号服务未就绪，请稍后重试。' : '用户名或密码不正确，请核对后重试。'); }
    } catch { setFailed(true); setMessage('无法连接账号服务，请稍后重试。'); } finally {
      if (passwordRef.current) { passwordRef.current.value = ''; passwordRef.current.focus(); }
      setBusy(false);
    }
  }
  async function logout(all = false) {
    setBusy(true);
    try {
      const r = await fetch(all ? '/api/auth/revoke-sessions' : '/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) { setMessage('退出失败，请重试'); return; }
      await refresh();
    } catch { setMessage('退出失败，请重试'); } finally { setBusy(false); }
  }
  return <main className={styles.shell}>
    <header className={styles.header}><Link className={styles.brand} href="/"><span aria-hidden="true">✦</span> 摄影作品集平台</Link><Link className={styles.textLink} href="/">返回平台首页</Link></header>
    <div className={styles.loginContent}>
      <section className={styles.loginIntro}>
        <p className={styles.eyebrow}>摄影师工作台</p>
        <h1>你的作品，<br />从这里继续。</h1>
        <p className={styles.lead}>一个账号，进入自己的站点后台。整理作品、保存草稿，再把准备好的内容展示给访客。</p>
        <div className={styles.routeNote}><strong>登录入口与站点后台，各有分工</strong><p>这里确认你的账号身份；登录后进入专属站点后台，管理该站点的内容和发布。无需为每个模板重复登录。</p></div>
      </section>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <p className={styles.eyebrow}>{account ? '已登录' : '欢迎回来'}</p>
        <h2 id="login-title">{account ? `${account.user.username} 的工作台` : '受邀账号登录'}</h2>
        <p className={styles.cardDescription}>{account ? `站点 /${account.site.slug} · 选择下方入口继续编辑` : '使用你的账号登录。本站不开放公众注册。'}</p>
        <p id="login-feedback" className={styles.status} data-tone={failed ? 'error' : undefined} role={failed ? 'alert' : 'status'}>{message}</p>
        {account ? <>
          <div className={styles.accountActions}><a className={styles.primaryButton} href={`/${encodeURIComponent(account.site.slug)}/admin`}>进入我的站点后台</a><a className={styles.secondaryButton} href={`/${encodeURIComponent(account.site.slug)}`}>查看我的主页</a></div>
          <details className={styles.accountDetails}><summary>账号与会话管理</summary><p>登录邮箱：{account.user.email}（{account.user.emailVerified ? '已验证' : '未验证'}）</p><p>基础模板：{account.templates.basic.length} 套</p><p>高级产品：{account.templates.premium.join('、') || '未授权'}</p><button className={styles.secondaryButton} disabled={busy} onClick={() => void logout(true)}>撤销全部会话</button></details>
          <button className={styles.textButton} disabled={busy} onClick={() => void logout()}>退出登录</button>
        </> : <form className={styles.loginForm} onSubmit={submit}><label>用户名<input name="username" autoComplete="username" required maxLength={30} placeholder="输入受邀账号用户名" /></label><label>密码<input ref={passwordRef} name="password" type="password" autoComplete="current-password" required maxLength={128} aria-describedby="login-feedback" aria-invalid={failed || undefined} placeholder="输入登录密码" /></label><button className={styles.primaryButton} disabled={busy} type="submit">{busy ? '登录中…' : '登录'}</button></form>}
      </section>
    </div>
  </main>;
}
