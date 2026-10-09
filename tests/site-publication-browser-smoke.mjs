import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { siteTemplateBrowserMatrix } from './site-template-browser-matrix.mjs';

// Use an already visible control or open its actual disclosure; never force visibility.
async function expandControl(page, control) {
  await control.waitFor({ state: 'attached' });
  if (await control.isVisible()) return;
  const ancestors = page.locator('details').filter({ has: control });
  assert.ok(await ancestors.count() > 0, 'Expected an existing disclosure for this control');
  const disclosure = ancestors.last();
  if (await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').click();
  await control.waitFor({ state: 'visible' });
}

// Writes use the real UI against a provisioned anonymous fixture only. The caller
// owns database/server start, backup and shutdown; this module never starts them.
export async function sitePublicationBrowserSmoke({ runtime, origin, password, signal }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
  const slug = 'pubbrowserfixture';
  await provisionAccount(runtime, { username: slug, slug, email: `${slug}@example.invalid`, password, premium: true });
  const privateRoot = process.env.FRAME_ZERO_BROWSER_OUTPUT_DIR || (process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'PortfolioPlatform', 'local-m3', 'pr33-publication-browser')
    : join(tmpdir(), 'frame-zero-publication-browser'));
  const output = resolve(privateRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  const fromRepo = relative(process.cwd(), output);
  assert.ok(fromRepo.startsWith('..') || resolve(output).split(':')[0] !== resolve(process.cwd()).split(':')[0], 'Screenshots must stay outside the repository');
  await mkdir(output, { recursive: true });
  const checkpoints = [], screenshots = [], network = [], pageErrors = [], forbiddenRequests = [], steps = [], timings = [];
  const matrixOnly = process.env.FRAME_ZERO_PUBLICATION_MATRIX_ONLY === '1';
  const report = { origin, head: process.env.GITHUB_SHA ?? 'local', fixture: slug, scope: matrixOnly ? 'matrix diagnostic plus fixture/card setup; core stages 03-09 excluded' : 'full browser publication and matrix acceptance', matrixFrom: process.env.FRAME_ZERO_PUBLICATION_MATRIX_FROM ?? 'first template', validation: 'isolated synthetic account; not customer acceptance', checkpoints, screenshots, network, pageErrors, forbiddenRequests, steps, timings };
  const persist = () => writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  const browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const anonymous = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(25000);
  anonymous.setDefaultTimeout(15000); anonymous.setDefaultNavigationTimeout(25000);
  const releases = new Set();
  const abort = () => { for (const release of releases) release(); void browser.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, 1500000);
  const page = await context.newPage(), publicPage = await anonymous.newPage();
  for (const ctx of [context, anonymous]) {
    ctx.on('page', p => {
      p.on('dialog', dialog => void dialog.accept());
      p.on('pageerror', error => pageErrors.push(String(error.message).split(password).join('[redacted]')));
    });
    ctx.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname.startsWith('/api/')) network.push({ method: request.method(), path: url.pathname });
      if (/^\/api\/(?:site-content|preview\/site-content|platform-qr|local-photos|photo-import)(?:\/|$)|^\/photos\//.test(url.pathname)) forbiddenRequests.push(url.pathname);
    });
  }
  // Pages created before the context listeners need their own dialog handler.
  page.on('dialog', dialog => void dialog.accept());
  page.on('pageerror', error => pageErrors.push(String(error.message).split(password).join('[redacted]')));
  publicPage.on('pageerror', error => pageErrors.push(String(error.message).split(password).join('[redacted]')));
  const basic = `/${slug}/admin/basic`, premium = `/${slug}/admin/premium-polaroid`;
  const draftPath = space => `/api/sites/${slug}/drafts/${space}`;
  const publicationPath = space => `/api/sites/${slug}/publications/${space}`;
  const assetsPath = `/api/sites/${slug}/assets`;
  const publicationRegion = () => page.getByRole('region', { name: '公开发布', exact: true });
  const writes = (method, path) => network.filter(item => item.method === method && item.path === path).length;
  async function bounded(promise, label, milliseconds = 20000) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds); })]); }
    finally { clearTimeout(timer); }
  }
  async function step(label) { steps.push(label); console.log(`[publication-browser] STEP ${label}`); await persist(); }
  function recordTiming(label, started) { const durationMs = Date.now() - started; timings.push({ label, durationMs }); console.log(`[publication-browser] TIME ${label}: ${durationMs}ms`); }
  async function json(path) { const response = await context.request.get(`${origin}${path}`, { timeout: 15000 }); assert.equal(response.status(), 200); return bounded(response.json(), `GET ${path} JSON`); }
  const draft = (space = 'basic') => json(draftPath(space));
  const publication = (space = 'basic') => json(publicationPath(space));
  async function screenshot(p, name) {
    assert.equal(await p.locator('input[type=password]').count(), 0);
    const file = `${name}-${p.viewportSize().width}.png`;
    await p.screenshot({ path: join(output, file), fullPage: false });
    screenshots.push({ file, path: new URL(p.url()).pathname, viewport: p.viewportSize() });
  }
  async function stage(name, run) {
    const started = Date.now();
    console.log(`[publication-browser] START ${name}`);
    try { await bounded(run(), `Stage ${name}`, 150000); checkpoints.push({ name, result: 'PASS', durationMs: Date.now() - started }); }
    catch (error) {
      checkpoints.push({ name, result: 'FAIL', durationMs: Date.now() - started, error: String(error.message).split(password).join('[redacted]') });
      if (!page.isClosed() && await page.locator('input[type=password]').count() === 0) await screenshot(page, 'failure').catch(() => {});
      throw error;
    } finally { await persist(); }
  }
  async function nav(section) {
    const href = `${basic}/${section}`;
    if (page.viewportSize().width <= 900) await page.getByLabel('切换后台分区').selectOption(href);
    else if (section === 'advanced') {
      const compatibility = page.getByRole('link', { name: '兼容内容与工具', exact: true });
      await expandControl(page, page.getByRole('link', { name: '兼容内容与工具', exact: true, includeHidden: true }));
      await compatibility.click();
    }
    else await page.locator(`nav[aria-label="后台主要分区"] a[href="${href}"]`).click();
    await page.waitForURL(`**${href}`);
  }
  async function ready(p = page) {
    await p.getByRole('region', { name: '公开发布', exact: true }).waitFor();
    await p.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
    // The history dialog repeats the public template in a hidden paragraph.
    // Wait for the loaded primary status, excluding unresolved/loading labels.
    await p.getByRole('region', { name: '公开发布', exact: true }).locator('span')
      .filter({ hasText: /^(?:暂无公开版本|(?:当前)?公开：(?!待核对|待确认).+)$/ }).waitFor({ state: 'visible' });
  }
  async function save(space = 'basic', p = page) {
    const pending = p.waitForResponse(response => new URL(response.url()).pathname === draftPath(space) && response.request().method() === 'PUT');
    await p.getByRole('button', { name: '仅保存草稿', exact: true }).click();
    const response = await pending; assert.equal(response.status(), 200);
    const value = await bounded(response.json(), `${space} save JSON`);
    await p.getByRole('button', { name: '仅保存草稿', exact: true }).waitFor();
    return value;
  }
  async function publish(space = 'basic') {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === publicationPath(space) && response.request().method() === 'POST');
    await publicationRegion().getByRole('button', { name: '保存并发布', exact: true }).click();
    const response = await pending; assert.equal(response.status(), 200);
    const value = (await bounded(response.json(), `${space} publication JSON`)).publication;
    await publicationRegion().getByRole('status').filter({ hasText: value.outcome === 'unchanged' ? '当前内容已发布' : '发布成功' }).waitFor();
    return value;
  }
  async function template(id) {
    await nav('template');
    if (page.viewportSize().width <= 900) await page.getByLabel('查看模板详情').selectOption(id);
    else await page.locator(`[data-template-option="${id}"]`).click();
    await page.locator(`[data-template-detail="${id}"] [data-template-primary-action] button`).click();
    await page.waitForURL(`**${basic}/layout`);
  }
  async function upload(file) {
    await step(`upload ${file.name} starts`);
    const before = new Set((await json(assetsPath)).assets.map(asset => asset.id));
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === assetsPath && response.request().method() === 'POST');
    await page.getByLabel('上传本站照片', { exact: true }).setInputFiles(file);
    const response = await pending; assert.ok([200, 201].includes(response.status()));
    await step(`upload ${file.name} HTTP ${response.status()} headers`);
    await page.getByText(/已上传 1 张/).waitFor();
    // Chromium can leave the already-consumed upload response stream pending.
    // Assert the real POST status and UI acknowledgement, then read persisted IDs.
    const additions = (await json(assetsPath)).assets.filter(asset => !before.has(asset.id));
    assert.equal(additions.length, 1, 'A unique synthetic upload adds exactly one Site asset');
    const value = additions[0];
    await step(`upload ${file.name} complete`);
    return value;
  }
  async function visibleUpload() {
    const uploader = page.locator('#basic-photo-upload [data-site-upload]');
    const input = uploader.getByLabel('上传本站照片', { exact: true });
    await input.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#basic-photo-upload input[type="file"]')?.matches(':enabled'));
    assert.equal(await input.isEnabled(), true, 'Upload is available directly in the gallery');
    assert.equal(await input.getAttribute('accept'), 'image/jpeg,image/png,image/webp');
    await uploader.getByText(/每批最多 8 张 · 每张最多 20 MB · JPEG \/ PNG \/ WebP/).waitFor({ state: 'visible' });
  }
  const makeFile = async (name, width, height, color) => ({ name: `${name}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer() });
  let firstBasic, secondBasic, firstPremium, originalCard, photoAssets;
  try {
    await stage('01 login, upload and explicit optional contact card selection', async () => {
      await step('login form');
      await page.goto(`${origin}/login`);
      await page.getByLabel('用户名', { exact: true }).fill(slug);
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('link', { name: '进入我的站点后台' }).waitFor();
      await step('login complete, open basic profile');
      await page.goto(`${origin}${basic}/profile`); await ready();
      await step('basic profile ready');
      await page.getByLabel('摄影师名称', { exact: true }).fill('Basic publication fixture');
      await page.getByLabel('首页主标题', { exact: true }).fill('Publication fixture title');
      await page.locator('summary').filter({ hasText: '可选品牌内容' }).click();
      await page.getByLabel('品牌名', { exact: true }).fill('PUBLICATION FIXTURE');
      await step('profile filled, navigate layout');
      await nav('layout');
      await visibleUpload();
      photoAssets = [await upload(await makeFile('landscape', 900, 600, '#557799')), await upload(await makeFile('landscape-second', 960, 640, '#997755')), await upload(await makeFile('portrait', 600, 900, '#667755'))];
      await nav('contact');
      await step('contact section ready');
      await page.getByRole('button', { name: '添加平台账号', exact: true }).click();
      await expandControl(page, page.getByLabel('平台 1', { exact: true }));
      await page.getByLabel('平台 1', { exact: true }).fill('Fixture contact');
      await page.getByLabel(/^账号、主页链接或分享文案 1/).fill('https://example.com/fixture');
      await expandControl(page, page.getByRole('button', { name: '选择或上传联系卡', exact: true, includeHidden: true }));
      await page.getByRole('button', { name: '选择或上传联系卡', exact: true }).click();
      originalCard = await upload(await makeFile('contact-card', 480, 640, '#f0e0d0'));
      await step('contact card uploaded, explicit selection');
      assert.equal(await page.getByAltText('当前联系卡', { exact: true }).count(), 0, 'Upload must not attach a card automatically');
      await page.locator('article').filter({ has: page.locator('code', { hasText: originalCard.id }) }).getByRole('button', { name: '选用此卡片', exact: true }).click();
      await page.getByAltText('当前联系卡', { exact: true }).waitFor();
      await step('contact selected, verify unchanged draft and publication');
      assert.equal((await draft()).revision, 0, 'Selection must remain unsaved');
      assert.equal((await publication()).current, null, 'Upload and selection must not publish');
      await step('first basic save and publish');
      firstBasic = await publish();
      assert.equal(firstBasic.space, 'basic'); assert.equal(firstBasic.templateId, 'cinematic-light'); assert.equal(firstBasic.draftRevision, 1);
    });
    await stage('02 card cancellation and failed replacement keep old reference', async () => {
      const before = await draft(), pointer = (await publication()).current.id;
      await expandControl(page, page.getByRole('button', { name: '替换联系卡', exact: true, includeHidden: true }));
      await page.getByRole('button', { name: '替换联系卡', exact: true }).click();
      await page.getByRole('button', { name: '取消选卡', exact: true }).click();
      assert.ok((await page.getByAltText('当前联系卡', { exact: true }).getAttribute('src')).includes(originalCard.id));
      await expandControl(page, page.getByRole('button', { name: '替换联系卡', exact: true, includeHidden: true }));
      await page.getByRole('button', { name: '替换联系卡', exact: true }).click();
      await page.route(`**${assetsPath}`, route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic upload unavailable' }) }) : route.continue());
      await page.getByLabel('上传本站照片', { exact: true }).setInputFiles(await makeFile('failed-card', 320, 480, '#123456'));
      await page.getByText(/上传未完成（503）/).waitFor();
      await page.getByRole('button', { name: '取消选卡', exact: true }).click();
      await page.unroute(`**${assetsPath}`);
      assert.ok((await page.getByAltText('当前联系卡', { exact: true }).getAttribute('src')).includes(originalCard.id));
      assert.deepEqual(await draft(), before); assert.equal((await publication()).current.id, pointer);
      await screenshot(page, 'contact-card-preserved');
    });
    if (!matrixOnly) {
    await stage('03 identical revision across spaces never reports synced', async () => {
      await page.goto(`${origin}${premium}`); await ready();
      await page.getByRole('button', { name: '主页资料', exact: true }).click();
      await page.getByLabel('摄影师名称', { exact: true }).fill('Premium publication fixture');
      const saved = await save('premium-polaroid'); assert.equal(saved.revision, 1);
      assert.equal(await publicationRegion().getByText('已同步', { exact: true }).count(), 0);
      await publicationRegion().getByText('草稿尚未发布', { exact: true }).waitFor();
      assert.equal((await publication()).current.id, firstBasic.id);
      await page.goto(`${origin}${basic}/profile`); await ready();
    });
    await stage('04 basic A to basic B to premium to basic and history rollback', async () => {
      await template('film-rail'); secondBasic = await publish();
      assert.equal(secondBasic.templateId, 'film-rail');
      const basicBefore = await draft();
      await page.goto(`${origin}${premium}`); await ready();
      firstPremium = await publish('premium-polaroid'); assert.equal(firstPremium.space, 'premium-polaroid');
      assert.deepEqual(await draft(), basicBefore);
      const premiumBefore = await draft('premium-polaroid');
      await page.goto(`${origin}${basic}/profile`); await ready();
      await publish(); assert.deepEqual(await draft('premium-polaroid'), premiumBefore);
      await publicationRegion().locator('summary').filter({ hasText: /^发布历史与回退 / }).click();
      const previous = publicationRegion().locator(`li[data-publication-id="${firstBasic.id}"]`);
      assert.match(await previous.textContent(), /基础版 · 明亮电影感/);
      const response = page.waitForResponse(r => new URL(r.url()).pathname === publicationPath('basic') && r.request().method() === 'POST');
      await previous.getByRole('button', { name: '恢复此公开版本', exact: true }).click();
      assert.equal((await response).status(), 200);
      await publicationRegion().getByRole('status').filter({ hasText: '已恢复公开版本' }).waitFor();
      assert.equal((await publication()).current.id, firstBasic.id);
      assert.deepEqual(await draft(), basicBefore); assert.deepEqual(await draft('premium-polaroid'), premiumBefore);
      await publicPage.goto(`${origin}/${slug}`); await publicPage.locator('[data-template="cinematic-light"]').waitFor();
      assert.equal(await publicPage.locator('[data-site-premium]').count(), 0);
      await screenshot(publicPage, 'rollback-basic-public');
    });
    await stage('05 edits while saving remain unsaved and unpublished', async () => {
      await page.getByLabel('摄影师名称', { exact: true }).fill('Captured publication name');
      let release, reached; const held = new Promise(r => { release = r; }); const started = new Promise(r => { reached = r; }); releases.add(release);
      await page.route(`**${draftPath('basic')}`, async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        const response = await route.fetch(); reached(); await held; await route.fulfill({ response });
      });
      const post = page.waitForResponse(r => new URL(r.url()).pathname === publicationPath('basic') && r.request().method() === 'POST');
      await publicationRegion().getByRole('button', { name: '保存并发布', exact: true }).click();
      await bounded(started, 'held save request reaches server');
      await page.getByLabel('摄影师名称', { exact: true }).fill('Newer unsaved name');
      release(); releases.delete(release); assert.equal((await post).status(), 200);
      await publicationRegion().getByRole('status').filter({ hasText: '发布成功' }).waitFor();
      assert.equal(await page.getByLabel('摄影师名称', { exact: true }).inputValue(), 'Newer unsaved name');
      assert.equal((await draft()).content.profile.photographer, 'Captured publication name');
      const publicHtml = await bounded((await anonymous.request.get(`${origin}/${slug}`, { timeout: 15000 })).text(), 'public page response body');
      assert.ok(publicHtml.includes('Captured publication name')); assert.ok(!publicHtml.includes('Newer unsaved name'));
      await page.unroute(`**${draftPath('basic')}`);
      await screenshot(page, 'in-flight-edits-retained');
      await page.reload(); await ready();
    });
    await stage('06 true second-tab CAS conflict preserves local edit and does not publish', async () => {
      const other = await context.newPage();
      await other.goto(`${origin}${basic}/profile`); await ready(other);
      await page.getByLabel('摄影师名称', { exact: true }).fill('Conflict local value');
      await other.getByLabel('摄影师名称', { exact: true }).fill('Second tab saved value'); await save('basic', other);
      const count = writes('POST', publicationPath('basic')), pointer = (await publication()).current.id;
      const conflict = page.waitForResponse(r => new URL(r.url()).pathname === draftPath('basic') && r.request().method() === 'PUT');
      await publicationRegion().getByRole('button', { name: '保存并发布', exact: true }).click();
      assert.equal((await conflict).status(), 409);
      await page.getByRole('alert').filter({ hasText: /版本|其他|冲突/ }).first().waitFor();
      assert.equal(await page.getByLabel('摄影师名称', { exact: true }).inputValue(), 'Conflict local value');
      assert.equal(writes('POST', publicationPath('basic')), count); assert.equal((await publication()).current.id, pointer);
      await other.close(); await page.reload(); await ready();
    });
    await stage('07 publish rejection leaves successful saved draft and old pointer', async () => {
      const pointer = (await publication()).current.id;
      await page.getByLabel('摄影师名称', { exact: true }).fill('Saved but rejected publication');
      await page.route(`**${publicationPath('basic')}`, route => route.request().method() === 'POST' ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic lost authorization' }) }) : route.continue());
      await publicationRegion().getByRole('button', { name: '保存并发布', exact: true }).click();
      await publicationRegion().getByRole('alert').filter({ hasText: /已保存.*发布被拒绝/ }).waitFor();
      assert.equal((await draft()).content.profile.photographer, 'Saved but rejected publication');
      assert.equal((await publication()).current.id, pointer);
      await page.unroute(`**${publicationPath('basic')}`);
    });
    await stage('08 lost save and publication responses reconcile read-only without duplicate writes', async () => {
      await page.getByLabel('摄影师名称', { exact: true }).fill('Readback confirmed publication');
      const beforePut = writes('PUT', draftPath('basic')), beforePost = writes('POST', publicationPath('basic'));
      for (const [path, method] of [[draftPath('basic'), 'PUT'], [publicationPath('basic'), 'POST']]) {
        await page.route(`**${path}`, async route => { if (route.request().method() !== method) return route.continue(); await route.fetch(); await route.abort('failed'); });
      }
      await publicationRegion().getByRole('button', { name: '保存并发布', exact: true }).click();
      await publicationRegion().getByRole('status').filter({ hasText: '已确认目标版本当前公开' }).waitFor();
      assert.equal(writes('PUT', draftPath('basic')) - beforePut, 1); assert.equal(writes('POST', publicationPath('basic')) - beforePost, 1);
      assert.equal((await publication()).current.draftRevision, (await draft()).revision);
      for (const path of [draftPath('basic'), publicationPath('basic')]) await page.unroute(`**${path}`);
    });
    await stage('09 unconfirmed publication locks automatic replay and offers read-only check', async () => {
      await page.getByLabel('摄影师名称', { exact: true }).fill('Pending publication fixture');
      const beforePost = writes('POST', publicationPath('basic')), pointer = (await publication()).current.id;
      await page.route(`**${publicationPath('basic')}`, route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
      await publicationRegion().getByRole('button', { name: '保存并发布', exact: true }).click();
      await publicationRegion().getByRole('status').filter({ hasText: /公开结果待确认；当前公开版本与目标不同/ }).waitFor();
      assert.equal(await publicationRegion().getByRole('button', { name: '保存并发布', exact: true }).isDisabled(), true);
      // Recovery remains available without expanding publication history.
      await publicationRegion().getByRole('button', { name: '只读检查发布结果', exact: true }).waitFor({ state: 'visible' });
      await publicationRegion().getByRole('button', { name: '只读检查发布结果', exact: true }).click();
      await publicationRegion().getByRole('status').filter({ hasText: '发布结果仍待确认' }).waitFor();
      assert.equal(writes('POST', publicationPath('basic')) - beforePost, 1); assert.equal((await publication()).current.id, pointer);
      await screenshot(page, 'uncertain-result-no-replay');
      await page.unroute(`**${publicationPath('basic')}`); await page.reload(); await ready();
    });
    }
    await siteTemplateBrowserMatrix({ page, publicPage, context, anonymous, origin, slug, basic, premium, stage, nav, ready, template, publish, draft, publication, screenshot, photoAssets, recordTiming });
    assert.deepEqual(pageErrors, [], 'No uncaught browser exceptions');
    assert.deepEqual(forbiddenRequests, [], 'Site UI must not use a legacy/private global endpoint');
  } finally {
    for (const release of releases) release();
    clearTimeout(deadline); signal?.removeEventListener('abort', abort);
    await persist(); await browser.close();
    console.log(`[publication-browser] evidence ${output}`);
  }
}
