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
import { assertPublishedMetadata } from './public-metadata-browser.mjs';
import { measureFlowGalleryRoutes } from './flow-gallery-route-performance.mjs';

const SPACE = 'premium-flow-gallery';
const DEFAULT_SLUG = 'flowuxfixture';
const MODULES = [
  ['library', '图库', 'gallery'], ['home', '首页', 'works'],
  ['groups', '完整作品', 'gallery'], ['pricing', '价格与活动', 'pricing'],
  ['contact', '联系', 'contact'],
];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const GROUP_PREVIEW_VIEWPORTS = [...VIEWPORTS, { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 320, height: 844 }];
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
    protectedBefore, protectedAfter: null, metadata: null, responsiveImages: [], routePerformance: [], groupPreviews: [], pickerLookup: [], mobileNavigation: [], singleRails: [],
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
      assert.equal(new URL(page.url()).hash, `#edit-${id}`);
      await page.waitForFunction(() => document.activeElement === document.querySelector('[data-flow-editor-section] h1'));
    }
    async function overflow(p) {
      const inspection = await p.evaluate(() => {
        const dimensions = { width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth };
        if (dimensions.html <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1) return { dimensions, samples: [] };
        const describe = element => {
          const r = element.getBoundingClientRect(), style = getComputedStyle(element);
          return {
            tag: element.tagName, id: element.id, className: element.getAttribute('class'),
            rect: { x: r.x, y: r.y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
            scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, inlineStyle: element.getAttribute('style'),
            computed: Object.fromEntries(['position', 'display', 'width', 'minWidth', 'maxWidth', 'boxSizing', 'paddingLeft', 'paddingRight', 'overflowX', 'overflowY', 'transform', 'scrollbarGutter'].map(key => [key, style[key]])),
          };
        };
        const sample = frame => {
          const viewportWidth = innerWidth;
          const overflowing = [...document.querySelectorAll('body *')].filter(element => {
            const r = element.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.left < -1 || r.right > viewportWidth + 1 || element.scrollWidth > element.clientWidth + 1);
          });
          return {
            frame, ms: performance.now(), viewport: { width: innerWidth, height: innerHeight, layoutWidth: document.documentElement.clientWidth },
            module: document.querySelector('[data-flow-editor-section]')?.getAttribute('data-flow-editor-section'),
            scroll: { x: scrollX, y: scrollY }, html: describe(document.documentElement), body: describe(document.body),
            dialogs: [...document.querySelectorAll('dialog')].map(element => ({ open: element.open, label: element.getAttribute('aria-label'), ...describe(element) })),
            overflowingCount: overflowing.length, overflowing: overflowing.slice(0, 80).map(element => ({ ...describe(element), parent: element.parentElement ? describe(element.parentElement) : null })),
          };
        };
        const samples = [sample('initial-measurement')];
        return new Promise(resolveInspection => requestAnimationFrame(() => {
          samples.push(sample('next-frame-1'));
          requestAnimationFrame(() => { samples.push(sample('next-frame-2')); resolveInspection({ dimensions, samples }); });
        }));
      });
      const { dimensions } = inspection;
      if (inspection.samples.length) {
        report.overflowDiagnostics ??= [];
        report.overflowDiagnostics.push({ viewport: p.viewportSize(), path: new URL(p.url()).pathname, hash: new URL(p.url()).hash, ...inspection });
      }
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
    async function lightboxSizing(p, source, expectedBrowsing = true) {
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
      const browsing = dialog.getByRole('group', { name: '当前分类照片，循环浏览', exact: true });
      const hasBrowsing = await browsing.count() === 1;
      assert.equal(hasBrowsing, expectedBrowsing, `${source} has the expected category or single-image scope`);
      assert.equal(await dialog.getByRole('button').count(), expectedBrowsing ? 4 : 2, 'Category lightbox exposes browsing controls; a single image retains close and zoom');
      assert.equal(await zoom.getAttribute('aria-pressed'), 'false');
      await close.focus();
      await p.keyboard.press('Tab');
      assert.equal(await zoom.evaluate(element => document.activeElement === element), true, 'Tab moves from close to zoom');
      await p.keyboard.press('Tab');
      if (hasBrowsing) {
        const previous = browsing.getByRole('button', { name: '上一张照片', exact: true });
        const next = browsing.getByRole('button', { name: '下一张照片', exact: true });
        assert.equal(await previous.evaluate(element => document.activeElement === element), true, 'Tab moves from zoom to previous photograph');
        await p.keyboard.press('Tab');
        assert.equal(await next.evaluate(element => document.activeElement === element), true, 'Tab moves from previous to next photograph');
        await p.keyboard.press('Tab');
        assert.equal(await close.evaluate(element => document.activeElement === element), true, 'Tab wraps from next photograph to close');
        await p.keyboard.press('Shift+Tab');
        assert.equal(await next.evaluate(element => document.activeElement === element), true, 'Shift+Tab wraps from close to next photograph');
        const before = await browsing.locator('output').textContent();
        await p.keyboard.press('ArrowRight');
        assert.notEqual(await browsing.locator('output').textContent(), before, 'Right arrow advances within the current category');
        await p.keyboard.press('ArrowLeft');
        assert.equal(await browsing.locator('output').textContent(), before, 'Left arrow returns to the original photograph');
      } else {
        assert.equal(await close.evaluate(element => document.activeElement === element), true, 'Tab wraps from zoom to close');
        await p.keyboard.press('Shift+Tab');
        assert.equal(await zoom.evaluate(element => document.activeElement === element), true, 'Shift+Tab wraps from close to zoom');
      }
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
      report.lightboxSizing.push({ source, viewport, expectedBrowsing, orientation: fitted.metadataHeight > fitted.metadataWidth ? 'portrait' : 'landscape', fitted, enlarged, restored });
    }
    async function modulePreview(id, scene, { temporary = false, title, capture = false, leftPercent } = {}) {
      const before = { draft: await draft(), publication: await publication(), writes: writeCount(), dirty: await root.getAttribute('data-flow-dirty'), hash: new URL(page.url()).hash };
      const trigger = page.locator(`[data-flow-module-preview="${id}"]`);
      assert.equal(await page.locator('[data-flow-module-preview]').count(), 1, 'The current module has one genuine module-effect entry');
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
      await page.locator('[data-flow-module-preview="library"]').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('[data-flow-module-preview]')?.disabled);
      assert.deepEqual(await page.locator('nav[aria-label="流影视廊后台模块"] [data-flow-section]').evaluateAll(nodes => nodes.map(node => node.dataset.flowSection)), MODULES.map(([id]) => id));
      const rights = await json('/api/account/site');
      assert.deepEqual(rights.templates.premium, [SPACE]);
      await json(draftPath('premium-polaroid'), 403);
      await page.goto(`${origin}/${SLUG}/admin/${SPACE}#edit-contact`);
      await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === 'contact');
      await module('home'); await module('groups');
      await page.goBack(); await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === 'home');
      await page.goForward(); await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === 'groups');
      basicBefore = await json(draftPath('basic'));
      assert.equal((await draft()).revision, 0);
      assert.equal((await publication()).current, null);
      for (const [id, , scene] of MODULES) {
        await module(id);
        if (id === 'groups') {
          // This fresh account has no category yet. S1a must explain the missing
          // target rather than opening an unrelated first-category preview.
          const before = { draft: await draft(), publication: await publication(), writes: writeCount(), dirty: await root.getAttribute('data-flow-dirty'), hash: new URL(page.url()).hash };
          assert.deepEqual(before.draft.content.groups, [], 'Fresh-account preview exercises an absent current category');
          const trigger = page.locator('[data-flow-module-preview="groups"]');
          await trigger.click();
          await page.locator('[role="status"][data-feedback="active"]').filter({ hasText: '当前分类已不存在，请重新选择分类后查看效果。' }).waitFor();
          assert.equal(await preview().count(), 0, 'An absent category never silently opens a different artwork');
          assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
          assert.equal(await root.getAttribute('data-flow-editor-section'), id);
          assert.equal(await root.getAttribute('data-flow-dirty'), before.dirty);
          assert.equal(new URL(page.url()).hash, before.hash);
          assert.equal(writeCount(), before.writes, 'Missing-category feedback never saves or publishes');
          assert.deepEqual(await draft(), before.draft);
          assert.deepEqual(await publication(), before.publication);
          continue;
        }
        await modulePreview(id, scene, { temporary: id === 'pricing' || id === 'contact' });
      }
    });

    await stage('02 real UI upload, categories, background and rails', async () => {
      await module('library');
      const files = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
        const width = index % 3 === 0 ? 1440 : 2160, height = index % 3 === 0 ? 2160 : 1440;
        return { name: `anonymous-flow-${index + 1}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width, height, channels: 3, background: { r: 35 + index * 19, g: 70 + index * 12, b: 100 + index * 9 } } }).png().toBuffer() };
      }));
      await page.getByLabel('上传本站照片', { exact: true }).setInputFiles(files);
      await page.getByText(/已上传 8 张/).waitFor();
      await page.getByText('本站图库 8 张', { exact: true }).waitFor();
      const assets = (await json(assetsPath)).assets;
      assert.equal(assets.length, 8);
      await page.getByRole('combobox', { name: '画幅', exact: true }).selectOption('portrait');
      assert.equal(await page.getByRole('button', {name: /^放大照片：/}).count(), 3);
      await page.getByRole('combobox', { name: '画幅', exact: true }).selectOption('landscape');
      assert.equal(await page.getByRole('button', {name: /^放大照片：/}).count(), 5);
      await page.getByRole('combobox', { name: '画幅', exact: true }).selectOption('all');
      await page.getByRole('combobox', { name: '加入本站时间', exact: true }).selectOption('oldest');
      assert.equal(await page.getByRole('button', {name: /^放大照片：/}).count(), 8);
      await module('groups');
      for (const [index, name] of ['Anonymous portrait studies', 'Anonymous landscape studies'].entries()) {
        await page.getByRole('button', { name: '新建分类', exact: true }).click();
        await page.getByRole('textbox', { name: '分类名称', exact: true }).fill(name);
        await page.getByRole('button', { name: '新建并从图库选片', exact: true }).click();
        const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
        await picker.waitFor();
        for (const asset of assets.slice(index * 4, index * 4 + 4)) await picker.locator(`[data-flow-asset-id="${asset.id}"]`).getByRole('checkbox', { name: /^选择照片：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).check();
        await picker.getByRole('button', { name: '加入当前分类（4 张）', exact: true }).click();
        await picker.waitFor({ state: 'detached' });
      }
      await page.getByRole('button', { name: '分类与说明', exact: true }).click();
      await page.getByRole('textbox', { name: '第 1 张照片说明', exact: true }).fill('Caption edited in place');
      await page.getByRole('button', { name: '移出当前照片', exact: true }).click();
      await page.getByRole('button', { name: '撤销最近移除', exact: true }).click();
      assert.equal(await page.getByRole('textbox', { name: '第 1 张照片说明', exact: true }).inputValue(), 'Caption edited in place');
      await module('home');
      await page.getByRole('textbox', { name: '导航品牌名', exact: true }).fill('Anonymous Flow Studio');
      await page.getByRole('textbox', { name: '首页标题', exact: true }).fill('Flow fixture published title');
      await page.getByRole('textbox', { name: '首页介绍', exact: true }).fill('Synthetic photographs for isolated browser acceptance.');
      await page.getByRole('button', { name: '从图库选择背景', exact: true }).click();
      await page.getByRole('dialog', { name: '从图库选择一张背景', exact: true }).locator(`[data-flow-asset-id="${assets[1].id}"]`).getByRole('button', { name: /^选择背景：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).click();
      await page.getByRole('combobox', { name: '左侧轨道', exact: true }).selectOption({ label: 'Anonymous portrait studies' });
      await page.getByRole('combobox', { name: '右侧轨道', exact: true }).selectOption({ label: 'Anonymous landscape studies' });
      const originalViewport = page.viewportSize();
      const railChoices = [page.getByRole('combobox', { name: '左侧轨道', exact: true }), page.getByRole('combobox', { name: '右侧轨道', exact: true })];
      const originalIds = await Promise.all(railChoices.map(choice => choice.inputValue()));
      const beforeSingle = { draft: await draft(), publication: await publication(), writes: writeCount() };
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 844 }, { width: 700, height: 900 }, { width: 701, height: 900 }]) {
        await page.setViewportSize(viewport);
        for (const side of [0, 1, null]) {
          await railChoices[0].selectOption(side === 0 ? originalIds[0] : '');
          await railChoices[1].selectOption(side === 1 ? originalIds[1] : '');
          await page.locator('[data-flow-module-preview="home"]').click();
          const area = preview().locator('[aria-label="作品速览"]');
          await area.waitFor();
          assert.equal(await area.getAttribute('data-flow-rail-layout'), side === null ? 'empty' : 'single');
          const windows = area.locator('[data-flow-rail-window]');
          assert.equal(await windows.count(), side === null ? 0 : 1);
          if (side === null) {
            await area.getByText('还没有作品', { exact: true }).waitFor();
          } else {
            await page.waitForFunction(() => {
              const img = document.querySelector('dialog [data-flow-rail-window] img');
              return img?.complete && img.naturalWidth > 0 && /^\d+px$/.test(img.sizes) && Math.abs(parseFloat(img.sizes) - img.clientWidth) <= 1;
            });
            const measured = await area.evaluate(element => {
              const area = element.getBoundingClientRect(), window = element.querySelector('[data-flow-rail-window]').getBoundingClientRect();
              const track = element.querySelector('[style*="--rail-duration"]');
              return { width: window.width, centerError: Math.abs((window.left + window.right - area.left - area.right) / 2), areaWidth: area.width, reverse: track.className.includes('reverse'), count: element.querySelectorAll('[data-flow-rail-window] button[tabindex="0"]').length };
            });
            assert.ok(Math.abs(measured.width - Math.min(measured.areaWidth, viewport.width <= 700 ? 300 : 500)) <= 1, 'Single rail uses the actual works area and bounded width');
            assert.ok(measured.centerError <= 1, 'Single rail is centered within the works area');
            assert.equal(measured.reverse, side === 1, 'Right-only selection preserves the right rail direction');
            assert.equal(measured.count, 4, 'Single selection retains its complete accessible photo scope');
            report.singleRails.push({ viewport, side, ...measured });
          }
          await overflow(page);
          await preview().locator('[data-flow-close-preview]').click();
          await preview().waitFor({ state: 'detached' });
        }
      }
      await railChoices[0].selectOption(originalIds[0]); await railChoices[1].selectOption(originalIds[1]);
      await page.setViewportSize(originalViewport);
      assert.equal(writeCount(), beforeSingle.writes, 'Single-rail previews never save or publish');
      assert.deepEqual(await draft(), beforeSingle.draft); assert.deepEqual(await publication(), beforeSingle.publication);
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
      await page.getByRole('button', { name: '移除此项目', exact: true }).click();
      await page.getByRole('button', { name: '撤销最近移除', exact: true }).click();
      assert.equal(await page.getByRole('textbox', { name: '价格说明', exact: true }).inputValue(), '100 fixture units');
      // A restored second item must be selected, rather than passing via the
      // first-item fallback, and later module navigation must own focus again.
      await page.getByRole('button', { name: '新增价格项目', exact: true }).click();
      await page.getByRole('textbox', { name: '名称', exact: true }).fill('Restored secondary project');
      await page.getByRole('button', { name: '移除此项目', exact: true }).click();
      await page.getByRole('button', { name: '撤销最近移除', exact: true }).click();
      await page.waitForFunction(name => {
        const entry = document.activeElement;
        return entry?.id.startsWith('flow-price-') && entry.querySelector('input:not([type="checkbox"])')?.value === name;
      }, 'Restored secondary project');
      assert.equal(await page.getByRole('textbox', { name: '名称', exact: true }).inputValue(), 'Restored secondary project');
      await module('home'); await module('pricing');
      await page.getByRole('button', { name: /Restored secondary project/ }).click();
      await page.getByRole('button', { name: '移除此项目', exact: true }).click();
      await module('contact');
      await page.getByRole('textbox', { name: '页面标题', exact: true }).fill('Synthetic contact');
      await page.getByRole('textbox', { name: '介绍', exact: true }).fill(Array.from({ length: 70 }, (_, index) => `Contact note ${index + 1}`).join('\n'));
      await page.getByRole('button', { name: '新增联系方式', exact: true }).click();
      await page.getByRole('textbox', { name: '联系名称', exact: true }).fill('Fixture email');
      await page.getByRole('textbox', { name: '账号或说明', exact: true }).fill('flow@example.invalid');
      await page.getByRole('textbox', { name: '链接（可选，http / https / mailto）', exact: true }).fill('mailto:flow@example.invalid');
      await page.getByRole('button', { name: '移除此联系方式', exact: true }).click();
      await page.getByRole('button', { name: '撤销最近移除', exact: true }).click();
      assert.equal(await page.getByRole('textbox', { name: '联系名称', exact: true }).inputValue(), 'Fixture email');
      const contactCard = page.locator('section[aria-label="可选联系卡"]');
      await contactCard.locator('summary').click();
      await contactCard.getByRole('button', { name: '选择或上传联系卡', exact: true }).click();
      await contactCard.locator('article').filter({ hasText: assets[0].id }).getByRole('button', { name: '选用此卡片', exact: true }).click();
      await contactCard.getByRole('link', { name: '查看联系卡大图', exact: true }).waitFor();
      const saved = await save();
      assert.equal(saved.revision, 1); assert.equal(saved.content.pricing.enabled, false); assert.equal(saved.content.contact.enabled, false);
      assert.equal(saved.content.contact.items[0].qrAssetId, assets[0].id, 'Optional contact QR references an existing anonymous Site asset');
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
      report.metadata = await assertPublishedMetadata(publicPage, { origin, snapshot: publishedSnapshot });
      await railWidth(publicPage.locator('[aria-label="作品速览"]'), 50, 'public');
      assert.equal(await publicPage.getByText('Unsaved immediate preview title', { exact: true }).count(), 0);
      assert.equal((await anonymous.request.get(`${origin}${draftPath(SPACE)}`)).status(), 401);
    });

    await stage('04 editor and module previews at desktop and mobile widths', async () => {
      for (const viewport of [VIEWPORTS[1], { width: 320, height: 844 }]) {
        await page.setViewportSize(viewport); await module('library');
        await page.evaluate(() => scrollTo(0, 0));
        const nav = page.locator('nav[aria-label="流影视廊后台模块"]');
        assert.equal(await nav.count(), 1, 'One navigation owns keyboard focus at the mobile breakpoint');
        const measured = await nav.locator('[data-flow-section]').evaluateAll(nodes => nodes.map(node => {
          const r = node.getBoundingClientRect(), nav = node.closest('nav');
          return { id: node.dataset.flowSection, name: node.textContent.trim(), height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom, navWidth: nav.clientWidth, navScrollWidth: nav.scrollWidth, width: innerWidth, focusable: !node.disabled && node.tabIndex >= 0 };
        }));
        assert.deepEqual(measured.map(row => row.id), MODULES.map(([id]) => id));
        assert.equal(new Set(measured.map(row => Math.round(row.top))).size, 2, 'All five named mobile modules occupy two visible rows');
        for (const [index, row] of measured.entries()) {
          assert.ok(row.name.includes(MODULES[index][1]), 'Full module labels remain discoverable');
          assert.ok(row.height >= 44 && row.focusable, 'Each module keeps a keyboard-accessible 44px target');
          assert.ok(row.left >= -1 && row.right <= row.width + 1 && row.top >= 0 && row.bottom < viewport.height, 'All five navigation entries are visible without horizontal discovery');
          assert.ok(row.navScrollWidth <= row.navWidth + 1, 'Mobile module navigation does not require horizontal scrolling');
        }
        await nav.locator('[data-flow-section="contact"]').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === 'contact' && document.activeElement === document.querySelector('[data-flow-editor-section] h1'));
        assert.equal(new URL(page.url()).hash, '#edit-contact');
        await page.goBack();
        await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === 'library' && document.activeElement === document.querySelector('[data-flow-editor-section] h1'));
        await page.goForward();
        await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === 'contact' && document.activeElement === document.querySelector('[data-flow-editor-section] h1'));
        assert.equal(await root.getAttribute('data-flow-dirty'), 'true', 'Breakpoint and history navigation retain current unsaved edits');
        report.mobileNavigation.push({ viewport, measured, keyboardAndHistory: 'PASS' });
      }
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

    await stage('04a current second-category preview and editor return at five widths', async () => {
      const beforeData = { draft: await draft(), publication: await publication(), writes: writeCount() };
      const [firstGroup, secondGroup] = beforeData.draft.content.groups;
      assert.ok(firstGroup && secondGroup, 'Targeting requires a real second group, beyond first-group fallback');
      const selectedGroup = () => page.locator('nav[aria-label="作品分类"] button[aria-current="page"]');
      const selectedStep = () => page.locator('nav[aria-label="分类编辑步骤"] button[aria-current="step"]');
      async function editorBookmark() {
        return {
          group: await selectedGroup().innerText(), step: await selectedStep().innerText(),
          dirty: await root.getAttribute('data-flow-dirty'), hash: new URL(page.url()).hash,
          ...await page.evaluate(() => ({ scroll: scrollY, overflow: document.body.style.overflow, padding: document.body.style.paddingRight })),
        };
      }
      async function assertEditorReturn(trigger, before) {
        await preview().waitFor({ state: 'detached' });
        await page.waitForFunction(() => document.activeElement?.closest('[data-flow-editor-section]') !== null);
        await stableScroll(page);
        assert.equal(await trigger.evaluate(element => document.activeElement === element), true, 'Preview closes with focus on its actual trigger');
        const after = await editorBookmark();
        assert.equal(after.group, before.group, 'Closing retains the selected second category');
        assert.equal(after.step, before.step, 'Closing retains the editing step');
        assert.equal(after.dirty, before.dirty); assert.equal(after.hash, before.hash);
        assert.equal(after.overflow, before.overflow); assert.equal(after.padding, before.padding);
        assert.ok(Math.abs(after.scroll - before.scroll) <= 2, `Closing retains the editor scroll bookmark: ${JSON.stringify({ before, after })}`);
        return after;
      }
      async function targetGeometry() {
        const section = preview().locator(`[data-flow-group-id="${secondGroup.id}"]`);
        await section.getByRole('heading', { name: secondGroup.name, exact: true }).waitFor();
        await page.waitForFunction(id => {
          const image = [...document.querySelectorAll('dialog [data-flow-group-id]')].find(group => group.getAttribute('data-flow-group-id') === id)?.querySelector('img');
          return image?.complete && image.naturalWidth > 0;
        }, secondGroup.id);
        await stableScroll(page, 'dialog [data-flow-scrollport]');
        const measured = await section.evaluate(element => {
          const port = element.closest('[data-flow-scrollport]'), heading = element.querySelector('h2');
          const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          const viewport = rect(port), nav = rect(port.querySelector('nav')), title = rect(heading);
          const safeTop = Math.max(viewport.top, nav.bottom), safeBottom = viewport.bottom;
          const photos = [...element.querySelectorAll('button[aria-label^="查看大图："]')].map(photo => {
            const r = rect(photo), image = photo.querySelector('img');
            return { ...r, visibleHeight: Math.min(r.bottom, safeBottom) - Math.max(r.top, safeTop), ready: Boolean(image?.complete && image.naturalWidth > 0) };
          });
          return { viewport, nav, title, photos, safeTop, safeBottom, focused: document.activeElement === heading, scroll: port.scrollTop };
        });
        assert.equal(await section.getAttribute('data-flow-preview-current'), 'true', 'Stable second-group ID identifies the current preview target');
        assert.equal(measured.focused, true, 'Opening the current category focuses its heading');
        assert.ok(measured.title.top >= measured.safeTop - 1 && measured.title.bottom <= measured.safeBottom + 1, `The target heading is readable below navigation: ${JSON.stringify(measured)}`);
        assert.ok(measured.photos.some(photo => photo.ready && photo.visibleHeight > 40), `A decoded target photograph is visible on opening: ${JSON.stringify(measured)}`);
        assert.ok(measured.scroll > 100, 'Second-category preview advances beyond the beginning of complete works');
        const firstHeading = await preview().locator(`[data-flow-group-id="${firstGroup.id}"] h2`).boundingBox();
        assert.ok(firstHeading && firstHeading.y + firstHeading.height <= measured.safeTop, 'Opening the second category does not land on the first category');
        assert.deepEqual(await preview().locator('[data-flow-group-id]').evaluateAll(nodes => nodes.map(node => node.dataset.flowGroupId)), [firstGroup.id, secondGroup.id], 'Targeted preview retains the full original group order');
        return measured;
      }
      for (const viewport of GROUP_PREVIEW_VIEWPORTS) {
        await page.setViewportSize(viewport); await module('groups');
        await page.locator('nav[aria-label="作品分类"]').getByRole('button', { name: new RegExp(secondGroup.name) }).click();
        for (const step of ['照片顺序', '分类与说明', '查看效果']) {
          await page.getByRole('button', { name: step, exact: true }).click();
          const trigger = page.getByRole('button', { name: '当前分类效果', exact: true });
          await trigger.scrollIntoViewIfNeeded(); await trigger.focus(); await stableScroll(page);
          const bookmark = await editorBookmark();
          await trigger.click(); await preview().waitFor();
          const geometry = await targetGeometry();
          await overflow(page);
          // Alternate the two supported close paths across actual edit steps.
          if (step === '分类与说明') await page.keyboard.press('Escape');
          else await preview().locator('[data-flow-close-preview]').click();
          const returned = await assertEditorReturn(trigger, bookmark);
          report.groupPreviews.push({ viewport, step, groupId: secondGroup.id, geometry, bookmark, returned });
        }
        // Two same-turn activations exercise the pending-open guard, before React
        // commits a modal. Reopening must reset the previous from-top position.
        const trigger = page.getByRole('button', { name: '当前分类效果', exact: true });
        await trigger.scrollIntoViewIfNeeded(); await trigger.focus(); await stableScroll(page);
        const bookmark = await editorBookmark();
        await trigger.evaluate(button => { button.click(); button.click(); });
        await preview().waitFor();
        assert.equal(await preview().count(), 1, 'Rapid repeated activation opens one preview');
        await targetGeometry();
        await preview().getByRole('button', { name: '从头看完整作品', exact: true }).click();
        await stableScroll(page, 'dialog [data-flow-scrollport]');
        const top = await preview().locator('[data-flow-scrollport]').evaluate(port => port.scrollTop);
        assert.ok(top <= 2, 'From-top control returns to the beginning of complete works');
        assert.equal(await preview().locator('[data-flow-preview-current="true"]').count(), 0, 'From-top clears the current-category marker');
        await preview().locator('[data-flow-close-preview]').click();
        await assertEditorReturn(trigger, bookmark);
        await trigger.click(); await preview().waitFor(); await targetGeometry();
        await page.keyboard.press('Escape'); await assertEditorReturn(trigger, bookmark);
      }
      assert.equal(writeCount(), beforeData.writes, 'Targeted, repeated and from-top previews never save or publish');
      assert.deepEqual(await draft(), beforeData.draft, 'All targeted preview paths retain the persisted draft');
      assert.deepEqual(await publication(), beforeData.publication, 'All targeted preview paths retain Published');
      await page.setViewportSize(VIEWPORTS[1]);
    });

    await stage('04b unavailable current categories explain the block without rewriting data', async () => {
      const before = { draft: await draft(), publication: await publication(), writes: writeCount() };
      for (const state of ['hidden', 'empty', 'unavailable-assets']) {
        const memory = structuredClone(before.draft), group = memory.content.groups[1];
        if (state === 'hidden') group.visible = false;
        else { group.assetIds = state === 'empty' ? [] : [randomUUID()]; group.captions = {}; }
        const expected = state === 'hidden'
          ? '当前分类已隐藏，完整作品中不会展示。请先在分类设置中决定是否展示。'
          : '当前分类没有可展示的照片，请先从本站图库选片或核对素材后查看效果。';
        const isolatedPage = await context.newPage(), writes = [];
        try {
          await isolatedPage.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (!['GET', 'HEAD'].includes(request.method())) {
              writes.push({ method: request.method(), path: url.pathname });
              return route.abort();
            }
            if (url.origin === origin && url.pathname === draftPath(SPACE) && request.method() === 'GET') {
              return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(memory) });
            }
            await route.fallback();
          });
          await isolatedPage.setViewportSize(VIEWPORTS[1]);
          await isolatedPage.goto(`${origin}/${SLUG}/admin/${SPACE}#edit-groups`);
          await isolatedPage.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.getAttribute('data-flow-editor-section') === 'groups' && !document.querySelector('fieldset')?.disabled);
          await isolatedPage.locator('nav[aria-label="作品分类"]').getByRole('button', { name: new RegExp(group.name) }).click();
          await isolatedPage.getByRole('button', { name: '分类与说明', exact: true }).click();
          const visible = isolatedPage.getByRole('checkbox', { name: '在完整作品页展示此分类', exact: true });
          assert.equal(await visible.isChecked(), group.visible);
          const membersBefore = await isolatedPage.getByRole('combobox', { name: '选择要编辑的照片', exact: true }).locator('option').evaluateAll(options => options.map(option => option.value));
          await isolatedPage.getByRole('button', { name: '查看效果', exact: true }).click();
          const trigger = isolatedPage.getByRole('button', { name: '当前分类效果', exact: true });
          await trigger.click();
          await isolatedPage.locator('[role="status"][data-feedback="active"]').filter({ hasText: expected }).waitFor();
          assert.equal(await isolatedPage.getByRole('dialog', { name: '当前编辑即时预览', exact: true }).count(), 0, `${state} does not silently preview another category`);
          assert.ok((await isolatedPage.locator('nav[aria-label="作品分类"] button[aria-current="page"]').innerText()).includes(group.name), 'Blocked preview retains the selected second category');
          assert.equal(await trigger.getAttribute('data-flow-group-preview'), group.id, 'Blocked preview retains the same stable target ID');
          assert.equal(await isolatedPage.locator('[data-flow-editor-section]').getAttribute('data-flow-dirty'), 'false', `${state} preview feedback does not edit the fixture document`);
          await isolatedPage.getByRole('button', { name: '分类与说明', exact: true }).click();
          assert.equal(await visible.isChecked(), group.visible, 'Preview feedback never enables a hidden category');
          assert.deepEqual(await isolatedPage.getByRole('combobox', { name: '选择要编辑的照片', exact: true }).locator('option').evaluateAll(options => options.map(option => option.value)), membersBefore, 'Preview feedback preserves the exact member references');
          assert.deepEqual(writes, [], 'Unavailable-category preview sends no mutating requests');
          report.groupPreviews.push({ state, viewport: VIEWPORTS[1], groupId: group.id, feedback: expected, memberCount: group.assetIds.length, visible: group.visible });
        } finally { await isolatedPage.close(); }
      }
      assert.equal(writeCount(), before.writes);
      assert.deepEqual(await draft(), before.draft, 'Browser-only unavailable fixtures preserve the stored draft');
      assert.deepEqual(await publication(), before.publication, 'Browser-only unavailable fixtures preserve Published');
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
        const primaryImages = '[data-flow-rail-window] > div > div:not([aria-hidden="true"]) img';
        const readRailSlots = () => publicPage.locator('[data-flow-rail-window] img').evaluateAll(images => images.map(image => ({
          sizes: image.sizes, clientWidth: image.clientWidth, renderedWidth: image.getBoundingClientRect().width,
          parentWidth: image.parentElement.getBoundingClientRect().width, complete: image.complete, naturalWidth: image.naturalWidth,
          path: new URL(image.currentSrc).pathname, primary: !image.closest('[aria-hidden="true"]'),
        })));
        const readiness = { viewport, initial: await readRailSlots(), ready: null, durationMs: null };
        report.railSlotReadiness ??= [];
        report.railSlotReadiness.push(readiness);
        const readinessStarted = Date.now();
        // Decoding SSR images alone does not establish that hydration or the
        // ResizeObserver has supplied numeric measured slots. Use the same
        // actual-slot readiness as DPR 2, with the original 15s timeout and 1px
        // tolerance; later assertions still independently inspect every image.
        try {
          await publicPage.waitForFunction(selector => [...document.querySelectorAll(selector)].length > 0 && [...document.querySelectorAll(selector)].every(image => image.complete && image.naturalWidth > 0 && /^\d+px$/.test(image.sizes) && Math.abs(Number.parseFloat(image.sizes) - image.clientWidth) <= 1), primaryImages);
          readiness.ready = await readRailSlots();
        } catch (error) { readiness.failed = await readRailSlots(); throw error; }
        finally { readiness.durationMs = Date.now() - readinessStarted; }
        const responsive = await publicPage.locator('[data-flow-rail-window] img').evaluateAll(images => images.map(image => ({
          path: new URL(image.currentSrc).pathname, srcSet: image.srcset, sizes: image.sizes,
          renderedWidth: image.clientWidth, intrinsicWidth: Number(image.getAttribute('width')), dpr: devicePixelRatio,
        })));
        report.responsiveImages.push({ viewport, images: responsive });
        const backgroundId = (await readPublished(runtime.pool, SLUG)).content.background.assetId;
        for (const image of responsive) {
          assert.ok(image.srcSet.includes('thumbnail') && image.srcSet.includes('card') && image.srcSet.includes('full'), 'Rail retains display variants for screen density');
          assert.ok(Math.abs(Number.parseFloat(image.sizes) - image.renderedWidth) <= 1, 'Rail sizes follow the actual column width');
          if (viewport.width > 700 && !image.path.includes(`/${backgroundId}/`)) assert.ok(!image.path.endsWith('/full'), 'At DPR 1 these synthetic rail slots use a smaller display variant');
        }
        await railWidth(publicPage.locator('[aria-label="作品速览"]'), 50, 'public');
        await overflow(publicPage);
        const expand = publicPage.locator('[data-flow-expand]');
        const heading = publicPage.locator('[data-flow-scene-heading]');
        await expand.focus();
        await publicPage.keyboard.press('Enter');
        await publicPage.locator('[data-flow-scene="gallery"]').waitFor();
        assert.equal(await heading.evaluate(element => document.activeElement === element), true, 'Keyboard expansion focuses the complete gallery heading');
        await publicPage.goBack();
        await publicPage.locator('[data-flow-scene="works"]').waitFor();
        assert.equal(await expand.evaluate(element => document.activeElement === element), true, 'History back restores the expand control after the gallery main unmounts');
        await publicPage.goForward();
        await publicPage.locator('[data-flow-scene="gallery"]').waitFor();
        assert.equal(await heading.evaluate(element => document.activeElement === element), true, 'History forward focuses the destination heading');
        await publicPage.getByRole('button', { name: '返回首页', exact: true }).click();
        await publicPage.locator('[data-flow-scene="works"]').waitFor();
        assert.equal(await expand.evaluate(element => document.activeElement === element), true, 'Explicit gallery return restores the expand control');
        for (const from of ['pricing', 'contact']) {
          const navigation = publicPage.locator(`nav[aria-label="主要导航"] a[href="#${from}"]`);
          await navigation.focus();
          await publicPage.keyboard.press('Enter');
          await publicPage.locator(`[data-flow-scene="${from}"]`).waitFor(); await overflow(publicPage);
          assert.equal(await navigation.evaluate(element => document.activeElement === element), true, 'Scene changes preserve focus on persistent navigation');
          const windowBefore = await publicPage.evaluate(() => scrollY);
          await publicPage.mouse.move(viewport.width / 2, viewport.height / 2); await publicPage.mouse.wheel(0, 420);
          await publicPage.waitForFunction(() => document.querySelector('[data-flow-scene] main')?.scrollTop > 100);
          const scroll = await publicPage.evaluate(() => ({ sceneTop: document.querySelector('[data-flow-scene] main').scrollTop, window: scrollY }));
          assert.equal(scroll.window, windowBefore, `${from} long content scrolls inside its scene`);
          report.sceneScroll.push({ scene: from, viewport, ...scroll });
          if (from === 'contact') {
            const qr = publicPage.getByRole('button', { name: '查看Fixture email二维码', exact: true });
            await qr.click();
            await lightboxSizing(publicPage, 'public-contact-qr', false);
            await publicPage.keyboard.press('Escape');
            await publicPage.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));
            await publicPage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '查看Fixture email二维码');
            assert.equal(await qr.evaluate(element => document.activeElement === element), true, 'Closing the single-image QR viewer restores its contact control');
          }
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
          const wheelBrowsing = [];
          for (const index of [0, 1]) {
            const viewport = rails.locator('[data-flow-rail-window]').nth(index);
            const bounds = await viewport.boundingBox();
            await publicPage.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await publicPage.waitForFunction(index => getComputedStyle(document.querySelectorAll('[data-flow-rail-window]')[index].firstElementChild).animationPlayState === 'paused', index);
            assert.equal(await viewport.locator('button').first().evaluate(e => getComputedStyle(e).cursor), 'zoom-in');
            for (const delta of [360, -360]) {
              const sample = () => viewport.evaluate(e => {
                const track = e.firstElementChild;
                return { y: new DOMMatrixReadOnly(getComputedStyle(track).transform).m42, time: track.getAnimations()[0].currentTime, height: track.firstElementChild.getBoundingClientRect().height };
              });
              const before = await sample();
              await publicPage.mouse.wheel(0, delta);
              await publicPage.waitForFunction(({ index, time }) => document.querySelectorAll('[data-flow-rail-window]')[index].firstElementChild.getAnimations()[0].currentTime !== time, { index, time: before.time });
              const after = await sample();
              const loops = (after.y - before.y + delta) / before.height;
              assert.ok(Math.abs(loops - Math.round(loops)) < 0.005, `Rail ${index} moves by ${delta}px modulo the photo loop`);
              assert.equal(new URL(publicPage.url()).hash, '#works', 'Rail wheel must not navigate to prices');
              wheelBrowsing.push({ index, delta, before, after });
            }
          }
          await publicPage.mouse.move(5, 5);
          const resumed = await trackMotion();
          assert.ok(resumed.before.every(t => t.state === 'running'));
          assert.ok(resumed.after.every((t, i) => Math.abs(t.y - resumed.before[i].y) > 2), 'Leaving a rail resumes both tracks');
          assert.ok(resumed.after.every((t, i) => Math.abs(t.y - resumed.before[i].y) < 30), 'Resume does not reset the wheel position');
          await publicPage.getByRole('button', { name: '暂停动效', exact: true }).click();
          const paused = await trackMotion();
          assert.ok(paused.before.every(track => track.name === 'none'), 'Pause switches the rails to a stable scrollable list');
          assert.ok(paused.after.every((track, index) => Math.abs(track.y - paused.before[index].y) <= 1));
          assert.equal(new URL(publicPage.url()).hash, '#works', 'Motion controls do not navigate');
          const staticViewport = rails.locator('[data-flow-rail-window]').first();
          const staticBounds = await staticViewport.boundingBox();
          await publicPage.mouse.move(staticBounds.x + staticBounds.width / 2, staticBounds.y + staticBounds.height / 2);
          await publicPage.mouse.wheel(0, 360);
          await publicPage.waitForFunction(() => document.querySelector('[data-flow-rail-window]').scrollTop > 0);
          await staticViewport.evaluate(e => { e.scrollTop = e.scrollHeight; });
          await publicPage.mouse.wheel(0, 360);
          assert.equal(new URL(publicPage.url()).hash, '#works', 'Static rail at its end must not navigate');
          await publicPage.getByRole('button', { name: '播放动效', exact: true }).click();
          await publicPage.mouse.move(20, 300);
          await publicPage.mouse.wheel(0, 360);
          await publicPage.locator('[data-flow-scene="pricing"]').waitFor();
          await returnToWorks('outside-rail-wheel', publicPage.locator('nav[aria-label="主要导航"] a[href="#works"]'));
          report.motion.push({ viewport, moving, hoverTarget, hoverHit, hover, wheelBrowsing, resumed, paused });
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
        const viewerImage = publicPage.locator('[role="dialog"][aria-modal="true"] img');
        assert.ok((await viewerImage.getAttribute('src')).endsWith('/full'), 'Opening the viewer requests the full display variant');
        assert.equal(await viewerImage.getAttribute('srcset'), null, 'The viewer does not inherit a rail slot size');
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
    await stage('06a distinct photo names, separate hit targets and first-group rhythm', async () => {
      report.s2 = [];
      const snapshot = await readPublished(runtime.pool, SLUG);
      for (const viewport of [...GROUP_PREVIEW_VIEWPORTS, { width: 1280, height: 600 }]) {
        await publicPage.setViewportSize(viewport);
        await publicPage.goto(`${origin}/${SLUG}#works`);
        await publicPage.locator('[data-flow-scene="works"]').waitFor();
        const controls = await publicPage.locator('[data-flow-expand], button[aria-pressed], [aria-label="页面位置"] button').evaluateAll(nodes => {
          const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          const photos = [...document.querySelectorAll('[data-flow-rail-window]')].map(rect);
          return nodes.map(node => { const bounds = rect(node); return { name: node.getAttribute('aria-label') ?? node.textContent, ...bounds, centerHit: node.contains(document.elementFromPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2)), overlapsPhoto: photos.some(photo => bounds.left < photo.right && bounds.right > photo.left && bounds.top < photo.bottom && bounds.bottom > photo.top) }; });
        });
        assert.equal(controls.length, 5);
        for (const control of controls) {
          assert.ok(control.width >= 44 && control.height >= 44, `${control.name} has a full 44px hit target`);
          assert.ok(control.centerHit && !control.overlapsPhoto, `${control.name} is hittable without covering the photo window`);
        }
        await publicPage.locator('[data-flow-expand]').click();
        await publicPage.locator('[data-flow-scene="gallery"]').waitFor();
        const first = publicPage.locator('[data-flow-group-id]').first();
        const photo = await first.locator('button').first().boundingBox();
        assert.ok(photo.y < (viewport.width <= 700 ? viewport.height * .55 : viewport.height <= 760 ? 340 : 470), 'First-group photograph appears within the expected viewport rhythm');
        const names = await first.locator('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
        for (const group of snapshot.content.groups.filter(group => group.visible)) {
          const expected = group.assetIds.map((id, index) => `查看大图：${group.captions[id]?.trim() ? group.captions[id] : `${group.name} · 第 ${index + 1} 张照片`}`);
          assert.deepEqual(await publicPage.locator(`[data-flow-group-id="${group.id}"] button`).evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), expected, 'Names preserve captions and identify the exact Published category order');
        }
        report.s2.push({ viewport, controls, firstPhoto: photo, names });
        await overflow(publicPage);
      }
    });

    await stage('07 advanced public and admin cold/warm route resource measurements', async () => {
      for (const viewport of VIEWPORTS) report.routePerformance.push(...await measureFlowGalleryRoutes({ browser, origin, fixtureSlug: SLUG, ownerStorageState: await context.storageState(), viewport, signal }));
    });
    await stage('08 independent DPR 2 responsive rail selection', async () => {
      const highDensity = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 2, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const requests = [];
      highDensity.on('request', request => requests.push({ method: request.method(), origin: new URL(request.url()).origin }));
      try {
        const p = await highDensity.newPage();
        // Reduced-motion mode deliberately hides the duplicate animation copy.
        // Measure the accessible primary photos, which own the actual slots.
        const primaryImages = '[data-flow-rail-window] > div > div:not([aria-hidden="true"]) img';
        await p.goto(`${origin}/${SLUG}#works`);
        await p.waitForFunction(selector => [...document.querySelectorAll(selector)].length > 0 && [...document.querySelectorAll(selector)].every(image => image.complete && image.naturalWidth > 0), primaryImages);
        // A fresh context can finish decoding SSR images before React hydrates.
        // Wait for the measured slot sizes rather than reading the SSR formula.
        await p.waitForFunction(selector => [...document.querySelectorAll(selector)].every(image => image.complete && image.naturalWidth > 0 && /^\d+px$/.test(image.sizes) && Math.abs(Number.parseFloat(image.sizes) - image.clientWidth) <= 1), primaryImages);
        const images = await p.locator(primaryImages).evaluateAll(images => images.map(image => ({ path: new URL(image.currentSrc).pathname, sizes: image.sizes, renderedWidth: image.clientWidth, dpr: devicePixelRatio })));
        report.responsiveImages.push({ viewport: VIEWPORTS[0], sample: 'fresh anonymous DPR 2 context', images });
        assert.equal(images.length, 8, 'The two accessible primary rails retain all eight synthetic photographs');
        for (const image of images) {
          assert.equal(image.dpr, 2);
          assert.ok(Math.abs(Number.parseFloat(image.sizes) - image.renderedWidth) <= 1);
          assert.ok(/\/(?:card|full)$/.test(image.path), 'High-density desktop rail needs a larger source than the synthetic thumbnail');
        }
        assert.ok(requests.every(request => request.origin === origin && ['GET', 'HEAD'].includes(request.method)), 'High-density sample is anonymous and read-only');
      } finally { await highDensity.close(); }
    });

    await stage('09 Flow library lookup, cross-page selections and explicit save on the isolated Site', async () => {
      // This runs after the public eight-photo measurements. Additional uploads
      // and the save belong only to this newly provisioned integration Site;
      // they are not the read-only layout baseline or a browser response mock.
      const b1 = await context.newPage();
      let allowPickerDiscard = false;
      b1.removeAllListeners('dialog');
      b1.on('dialog', dialog => {
        if (dialog.type() === 'beforeunload' || allowPickerDiscard && dialog.type() === 'confirm' && dialog.message().startsWith('放弃本次选片？')) void dialog.accept();
        else { report.forbiddenRequests.push(`unexpected-b1-dialog:${dialog.type()}`); void dialog.dismiss(); }
      });
      const b1root = b1.locator('[data-flow-editor-section]');
      const picker = b1.getByRole('dialog', { name: '从图库选片', exact: true });
      const ids = () => picker.getByRole('checkbox', { name: /^选择照片：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).evaluateAll(nodes => nodes.map(node => node.closest('[data-flow-asset-id]').dataset.flowAssetId));
      const selectedIds = async () => {
        await picker.getByRole('button', { name: '查看已选', exact: true }).click();
        const result = await ids();
        await picker.getByRole('button', { name: '返回全部结果', exact: true }).click();
        return result;
      };
      async function b1module(id) {
        await b1.locator(`nav[aria-label="流影视廊后台模块"] [data-flow-section="${id}"]`).click();
        await b1.waitForFunction(value => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === value, id);
      }
      try {
        await b1.goto(`${origin}/${SLUG}/admin/${SPACE}#edit-library`);
        await b1.getByText('本站图库 8 张', { exact: true }).waitFor();
        const before = { draft: await draft(), publication: await publication() };
        assert.equal(await b1root.getAttribute('data-flow-dirty'), 'false');
        // A first group has four existing members: 55 Site assets gives 51
        // eligible photos and a real second picker page under the normal API.
        for (let offset = 0; offset < 47; offset += 8) {
          const batch = await Promise.all(Array.from({ length: Math.min(8, 47 - offset) }, async (_, index) => {
            const n = offset + index, portrait = n % 2 === 0;
            return { name: `anonymous-s1b-${n + 1}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width: portrait ? 140 : 210, height: portrait ? 210 : 140, channels: 3, background: { r: 80 + n, g: 150 - n, b: 40 + n * 2 } } }).png().toBuffer() };
          }));
          await b1.waitForFunction(() => {
            const input = document.querySelector('input[type="file"][aria-label="上传本站照片"]');
            return input && !input.disabled;
          });
          await b1.getByLabel('上传本站照片', { exact: true }).setInputFiles(batch);
          await b1.getByText(`本站图库 ${8 + offset + batch.length} 张`, { exact: true }).waitFor();
        }
        const allAssets = (await json(assetsPath)).assets;
        assert.equal(allAssets.length, 55, 'The isolated fixture has real cross-page assets');
        const group = before.draft.content.groups[0];
        const lookupAsset = allAssets.find(asset => asset.orientation === 'portrait' && !group.assetIds.includes(asset.id));
        assert.ok(lookupAsset);
        const sourceQuery = `  ${lookupAsset.id.toUpperCase()}  `;
        await b1.getByRole('combobox', { name: '画幅', exact: true }).selectOption('portrait');
        await b1.getByRole('combobox', { name: '加入本站时间', exact: true }).selectOption('oldest');
        await b1.locator('summary').filter({ hasText: /^按素材 ID 查找/ }).click();
        await b1.getByRole('textbox', { name: '素材 ID（可选）', exact: true }).fill(sourceQuery);
        const libraryIds = await b1.getByRole('button', { name: /^放大照片：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).evaluateAll(nodes => nodes.map(node => node.closest('[data-flow-asset-id]').dataset.flowAssetId));
        assert.deepEqual(libraryIds, [lookupAsset.id]);
        await b1module('home');
        await b1.getByRole('button', { name: '从图库选择背景', exact: true }).click();
        const backgroundPicker = b1.getByRole('dialog', { name: '从图库选择一张背景', exact: true });
        await backgroundPicker.waitFor();
        assert.equal(await backgroundPicker.getByRole('button', { name: '沿用图库查找条件', exact: true }).count(), 0, 'Single-background selection does not inherit category rules');
        assert.equal(await backgroundPicker.getByRole('combobox', { name: '画幅', exact: true }).inputValue(), 'all');
        assert.equal(await backgroundPicker.getByRole('textbox', { name: '素材 ID（可选）', exact: true }).inputValue(), '');
        await backgroundPicker.getByRole('button', { name: '取消', exact: true }).click();
        await backgroundPicker.waitFor({ state: 'detached' });
        await b1module('groups');
        await b1.locator('nav[aria-label="作品分类"]').getByRole('button', { name: new RegExp(group.name) }).click();
        const open = () => b1.getByRole('button', { name: '从图库选片', exact: true }).click();
        const noWrite = writeCount();
        await open(); await picker.waitFor();
        assert.equal(await picker.getByRole('textbox', { name: '按素材 ID 查找', exact: true }).inputValue(), '', 'Direct selection keeps the original default instead of auto-inheriting lookup');
        assert.equal(await picker.getByRole('combobox', { name: '照片方向', exact: true }).inputValue(), 'all');
        assert.equal(await picker.getByRole('combobox', { name: '加入本站时间', exact: true }).inputValue(), 'newest');
        await picker.getByText('第 1 / 2 页 · 51 张匹配', { exact: true }).waitFor();
        const first = (await ids())[0];
        await picker.locator(`[data-flow-asset-id="${first}"]`).getByRole('checkbox', { name: /^选择照片：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).check();
        await picker.getByRole('button', { name: '下一页', exact: true }).click();
        const second = (await ids())[0];
        await picker.locator(`[data-flow-asset-id="${second}"]`).getByRole('checkbox', { name: /^选择照片：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).check();
        assert.notEqual(first, second);
        for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 844 }, VIEWPORTS[0]]) {
          await b1.setViewportSize(viewport);
          assert.equal(await b1.locator('dialog[open]').count(), 1, 'A breakpoint change retains one actual open selection dialog');
          assert.equal(await picker.evaluate(dialog => dialog.open && dialog.contains(document.activeElement)), true, 'Resizing keeps keyboard focus inside the active picker');
          assert.deepEqual(await selectedIds(), [first, second], 'Cross-page temporary selections keep their order across mobile and desktop breakpoints');
          const actionBar = b1.locator('[data-editor-save-actions]');
          assert.equal(await actionBar.getAttribute('data-modal-open'), 'true', 'The save bar remains aware of the active modal after resizing');
          assert.equal(await actionBar.evaluate(element => element.inert), true, 'The save bar cannot take modal keyboard focus at either breakpoint');
          assert.equal(await b1root.getAttribute('data-flow-dirty'), 'false', 'Resizing and selected review do not edit the draft');
          assert.equal(writeCount(), noWrite, 'Resizing preserves selection without draft or publish writes');
          report.pickerLookup.push({ source: 'real isolated cross-page picker', viewport, selectedOrder: [first, second], dialogCount: 1, modalFocusRetained: true, saveBarInert: true, dirty: false, implicitWrites: 0 });
        }
        await picker.getByRole('button', { name: '沿用图库查找条件', exact: true }).click();
        assert.equal(await picker.getByRole('textbox', { name: '按素材 ID 查找', exact: true }).inputValue(), sourceQuery.trim());
        assert.equal(await picker.getByRole('combobox', { name: '照片方向', exact: true }).inputValue(), 'portrait');
        assert.equal(await picker.getByRole('combobox', { name: '分类关系', exact: true }).inputValue(), 'outside');
        assert.equal(await picker.getByRole('combobox', { name: '加入本站时间', exact: true }).inputValue(), 'oldest');
        await picker.getByText('第 1 / 1 页 · 1 张匹配', { exact: true }).waitFor();
        assert.deepEqual(await ids(), libraryIds, 'An explicit inherited ID+orientation lookup finds the same eligible Site photograph');
        assert.deepEqual(await selectedIds(), [first, second], 'Selections outside the inherited range remain in their original cross-page order');
        await picker.getByRole('textbox', { name: '按素材 ID 查找', exact: true }).fill('s1b-no-match');
        await picker.getByRole('status').filter({ hasText: /当前条件：竖图.*素材 ID 包含“s1b-no-match”/ }).waitFor();
        assert.deepEqual(await ids(), [], 'No-result feedback does not silently broaden filters');
        await picker.getByRole('button', { name: '查看已选', exact: true }).click();
        await picker.getByRole('button', { name: '清除查找条件', exact: true }).click();
        assert.deepEqual(await ids(), [first, second], 'Clearing lookup preserves selected review and selection order');
        await picker.getByRole('button', { name: '返回全部结果', exact: true }).click();
        assert.equal(await picker.getByRole('combobox', { name: '分类关系', exact: true }).inputValue(), 'outside');
        assert.equal(await picker.getByRole('combobox', { name: '加入本站时间', exact: true }).inputValue(), 'oldest');
        await picker.getByRole('combobox', { name: '加入本站时间', exact: true }).selectOption('newest');
        await picker.getByRole('combobox', { name: '照片方向', exact: true }).selectOption('landscape');
        assert.deepEqual(await selectedIds(), [first, second], 'Further filter and sort changes are not overwritten by the library snapshot');
        allowPickerDiscard = true;
        await picker.getByRole('button', { name: '取消选片', exact: true }).click();
        await picker.waitFor({ state: 'detached' }); allowPickerDiscard = false;
        assert.equal(await b1root.getAttribute('data-flow-dirty'), 'false');
        assert.equal(writeCount(), noWrite, 'Looking up, reviewing and cancelling selections produces no draft or publish write');
        assert.deepEqual(await draft(), before.draft); assert.deepEqual(await publication(), before.publication);
        await b1module('library');
        assert.equal(await b1.getByRole('textbox', { name: '素材 ID（可选）', exact: true }).inputValue(), sourceQuery, 'Picker edits never back-write library lookup');
        assert.equal(await b1.getByRole('combobox', { name: '画幅', exact: true }).inputValue(), 'portrait');
        assert.equal(await b1.getByRole('combobox', { name: '加入本站时间', exact: true }).inputValue(), 'oldest');
        await b1module('groups'); await open(); await picker.waitFor();
        assert.equal(await picker.getByRole('checkbox', { name: /^选择照片：/ }).evaluateAll(nodes => nodes.filter(node => node.checked).length), 0, 'Cancelled temporary selections do not leak into a new picker');
        // Deliberately pick in reversed order to distinguish append order from
        // library sorting, filtering and member order.
        for (const id of [second, first]) {
          await picker.getByRole('textbox', { name: '按素材 ID 查找', exact: true }).fill(id);
          await picker.locator(`[data-flow-asset-id="${id}"]`).getByRole('checkbox', { name: /^选择照片：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).check();
        }
        await picker.getByRole('button', { name: '沿用图库查找条件', exact: true }).click();
        assert.deepEqual(await selectedIds(), [second, first]);
        await picker.getByRole('button', { name: '加入当前分类（2 张）', exact: true }).click();
        await picker.waitFor({ state: 'detached' });
        assert.equal(await b1root.getAttribute('data-flow-dirty'), 'true', 'Only confirmation appends to the in-memory category');
        assert.equal(writeCount(), noWrite, 'Confirming addition still does not implicitly save');
        assert.deepEqual(await draft(), before.draft);
        const pending = b1.waitForResponse(response => new URL(response.url()).pathname === draftPath(SPACE) && response.request().method() === 'PUT');
        await b1.getByRole('button', { name: '仅保存草稿', exact: true }).click();
        const receipt = await pending; assert.equal(receipt.status(), 200);
        const saved = await receipt.json();
        await b1.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowDirty === 'false');
        assert.equal(saved.revision, before.draft.revision + 1);
        assert.deepEqual(saved.content.groups[0].assetIds, [...group.assetIds, second, first]);
        assert.deepEqual(saved.content.groups.slice(1), before.draft.content.groups.slice(1));
        assert.deepEqual(await draft(), saved);
        assert.deepEqual(await publication(), before.publication, 'Save-only preserves the complete existing Published record');
        // Changing only this route's hash retains the current editing session.
        // A real reload mounts a new session and must discard transient lookup.
        await b1.reload();
        await b1module('library');
        await b1.getByText('本站图库 55 张', { exact: true }).waitFor();
        assert.equal(await b1.getByRole('combobox', { name: '画幅', exact: true }).inputValue(), 'all', 'A new editor session does not persist library conditions in storage');
        assert.equal(await b1.getByRole('combobox', { name: '加入本站时间', exact: true }).inputValue(), 'recent');
        await b1module('groups'); await open(); await picker.waitFor();
        assert.equal(await picker.getByRole('button', { name: '沿用图库查找条件', exact: true }).count(), 0, 'Default library conditions do not create a useless inheritance entry');
        assert.equal(await picker.getByRole('checkbox', { name: /^选择照片：/ }).evaluateAll(nodes => nodes.filter(node => node.checked).length), 0);
        await picker.getByRole('button', { name: '取消选片', exact: true }).click();
        await picker.waitFor({ state: 'detached' });
        for (const status of [401, 403]) {
          // Browser response injection exercises private UI cleanup only. It is
          // not evidence that the server revoked a session or checked ownership;
          // real Site authorization remains covered by HTTP integration.
          const protectedEditor = { draft: await draft(), publication: await publication(), dirty: await b1root.getAttribute('data-flow-dirty'), writes: writeCount() };
          await b1module('library');
          await b1.getByRole('combobox', { name: '画幅', exact: true }).selectOption('portrait');
          await b1.getByRole('combobox', { name: '加入本站时间', exact: true }).selectOption('oldest');
          await b1.locator('summary').filter({ hasText: /^按素材 ID 查找/ }).click();
          await b1.getByRole('textbox', { name: '素材 ID（可选）', exact: true }).fill(lookupAsset.id);
          await b1module('groups'); await open(); await picker.waitFor();
          const temporary = (await ids()).slice(0, 2);
          assert.equal(temporary.length, 2);
          for (const id of temporary) await picker.locator(`[data-flow-asset-id="${id}"]`).getByRole('checkbox', { name: /^选择照片：第 \d+ 张照片，(横幅|竖幅|方幅)$/ }).check();
          await picker.getByRole('button', { name: '沿用图库查找条件', exact: true }).click();
          const assetsUrl = `${origin}${assetsPath}`;
          await b1.route(assetsUrl, route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: `Synthetic session failure ${status}` }) }));
          try {
            const failed = b1.waitForResponse(response => response.url() === assetsUrl && response.status() === status);
            await picker.getByRole('button', { name: '重新读取素材', exact: true }).click();
            await failed; await picker.waitFor({ state: 'detached' });
            assert.equal(await b1root.getAttribute('data-flow-dirty'), protectedEditor.dirty, 'Session read failure preserves the draft dirty state');
            await b1module('library');
            await b1.getByRole('status').filter({ hasText: '本站素材读取失败，请确认登录状态。' }).waitFor();
            assert.equal(await b1.getByRole('combobox', { name: '画幅', exact: true }).inputValue(), 'all');
            assert.equal(await b1.getByRole('combobox', { name: '加入本站时间', exact: true }).inputValue(), 'recent');
            assert.equal(await b1.locator('input[placeholder="粘贴已知素材 ID"]').inputValue(), '');
            assert.equal(await b1.getByRole('button', { name: /^放大照片：/ }).count(), 0, 'Unavailable session removes cached private photo cards');
            assert.equal(await b1.getByRole('dialog', { name: /^照片大图：/ }).count(), 0);
            assert.equal(await b1.getByRole('dialog', { name: '当前编辑即时预览', exact: true }).count(), 0);
            assert.equal(writeCount(), protectedEditor.writes, 'Private state cleanup never writes a draft or publication');
            assert.deepEqual(await draft(), protectedEditor.draft); assert.deepEqual(await publication(), protectedEditor.publication);
          } finally { await b1.unroute(assetsUrl); }
          await b1.getByRole('button', { name: '重新读取图库', exact: true }).click();
          await b1.getByText('本站图库 55 张', { exact: true }).waitFor();
          assert.equal(await b1.getByRole('button', { name: /^放大照片：/ }).count(), 48, 'Removing the synthetic failure restores the normal paged Site assets');
          await b1module('groups'); await open(); await picker.waitFor();
          assert.equal(await picker.getByRole('button', { name: '沿用图库查找条件', exact: true }).count(), 0, 'A failed session leaves no inherited lookup');
          assert.equal(await picker.getByRole('checkbox', { name: /^选择照片：/ }).evaluateAll(nodes => nodes.filter(node => node.checked).length), 0, 'A failed session leaves no temporary selection');
          await picker.getByRole('button', { name: '取消选片', exact: true }).click();
          await picker.waitFor({ state: 'detached' });
          assert.equal(await b1root.getAttribute('data-flow-dirty'), protectedEditor.dirty);
          report.pickerLookup.push({ source: 'browser-only synthetic assets response; not server authorization proof', status, cleanup: 'lookup/temporary selection/cached assets cleared', dirtyPreserved: true, implicitWrites: 0 });
        }
        report.pickerLookup.push({ source: 'real isolated upload/API/UI', totalAssets: allAssets.length, eligibleBefore: 51, inheritedId: lookupAsset.id, selectedOrder: [second, first], beforeRevision: before.draft.revision, afterRevision: saved.revision, cancelDirty: false, implicitWrites: 0, publishedUnchanged: true });
      } finally { await b1.close(); }
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
