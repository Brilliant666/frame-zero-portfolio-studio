import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

// Anonymous fixtures only. Keep all writes in the actual existing editors;
// API reads below are assertions, not a replacement for the browser save flow.
export async function siteAssetsBrowserSmoke({ origin, password, restart, signal }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  const output = join(process.cwd(), 'outputs', 'site-editor-browser', 'm3-assets');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(20000);
  const a = 'assetsmokea', b = 'assetsmokeb';
  const basic = `/${a}/admin/basic`, premium = `/${a}/admin/premium-polaroid`;
  const checkpoints = [], network = [], screenshots = [];
  const report = { head: process.env.GITHUB_SHA ?? 'local', build: 'Standard Next production / isolated PostgreSQL', checkpoints, network, screenshots };
  const persist = () => writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  const forbidden = /^\/(?:photos|platform-qr|__local-preview-photo)(?:\/|$)|^\/api\/(?:site-content|preview|platform-qr|local-photos|photo-import)(?:\/|$)/;
  const abort = () => { void browser.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 220000);
  context.on('request', request => {
    const url = new URL(request.url());
    if (forbidden.test(url.pathname)) network.push({ path: url.pathname, forbidden: true });
  });
  context.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith(`/api/sites/${a}/assets`)) network.push({ path: url.pathname, method: response.request().method(), status: response.status() });
  });
  const page = await context.newPage();
  async function expandTools(title) {
    const summary = page.getByText(title, { exact: true });
    // Read the native disclosure state and use its visible control, as a user does.
    const details = summary.locator('..');
    if (await details.getAttribute('open') === null) await summary.click();
  }

  async function login(p, username) {
    await p.goto(`${origin}/login`);
    await p.getByLabel('用户名', { exact: true }).fill(username);
    await p.getByLabel('密码', { exact: true }).fill(password);
    await p.getByRole('button', { name: '登录', exact: true }).click();
    await p.getByRole('link', { name: '进入我的站点后台' }).waitFor();
  }
  async function read(space, ctx = context) {
    const r = await ctx.request.get(`${origin}/api/sites/${a}/drafts/${space}`);
    assert.equal(r.status(), 200); return r.json();
  }
  async function save(space) {
    const result = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/sites/${a}/drafts/${space}`);
    await page.getByRole('button', { name: '仅保存草稿', exact: true }).click();
    const response = await result; assert.equal(response.status(), 200);
    return response.json();
  }
  async function shot(name) {
    assert.equal(await page.locator('input[type=password]').count(), 0);
    const file = `${name}-${page.viewportSize().width}.png`;
    await page.screenshot({ path: join(output, file) });
    screenshots.push({ file, path: new URL(page.url()).pathname });
  }
  async function images({ editor = false } = {}) {
    // Editors have long forms and lazy recommendation thumbnails. Bring a real
    // asset into view rather than requiring every offscreen lazy image to load.
    if (editor) await page.locator('img[src*="/api/sites/"]').filter({ visible: true }).first().scrollIntoViewIfNeeded();
    try {
      await page.waitForFunction(() => {
        const imgs = [...document.querySelectorAll('img[src*="/api/sites/"]')].filter(i => {
          const r = i.getBoundingClientRect();
          return i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
            r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
        });
        return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
      });
    } catch (error) {
      report.imageFailure = await page.locator('img[src*="/api/sites/"]').evaluateAll(imgs => imgs.map(i => {
        const r = i.getBoundingClientRect();
        return { src: i.getAttribute('src'), loading: i.loading, complete: i.complete, naturalWidth: i.naturalWidth,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
      }));
      throw error;
    }
  }
  async function step(name, run) {
    console.log(`[m3-browser] START ${name}`);
    try { await run(); checkpoints.push({ name, result: 'PASS' }); }
    catch (error) {
      checkpoints.push({ name, result: 'FAIL', error: String(error.message).split(password).join('[redacted]') });
      if (await page.locator('input[type=password]').count() === 0) await shot('failure').catch(() => {});
      throw error;
    } finally { await persist(); }
  }
  let assets, basicSaved, premiumSaved;
  try {
    await step('01 real login / upload landscape portrait square / select in basic editor', async () => {
      await login(page, a);
      await page.goto(`${origin}${basic}/profile`);
      await page.getByLabel('摄影师名称', { exact: true }).fill('Basic asset photographer');
      const href = `${basic}/layout`;
      await page.locator(`nav[aria-label="后台主要分区"] a[href="${href}"]`).click();
      const files = [];
      for (const [name, width, height, background] of [['landscape', 900, 600, '#476aa3'], ['portrait', 600, 900, '#70a284'], ['square', 700, 700, '#d2ad65']]) {
        files.push({ name: `${name}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width, height, channels: 3, background } }).png().toBuffer() });
      }
      await expandTools('上传素材与排版建议');
      await page.getByLabel('上传本站照片', { exact: true }).setInputFiles(files);
      await page.getByText('已上传 3 张；本站两套后台可引用同一资源，无需重复上传。', { exact: true }).waitFor();
      const list = await context.request.get(`${origin}/api/sites/${a}/assets`);
      assets = (await list.json()).assets;
      assert.equal(assets.length, 3);
      assert.deepEqual(assets.map(i => i.orientation).sort(), ['landscape', 'portrait', 'square']);
      await page.getByRole('button', { name: /横幅 · 1.50/ }).click();
      basicSaved = await save('basic');
      const chosen = Object.values(basicSaved.content.templateWorks).flat();
      assert.ok(chosen.some(w => w.assetId === assets.find(a => a.orientation === 'landscape').id));
      assert.equal(basicSaved.content.profile.photographer, 'Basic asset photographer');
      await images({ editor: true }); await shot('01-basic-upload-select');
    });
    await step('02 premium existing editor reuses uploaded assets / independent saved fields', async () => {
      await page.goto(`${origin}${premium}`);
      await page.getByRole('button', { name: '主页资料', exact: true }).click();
      await page.getByLabel('摄影师名称', { exact: true }).fill('Premium asset photographer');
      await page.getByRole('button', { name: '图集', exact: true }).click();
      await page.getByRole('button', { name: '新建图集', exact: true }).click();
      const creation = page.getByRole('dialog', { name: '新建图集', exact: true });
      await creation.getByLabel('图集名称', { exact: true }).fill('Anonymous landscape portrait square');
      await creation.getByRole('button', { name: '创建并选片', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
      for (const asset of assets) await picker.getByRole('checkbox', { name: `选择照片 ${asset.id}`, exact: true }).check();
      await picker.getByRole('button', { name: '加入当前图集（3 张）', exact: true }).click();
      await page.getByRole('navigation', { name: '图集编辑内容', exact: true }).getByRole('button', { name: '图集设置', exact: true }).click();
      await page.getByRole('combobox', { name: '独立封面', exact: true }).selectOption(assets.find(a => a.orientation === 'landscape').id);
      await page.getByRole('combobox', { name: '星图重点照片', exact: true }).selectOption(assets.find(a => a.orientation === 'portrait').id);
      premiumSaved = await save('premium-polaroid');
      assert.deepEqual([...premiumSaved.content.collections[0].assetIds].sort(), assets.map(a => a.id).sort());
      assert.equal(premiumSaved.content.profile.photographer, 'Premium asset photographer');
      assert.deepEqual(await read('basic'), basicSaved);
      const list = await context.request.get(`${origin}/api/sites/${a}/assets`);
      assert.equal((await list.json()).assets.length, 3, 'No second upload or copy for premium');
      await shot('02-premium-shared-assets');
    });
    await step('03 saved previews / three compositions / two themes / lightbox', async () => {
      await page.goto(`${origin}/${a}/admin/preview/basic`);
      await images(); await shot('03-basic-preview');
      await page.goto(`${origin}/${a}/admin/preview/premium-polaroid`);
      await images(); await shot('03-premium-home');
      await page.getByRole('button', { name: /进入图集：Anonymous/ }).click();
      const savedPreview = page.locator('[data-site-premium]');
      await savedPreview.getByRole('button', { name: '散落', exact: true }).waitFor();
      for (const mode of ['星座', '散落', '跨页']) {
        await savedPreview.getByRole('button', { name: mode, exact: true }).click();
        assert.equal(await savedPreview.getByRole('button', { name: mode, exact: true }).getAttribute('aria-pressed'), 'true');
        await images(); await shot(`03-${mode}`);
      }
      await savedPreview.getByRole('button', { name: '切换到夜空', exact: true }).click();
      await savedPreview.getByRole('button', { name: '切换到纸面', exact: true }).waitFor();
      await shot('03-night');
      await savedPreview.getByRole('button', { name: '散落', exact: true }).click();
      await savedPreview.getByRole('button', { name: /查看第 1 张照片/ }).click();
      await page.getByRole('dialog', { name: /第 \d+ 张照片预览/ }).waitFor(); await images(); await shot('03-lightbox');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: /第 \d+ 张照片预览/ }).waitFor({ state: 'hidden' });
    });
    await step('04 mobile 390 and 320 key paths / saved photos remain readable', async () => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`${origin}${basic}/layout`);
        await expandTools('上传素材与排版建议');
        await page.getByLabel('上传本站照片', { exact: true }).waitFor();
        await images({ editor: true }); await shot('04-basic-mobile');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Basic editor overflow at ${width}`);
        await page.goto(`${origin}${premium}#edit-collections`);
        await page.getByRole('navigation', { name: '图集编辑内容', exact: true }).getByRole('button', { name: '图集设置', exact: true }).click();
        await page.getByLabel('图集名称', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('图集名称', { exact: true }).inputValue(), 'Anonymous landscape portrait square');
        await shot('04-premium-mobile');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Premium editor overflow at ${width}`);
        await page.goto(`${origin}/${a}/admin/preview/premium-polaroid`);
        // Mobile home is a normal vertical document: the identity precedes
        // covers. Scroll to the real cover before asserting visible pixels.
        await page.getByRole('button', { name: /进入图集：Anonymous/ }).scrollIntoViewIfNeeded();
        await images(); await shot('04-preview-mobile');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        assert.equal(overflow, false, `No page-level overflow at ${width}`);
      }
    });
    await step('05 real service restart retains assets relations and independent content', async () => {
      await restart();
      await context.clearCookies(); await login(page, a);
      assert.deepEqual(await read('basic'), basicSaved);
      const reread = await read('premium-polaroid');
      assert.equal(reread.revision, premiumSaved.revision);
      assert.deepEqual(reread.content, premiumSaved.content);
      await page.goto(`${origin}/${a}/admin/preview/premium-polaroid`);
      await page.getByRole('button', { name: /进入图集：Anonymous/ }).scrollIntoViewIfNeeded();
      await images(); await shot('05-restart');
    });
    await step('06 other photographer and anonymous cannot read drafts or photos / no global requests', async () => {
      const other = await browser.newContext(); const p = await other.newPage();
      await login(p, b);
      for (const method of ['get', 'head']) {
        const response = await other.request[method](`${origin}${assets[0].variants.card.src}`);
        assert.equal(response.status(), 403);
      }
      const preview = await other.request.get(`${origin}/${a}/admin/preview/premium-polaroid`);
      assert.ok([401, 403, 404].includes(preview.status()) || new URL(preview.url()).pathname === '/login');
      const anon = await browser.newContext();
      assert.equal((await anon.request.get(`${origin}${assets[0].variants.card.src}`)).status(), 401);
      const publicPage = await anon.request.get(`${origin}/${a}`);
      assert.match(await publicPage.text(), /data-site-state="unpublished"/);
      await other.close(); await anon.close();
      assert.deepEqual(network.filter(n => n.forbidden), []);
      assert.equal(network.filter(n => n.method === 'POST' && n.path === `/api/sites/${a}/assets`).length, 3);
    });
  } finally {
    clearTimeout(timeout); signal?.removeEventListener('abort', abort);
    await persist(); await browser.close();
  }
}
