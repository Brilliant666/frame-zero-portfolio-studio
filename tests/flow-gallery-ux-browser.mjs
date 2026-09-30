import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { readPublished } from '../db/accounts/publications.mjs';
import { isSiteSlug } from '../db/accounts/site-slug.mjs';

const SPACE = 'premium-flow-gallery';
const DEFAULT_SLUG = 'flowuxfixture';
const MODULES = [
  ['library', '图库', 'gallery'], ['home', '首页', 'works'],
  ['groups', '完整作品', 'gallery'], ['pricing', '价格与活动', 'pricing'],
  ['contact', '联系', 'contact'],
];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const outside = (root, target) => {
  const from = relative(root, target);
  return from.startsWith(`..${sep}`) || from === '..' || isAbsolute(from);
};

/** Caller owns the isolated database, build, server and its cleanup. Never reuse
 * a fixture, start a server, migrate, delete a Site, or write drafts through APIs. */
export async function flowGalleryUxBrowser({ runtime, origin, password, signal, fixtureSlug = DEFAULT_SLUG }) {
  assert.equal(isSiteSlug(fixtureSlug), true, 'Flow UX fixture must be a safe Site slug');
  assert.ok(fixtureSlug.startsWith('flowux'), 'Flow UX fixture must use the flowux prefix');
  const SLUG = fixtureSlug;
  assert.equal(runtime.config.isTest, true, 'Flow UX requires the explicit test runtime');
  assert.equal(origin, 'http://127.0.0.1:3004', 'Flow UX only uses the isolated browser origin');
  assert.equal(new URL(runtime.config.databaseUrl).pathname, '/frame_zero_accounts_test');
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
  signal?.throwIfAborted();
  const collision = await runtime.pool.query(`SELECT
    EXISTS(SELECT 1 FROM sites WHERE slug=$1) OR
    EXISTS(SELECT 1 FROM "user" WHERE lower(username)=$1 OR lower(email)=$2) OR
    EXISTS(SELECT 1 FROM account_provisioning WHERE username=$1 OR slug=$1 OR email=$2) AS present`, [SLUG, `${SLUG}@example.invalid`]);
  assert.equal(collision.rows[0].present, false, 'Requested Flow UX fixture already exists; refuse to reuse or overwrite it');

  // Fingerprint business rows without retaining private payloads or reading auth data.
  async function protectedState(excludeSiteId = null) {
    const result = {};
    for (const table of ['site_content_drafts', 'site_publications', 'site_assets', 'site_template_grants']) {
      const rows = (await runtime.pool.query(`SELECT md5(row_to_json(t)::text) AS fingerprint FROM ${table} t
        WHERE ($1::uuid IS NULL OR site_id<>$1::uuid) ORDER BY fingerprint`, [excludeSiteId])).rows;
      result[table] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    return result;
  }
  const protectedBefore = await protectedState();
  const owner = await provisionAccount(runtime, { username: SLUG, slug: SLUG, email: `${SLUG}@example.invalid`, password, premium: false });
  assert.equal(owner.status, 'CREATED', 'Only a newly created anonymous fixture may receive a grant');
  assert.match(owner.siteId, /^[0-9a-f-]{36}$/);
  const grant = await runtime.pool.query(`INSERT INTO site_template_grants(id,site_id,product,source)
    SELECT $1,id,$3,'operator-test' FROM sites WHERE id=$2 AND slug=$4 RETURNING id`, [randomUUID(), owner.siteId, SPACE, SLUG]);
  assert.equal(grant.rowCount, 1);

  const repository = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const output = resolve(process.env.FRAME_ZERO_BROWSER_OUTPUT_DIR || (process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'PortfolioPlatform', 'local-m3', 'pr34-flow-ux-browser')
    : join(tmpdir(), 'frame-zero-flow-ux-browser')), `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  assert.ok(outside(repository, output), 'Browser evidence must remain outside the repository');
  await mkdir(output, { recursive: true });
  assert.ok(outside(repository, await realpath(output)), 'Evidence symlinks must not resolve into the repository');
  const redact = value => String(value).split(password).join('[redacted]').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[redacted database]');
  const report = {
    origin, fixture: SLUG, head: process.env.GITHUB_SHA ?? 'local',
    scope: 'Synthetic third-space UI, memory preview, Published-only rendering and viewport/motion regressions; no physical device acceptance',
    checkpoints: [], screenshots: [], transitions: [], sceneScroll: [], lightboxReturns: [], lightboxSizing: [], motion: [], railWidths: [], network: [], forbiddenRequests: [], pageErrors: [],
    protectedBefore, protectedAfter: null,
  };
  const persist = () => writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  let browser, page, publicPage;
  const abort = () => { void browser?.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, 600000);
  const draftPath = space => `/api/sites/${SLUG}/drafts/${space}`;
  const publicationPath = `/api/sites/${SLUG}/publications/${SPACE}`;
  const assetsPath = `/api/sites/${SLUG}/assets`;
  const writeCount = () => report.network.filter(row => !['GET', 'HEAD'].includes(row.method)).length;
  async function screenshot(p, name) {
    assert.equal(await p.locator('input[type="password"]').count(), 0, 'Never screenshot credentials');
    const file = `${name}-${p.viewportSize().width}.png`;
    await p.screenshot({ path: join(output, file), fullPage: false });
    report.screenshots.push({ file, pathname: new URL(p.url()).pathname, viewport: p.viewportSize() });
  }
  async function stage(name, run) {
    signal?.throwIfAborted();
    const started = Date.now();
    console.log(`[flow-ux-browser] START ${name}`);
    try { await run(); report.checkpoints.push({ name, result: 'PASS', durationMs: Date.now() - started }); }
    catch (error) {
      report.checkpoints.push({ name, result: 'FAIL', error: redact(error.message), durationMs: Date.now() - started });
      if (page && !page.isClosed() && await page.locator('input[type="password"]').count() === 0) await screenshot(page, 'failure').catch(() => {});
      if (publicPage && !publicPage.isClosed()) await screenshot(publicPage, 'failure-public').catch(() => {});
      throw new Error(redact(error.message));
    } finally { await persist(); }
  }
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
    const context = await browser.newContext({ viewport: VIEWPORTS[0], reducedMotion: 'reduce' });
    const anonymous = await browser.newContext({ viewport: VIEWPORTS[0], reducedMotion: 'no-preference' });
    for (const ctx of [context, anonymous]) {
      ctx.setDefaultTimeout(15000); ctx.setDefaultNavigationTimeout(25000);
      ctx.on('page', p => {
        p.on('pageerror', error => report.pageErrors.push(redact(error.message)));
        // Only browser beforeunload is expected; no deletion/overwrite confirmation is accepted.
        p.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.accept(); else { report.forbiddenRequests.push(`unexpected-dialog:${dialog.type()}`); void dialog.dismiss(); } });
      });
      await ctx.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (url.origin !== origin && /^https?:$/.test(url.protocol)) { report.forbiddenRequests.push('external-origin'); return route.abort(); }
        if (url.origin === origin && url.pathname.startsWith('/api/')) {
          report.network.push({ method, path: url.pathname });
          const ownWrite = url.pathname === draftPath(SPACE) || url.pathname === publicationPath || url.pathname === assetsPath;
          if ((method !== 'GET' && method !== 'HEAD' && !ownWrite && !url.pathname.startsWith('/api/auth/')) ||
              /^\/api\/(?:site-content|preview\/site-content|platform-qr|local-photos|photo-import)(?:\/|$)/.test(url.pathname)) {
            report.forbiddenRequests.push(url.pathname); return route.abort();
          }
        }
        if (url.pathname.startsWith('/photos/') || url.pathname.startsWith('/preview/flow-gallery/asset')) { report.forbiddenRequests.push(url.pathname); return route.abort(); }
        await route.continue();
      });
    }
    page = await context.newPage(); publicPage = await anonymous.newPage();
    const root = page.locator('[data-flow-editor-section]');
    const preview = () => page.getByRole('dialog', { name: '当前编辑即时预览', exact: true });
    const publicationRegion = page.getByRole('region', { name: '公开发布', exact: true });
    async function json(path, status = 200) {
      const response = await context.request.get(`${origin}${path}`);
      assert.equal(response.status(), status, `GET ${path}`);
      return status === 200 ? response.json() : null;
    }
    const draft = () => json(draftPath(SPACE));
    const publication = () => json(publicationPath);
    async function module(id) {
      await page.locator(`nav[aria-label="流影视廊后台模块"] [data-flow-section="${id}"]`).click();
      await page.waitForFunction(value => document.querySelector('[data-flow-editor-section]')?.getAttribute('data-flow-editor-section') === value, id);
    }
    async function overflow(p) {
      const dimensions = await p.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(dimensions.html <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `Horizontal overflow: ${JSON.stringify(dimensions)}`);
    }
    async function stableScroll(p, selector = null) {
      return p.evaluate(target => new Promise((resolveScroll, rejectScroll) => {
        const port = target ? document.querySelector(target) : null;
        if (target && !port) return rejectScroll(new Error('Expected scrollport is missing'));
        const read = () => port ? port.scrollTop : scrollY;
        const start = performance.now(), samples = [];
        let previous = read(), stableSince = start;
        const frame = now => {
          const top = read(); samples.push({ ms: now - start, top, window: scrollY });
          if (Math.abs(top - previous) > 0.25) stableSince = now;
          previous = top;
          if (now - stableSince >= 160 && samples.length >= 5) return resolveScroll({ durationMs: now - start, top, samples });
          if (now - start > 5000) return rejectScroll(new Error(`User scrolling did not settle: ${JSON.stringify(samples.slice(-8))}`));
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }), selector);
    }
    async function railWidth(rails, expectedLeftPercent, source) {
      const measured = await rails.evaluate(element => {
        const columns = [...element.children].map(column => column.getBoundingClientRect().width);
        return { columns, inlineGrid: element.style.gridTemplateColumns };
      });
      assert.equal(measured.columns.length, 2, 'Home has exactly two rail columns');
      assert.ok(measured.columns.every(width => width > 0), 'Both rail columns remain visible');
      measured.leftPercent = measured.columns[0] / (measured.columns[0] + measured.columns[1]) * 100;
      assert.ok(Math.abs(measured.leftPercent - expectedLeftPercent) <= 0.5, `${source} rail proportions: ${JSON.stringify(measured)}`);
      if (expectedLeftPercent === 200 / 3) assert.equal(measured.inlineGrid, '', 'Original proportion deletes the explicit grid override');
      report.railWidths.push({ source, viewport: source === 'public' ? publicPage.viewportSize() : page.viewportSize(), expectedLeftPercent, ...measured });
    }
    async function lightboxSizing(p, source) {
      const dialog = p.locator('[role="dialog"][aria-modal="true"]');
      const image = dialog.locator('img');
      await dialog.waitFor();
      await p.waitForFunction(() => {
        const image = document.querySelector('[role="dialog"][aria-modal="true"] img');
        return image?.complete && image.naturalWidth > 0;
      });
      async function measure() {
        return image.evaluate(async element => {
          await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
          const r = element.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
            metadataWidth: Number(element.getAttribute('width')), metadataHeight: Number(element.getAttribute('height')),
            naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, objectFit: getComputedStyle(element).objectFit };
        });
      }
      function intrinsicRatio(bounds) {
        assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.metadataWidth > 0 && bounds.metadataHeight > 0, 'Lightbox has visible image geometry and intrinsic metadata');
        const expected = bounds.metadataWidth / bounds.metadataHeight;
        assert.ok(Math.abs(bounds.naturalWidth / bounds.naturalHeight - expected) <= 0.001, 'Synthetic asset dimensions match content metadata');
        assert.ok(Math.abs(bounds.width / bounds.height - expected) <= 0.01, `${source} preserves the complete photograph ratio: ${JSON.stringify(bounds)}`);
      }
      const fitted = await measure();
      intrinsicRatio(fitted);
      const viewport = p.viewportSize();
      assert.ok(fitted.left >= -1 && fitted.top >= -1 && fitted.right <= viewport.width + 1 && fitted.bottom <= viewport.height + 1,
        `${source} default image fits the screen: ${JSON.stringify({ viewport, fitted })}`);
      const close = dialog.getByRole('button', { name: '关闭大图', exact: true });
      const zoom = dialog.getByRole('button', { name: '放大查看', exact: true });
      assert.equal(await dialog.getByRole('button').count(), 2, 'Lightbox exposes close and zoom controls');
      assert.equal(await zoom.getAttribute('aria-pressed'), 'false');
      await close.focus();
      await p.keyboard.press('Tab');
      assert.equal(await zoom.evaluate(element => document.activeElement === element), true, 'Tab moves from close to zoom');
      await p.keyboard.press('Tab');
      assert.equal(await close.evaluate(element => document.activeElement === element), true, 'Tab wraps from zoom to close');
      await p.keyboard.press('Shift+Tab');
      assert.equal(await zoom.evaluate(element => document.activeElement === element), true, 'Shift+Tab wraps from close to zoom');
      await zoom.click();
      const fit = dialog.getByRole('button', { name: '适应屏幕', exact: true });
      await fit.waitFor();
      assert.equal(await fit.getAttribute('aria-pressed'), 'true');
      const enlarged = await measure();
      intrinsicRatio(enlarged);
      assert.ok(enlarged.width > fitted.width + 1 || enlarged.height > fitted.height + 1, `${source} explicit zoom enlarges the image`);
      await fit.click();
      await zoom.waitFor();
      assert.equal(await zoom.getAttribute('aria-pressed'), 'false');
      const restored = await measure();
      intrinsicRatio(restored);
      assert.ok(Math.abs(restored.width - fitted.width) <= 1 && Math.abs(restored.height - fitted.height) <= 1, 'Fit restores the original complete-image geometry');
      report.lightboxSizing.push({ source, viewport, orientation: fitted.metadataHeight > fitted.metadataWidth ? 'portrait' : 'landscape', fitted, enlarged, restored });
    }
    async function modulePreview(id, scene, { temporary = false, title, capture = false, leftPercent } = {}) {
      const before = { draft: await draft(), publication: await publication(), writes: writeCount(), dirty: await root.getAttribute('data-flow-dirty'), hash: new URL(page.url()).hash };
      const trigger = page.locator(`[data-flow-module-preview="${id}"]`);
      await trigger.click();
      await preview().waitFor();
      await preview().locator(`[data-flow-scene="${scene}"]`).waitFor();
      const dialogBounds = await preview().boundingBox();
      assert.ok(dialogBounds && Math.abs(dialogBounds.width - page.viewportSize().width) <= 1, `${id} preview dialog spans the viewport width`);
      assert.equal(await preview().getAttribute('data-flow-preview'), id);
      assert.equal(new URL(page.url()).hash, `#${scene}`);
      assert.equal(await preview().locator('[data-flow-preview-temporary]').count(), temporary ? 1 : 0);
      if (title) await preview().getByRole('heading', { name: title, exact: true }).waitFor();
      if (leftPercent !== undefined) await railWidth(preview().locator('[aria-label="作品速览"]'), leftPercent, 'memory-preview');
      await overflow(page);
      if (capture) await screenshot(page, `preview-${id}`);
      await preview().locator('[data-flow-close-preview]').click();
      await preview().waitFor({ state: 'detached' });
      await page.waitForFunction(value => document.activeElement?.getAttribute('data-flow-module-preview') === value, id);
      assert.equal(await root.getAttribute('data-flow-editor-section'), id);
      assert.equal(await root.getAttribute('data-flow-dirty'), before.dirty);
      assert.equal(new URL(page.url()).hash, before.hash);
      assert.equal(writeCount(), before.writes, 'Preview must not save or publish');
      assert.deepEqual(await draft(), before.draft, 'Memory preview retains the persisted draft');
      assert.deepEqual(await publication(), before.publication, 'Memory preview retains Published');
    }
    async function save() {
      const response = page.waitForResponse(r => new URL(r.url()).pathname === draftPath(SPACE) && r.request().method() === 'PUT');
      await page.getByRole('button', { name: '仅保存草稿', exact: true }).click();
      const received = await response;
      assert.equal(received.status(), 200);
      const receipt = await received.json();
      await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.getAttribute('data-flow-dirty') === 'false');
      assert.deepEqual(await draft(), receipt, 'The save receipt matches the persisted draft');
      return receipt;
    }

    let basicBefore, published;
    await stage('01 owner login and module navigation', async () => {
      await page.goto(`${origin}/login`);
      await page.getByRole('textbox', { name: '用户名', exact: true }).fill(SLUG);
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('link', { name: '进入我的站点后台' }).waitFor();
      await page.goto(`${origin}/${SLUG}/admin/${SPACE}`);
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled && document.querySelector('[data-flow-editor-section]'));
      await page.getByRole('button', { name: '查看本模块效果', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('[data-flow-module-preview]')?.disabled);
      assert.deepEqual(await page.locator('nav[aria-label="流影视廊后台模块"] [data-flow-section]').evaluateAll(nodes => nodes.map(node => node.dataset.flowSection)), MODULES.map(([id]) => id));
      const rights = await json('/api/account/site');
      assert.deepEqual(rights.templates.premium, [SPACE]);
      await json(draftPath('premium-polaroid'), 403);
      basicBefore = await json(draftPath('basic'));
      assert.equal((await draft()).revision, 0);
      assert.equal((await publication()).current, null);
      for (const [id, , scene] of MODULES) {
        await module(id);
        await modulePreview(id, scene, { temporary: id === 'pricing' || id === 'contact' });
      }
    });

    await stage('02 real UI upload, categories, background and rails', async () => {
      await module('library');
      const files = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
        const width = index % 3 === 0 ? 480 : 720, height = index % 3 === 0 ? 720 : 480;
        return { name: `anonymous-flow-${index + 1}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width, height, channels: 3, background: { r: 35 + index * 19, g: 70 + index * 12, b: 100 + index * 9 } } }).png().toBuffer() };
      }));
      await page.getByLabel('上传本站照片', { exact: true }).setInputFiles(files);
      await page.getByText(/已上传 8 张/).waitFor();
      await page.getByText('本站图库 8 张', { exact: true }).waitFor();
      const assets = (await json(assetsPath)).assets;
      assert.equal(assets.length, 8);
      await module('groups');
      for (const [index, name] of ['Anonymous portrait studies', 'Anonymous landscape studies'].entries()) {
        await page.getByRole('textbox', { name: '分类名称', exact: true }).fill(name);
        await page.getByRole('button', { name: '新建并从图库选片', exact: true }).click();
        const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
        await picker.waitFor();
        for (const asset of assets.slice(index * 4, index * 4 + 4)) await picker.getByLabel(`选择照片 ${asset.id}`, { exact: true }).check();
        await picker.getByRole('button', { name: '加入当前图集（4 张）', exact: true }).click();
        await picker.waitFor({ state: 'detached' });
      }
      await module('home');
      await page.getByRole('textbox', { name: '导航品牌名', exact: true }).fill('Anonymous Flow Studio');
      await page.getByRole('textbox', { name: '首页标题', exact: true }).fill('Flow fixture published title');
      await page.getByRole('textbox', { name: '首页介绍', exact: true }).fill('Synthetic photographs for isolated browser acceptance.');
      await page.getByRole('button', { name: '从图库选择背景', exact: true }).click();
      await page.getByRole('dialog', { name: '从图库选择一张背景', exact: true }).getByRole('button', { name: `选择背景 ${assets[1].id}`, exact: true }).click();
      await page.getByRole('combobox', { name: '左侧轨道', exact: true }).selectOption({ label: 'Anonymous portrait studies' });
      await page.getByRole('combobox', { name: '右侧轨道', exact: true }).selectOption({ label: 'Anonymous landscape studies' });
      for (const [name, leftPercent] of [['7∶3', 70], ['5∶5', 50]]) {
        const preset = page.getByRole('button', { name, exact: true });
        await preset.click(); assert.equal(await preset.getAttribute('aria-pressed'), 'true');
        await modulePreview('home', 'works', { title: 'Flow fixture published title', leftPercent });
      }
      assert.equal((await draft()).revision, 0, 'Editing and preview do not save implicitly');
      assert.equal((await publication()).current, null);
      await module('pricing');
      await page.getByRole('textbox', { name: '页面标题', exact: true }).fill('Synthetic pricing');
      await page.getByRole('textbox', { name: '介绍', exact: true }).fill(Array.from({ length: 70 }, (_, index) => `Fixture detail ${index + 1}`).join('\n'));
      await page.getByRole('button', { name: '新增价格项目', exact: true }).click();
      await page.getByRole('textbox', { name: '名称', exact: true }).fill('Synthetic session');
      await page.getByRole('textbox', { name: '价格说明', exact: true }).fill('100 fixture units');
      await module('contact');
      await page.getByRole('textbox', { name: '页面标题', exact: true }).fill('Synthetic contact');
      await page.getByRole('textbox', { name: '介绍', exact: true }).fill(Array.from({ length: 70 }, (_, index) => `Contact note ${index + 1}`).join('\n'));
      await page.getByRole('button', { name: '新增联系方式', exact: true }).click();
      await page.getByRole('textbox', { name: '联系名称', exact: true }).fill('Fixture email');
      await page.getByRole('textbox', { name: '账号或说明', exact: true }).fill('flow@example.invalid');
      await page.getByRole('textbox', { name: '链接（可选，http / https / mailto）', exact: true }).fill('mailto:flow@example.invalid');
      const saved = await save();
      assert.equal(saved.revision, 1); assert.equal(saved.content.pricing.enabled, false); assert.equal(saved.content.contact.enabled, false);
      assert.equal(saved.content.rails.leftWidthPercent, 50, 'Save receipt preserves the chosen 5:5 proportion');
      assert.equal((await publication()).current, null, 'Save only preserves the unpublished pointer');
      await module('home');
      await page.getByRole('button', { name: '原比例 2∶1', exact: true }).click();
      await modulePreview('home', 'works', { leftPercent: 200 / 3 });
      const originalRatio = await save();
      assert.equal(originalRatio.revision, 2);
      assert.equal(Object.hasOwn(originalRatio.content.rails, 'leftWidthPercent'), false, 'Saving the original proportion removes the optional persisted field');
      assert.deepEqual(originalRatio.content.groups, saved.content.groups, 'Resetting width retains categories and photo order');
      assert.equal((await publication()).current, null);
      await page.getByRole('button', { name: '5∶5', exact: true }).click();
      for (const [id, title, checkbox] of [['pricing', 'Synthetic pricing', '展示价格与活动页面'], ['contact', 'Synthetic contact', '展示联系页面']]) {
        await module(id); await modulePreview(id, id, { temporary: true, title });
        assert.equal(await page.getByLabel(checkbox, { exact: true }).isChecked(), false);
      }
    });

    await stage('03 explicit publish and unsaved-title preview isolation', async () => {
      await module('pricing'); await page.getByLabel('展示价格与活动页面', { exact: true }).check();
      await module('contact'); await page.getByLabel('展示联系页面', { exact: true }).check();
      const response = page.waitForResponse(r => new URL(r.url()).pathname === publicationPath && r.request().method() === 'POST');
      await publicationRegion.getByRole('button', { name: '保存并发布', exact: true }).click();
      assert.equal((await response).status(), 200);
      await publicationRegion.getByRole('status').filter({ hasText: '发布成功' }).waitFor();
      published = (await publication()).current;
      assert.equal(published.space, SPACE); assert.equal(published.templateId, SPACE); assert.equal(published.draftRevision, 3);
      const publishedSnapshot = await readPublished(runtime.pool, SLUG);
      assert.equal(publishedSnapshot.content.rails.leftWidthPercent, 50, 'Explicit publishing freezes the chosen rail proportion');
      assert.equal((await draft()).content.rails.leftWidthPercent, 50);
      await module('home');
      await page.getByRole('textbox', { name: '首页标题', exact: true }).fill('Unsaved immediate preview title');
      await page.getByRole('button', { name: '7∶3', exact: true }).click();
      assert.equal(await root.getAttribute('data-flow-dirty'), 'true');
      await modulePreview('home', 'works', { title: 'Unsaved immediate preview title', leftPercent: 70 });
      assert.equal(await page.getByRole('textbox', { name: '首页标题', exact: true }).inputValue(), 'Unsaved immediate preview title');
      assert.equal((await draft()).content.profile.title, 'Flow fixture published title');
      assert.equal((await publication()).current.id, published.id);
      assert.deepEqual(await readPublished(runtime.pool, SLUG), publishedSnapshot, 'Unsaved proportion changes leave the complete Published snapshot unchanged');
      assert.deepEqual(await json(draftPath('basic')), basicBefore, 'Flow editing retains the basic draft');
      await publicPage.goto(`${origin}/${SLUG}`);
      await publicPage.locator('[data-flow-scene="works"]').waitFor();
      await publicPage.getByRole('heading', { name: 'Flow fixture published title', exact: true }).waitFor();
      await railWidth(publicPage.locator('[aria-label="作品速览"]'), 50, 'public');
      assert.equal(await publicPage.getByText('Unsaved immediate preview title', { exact: true }).count(), 0);
      assert.equal((await anonymous.request.get(`${origin}${draftPath(SPACE)}`)).status(), 401);
    });

    await stage('04 editor and module previews at desktop and mobile widths', async () => {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        for (const [id, , scene] of MODULES) {
          await module(id); await overflow(page);
          if (id === 'home') {
            for (const [name, leftPercent] of [['7∶3', 70], ['5∶5', 50], ['原比例 2∶1', 200 / 3]]) {
              await page.getByRole('button', { name, exact: true }).click();
              await modulePreview(id, scene, { leftPercent });
            }
            await page.getByRole('button', { name: '7∶3', exact: true }).click();
          }
          await modulePreview(id, scene, { capture: true, ...(id === 'home' ? { leftPercent: 70 } : {}) });
          await screenshot(page, `editor-${id}`);
        }
        assert.equal(await root.getAttribute('data-flow-dirty'), 'true');
      }
    });

    await stage('05 nested preview lightbox retains its scrollport and body lock', async () => {
      await module('groups');
      const before = { draft: await draft(), publication: await publication(), writes: writeCount() };
      await page.locator('[data-flow-module-preview="groups"]').click();
      await preview().locator('[data-flow-scene="gallery"]').waitFor();
      const port = await preview().boundingBox();
      await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2); await page.mouse.wheel(0, 450);
      await page.waitForFunction(() => document.querySelector('dialog [data-flow-scrollport]')?.scrollTop > 100);
      const beforeSettled = await stableScroll(page, 'dialog [data-flow-scrollport]');
      const photos = preview().locator('main button[aria-label^="查看大图："]');
      let visiblePhoto;
      for (let index = 0; index < await photos.count(); index++) {
        const bounds = await photos.nth(index).boundingBox();
        if (bounds && bounds.y >= port.y + 100 && bounds.y + bounds.height <= port.y + port.height - 40) { visiblePhoto = photos.nth(index); break; }
      }
      assert.ok(visiblePhoto, 'A preview photograph is visible inside the dialog scrollport');
      const geometry = await visiblePhoto.evaluate(photo => {
        const port = photo.closest('[data-flow-scrollport]');
        const rect = () => { const bounds = photo.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height }; };
        const read = () => ({ port: port.scrollTop, window: scrollY, photoRect: rect() });
        window.__flowUxPhotoClick = {};
        photo.addEventListener('pointerdown', () => { window.__flowUxPhotoClick.pointerdown = read(); }, { capture: true, once: true });
        photo.addEventListener('click', () => { window.__flowUxPhotoClick.click = read(); }, { capture: true, once: true });
        return { ...read(), overflow: document.body.style.overflow, width: document.body.getBoundingClientRect().width, dialogTransform: getComputedStyle(port.closest('dialog')).transform, scrollportTransform: getComputedStyle(port).transform };
      });
      const diagnostic = { type: 'preview', viewport: page.viewportSize(), beforeSettled, geometry, actualPhotoClick: null, opened: null, actualCloseClick: null, restored: null, afterSettled: null };
      report.lightboxReturns.push(diagnostic);
      await visiblePhoto.click();
      const close = preview().getByRole('button', { name: '关闭大图', exact: true });
      await close.waitFor();
      diagnostic.actualPhotoClick = await page.evaluate(() => window.__flowUxPhotoClick);
      diagnostic.opened = await close.evaluate(button => {
        const port = button.closest('[data-flow-scrollport]'), lightbox = button.closest('[aria-modal="true"]');
        const rect = element => { const bounds = element.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, width: bounds.width }; };
        const read = () => ({ port: port.scrollTop, window: scrollY, buttonRect: rect(button) });
        window.__flowUxLightboxClose = {};
        button.addEventListener('pointerdown', () => { window.__flowUxLightboxClose.pointerdown = read(); }, { capture: true, once: true });
        button.addEventListener('click', () => { window.__flowUxLightboxClose.click = read(); }, { capture: true, once: true });
        return { ...read(), lightboxRect: rect(lightbox), overflow: document.body.style.overflow, width: document.body.getBoundingClientRect().width };
      });
      await lightboxSizing(page, 'nested-preview');
      await close.click();
      await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));
      diagnostic.actualCloseClick = await page.evaluate(() => window.__flowUxLightboxClose);
      diagnostic.afterSettled = await stableScroll(page, 'dialog [data-flow-scrollport]');
      const restored = await page.evaluate(() => ({ port: document.querySelector('dialog [data-flow-scrollport]').scrollTop, window: scrollY, overflow: document.body.style.overflow, width: document.body.getBoundingClientRect().width }));
      diagnostic.restored = restored;
      const clickedTop = diagnostic.actualPhotoClick?.click?.port;
      const values = `before=${geometry.port}, pointerdown=${diagnostic.actualPhotoClick?.pointerdown?.port}, click=${clickedTop}, opened=${diagnostic.opened.port}, closeClick=${diagnostic.actualCloseClick?.click?.port}, restored=${restored.port}`;
      assert.equal(typeof clickedTop, 'number', `Actual photograph click was captured: ${values}`);
      assert.ok(Math.abs(clickedTop - geometry.port) <= 2, `Playwright scrolled the preview before the photograph click: ${values}`);
      assert.ok(Math.abs(diagnostic.opened.port - clickedTop) <= 2, `Opening the lightbox changed the actual gallery bookmark: ${values}`);
      assert.ok(Math.abs(restored.port - geometry.port) <= 2, `Closing the lightbox changed the preview bookmark: ${values}`); assert.equal(restored.window, geometry.window);
      assert.equal(restored.overflow, geometry.overflow); assert.ok(Math.abs(restored.width - geometry.width) <= 1);
      await screenshot(page, 'preview-lightbox-return');
      await preview().locator('[data-flow-close-preview]').click(); await preview().waitFor({ state: 'detached' });
      assert.equal(await root.getAttribute('data-flow-dirty'), 'true');
      assert.equal(writeCount(), before.writes); assert.deepEqual(await draft(), before.draft); assert.deepEqual(await publication(), before.publication);
    });

    // Capture is armed before the actual user click; rAF starts in its capture
    // listener, so it includes the first committed works frame, not a delayed poll.
    async function returnToWorks(from, button) {
      await publicPage.evaluate(() => {
        window.__flowUxCapture = { done: false, samples: [] };
        document.addEventListener('click', () => {
          const start = performance.now();
          const frame = now => {
            const root = document.querySelector('[data-flow-scene]'), scene = root?.getAttribute('data-flow-scene');
            const rect = selector => { const r = root?.querySelector(selector)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width } : null; };
            const tracks = [...(root?.querySelectorAll('[style*="--rail-duration"]') ?? [])].map(track => {
              const style = getComputedStyle(track);
              return { y: new DOMMatrixReadOnly(style.transform).m42, delay: style.animationDelay, state: style.animationPlayState };
            });
            window.__flowUxCapture.samples.push({ ms: now - start, scene, inner: innerWidth, html: document.documentElement.clientWidth, body: document.body.getBoundingClientRect().width, bodyLeft: document.body.getBoundingClientRect().left, overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), title: rect('h1'), rails: rect('[aria-label="作品速览"]'), tracks });
            if (now - start < 700) requestAnimationFrame(frame); else window.__flowUxCapture.done = true;
          };
          requestAnimationFrame(frame);
        }, { capture: true, once: true });
      });
      await button.click();
      await publicPage.waitForFunction(() => window.__flowUxCapture?.done);
      const samples = await publicPage.evaluate(() => window.__flowUxCapture.samples);
      const works = samples.filter(row => row.scene === 'works');
      assert.ok(works.length >= 5 && samples.at(-1).ms >= 700, 'Capture includes multiple first-scene rAF frames across 700ms');
      const spread = values => Math.max(...values) - Math.min(...values);
      for (const key of ['html', 'body', 'bodyLeft']) assert.ok(spread(samples.map(row => row[key])) <= 1, `${from}→works ${key} changed during transition`);
      for (const row of samples) assert.ok(row.overflow <= row.inner + 1, `${from}→works transient horizontal overflow`);
      for (const field of ['title', 'rails']) {
        assert.ok(works.every(row => row[field]), `${field} exists from the first works frame`);
        for (const key of ['left', 'right', 'top', 'bottom', 'width']) assert.ok(spread(works.map(row => row[field][key])) <= 1, `${from}→works ${field}.${key} shifted (entry translation / scrollbar reflow regression)`);
      }
      const early = works.filter(row => row.ms <= works[0].ms + 250);
      assert.ok(early.length >= 3, 'Capture includes the first 250ms of visible home frames');
      assert.ok(early.every(row => row.tracks.length === 2 && row.tracks.every(track => track.delay === '0s' && track.state === 'running')), 'Both rails start without a fixed delay');
      for (let index = 0; index < 2; index++) {
        assert.ok(Math.abs(early.at(-1).tracks[index].y - early[0].tracks[index].y) > 2, 'Both rails move within the first 250ms');
      }
      report.transitions.push({ from, viewport: publicPage.viewportSize(), durationMs: samples.at(-1).ms, samples });
      await screenshot(publicPage, `public-${from}-return`);
    }
    async function trackMotion(milliseconds = 400) {
      return publicPage.evaluate(duration => new Promise(resolveMotion => {
        const tracks = [...document.querySelector('[aria-label="作品速览"]').querySelectorAll('[style*="--rail-duration"]')];
        const read = () => tracks.map(track => ({ y: new DOMMatrixReadOnly(getComputedStyle(track).transform).m42, name: getComputedStyle(track).animationName, state: getComputedStyle(track).animationPlayState, duration: getComputedStyle(track).animationDuration }));
        const start = performance.now(), before = read();
        const frame = now => { if (now - start < duration) requestAnimationFrame(frame); else resolveMotion({ durationMs: now - start, before, after: read() }); };
        requestAnimationFrame(frame);
      }), milliseconds);
    }
    await stage('06 public first-frame geometry, rail motion and lightbox return', async () => {
      for (const viewport of VIEWPORTS) {
        await publicPage.setViewportSize(viewport);
        await publicPage.goto(`${origin}/${SLUG}#works`);
        await publicPage.locator('[data-flow-scene="works"]').waitFor();
        await publicPage.waitForFunction(() => [...document.querySelector('[data-flow-scene]').querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0));
        await railWidth(publicPage.locator('[aria-label="作品速览"]'), 50, 'public');
        await overflow(publicPage);
        for (const from of ['pricing', 'contact']) {
          await publicPage.locator(`nav[aria-label="主要导航"] a[href="#${from}"]`).click();
          await publicPage.locator(`[data-flow-scene="${from}"]`).waitFor(); await overflow(publicPage);
          const windowBefore = await publicPage.evaluate(() => scrollY);
          await publicPage.mouse.move(viewport.width / 2, viewport.height / 2); await publicPage.mouse.wheel(0, 420);
          await publicPage.waitForFunction(() => document.querySelector('[data-flow-scene] main')?.scrollTop > 100);
          const scroll = await publicPage.evaluate(() => ({ sceneTop: document.querySelector('[data-flow-scene] main').scrollTop, window: scrollY }));
          assert.equal(scroll.window, windowBefore, `${from} long content scrolls inside its scene`);
          report.sceneScroll.push({ scene: from, viewport, ...scroll });
          await returnToWorks(from, publicPage.locator('nav[aria-label="主要导航"] a[href="#works"]'));
        }
        if (viewport.width > 700) {
          await publicPage.mouse.move(5, 5);
          await publicPage.waitForFunction(() => [...document.querySelector('[aria-label="作品速览"]').querySelectorAll('[style*="--rail-duration"]')].every(track => track.getAnimations().some(animation => typeof animation.currentTime === 'number' && animation.currentTime > 0)));
          const moving = await trackMotion();
          assert.equal(moving.before.length, 2);
          assert.ok(moving.after.every((track, index) => Math.abs(track.y - moving.before[index].y) > 2), 'Both rails move with normal motion');
          moving.pixelsPerSecond = moving.after.map((track, index) => Math.abs(track.y - moving.before[index].y) / moving.durationMs * 1000);
          assert.ok(moving.pixelsPerSecond.every(speed => speed >= 22 && speed <= 28), `Normal rails move about 25px/s: ${JSON.stringify(moving.pixelsPerSecond)}`);
          const rails = publicPage.locator('[aria-label="作品速览"]');
          // The rail viewport is static while its photographs continuously move.
          // Real pointer movement must not wait for an animated button to settle.
          const hoverTarget = await rails.locator(':scope > div').first().evaluate(rail => {
            const railWindow = rail.querySelector(':scope > div');
            const r = railWindow.getBoundingClientRect();
            const railBounds = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
            const x = r.left + r.width / 2;
            for (const photo of railWindow.querySelectorAll('button[aria-label^="查看大图："]')) {
              const bounds = photo.getBoundingClientRect();
              const top = Math.max(r.top + 30, bounds.top + 10, 10), bottom = Math.min(r.bottom - 30, bounds.bottom - 10, innerHeight - 10);
              if (bottom - top < 40) continue;
              const y = (top + bottom) / 2, hit = document.elementFromPoint(x, y);
              if (hit?.closest('button') === photo && rail.contains(hit)) return { x, y, railBounds, photoBounds: { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right } };
            }
            return null;
          });
          assert.ok(hoverTarget, 'The static left rail viewport contains a visible photograph');
          await publicPage.mouse.move(hoverTarget.x, hoverTarget.y);
          const hoverHit = await publicPage.evaluate(({ x, y }) => {
            const rail = document.querySelector('[aria-label="作品速览"]')?.firstElementChild;
            const hit = document.elementFromPoint(x, y), photo = hit?.closest('button[aria-label^="查看大图："]');
            return { leftPhotograph: Boolean(photo && rail?.contains(photo)), tag: hit?.tagName ?? null };
          }, hoverTarget);
          assert.equal(hoverHit.leftPhotograph, true, `Actual hover reaches a left-rail photograph: ${JSON.stringify(hoverHit)}`);
          const hover = await trackMotion();
          assert.equal(hover.before[0].state, 'paused'); assert.equal(hover.before[1].state, 'running');
          assert.ok(Math.abs(hover.after[0].y - hover.before[0].y) <= 1, 'Hovered rail remains stable');
          assert.ok(Math.abs(hover.after[1].y - hover.before[1].y) > 2, 'The other rail continues');
          await publicPage.getByRole('button', { name: '暂停动效', exact: true }).click();
          const paused = await trackMotion();
          assert.ok(paused.before.every(track => track.name === 'none'), 'Pause switches the rails to a stable scrollable list');
          assert.ok(paused.after.every((track, index) => Math.abs(track.y - paused.before[index].y) <= 1));
          assert.equal(new URL(publicPage.url()).hash, '#works', 'Motion controls do not navigate');
          await publicPage.getByRole('button', { name: '播放动效', exact: true }).click();
          report.motion.push({ viewport, moving, hoverTarget, hoverHit, hover, paused });
        }
        await publicPage.getByRole('link', { name: '展开完整作品', exact: true }).click();
        await publicPage.locator('[data-flow-scene="gallery"]').waitFor(); await overflow(publicPage);
        await publicPage.mouse.move(viewport.width / 2, viewport.height / 2); await publicPage.mouse.wheel(0, 450);
        await publicPage.waitForFunction(() => scrollY > 100);
        const beforeSettled = await stableScroll(publicPage);
        const photos = publicPage.locator('main button[aria-label^="查看大图："]');
        const before = await publicPage.evaluate(() => ({ scroll: scrollY, overflow: document.body.style.overflow, padding: document.body.style.paddingRight, width: document.body.getBoundingClientRect().width }));
        const diagnostic = { type: 'public', viewport, beforeSettled, candidates: [], safeBounds: null, clickTarget: null, hitBeforeClick: null, photoRect: null, geometry: before, actualPhotoClick: null, opened: null, afterSettled: null, restored: null, focusRestored: null };
        report.lightboxReturns.push(diagnostic);
        const selection = await photos.evaluateAll(nodes => {
          const safeBounds = { left: 16, right: innerWidth - 16, top: 110, bottom: innerHeight - 60 };
          const candidates = nodes.map((photo, index) => {
            const r = photo.getBoundingClientRect();
            const bounds = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            const intersection = { left: Math.max(r.left, safeBounds.left), right: Math.min(r.right, safeBounds.right), top: Math.max(r.top, safeBounds.top), bottom: Math.min(r.bottom, safeBounds.bottom) };
            const width = intersection.right - intersection.left, height = intersection.bottom - intersection.top;
            if (width <= 40 || height <= 40) return { index, bounds, intersection: { ...intersection, width, height }, hit: null };
            const x = (intersection.left + intersection.right) / 2, y = (intersection.top + intersection.bottom) / 2;
            const hit = document.elementFromPoint(x, y);
            return { index, bounds, intersection: { ...intersection, width, height }, x, y, hit: { tag: hit?.tagName ?? null, samePhoto: hit?.closest('button[aria-label^="查看大图："]') === photo } };
          });
          return { safeBounds, candidates, target: candidates.find(candidate => candidate.hit?.samePhoto) ?? null };
        });
        diagnostic.safeBounds = selection.safeBounds; diagnostic.candidates = selection.candidates;
        const target = selection.target;
        assert.ok(target, `A gallery photograph has a clickable visible intersection larger than 40px: ${JSON.stringify(selection)}`);
        diagnostic.clickTarget = { index: target.index, x: target.x, y: target.y }; diagnostic.photoRect = target.bounds;
        const visiblePhoto = photos.nth(target.index);
        await visiblePhoto.evaluate(photo => {
          const read = () => {
            const r = photo.getBoundingClientRect();
            return { scroll: scrollY, focused: document.activeElement === photo, photoRect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } };
          };
          window.__flowUxPublicPhotoClick = {};
          photo.addEventListener('pointerdown', () => { window.__flowUxPublicPhotoClick.pointerdown = read(); }, { capture: true, once: true });
          photo.addEventListener('click', () => { window.__flowUxPublicPhotoClick.click = read(); }, { capture: true, once: true });
        });
        diagnostic.hitBeforeClick = await publicPage.evaluate(({ index, x, y }) => {
          const photo = document.querySelectorAll('main button[aria-label^="查看大图："]')[index];
          const hit = document.elementFromPoint(x, y);
          return { samePhoto: Boolean(photo && hit?.closest('button[aria-label^="查看大图："]') === photo), tag: hit?.tagName ?? null };
        }, diagnostic.clickTarget);
        assert.equal(diagnostic.hitBeforeClick.samePhoto, true, `Public lightbox click reaches the chosen photograph: ${JSON.stringify(diagnostic.hitBeforeClick)}`);
        // A tall portrait only needs a visible clickable portion. Coordinate clicks
        // preserve the user's scroll position without locator scrollIntoView.
        await publicPage.mouse.click(target.x, target.y); await publicPage.getByRole('button', { name: '关闭大图', exact: true }).waitFor();
        diagnostic.actualPhotoClick = await publicPage.evaluate(() => window.__flowUxPublicPhotoClick);
        diagnostic.opened = await publicPage.evaluate(() => ({ scroll: scrollY, overflow: document.body.style.overflow, padding: document.body.style.paddingRight, width: document.body.getBoundingClientRect().width }));
        await publicPage.getByRole('button', { name: '关闭大图', exact: true }).click();
        await publicPage.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));
        diagnostic.afterSettled = await stableScroll(publicPage);
        const after = await publicPage.evaluate(() => ({ scroll: scrollY, overflow: document.body.style.overflow, padding: document.body.style.paddingRight, width: document.body.getBoundingClientRect().width }));
        diagnostic.restored = after;
        diagnostic.focusRestored = await visiblePhoto.evaluate(photo => document.activeElement === photo);
        assert.equal(diagnostic.focusRestored, true, 'Closing the public lightbox restores focus to the clicked gallery photograph');
        const clickedTop = diagnostic.actualPhotoClick?.click?.scroll;
        assert.equal(typeof clickedTop, 'number', 'The coordinate click was received by the chosen gallery photograph');
        assert.ok(Math.abs(clickedTop - before.scroll) <= 2, `Coordinate clicking preserves gallery scroll: before=${before.scroll}, pointerdown=${diagnostic.actualPhotoClick?.pointerdown?.scroll}, click=${clickedTop}`);
        assert.ok(Math.abs(diagnostic.opened.scroll - before.scroll) <= 2, `Opening a public lightbox preserves gallery scroll: before=${before.scroll}, opened=${diagnostic.opened.scroll}`);
        assert.ok(Math.abs(after.scroll - before.scroll) <= 2, `Closing a public lightbox preserves gallery scroll: before=${before.scroll}, opened=${diagnostic.opened.scroll}, restored=${after.scroll}`); assert.equal(after.overflow, before.overflow); assert.equal(after.padding, before.padding); assert.ok(Math.abs(after.width - before.width) <= 1);
        for (const orientation of ['portrait', 'landscape']) {
          const photoIndex = await photos.evaluateAll((nodes, requested) => nodes.findIndex(photo => {
            const image = photo.querySelector('img');
            return image && (Number(image.getAttribute('height')) > Number(image.getAttribute('width')) ? 'portrait' : 'landscape') === requested;
          }), orientation);
          assert.ok(photoIndex >= 0, `Synthetic gallery includes a ${orientation} image`);
          const photograph = photos.nth(photoIndex);
          await photograph.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
          await stableScroll(publicPage);
          const bookmark = await publicPage.evaluate(() => ({ scroll: scrollY, overflow: document.body.style.overflow, padding: document.body.style.paddingRight }));
          const point = await photograph.evaluate(element => {
            const r = element.getBoundingClientRect(), x = Math.max(16, r.left) + (Math.min(innerWidth - 16, r.right) - Math.max(16, r.left)) / 2;
            const top = Math.max(110, r.top), bottom = Math.min(innerHeight - 60, r.bottom);
            const y = (top + bottom) / 2;
            return { x, y, visibleHeight: bottom - top, reachesPhoto: document.elementFromPoint(x, y)?.closest('button[aria-label^="查看大图："]') === element };
          });
          assert.ok(point.visibleHeight > 40 && point.reachesPhoto, `${orientation} photograph has a visible coordinate click target`);
          await publicPage.mouse.click(point.x, point.y);
          await lightboxSizing(publicPage, `public-${orientation}`);
          await publicPage.keyboard.press('Escape');
          await publicPage.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));
          await stableScroll(publicPage);
          const returned = await publicPage.evaluate(() => ({ scroll: scrollY, overflow: document.body.style.overflow, padding: document.body.style.paddingRight }));
          assert.equal(await photograph.evaluate(element => document.activeElement === element), true, 'Escape returns focus to the originating photograph');
          assert.ok(Math.abs(returned.scroll - bookmark.scroll) <= 2, 'Escape retains the gallery scroll bookmark');
          assert.equal(returned.overflow, bookmark.overflow); assert.equal(returned.padding, bookmark.padding);
          report.lightboxReturns.push({ type: `public-${orientation}-escape`, viewport, before: bookmark, restored: returned, focusRestored: true });
        }
        await returnToWorks('gallery', publicPage.getByRole('button', { name: '返回首页', exact: true }));
      }
    });
    assert.deepEqual(await json(draftPath('basic')), basicBefore);
    assert.equal((await publication()).current.id, published.id);
    assert.deepEqual(report.forbiddenRequests, []); assert.deepEqual(report.pageErrors, []);
  } finally {
    clearTimeout(deadline); signal?.removeEventListener('abort', abort);
    await browser?.close();
    report.protectedAfter = await protectedState(owner.siteId);
    await persist();
    assert.deepEqual(report.protectedAfter, protectedBefore, 'Other Sites retain their drafts, publications, assets and grants');
    console.log(`[flow-ux-browser] Evidence: ${join(output, 'acceptance.json')}`);
  }
  return { fixture: SLUG, output, report };
}
