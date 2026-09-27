import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

// A single bounded acceptance scenario, not a new E2E framework. All edits use
// the real forms and real API. Never capture traces, cookies, headers or bodies.
export async function siteEditorBrowserSmoke({ origin, password, restart, expire }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  const output = join(process.cwd(), 'outputs', 'site-editor-browser');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const network = [], checkpoints = [], screenshots = [];
  const report = { origin, build: 'Standard Next production / isolated PostgreSQL', browser: browser.version(), head: process.env.GITHUB_SHA ?? 'local', checkpoints, screenshots, network };
  const forbidden = /^(?:\/api\/(?:site-content|preview\/site-content|local-photos|photo-import|platform-qr)|\/photos\/|\/platform-qr\/|\/(?:health|import|library)(?:\/|$))/;
  const a = 'smokefixturea', b = 'smokefixtureb';
  const path = (space, slug = a) => `/api/sites/${slug}/drafts/${space}`;
  const basic = `/${a}/admin/basic`, premium = `/${a}/admin/premium-polaroid`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  function watch(ctx) {
    ctx.on('page', p => p.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.accept(); }));
    ctx.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === origin && (url.pathname.startsWith('/api/') || forbidden.test(url.pathname))) {
        network.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      }
    });
    ctx.on('request', request => {
      const url = new URL(request.url());
      if (forbidden.test(url.pathname)) network.push({ method: request.method(), path: url.pathname, forbidden: true });
    });
  }
  watch(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const field = (p, name) => p.getByLabel(name, { exact: true });
  async function snapshot(p, name) {
    // Screenshots are only taken after login, never on credential-entry forms.
    assert.equal(await p.locator('input[type=password]').count(), 0);
    const viewport = p.viewportSize();
    const file = `${name}-${viewport.width}.png`;
    await p.screenshot({ path: join(output, file), fullPage: false });
    screenshots.push({ file, viewport, path: new URL(p.url()).pathname });
  }
  async function stage(name, run) {
    try { await run(); checkpoints.push({ name, result: 'PASS' }); }
    catch (error) {
      checkpoints.push({ name, result: 'FAIL', error: error instanceof Error ? error.message.split(password).join('[redacted]') : 'Unknown error' });
      if (await page.locator('input[type=password]').count() === 0) await snapshot(page, 'failure').catch(() => {});
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  }
  async function login(p, username) {
    await p.goto(`${origin}/login`);
    await p.getByText('请使用受邀账号登录', { exact: true }).waitFor();
    await field(p, '用户名').fill(username);
    await field(p, '密码').fill(password);
    await p.getByRole('button', { name: '登录', exact: true }).click();
    await p.getByRole('link', { name: '进入我的站点后台' }).waitFor();
  }
  async function openEditor(p, url) {
    const loaded = p.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('/api/sites/') && r.status() === 200);
    await p.goto(`${origin}${url}`); await loaded;
    await field(p, '摄影师名称').waitFor();
    await p.waitForFunction(() => !document.querySelector('input')?.disabled && !document.querySelector('fieldset')?.disabled);
  }
  async function nav(p, section) {
    const href = `${basic}/${section}`;
    if (p.viewportSize().width < 768) await p.getByLabel('切换后台分区').selectOption(href);
    else await p.locator(`nav[aria-label="后台主要分区"] a[href="${href}"]`).click();
    await p.waitForURL(`**${href}`);
  }
  async function saved(p, space, shortcut = false, status = 200) {
    const result = p.waitForResponse(r => new URL(r.url()).pathname === path(space) && r.request().method() === 'PUT');
    if (shortcut) await p.keyboard.press('Control+s');
    else await p.getByRole('button', { name: space === 'basic' ? '保存修改' : '保存新版修改', exact: true }).click();
    const response = await result;
    assert.equal(response.status(), status);
    const body = await response.json();
    await p.waitForTimeout(80);
    return body;
  }
  async function read(space, ctx = context, slug = a) {
    const response = await ctx.request.get(`${origin}${path(space, slug)}`);
    assert.equal(response.status(), 200);
    return response.json();
  }
  let basicSaved, premiumSaved;
  try {
    await stage('01 login / six sections retain unsaved draft', async () => {
      await login(page, a);
      await page.getByRole('link', { name: '进入我的站点后台' }).click();
      await page.locator(`a[href="${basic}/profile"]`).click();
      await field(page, '摄影师名称').waitFor();
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      await field(page, '摄影师名称').fill('Basic anonymous photographer');
      await field(page, '首页主标题').fill('Basic private title');
      for (const section of ['template', 'packages', 'layout', 'contact', 'advanced', 'profile']) await nav(page, section);
      assert.equal(await field(page, '摄影师名称').inputValue(), 'Basic anonymous photographer');
      assert.equal(await field(page, '摄影师名称').isEnabled(), true);
      await field(page, '摄影师名称').focus();
      assert.equal(await field(page, '摄影师名称').evaluate(el => el === document.activeElement), true);
      await snapshot(page, '01-unsaved-across-sections');
    });
    await stage('02 basic real save / refresh / independent premium content', async () => {
      await nav(page, 'packages');
      await page.getByRole('button', { name: '添加套餐', exact: true }).click();
      await field(page, '套餐 1 标题').fill('Basic anonymous package');
      await field(page, '价格').fill('100');
      await nav(page, 'contact');
      await field(page, '邮箱').fill('basic@fixture.example');
      await field(page, '微信号').fill('basic-fixture-contact');
      basicSaved = await saved(page, 'basic');
      await page.reload();
      await field(page, '邮箱').waitFor();
      await page.waitForFunction(() => document.querySelector('input[type=text], input')?.value !== undefined);
      assert.equal((await read('basic')).content.contact.email, 'basic@fixture.example');
      await snapshot(page, '02-basic-saved');
      await openEditor(page, premium);
      await field(page, '摄影师名称').fill('Premium anonymous photographer');
      await field(page, '首页标题').fill('Premium private title');
      await page.getByRole('button', { name: '套餐与联系', exact: true }).click();
      await page.getByRole('button', { name: '添加套餐', exact: true }).click();
      await field(page, '套餐 1 · 名称').fill('Premium anonymous package');
      await field(page, '套餐 1 · 价格').fill('200');
      await field(page, '邮箱').fill('premium@fixture.example');
      await field(page, '微信号').fill('premium-fixture-contact');
      premiumSaved = await saved(page, 'premium-polaroid');
      assert.deepEqual(await read('basic'), basicSaved);
      await snapshot(page, '02-premium-saved');
    });
    await stage('03 empty collections create / rename / reorder / save', async () => {
      await page.getByRole('button', { name: '图集管理', exact: true }).click();
      for (const name of ['Anonymous collection one', 'Anonymous collection two']) {
        await page.getByRole('button', { name: '新建图集', exact: true }).click();
        await field(page, '图集名称').fill(name);
      }
      await page.getByRole('button', { name: '图集上移', exact: true }).click();
      premiumSaved = await saved(page, 'premium-polaroid');
      assert.deepEqual(premiumSaved.content.collections.map(c => c.name), ['Anonymous collection two', 'Anonymous collection one']);
      assert.ok(premiumSaved.content.collections.every(c => c.assetIds.length === 0 && c.coverAssetId === null));
      assert.deepEqual(await read('basic'), basicSaved);
      await snapshot(page, '03-empty-collections');
    });
    await stage('04 real delayed response preserves newer editing in both spaces', async () => {
      for (const space of ['basic', 'premium-polaroid']) {
        await openEditor(page, space === 'basic' ? `${basic}/profile` : premium);
        const first = `${space} saved before response`, second = `${space} newer unsaved`;
        await field(page, '摄影师名称').fill(first);
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let written;
        const serverWritten = new Promise(resolve => { written = resolve; });
        await page.route(`**${path(space)}`, async route => {
          if (route.request().method() !== 'PUT') return route.continue();
          const realResponse = await route.fetch(); // Real PostgreSQL CAS completes first.
          written(); await gate; await route.fulfill({ response: realResponse });
        });
        const saving = saved(page, space);
        await serverWritten;
        let editFailure;
        try {
          await snapshot(page, `04-${space}-saving`);
          assert.equal(await field(page, '摄影师名称').isEnabled(), true, 'Saving must not disable further Site edits');
          await field(page, '摄影师名称').fill(second);
        } catch (error) { editFailure = error; }
        finally { release(); }
        await saving; await page.unroute(`**${path(space)}`);
        if (editFailure) throw editFailure;
        assert.equal(await field(page, '摄影师名称').inputValue(), second);
        assert.equal((await read(space)).content.profile.photographer, first);
        const puts = network.filter(n => n.method === 'PUT').length;
        const result = await saved(page, space, true);
        assert.equal(network.filter(n => n.method === 'PUT').length, puts + 1, 'One shortcut saves only one active space');
        if (space === 'basic') basicSaved = result; else premiumSaved = result;
        await snapshot(page, `04-${space}-new-edit-preserved`);
      }
    });
    await stage('05 two tabs CAS conflict / retained draft / export / discard warning', async () => {
      for (const space of ['basic', 'premium-polaroid']) {
        const url = space === 'basic' ? `${basic}/profile` : premium;
        await openEditor(page, url);
        const other = await context.newPage(); await openEditor(other, url);
        await field(page, '摄影师名称').fill(`${space} winner`);
        await field(other, '摄影师名称').fill(`${space} retained conflict`);
        const result = await saved(page, space);
        await saved(other, space, true, 409);
        assert.equal(await field(other, '摄影师名称').inputValue(), `${space} retained conflict`);
        assert.match(await other.locator('body').innerText(), /版本冲突/);
        assert.deepEqual(await read(space), result);
        if (space === 'premium-polaroid') {
          const download = other.waitForEvent('download');
          await other.getByRole('button', { name: '导出当前草稿', exact: true }).click();
          const file = await (await download).path();
          const exported = JSON.parse(await readFile(file, 'utf8'));
          assert.ok(JSON.stringify(exported).includes(`${space} retained conflict`));
        }
        const dialog = other.waitForEvent('dialog');
        const click = other.getByRole('button', { name: '重新读取', exact: true }).click();
        const warning = await dialog; assert.match(warning.message(), /未保存草稿|未保存/); await warning.dismiss(); await click;
        assert.equal(await field(other, '摄影师名称').inputValue(), `${space} retained conflict`);
        await snapshot(other, `05-${space}-conflict`);
        other.on('dialog', d => d.accept()); await other.close();
        if (space === 'basic') basicSaved = result; else premiumSaved = result;
      }
    });
    await stage('06 memory preview differs from protected saved preview', async () => {
      const savedTitle = (await read('premium-polaroid')).content.hero.title;
      await openEditor(page, premium);
      await field(page, '首页标题').fill('UNSAVED MEMORY PREVIEW');
      await page.getByRole('button', { name: '查看草稿效果', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('UNSAVED MEMORY PREVIEW', { exact: true }).first().waitFor();
      await snapshot(page, '06-memory-preview');
      await page.getByRole('button', { name: '关闭草稿效果', exact: true }).click();
      const preview = await context.newPage(); await preview.goto(`${origin}/${a}/admin/preview/premium-polaroid`);
      await preview.getByText(savedTitle, { exact: true }).first().waitFor();
      assert.ok(!(await preview.locator('body').innerText()).includes('UNSAVED MEMORY PREVIEW'));
      await snapshot(preview, '06-protected-saved-preview'); await preview.close();
      premiumSaved = await saved(page, 'premium-polaroid');
    });
    await stage('07 Ctrl and Meta shortcuts scoped to active editor', async () => {
      for (const [space, key] of [['basic', 'Control+s'], ['premium-polaroid', 'Meta+s']]) {
        await openEditor(page, space === 'basic' ? `${basic}/profile` : premium);
        await field(page, '摄影师名称').fill(`${space} keyboard saved`);
        const before = network.filter(n => n.method === 'PUT').length;
        const result = page.waitForResponse(r => new URL(r.url()).pathname === path(space) && r.request().method() === 'PUT');
        await page.keyboard.press(key); assert.equal((await result).status(), 200); await delay(150);
        assert.equal(network.filter(n => n.method === 'PUT').length, before + 1);
        if (space === 'basic') basicSaved = await read(space); else premiumSaved = await read(space);
      }
    });
    await stage('08 other owner / anonymous / expired session deny private editors and previews', async () => {
      const otherContext = await browser.newContext(); watch(otherContext);
      const other = await otherContext.newPage(); await login(other, b);
      for (const space of ['basic', 'premium-polaroid']) {
        for (const ctx of [otherContext, await browser.newContext()]) {
          const visitor = await ctx.newPage();
          for (const url of [`/${a}/admin/${space === 'basic' ? 'basic/profile' : space}`, `/${a}/admin/preview/${space}`]) {
            await visitor.goto(`${origin}${url}`);
            assert.doesNotMatch(await visitor.locator('body').innerText(), /keyboard saved|private title|UNSAVED MEMORY/);
            assert.equal(await field(visitor, '摄影师名称').count(), 0);
          }
          await visitor.close(); if (ctx !== otherContext) await ctx.close();
        }
      }
      await other.goto(`${origin}/${b}/admin/premium-polaroid`);
      assert.equal(await field(other, '摄影师名称').count(), 0);
      await otherContext.close();
      await expire(a);
      const expired = await context.newPage(); await expired.goto(`${origin}/${a}/admin/preview/premium-polaroid`);
      assert.doesNotMatch(await expired.locator('body').innerText(), /keyboard saved|UNSAVED MEMORY/); await expired.close();
      await field(page, '摄影师名称').fill('Expired must not save');
      await saved(page, 'premium-polaroid', true, 401);
      assert.equal(await field(page, '摄影师名称').inputValue(), 'Expired must not save');
    });
    await stage('09 logout / switch account / old page cannot submit into new Site', async () => {
      const loginPage = await context.newPage(); await login(loginPage, a);
      await openEditor(page, `${basic}/profile`);
      await field(page, '摄影师名称').fill('Old owner unsaved');
      await loginPage.getByRole('button', { name: '退出登录', exact: true }).click();
      await loginPage.getByText('请使用受邀账号登录', { exact: true }).waitFor();
      await saved(page, 'basic', true, 401);
      await login(loginPage, b);
      await field(page, '摄影师名称').fill('Old owner after switch');
      await saved(page, 'basic', true, 403);
      await openEditor(loginPage, `/${b}/admin/basic/profile`);
      assert.equal(await field(loginPage, '摄影师名称').inputValue(), '');
      assert.equal((await read('basic', context, b)).revision, 0);
      await loginPage.goBack();
      assert.doesNotMatch(await loginPage.locator('body').innerText(), /Old owner after switch|Old owner unsaved/);
      await loginPage.goto(`${origin}/login`); await loginPage.getByRole('button', { name: '退出登录', exact: true }).click();
      await login(page, a);

      // A's authorized write finishes in PostgreSQL, but its real response is
      // held while the same browser changes identity and the editor changes
      // Site. A stale response must never populate or save B's empty document.
      await openEditor(page, `${basic}/profile`);
      await field(page, '摄影师名称').fill('A delayed response before identity switch');
      let release, written, finished;
      const gate = new Promise(resolve => { release = resolve; });
      const serverWritten = new Promise(resolve => { written = resolve; });
      const routeFinished = new Promise(resolve => { finished = resolve; });
      await page.route(`**${path('basic')}`, async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        try {
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          written(); await gate;
          // Navigating away is allowed to cancel this pending response. It is
          // not substituted or forged; the database write already completed.
          await route.fulfill({ response }).catch(() => {});
        } finally { finished(); }
      });
      await page.keyboard.press('Control+s');
      await serverWritten;
      try {
        await loginPage.goto(`${origin}/login`);
        await loginPage.getByRole('button', { name: '退出登录', exact: true }).click();
        await login(loginPage, b);
        await openEditor(page, `/${b}/admin/basic/profile`);
      } finally { release(); }
      await routeFinished; await page.unroute(`**${path('basic')}`);
      assert.equal(await field(page, '摄影师名称').inputValue(), '');
      assert.equal((await read('basic', context, b)).revision, 0);
      await snapshot(page, '09-delayed-A-response-cannot-enter-B');
      await loginPage.getByRole('button', { name: '退出登录', exact: true }).click();
      await login(page, a);
      assert.equal((await read('basic')).content.profile.photographer, 'A delayed response before identity switch');
      await loginPage.close();
    });
    await stage('10 public unpublished / restart persists both independently', async () => {
      // Read authoritative snapshots before restart, independently of a prior
      // UI assertion failure, so all acceptance items still get a result.
      basicSaved = await read('basic'); premiumSaved = await read('premium-polaroid');
      await page.goto(`${origin}/${a}`);
      await page.locator('[data-site-state="unpublished"]').waitFor();
      assert.doesNotMatch(await page.locator('body').innerText(), /keyboard saved|fixture-contact|private title|UNSAVED MEMORY/);
      await snapshot(page, '10-public-unpublished');
      await restart(); await context.clearCookies(); await login(page, a);
      assert.deepEqual(await read('basic'), basicSaved);
      assert.deepEqual(await read('premium-polaroid'), premiumSaved);
      await openEditor(page, `${basic}/profile`);
      assert.equal(await field(page, '摄影师名称').inputValue(), basicSaved.content.profile.photographer);
      await openEditor(page, premium);
      assert.equal(await field(page, '摄影师名称').inputValue(), premiumSaved.content.profile.photographer);
    });
    await stage('11 desktop / mobile / narrow forms and previews', async () => {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const [label, url] of [['basic', `${basic}/profile`], ['premium', premium]]) {
          await openEditor(page, url);
          await field(page, '摄影师名称').focus();
          assert.equal(await field(page, '摄影师名称').isEditable(), true);
          const width = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth }));
          await snapshot(page, `11-${label}-form`);
          assert.ok(width.scroll <= width.inner + 1, `${label} form overflows at ${viewport.width}: ${width.scroll}`);
          await page.goto(`${origin}/${a}/admin/preview/${label === 'basic' ? 'basic' : 'premium-polaroid'}`);
          await page.waitForTimeout(200);
          await snapshot(page, `11-${label}-preview`);
        }
      }
    });
    await stage('12 no global content / manifest / import / card request', async () => {
      assert.deepEqual(network.filter(n => n.forbidden), []);
    });
    assert.equal(checkpoints.filter(item => item.result === 'FAIL').length, 0, `Browser acceptance failed: ${checkpoints.filter(item => item.result === 'FAIL').map(item => item.name).join('; ')}. See sanitized acceptance.json.`);
  } finally {
    // Whitelisted metadata only. No response bodies, auth headers or sessions.
    await writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
