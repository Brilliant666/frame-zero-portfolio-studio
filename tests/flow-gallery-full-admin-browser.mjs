import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';

const SPACE = 'premium-flow-gallery';
const MODULES = ['library', 'groups', 'home', 'pricing', 'contact'];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Layout stress uses intercepted GET responses in browser memory only. */
export async function flowGalleryAdminMemoryLayout({ runtime, origin, password, fixtureSlug, siteId, outputDir }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  assert.equal(runtime.config.isTest, true);
  assert.equal(new URL(runtime.config.databaseUrl).port, '55436');
  const output = join(outputDir, 'memory-layout');
  await assert.rejects(readFile(join(output, 'acceptance.json')), error => error.code === 'ENOENT', 'Keep prior memory layout evidence intact');
  await mkdir(output, { recursive: true });
  const report = { scope: 'GET draft response substituted only in browser memory; no persisted business writes; emulated touch, not physical device', scenarios: [], forbidden: [], pageErrors: [] };
  const redact = value => String(value).split(password).join('[redacted]');
  const browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
  try {
    for (const viewport of VIEWPORTS) {
      const touch = viewport.width === 390;
      const context = await browser.newContext({ viewport, hasTouch: touch, reducedMotion: 'reduce' });
      const login = await context.request.post(`${origin}/api/auth/sign-in/username`, { headers: { origin }, data: { username: fixtureSlug, password } });
      assert.equal(login.status(), 200);
      const path = `/api/sites/${fixtureSlug}/drafts/${SPACE}`;
      const realDraft = await (await context.request.get(`${origin}${path}`)).json();
      const baseline = digest(realDraft);
      const memoryDraft = structuredClone(realDraft);
      const prices = Array.from({ length: 30 }, (_, index) => ({ id: randomUUID(), name: `匿名内存价格 ${index + 1}`, price: `${index + 1} 元`, description: '仅布局验收', details: ['一条细则', '第二条细则'], enabled: true }));
      const contacts = Array.from({ length: 20 }, (_, index) => ({ id: randomUUID(), label: `匿名内存联系 ${index + 1}`, value: '仅布局验收', href: 'mailto:memory@example.invalid' }));
      memoryDraft.content.pricing.packages = prices;
      memoryDraft.content.contact.items = contacts;
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (/^https?:$/.test(url.protocol) && url.origin !== origin) { report.forbidden.push('external-origin'); return route.abort(); }
        if (url.origin === origin && url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) { report.forbidden.push(url.pathname); return route.abort(); }
        if (url.pathname === path && request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(memoryDraft) });
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push(redact(error.message)));
      await page.goto(`${origin}/${fixtureSlug}/admin/${SPACE}#edit-groups`);
      await page.locator('[data-flow-editor-section]').waitFor();
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      const activate = async locator => { await locator.scrollIntoViewIfNeeded(); if (touch) await locator.tap(); else { await locator.focus(); await locator.press('Enter'); } };
      await activate(page.getByRole('button', { name: '从图库选片', exact: true }));
      const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
      await picker.waitFor();
      await activate(picker.getByRole('button', { name: '取消选片', exact: true }));
      for (const [module, label, items, prefix] of [['pricing', '价格项目定位', prices, 'flow-price-'], ['contact', '联系方式定位', contacts, 'flow-contact-']]) {
        await activate(page.locator(`nav[aria-label="流影视廊后台模块"] [data-flow-section="${module}"]`));
        const nav = page.getByRole('navigation', { name: label, exact: true });
        const buttons = nav.getByRole('button');
        assert.equal(await buttons.count(), items.length);
        const last = buttons.last();
        await activate(last);
        await page.waitForFunction(id => Boolean(document.getElementById(id)), `${prefix}${items.at(-1).id}`);
        const navigation = await last.evaluate(button => {
          const nav = button.closest('nav'), b = button.getBoundingClientRect(), n = nav.getBoundingClientRect();
          return { scrollX: nav.scrollLeft, scrollY: nav.scrollTop, clientWidth: nav.clientWidth, clientHeight: nav.clientHeight, scrollWidth: nav.scrollWidth, scrollHeight: nav.scrollHeight, button: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, nav: { left: n.left, right: n.right, top: n.top, bottom: n.bottom } };
        });
        assert.ok(navigation.button.left >= navigation.nav.left - 1 && navigation.button.right <= navigation.nav.right + 1 && navigation.button.top >= navigation.nav.top - 1 && navigation.button.bottom <= navigation.nav.bottom + 1, 'Last memory item remains visible inside its own navigation viewport');
        const fields = page.locator(`[id="${prefix}${items.at(-1).id}"] input:not([type="file"]):visible, [id="${prefix}${items.at(-1).id}"] textarea:visible`);
        await fields.last().focus();
        await fields.last().evaluate(field => field.scrollIntoView({ block: 'center' }));
        const end = await fields.last().evaluate(field => { const b = field.getBoundingClientRect(), dock = document.querySelector('[data-editor-save-actions="true"]'), d = dock?.getBoundingClientRect(); return { focused: document.activeElement === field, top: b.top, bottom: b.bottom, safeBottom: dock && getComputedStyle(dock).position === 'fixed' && d.top > innerHeight / 2 ? d.top : innerHeight }; });
        assert.ok(end.focused && end.top < end.safeBottom && end.bottom > 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        report.scenarios.push({ viewport, input: touch ? 'emulated touch tap' : 'keyboard Enter', module, count: items.length, navigation, lastParameter: end });
        await page.screenshot({ path: join(output, `${viewport.width}-${module}-last.png`) });
      }
      assert.equal(digest(await (await context.request.get(`${origin}${path}`)).json()), baseline, 'Memory stress did not change persisted draft');
      assert.equal((await runtime.pool.query('SELECT id FROM sites WHERE slug=$1', [fixtureSlug])).rows[0]?.id, siteId);
      await context.close();
    }
    assert.deepEqual(report.forbidden, []);
    assert.deepEqual(report.pageErrors, []);
    return report;
  } finally {
    await writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}

/** Caller supplies a newly created, dedicated anonymous Site on a new test PG.
 * No provision, migration, truncation, service start/stop or account cleanup.
 * "before" and "after" only photograph the same persisted data.
 * "exercise" writes only this fixture via UI, after comparison is complete.
 */
export async function flowGalleryFullAdminBrowser({ runtime, origin, password, fixtureSlug, siteId, phase, outputDir, expectedBaseline, signal }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  assert.equal(runtime.config.isTest, true);
  assert.equal(new URL(runtime.config.databaseUrl).pathname, '/frame_zero_accounts_test');
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
  assert.match(fixtureSlug, /^flowfull[a-z0-9-]+$/);
  assert.match(siteId, /^[a-f0-9-]{36}$/);
  assert.ok(['before', 'after', 'exercise'].includes(phase));
  assert.equal((await runtime.pool.query('SELECT id FROM sites WHERE slug=$1', [fixtureSlug])).rows[0]?.id, siteId);
  const repository = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const output = resolve(outputDir, phase === 'exercise' ? `exercise-${Date.now()}` : phase);
  const outside = path => { const r = relative(repository, path); return r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r); };
  assert.ok(outside(output), 'Evidence must stay outside the repository');
  await mkdir(output, { recursive: true });
  assert.ok(outside(await realpath(output)));
  const redact = value => String(value).split(password).join('[redacted]').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[redacted database]');
  const paths = {
    draft: `/api/sites/${fixtureSlug}/drafts/${SPACE}`,
    publication: `/api/sites/${fixtureSlug}/publications/${SPACE}`,
    assets: `/api/sites/${fixtureSlug}/assets`,
  };
  const report = { phase, origin, fixture: fixtureSlug, screenshots: [], imageGeometry: [], layout: [], readOnlyInteractions: [], checkpoints: [], network: [], forbidden: [], pageErrors: [], injectedFailures: [], baseline: null };
  const categoryName = `匿名回归分类 ${randomUUID().slice(0, 8)}`;
  const deletedCategoryName = `匿名删除分类 ${randomUUID().slice(0, 8)}`;
  async function protectedRows() {
    const result = {};
    for (const table of ['site_content_drafts', 'site_publications', 'site_publication_revisions', 'site_assets', 'site_template_grants']) {
      const rows = (await runtime.pool.query(`SELECT md5(row_to_json(t)::text) AS fingerprint FROM ${table} t WHERE site_id<>$1 ORDER BY fingerprint`, [siteId])).rows;
      result[table] = { count: rows.length, digest: digest(rows) };
    }
    return result;
  }
  const protectedBefore = await protectedRows();
  let browser, page;
  const abort = () => { void browser?.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  const persist = () => writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
    const context = await browser.newContext({ viewport: VIEWPORTS[0], reducedMotion: 'reduce' });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(25000);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) { report.forbidden.push('external-origin'); return route.abort(); }
      if (url.origin === origin && url.pathname.startsWith('/api/')) {
        report.network.push({ method, path: url.pathname });
        const read = ['GET', 'HEAD'].includes(method);
        const ownWrite = Object.values(paths).includes(url.pathname);
        const login = url.pathname === '/api/auth/sign-in/username' && method === 'POST';
        if ((!read && !login && (phase !== 'exercise' || !ownWrite)) || /^\/api\/(?:site-content|preview|platform-qr|local-photos|photo-import)(?:\/|$)/.test(url.pathname)) {
          report.forbidden.push(url.pathname); return route.abort();
        }
      }
      if (url.pathname.startsWith('/photos/') || url.pathname.startsWith('/preview/')) { report.forbidden.push(url.pathname); return route.abort(); }
      return route.continue();
    });
    page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(redact(error.message)));
    page.on('dialog', dialog => {
      if (dialog.type() === 'beforeunload') void dialog.accept();
      else if (phase === 'exercise' && dialog.type() === 'confirm' && /删除分类|放弃本次选片|重新读取将替换当前未保存编辑/.test(dialog.message())) void dialog.accept();
      else { report.forbidden.push(`unexpected-dialog:${dialog.type()}`); void dialog.dismiss(); }
    });
    const json = async path => {
      const response = await context.request.get(`${origin}${path}`);
      assert.equal(response.status(), 200, `Read own fixture ${path}`);
      return response.json();
    };
    const draft = () => json(paths.draft);
    const publication = () => json(paths.publication);
    const root = page.locator('[data-flow-editor-section]');
    const writes = () => report.network.filter(item => !['GET', 'HEAD'].includes(item.method) && !item.path.startsWith('/api/auth/')).length;
    async function module(id) {
      await page.locator(`nav[aria-label="流影视廊后台模块"] [data-flow-section="${id}"]`).click();
      await page.waitForFunction(value => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === value, id);
      assert.equal(new URL(page.url()).hash, `#edit-${id}`);
      await page.waitForFunction(() => document.activeElement === document.querySelector('[data-flow-editor-section] h1'));
    }
    async function shot(name) {
      assert.equal(await page.locator('input[type="password"]').count(), 0);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForFunction(() => [...document.querySelectorAll('img')].filter(image => {
        const bounds = image.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && bounds.top < innerHeight && bounds.bottom > 0;
      }).every(image => image.complete && image.naturalWidth > 0));
      await page.screenshot({ path: join(output, name), fullPage: false });
      report.screenshots.push({ file: name, viewport: page.viewportSize(), pathname: new URL(page.url()).pathname });
      const primary = await page.evaluate(() => {
        const section = document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection;
        const image = section === 'library' ? document.querySelector('button[aria-label^="放大素材 "] img')
          : section === 'groups' ? document.querySelector('[data-sort-card] img') : null;
        if (!image) return null;
        const rect = element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
        const intersect = (a, b, x = true, y = true) => ({ left: x ? Math.max(a.left, b.left) : a.left, right: x ? Math.min(a.right, b.right) : a.right, top: y ? Math.max(a.top, b.top) : a.top, bottom: y ? Math.min(a.bottom, b.bottom) : a.bottom });
        const height = bounds => Math.max(0, bounds.bottom - bounds.top);
        const bounds = rect(image), photoFrame = rect(image.parentElement);
        const imageStyle = getComputedStyle(image);
        const position = imageStyle.objectPosition.split(/\s+/);
        const offset = (value, freeSpace) => value?.endsWith('%') ? freeSpace * parseFloat(value) / 100 : value?.endsWith('px') ? parseFloat(value) : null;
        const fit = imageStyle.objectFit;
        const contentRect = {
          left: bounds.left + parseFloat(imageStyle.borderLeftWidth) + parseFloat(imageStyle.paddingLeft),
          right: bounds.right - parseFloat(imageStyle.borderRightWidth) - parseFloat(imageStyle.paddingRight),
          top: bounds.top + parseFloat(imageStyle.borderTopWidth) + parseFloat(imageStyle.paddingTop),
          bottom: bounds.bottom - parseFloat(imageStyle.borderBottomWidth) - parseFloat(imageStyle.paddingBottom),
        };
        const contentWidth = contentRect.right - contentRect.left, contentHeight = contentRect.bottom - contentRect.top;
        const containScale = Math.min(contentWidth / image.naturalWidth, contentHeight / image.naturalHeight);
        const scale = fit === 'contain' ? containScale : fit === 'cover' ? Math.max(contentWidth / image.naturalWidth, contentHeight / image.naturalHeight) : fit === 'scale-down' ? Math.min(1, containScale) : 1;
        const paintWidth = fit === 'fill' ? contentWidth : image.naturalWidth * scale;
        const paintHeight = fit === 'fill' ? contentHeight : image.naturalHeight * scale;
        const positionX = offset(position[0], contentWidth - paintWidth), positionY = offset(position[1], contentHeight - paintHeight);
        const paintedRect = image.naturalWidth && image.naturalHeight && positionX !== null && positionY !== null
          ? { left: contentRect.left + positionX, top: contentRect.top + positionY, right: contentRect.left + positionX + paintWidth, bottom: contentRect.top + positionY + paintHeight } : null;
        let clipped = intersect(paintedRect ?? contentRect, contentRect);
        const clipAncestors = [];
        for (let ancestor = image.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX);
          const clipY = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY);
          if (!clipX && !clipY) continue;
          const r = ancestor.getBoundingClientRect();
          const paddingBox = { left: r.left + ancestor.clientLeft, top: r.top + ancestor.clientTop, right: r.left + ancestor.clientLeft + ancestor.clientWidth, bottom: r.top + ancestor.clientTop + ancestor.clientHeight };
          clipAncestors.push({ tag: ancestor.tagName, overflowX: style.overflowX, overflowY: style.overflowY, paddingBox });
          clipped = intersect(clipped, paddingBox, clipX, clipY);
        }
        const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        const visible = intersect(clipped, viewport);
        const saveActions = document.querySelector('[data-editor-save-actions="true"]');
        const dock = saveActions?.getBoundingClientRect();
        const safeBottom = dock && getComputedStyle(saveActions).position === 'fixed' && dock.top > innerHeight / 2 ? Math.min(innerHeight, dock.top) : innerHeight;
        const unobscured = intersect(visible, { ...viewport, bottom: safeBottom });
        return { section, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
          algorithm: 'paint-and-ancestor-clip-v2', imageRect: bounds, photoFrame, objectFit: fit, objectPosition: imageStyle.objectPosition, paintedRect, clippedRect: clipped, clipAncestors,
          visibleHeight: paintedRect ? height(visible) : null, unobscuredVisibleHeight: paintedRect ? height(unobscured) : null, unobscuredVisibleWidth: paintedRect ? Math.max(0, unobscured.right - unobscured.left) : null, saveDockTop: safeBottom,
          complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
      });
      if (primary) report.imageGeometry.push({ file: name, ...primary });
      report.layout.push({ file: name, ...await page.evaluate(() => {
        const section = document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection;
        const nav = document.querySelector('nav[aria-label="流影视廊后台模块"]');
        const sidebar = nav?.parentElement;
        const rgba = value => { const parts = value.match(/[\d.]+/g)?.map(Number); return parts?.length >= 3 ? [...parts.slice(0, 3), parts[3] ?? 1] : [255, 255, 255, 1]; };
        const background = element => {
          let result = [255, 255, 255];
          const ancestors = []; for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
          for (const node of ancestors) { const color = rgba(getComputedStyle(node).backgroundColor); result = color.slice(0, 3).map((channel, index) => channel * color[3] + result[index] * (1 - color[3])); }
          return result;
        };
        const luminance = rgb => rgb.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
        const contrast = element => {
          if (!element) return null;
          const bg = background(element), fg = rgba(getComputedStyle(element).color);
          const a = luminance(fg.slice(0, 3).map((channel, index) => channel * fg[3] + bg[index] * (1 - fg[3]))), b = luminance(bg);
          return { color: getComputedStyle(element).color, background: bg.map(Math.round), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        };
        const field = section === 'pricing' ? document.querySelector('[id^="flow-price-"] input[maxlength="120"]')
          : section === 'contact' ? document.querySelector('input[aria-label="联系名称"]') : null;
        const active = nav?.querySelector('[aria-current="page"]');
        const inactive = nav?.querySelector('button:not([aria-current])');
        const savedAt = document.querySelector('[data-flow-editor-section] [role="status"] small');
        return { section, viewport: { width: innerWidth, height: innerHeight }, sidebarBackground: sidebar ? getComputedStyle(sidebar).backgroundColor : null,
          sidebarText: contrast(sidebar?.querySelector('strong')), activeNavText: contrast(active), inactiveNavText: contrast(inactive), savedTimeText: contrast(savedAt),
          currentNameField: field ? { top: field.getBoundingClientRect().top, bottom: field.getBoundingClientRect().bottom, value: field.value } : null };
      }) });
      const bounds = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(bounds.html <= bounds.viewport + 1 && bounds.body <= bounds.viewport + 1, `Horizontal overflow: ${JSON.stringify(bounds)}`);
    }
    async function stage(name, run) {
      signal?.throwIfAborted();
      const started = Date.now();
      console.log(`[flow-full-admin] START ${name}`);
      try { await run(); report.checkpoints.push({ name, result: 'PASS', durationMs: Date.now() - started }); }
      catch (error) { report.checkpoints.push({ name, result: 'FAIL', error: redact(error.message) }); await shot(`failure-${page.viewportSize().width}.png`).catch(() => {}); throw error; }
      finally { await persist(); }
    }
    async function readOnlyReachability(id, initialDraft) {
      if (id === 'groups') {
        await page.getByRole('button', { name: '从图库选片', exact: true }).click();
        const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
        await picker.waitFor();
        const bounds = await picker.evaluate(dialog => ({ width: dialog.getBoundingClientRect().width, scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth, htmlWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }));
        assert.ok(bounds.scrollWidth <= bounds.clientWidth + 1 && bounds.htmlWidth <= bounds.viewportWidth + 1, 'Picker has no horizontal page overflow');
        await picker.getByRole('button', { name: '取消选片', exact: true }).click();
        report.readOnlyInteractions.push({ viewport: page.viewportSize(), module: id, pickerBounds: bounds });
      }
      if (id !== 'pricing' && id !== 'contact') return;
      const name = id === 'pricing' ? '价格项目定位' : '联系方式定位';
      const prefix = id === 'pricing' ? 'flow-price-' : 'flow-contact-';
      const items = id === 'pricing' ? initialDraft.content.pricing.packages : initialDraft.content.contact.items;
      const buttons = page.getByRole('navigation', { name, exact: true }).getByRole('button');
      assert.equal(await buttons.count(), items.length, 'Every persisted commercial item has a navigation control');
      const reached = [];
      for (let index = 0; index < items.length; index++) {
        const button = buttons.nth(index);
        await button.scrollIntoViewIfNeeded();
        // Pointer click covers the same semantic control used by touch; this is not a physical touchscreen claim.
        await button.click();
        assert.equal(await page.locator(`[id="${prefix}${items[index].id}"]`).count(), 1);
        await button.focus();
        await button.press(index % 2 ? 'Space' : 'Enter');
        assert.equal(await page.locator(`[id="${prefix}${items[index].id}"]`).count(), 1);
        const fields = page.locator(`[id="${prefix}${items[index].id}"] input:not([type="file"]):visible, [id="${prefix}${items[index].id}"] textarea:visible`);
        const last = fields.last();
        await last.focus();
        await last.evaluate(field => field.scrollIntoView({ block: 'center' }));
        const geometry = await last.evaluate(field => { const bounds = field.getBoundingClientRect(), dock = document.querySelector('[data-editor-save-actions="true"]'); const dockBounds = dock?.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom, height: bounds.height, viewportHeight: innerHeight, safeBottom: dock && getComputedStyle(dock).position === 'fixed' && dockBounds.top > innerHeight / 2 ? dockBounds.top : innerHeight, focused: document.activeElement === field }; });
        assert.ok(geometry.focused && geometry.top < geometry.safeBottom && geometry.bottom > 0, 'Last commercial parameter is focusable and scroll reachable above the save dock');
        reached.push({ index, inputCount: await fields.count(), lastField: geometry });
      }
      if (items.length) await buttons.first().click();
      report.readOnlyInteractions.push({ viewport: page.viewportSize(), module: id, persistedItemCount: items.length, reached, scope: 'all persisted fixture items; no limit-size or physical device claim' });
    }
    let initialDraftForComparison;
    await stage('01 own fixture login and exact baseline', async () => {
      await page.goto(`${origin}/login`);
      await page.getByRole('textbox', { name: '用户名', exact: true }).fill(fixtureSlug);
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('link', { name: '进入我的站点后台' }).waitFor();
      const rights = await json('/api/account/site');
      assert.equal(rights.site.id, siteId); assert.equal(rights.site.slug, fixtureSlug);
      assert.ok(rights.templates.premium.includes(SPACE));
      await page.goto(`${origin}/${fixtureSlug}/admin/${SPACE}#edit-library`);
      await root.waitFor();
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      await page.getByRole('button', { name: '重新读取图库', exact: true }).waitFor();
      assert.deepEqual((await page.locator('nav[aria-label="流影视廊后台模块"] [data-flow-section]').evaluateAll(nodes => nodes.map(node => node.dataset.flowSection))).toSorted(), MODULES.toSorted());
      const initialDraft = await draft(), initialPublication = await publication(), initialAssets = (await json(paths.assets)).assets;
      initialDraftForComparison = initialDraft;
      const baseline = { draft: digest(initialDraft), publication: digest(initialPublication), assets: digest(initialAssets) };
      report.dataset = { draftRevision: initialDraft.revision, publishedDraftRevision: initialPublication.current?.draftRevision ?? null, assetCount: initialAssets.length };
      report.baseline = baseline;
      if (expectedBaseline) assert.deepEqual(baseline, expectedBaseline, 'Before/after use identical persisted data');
    });
    if (phase !== 'exercise') await stage('02 five modules at the same desktop and mobile viewports', async () => {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        for (const id of MODULES) { await module(id); await shot(`${viewport.width}-${id}.png`); await readOnlyReachability(id, initialDraftForComparison); }
      }
      assert.equal(writes(), 0, 'All screenshots are read-only');
    });
    if (phase !== 'exercise') {
      assert.deepEqual(await protectedRows(), protectedBefore);
      assert.deepEqual({ draft: digest(await draft()), publication: digest(await publication()), assets: digest((await json(paths.assets)).assets) }, report.baseline);
      await persist(); return report;
    }
    await page.setViewportSize(VIEWPORTS[0]);
    let assets = (await json(paths.assets)).assets;
    assert.ok(assets.length >= 50, '50 anonymous real assets cover 48-item pagination');
    const originalPublished = await publication();
    await stage('03 real library metadata, filters, pagination and upload result states', async () => {
      await module('library');
      const photos = () => page.getByRole('button', { name: /^放大素材 / });
      await photos().first().waitFor();
      assert.equal(await photos().count(), 48);
      await page.getByRole('button', { name: '下一页', exact: true }).click();
      assert.equal(await photos().count(), assets.length - 48);
      await page.getByRole('button', { name: '上一页', exact: true }).click();
      for (const orientation of ['portrait', 'landscape', 'square']) {
        await page.getByRole('combobox', { name: '画幅', exact: true }).selectOption(orientation);
        assert.equal(await photos().count(), Math.min(48, assets.filter(asset => asset.orientation === orientation).length));
      }
      await page.getByRole('combobox', { name: '画幅', exact: true }).selectOption('all');
      await page.getByRole('combobox', { name: '加入本站时间', exact: true }).selectOption('oldest');
      const earliest = [...assets].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))[0];
      assert.equal(await photos().first().getAttribute('aria-label'), `放大素材 ${earliest.id}`);
      const metadata = photos().first().locator('xpath=ancestor::article[1]');
      assert.match(await metadata.innerText(), /\d+\s*×\s*\d+/);
      await metadata.locator('summary').click();
      assert.ok((await metadata.innerText()).includes(earliest.id));
      const idLookup = page.locator('summary').filter({ hasText: '按素材 ID 查找' });
      await idLookup.click();
      await page.getByRole('textbox', { name: '素材 ID（可选）', exact: true }).fill(earliest.id);
      assert.equal(await photos().count(), 1);
      assert.equal(await photos().first().getAttribute('aria-label'), `放大素材 ${earliest.id}`);
      await page.getByRole('textbox', { name: '素材 ID（可选）', exact: true }).fill('');
      if (await idLookup.locator('..').getAttribute('open') !== null) await idLookup.click();
      assert.equal(await idLookup.locator('..').getAttribute('open'), null);
      assert.equal(await photos().count(), 48);
      await page.getByRole('button', { name: /添加照片/ }).click();
      const requestCount = writes();
      await page.getByLabel('上传本站照片', { exact: true }).setInputFiles({ name: 'rejected-anonymous.txt', mimeType: 'text/plain', buffer: Buffer.from('anonymous fixture') });
      await page.getByRole('alert').filter({ hasText: '本批未上传' }).waitFor();
      assert.equal(writes(), requestCount, 'Client validation performs no upload');
      const buffer = await sharp({ create: { width: 120, height: 180, channels: 3, background: '#589087' } }).png().toBuffer();
      let attempts = 0;
      const interrupted = route => {
        if (route.request().method() !== 'POST') return route.fallback();
        attempts++;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'ISOLATED_TEST_UPLOAD_UNAVAILABLE' }) });
      };
      await context.route(`${origin}${paths.assets}`, interrupted);
      await page.getByLabel('上传本站照片', { exact: true }).setInputFiles(['uncertain.png', 'not-started-1.png', 'not-started-2.png'].map(name => ({ name, mimeType: 'image/png', buffer })));
      const resultList = page.getByRole('list', { name: '本批上传结果', exact: true });
      await resultList.getByText(/uncertain.png.*结果待核对/).waitFor();
      assert.ok(await resultList.getByText(/not-started-1.png.*未上传/).isVisible());
      assert.ok(await resultList.getByText(/not-started-2.png.*未上传/).isVisible());
      assert.equal(attempts, 1, 'An uncertain upload stops the batch without replay');
      assert.equal((await json(paths.assets)).assets.length, assets.length);
      await context.unroute(`${origin}${paths.assets}`, interrupted);
      report.injectedFailures.push('One intercepted 503 upload response on this anonymous fixture; remaining files stayed queued without POST');
      await page.getByLabel('上传本站照片', { exact: true }).setInputFiles({ name: 'real-ui-anonymous.png', mimeType: 'image/png', buffer });
      await page.getByRole('list', { name: '本批上传结果', exact: true }).getByText(/real-ui-anonymous.png.*已入库/).waitFor();
      assets = (await json(paths.assets)).assets;
      assert.ok(assets.length >= 51);
      assert.deepEqual(await publication(), originalPublished, 'Upload never publishes');
      await shot('1440-library-upload.png');
    });
    await stage('04 category creation, chosen order, keyboard sort, caption and removal undo', async () => {
      await module('groups');
      const groupsBeforeCancel = await page.getByRole('navigation', { name: '作品分类', exact: true }).getByRole('button').allTextContents();
      const dirtyBeforeCancel = await root.getAttribute('data-flow-dirty');
      const writesBeforeCancel = writes();
      await page.getByRole('button', { name: '新建分类', exact: true }).click();
      const createDialog = page.getByRole('dialog', { name: '新建作品分类', exact: true });
      assert.equal(await createDialog.getByRole('textbox', { name: '分类名称', exact: true }).evaluate(input => document.activeElement === input), true);
      await createDialog.getByRole('textbox', { name: '分类名称', exact: true }).fill('取消后不创建的匿名分类');
      await page.keyboard.press('Control+s');
      assert.equal(writes(), writesBeforeCancel, 'The naming dialog cannot save through the global shortcut');
      await createDialog.getByRole('button', { name: '取消', exact: true }).click();
      assert.deepEqual(await page.getByRole('navigation', { name: '作品分类', exact: true }).getByRole('button').allTextContents(), groupsBeforeCancel);
      assert.equal(await root.getAttribute('data-flow-dirty'), dirtyBeforeCancel);
      assert.equal(writes(), writesBeforeCancel);
      await page.getByRole('button', { name: '新建分类', exact: true }).click();
      await page.getByRole('textbox', { name: '分类名称', exact: true }).fill(categoryName);
      await page.getByRole('button', { name: '新建并从图库选片', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
      await picker.waitFor();
      const choices = picker.getByRole('checkbox', { name: /^选择照片 / });
      const selected = [await choices.nth(2).getAttribute('aria-label'), await choices.nth(0).getAttribute('aria-label')].map(label => label.replace('选择照片 ', ''));
      for (const id of selected) await picker.getByLabel(`选择照片 ${id}`, { exact: true }).check();
      await picker.getByRole('button', { name: '查看已选', exact: true }).click();
      assert.deepEqual(await choices.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').replace('选择照片 ', ''))), selected);
      await picker.getByRole('button', { name: '加入当前分类（2 张）', exact: true }).click();
      const members = page.locator('[data-sort-card]');
      assert.deepEqual(await members.evaluateAll(nodes => nodes.map(node => node.dataset.memberId)), selected);
      await members.first().focus(); await page.keyboard.press('End');
      assert.deepEqual(await members.evaluateAll(nodes => nodes.map(node => node.dataset.memberId)), selected.toReversed());
      await page.getByRole('button', { name: '撤销最近移动', exact: true }).click();
      await page.getByRole('button', { name: '分类与说明', exact: true }).click();
      const classificationList = page.getByRole('navigation', { name: '作品分类', exact: true });
      const originalOrder = await classificationList.getByRole('button').allTextContents();
      await page.getByRole('button', { name: '分类上移', exact: true }).click();
      assert.notDeepEqual(await classificationList.getByRole('button').allTextContents(), originalOrder);
      await page.getByRole('button', { name: '分类下移', exact: true }).click();
      assert.deepEqual(await classificationList.getByRole('button').allTextContents(), originalOrder);
      await page.getByRole('textbox', { name: '第 1 张照片说明', exact: true }).fill('匿名说明，保留原顺序与内容');
      await page.getByRole('button', { name: '移出当前照片', exact: true }).click();
      await page.getByRole('button', { name: '撤销最近移除', exact: true }).click();
      assert.equal(await page.getByRole('textbox', { name: '第 1 张照片说明', exact: true }).inputValue(), '匿名说明，保留原顺序与内容');
      assert.deepEqual(await publication(), originalPublished);
      await page.getByRole('button', { name: '照片顺序', exact: true }).click();
      await shot('1440-groups-edited.png');
    });
    await stage('05 homepage rails, price, optional contact QR and memory previews', async () => {
      await module('home');
      await page.getByRole('combobox', { name: '左侧轨道', exact: true }).selectOption({ label: categoryName });
      await page.getByRole('button', { name: '7∶3', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '7∶3', exact: true }).getAttribute('aria-pressed'), 'true');
      await module('pricing');
      await page.getByRole('button', { name: /新增价格项目/ }).click();
      await page.getByRole('textbox', { name: '名称', exact: true }).fill('匿名回归套餐');
      await page.getByRole('textbox', { name: '价格说明', exact: true }).fill('测试报价 200');
      await page.getByRole('textbox', { name: /^内容说明/ }).fill('匿名测试套餐，不属于真实业务');
      await page.getByRole('textbox', { name: '细则（每行一条，最多 30 条）', exact: true }).fill('拍摄一小时\n交付十张照片');
      await page.getByRole('button', { name: '移除此项目', exact: true }).click();
      await page.getByRole('button', { name: '撤销最近移除', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === '匿名回归套餐'));
      assert.equal(await page.getByRole('textbox', { name: '价格说明', exact: true }).inputValue(), '测试报价 200');
      await page.getByLabel('展示此项目', { exact: true }).uncheck();
      await page.getByLabel('展示此项目', { exact: true }).check();
      await module('contact');
      const contact = page.getByRole('textbox', { name: '账号或说明', exact: true }).first();
      assert.ok((await contact.inputValue()).length > 0);
      const card = page.getByRole('region', { name: '可选联系卡', exact: true }).first();
      assert.ok((await card.innerText()).includes('文字账号和网址可独立使用'));
      await page.getByRole('button', { name: /新增联系方式/ }).click();
      await page.getByRole('textbox', { name: '联系名称', exact: true }).fill('匿名回归邮箱');
      await page.getByRole('textbox', { name: '账号或说明', exact: true }).fill('anonymous@example.invalid');
      await page.getByRole('textbox', { name: '链接（可选，http / https / mailto）', exact: true }).fill('mailto:anonymous@example.invalid');
      const newCard = page.getByRole('region', { name: '可选联系卡', exact: true });
      await newCard.locator('summary').click();
      await newCard.getByRole('button', { name: '选择或上传联系卡', exact: true }).click();
      await newCard.getByRole('button', { name: '选用此卡片', exact: true }).first().click();
      await newCard.getByRole('link', { name: '查看联系卡大图', exact: true }).waitFor();
      await newCard.getByRole('button', { name: '移除卡片引用', exact: true }).click();
      assert.equal(await newCard.getByRole('link', { name: '查看联系卡大图', exact: true }).count(), 0);
      assert.deepEqual((await json(paths.assets)).assets, assets, 'Removing optional QR preserves all Site asset identities and metadata');
      await page.getByRole('button', { name: '移除此联系方式', exact: true }).click();
      await page.getByRole('button', { name: '撤销最近移除', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === '匿名回归邮箱'));
      assert.equal(await page.getByRole('textbox', { name: '账号或说明', exact: true }).inputValue(), 'anonymous@example.invalid');
      for (const id of MODULES) {
        await module(id);
        const persisted = await draft(), published = await publication(), count = writes();
        await page.getByRole('button', { name: '查看本模块效果', exact: true }).click();
        await page.getByRole('dialog', { name: '当前编辑即时预览', exact: true }).waitFor();
        await page.getByRole('button', { name: '关闭当前编辑预览', exact: true }).click();
        assert.equal(writes(), count); assert.deepEqual(await draft(), persisted); assert.deepEqual(await publication(), published);
      }
    });
    await stage('06 deletion clears only the new category rail reference', async () => {
      await module('groups');
      await page.getByRole('button', { name: '新建分类', exact: true }).click();
      await page.getByRole('textbox', { name: '分类名称', exact: true }).fill(deletedCategoryName);
      await page.getByRole('button', { name: '新建并从图库选片', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
      await picker.getByRole('button', { name: '取消选片', exact: true }).click();
      await module('home');
      await page.getByRole('combobox', { name: '右侧轨道', exact: true }).selectOption({ label: deletedCategoryName });
      await module('groups');
      await page.getByRole('button', { name: '分类与说明', exact: true }).click();
      await page.getByRole('button', { name: '删除此分类', exact: true }).click();
      await module('home');
      assert.equal(await page.getByRole('combobox', { name: '右侧轨道', exact: true }).inputValue(), '');
      assert.equal(await page.getByRole('combobox', { name: '左侧轨道', exact: true }).locator('option:checked').innerText(), categoryName);
      assert.deepEqual((await json(paths.assets)).assets, assets, 'Deleting a class preserves all Site asset identities and metadata');
      assert.deepEqual(await publication(), originalPublished);
    });
    await stage('07 real save, Published separation and explicit publication', async () => {
      const response = page.waitForResponse(response => new URL(response.url()).pathname === paths.draft && response.request().method() === 'PUT');
      await page.getByRole('button', { name: '仅保存草稿', exact: true }).click();
      assert.equal((await response).status(), 200);
      await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowDirty === 'false');
      const saved = await draft();
      assert.ok(saved.content.groups.some(group => group.name === categoryName));
      assert.ok(saved.content.pricing.packages.some(item => item.name === '匿名回归套餐' && item.details.length === 2));
      assert.ok(saved.content.contact.items.some(item => item.label === '匿名回归邮箱' && !Object.hasOwn(item, 'qrAssetId')));
      assert.deepEqual(await publication(), originalPublished, 'Draft save leaves the public snapshot unchanged');
      const publicationResponse = page.waitForResponse(response => new URL(response.url()).pathname === paths.publication && response.request().method() === 'POST');
      await page.getByRole('button', { name: '保存并发布', exact: true }).click();
      assert.equal((await publicationResponse).status(), 200);
      await page.getByRole('status').filter({ hasText: '发布成功' }).waitFor();
      assert.equal((await publication()).current.draftRevision, (await draft()).revision);
      const tools = page.getByText('预览与草稿工具', { exact: true });
      if (await tools.count()) await tools.click();
      assert.ok(await page.getByRole('button', { name: '导出当前草稿', exact: true }).isVisible());
      assert.ok(await page.getByRole('button', { name: '重新读取草稿', exact: true }).isVisible());
      assert.ok(await page.getByText(/^发布历史与回退/).count());
    });
    await stage('08 mobile picker, modal save isolation and draft-only save', async () => {
      await page.setViewportSize(VIEWPORTS[1]);
      const pointer = await publication();
      await module('groups');
      await page.getByRole('navigation', { name: '作品分类', exact: true }).getByRole('button', { name: new RegExp(categoryName) }).click();
      await page.getByRole('button', { name: '从图库选片', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
      await picker.waitFor();
      await page.waitForFunction(() => document.querySelector('[data-editor-save-actions="true"]')?.hasAttribute('inert'));
      assert.equal(await page.locator('[data-editor-save-actions="true"]').getAttribute('inert'), '');
      await shot('390-picker.png');
      await picker.getByRole('button', { name: '取消选片', exact: true }).click();
      await module('home');
      const title = page.getByRole('textbox', { name: '首页标题', exact: true });
      await title.fill('手机仅保存草稿标题');
      await page.getByRole('heading', { level: 1 }).click();
      await page.getByRole('button', { name: '查看本模块效果', exact: true }).click();
      await page.getByRole('dialog', { name: '当前编辑即时预览', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('[data-editor-save-actions="true"]')?.hasAttribute('inert'));
      assert.equal(await page.locator('[data-editor-save-actions="true"]').getAttribute('inert'), '');
      await page.getByRole('button', { name: '关闭当前编辑预览', exact: true }).click();
      const saveButton = page.getByRole('button', { name: '仅保存草稿', exact: true });
      const bounds = await saveButton.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.y + bounds.height <= 844, 'Mobile save action stays reachable in the viewport');
      const saveResponse = page.waitForResponse(response => new URL(response.url()).pathname === paths.draft && response.request().method() === 'PUT');
      await saveButton.click(); assert.equal((await saveResponse).status(), 200);
      await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowDirty === 'false');
      assert.equal((await draft()).content.profile.title, '手机仅保存草稿标题');
      assert.deepEqual(await publication(), pointer, 'Mobile draft-only save keeps Published unchanged');
      await shot('390-home-draft-only.png');
    });
    await stage('09 rejected save exposes recovery without discarding local edits', async () => {
      const savedBefore = await draft(), pointer = await publication();
      await page.getByRole('textbox', { name: '首页标题', exact: true }).fill('冲突时保留当前编辑');
      const refusal = route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DRAFT_CONFLICT' }) })
        : route.fallback();
      await context.route(`${origin}${paths.draft}`, refusal);
      const received = page.waitForResponse(response => new URL(response.url()).pathname === paths.draft && response.request().method() === 'PUT');
      await page.getByRole('button', { name: '仅保存草稿', exact: true }).click();
      assert.equal((await received).status(), 409);
      await page.getByRole('button', { name: '重新读取并核对', exact: true }).waitFor();
      assert.ok(await page.getByRole('button', { name: '导出当前编辑', exact: true }).isVisible());
      assert.equal(await page.getByRole('textbox', { name: '首页标题', exact: true }).inputValue(), '冲突时保留当前编辑');
      assert.deepEqual(await draft(), savedBefore); assert.deepEqual(await publication(), pointer);
      await shot('390-rejected-save-recovery.png');
      await context.unroute(`${origin}${paths.draft}`, refusal);
      await page.getByRole('button', { name: '重新读取并核对', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowDirty === 'false');
      assert.equal(await page.getByRole('textbox', { name: '首页标题', exact: true }).inputValue(), savedBefore.content.profile.title);
      assert.deepEqual(await publication(), pointer);
      report.injectedFailures.push('One intercepted 409 save response on this anonymous fixture; recovery did not replay the PUT');
    });
    assert.deepEqual(await protectedRows(), protectedBefore, 'Other Sites retain every protected business row');
    assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []);
    report.terminal = { draftRevision: (await draft()).revision, publishedDraftRevision: (await publication()).current?.draftRevision ?? null, assetCount: (await json(paths.assets)).assets.length };
    await persist(); return report;
  } catch (error) {
    await persist(); throw new Error(redact(error.message));
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser?.close();
  }
}
