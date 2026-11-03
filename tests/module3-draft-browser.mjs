import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { chooseOption } from './kit-select-helpers.mjs';
import { keepManualSave, waitForDraftResponse } from './manual-save-browser.mjs';

const SPACE = 'premium-flow-gallery';

// The account harness owns provisioning, grants, the isolated PG, build and server.
// All draft/publication writes below come from actual UI actions. Evidence never
// includes response bodies, credentials, cookies, headers, traces or login images.
export async function module3DraftBrowser({ origin, password, username, outputDir, signal }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  assert.match(username, /^draftlife[a-f0-9]{8}$/);
  await mkdir(outputDir, { recursive: true });
  const browser = keepManualSave(await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined }));
  const report = { checkpoints: [], network: [], screenshots: [] };
  const persist = () => writeFile(join(outputDir, 'acceptance.json'), JSON.stringify(report, null, 2));
  const releases = new Set();
  const abort = () => { for (const release of releases) release(); void browser.close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const overall = setTimeout(abort, 240000);
  const draftPath = (space = SPACE) => `/api/sites/${username}/drafts/${space}`;
  const publicationPath = `/api/sites/${username}/publications/${SPACE}`;
  const field = (page, name = '首页标题') => page.locator('label').filter({ hasText: new RegExp(`^${name}`) }).locator('input, textarea');
  let page;
  async function bounded(promise, label, milliseconds = 15000) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} deadline exceeded`)), milliseconds);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function screenshot(name) {
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    const file = `${name}.png`;
    await page.screenshot({ path: join(outputDir, file), fullPage: false });
    report.screenshots.push({ file, path: new URL(page.url()).pathname });
  }
  async function stage(name, run) {
    signal?.throwIfAborted();
    console.log(`[module3-draft-browser] START ${name}`);
    try {
      await bounded(run(), `Stage ${name}`, 45000);
      report.checkpoints.push({ name, result: 'PASS' });
    } catch (error) {
      // Retain only source coordinates; browser error messages can contain bodies.
      const source = /module3-draft-browser\.mjs:(\d+):(\d+)/.exec(error?.stack ?? '');
      const location = source ? { line: Number(source[1]), column: Number(source[2]) } : undefined;
      report.checkpoints.push({ name, result: 'FAIL', location });
      console.log(`[module3-draft-browser] FAIL ${name} at helper line ${location?.line ?? 'unknown'}`);
      for (const release of releases) release();
      if (page && !page.isClosed() && await page.locator('input[type="password"]').count() === 0) {
        await bounded(screenshot('failure'), 'Failure screenshot', 5000).catch(() => {});
      }
      abort(); // Cancel the old stage before another operation can touch the fixture.
      throw new Error(`Module3 draft acceptance failed at ${name}; see sanitized acceptance.json`);
    } finally { await persist(); }
  }
  const isResponse = (method, path) => response => response.request().method() === method && new URL(response.url()).pathname === path;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(15000);
    const requests = [];
    // Track request attempts separately from HTTP responses, including lost replies.
    // Both lists contain only the sanitized method/path/status allowlist.
    context.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname.startsWith('/api/')) {
        const row = { method: request.method(), path: url.pathname, status: null };
        requests.push({ request, row }); report.network.push(row);
      }
    });
    context.on('response', response => {
      const entry = requests.find(item => item.request === response.request());
      if (entry) entry.row.status = response.status();
    });
    context.on('page', p => p.on('dialog', dialog => {
      if (dialog.type() === 'beforeunload') void dialog.accept();
      else void dialog.dismiss();
    }));
    page = await context.newPage();
    const root = () => page.locator('[data-flow-editor-section]');
    const feedback = () => page.locator('[role="status"][data-feedback="active"]');
    const saveButton = () => page.getByRole('button', { name: '仅保存草稿', exact: true });
    const publishButton = () => page.getByRole('region', { name: '公开发布', exact: true }).getByRole('button', { name: '保存并发布', exact: true });
    const count = (method, path = draftPath()) => report.network.filter(row => row.method === method && row.path === path).length;
    async function read(path = draftPath()) {
      const response = await context.request.get(`${origin}${path}`, { timeout: 15000 });
      // APIRequestContext requests are separate from the UI's request counter.
      report.network.push({ method: 'GET', path, status: response.status(), source: 'verification' });
      assert.equal(response.status(), 200, 'Authoritative fixture read succeeds');
      return bounded(response.json(), 'Fixture read body');
    }
    async function openFlow() {
      await page.goto(`${origin}/${username}/admin/${SPACE}#edit-home`);
      await field(page).waitFor();
      await page.waitForFunction(() => document.querySelector('[data-flow-editor-section]')?.dataset.flowEditorSection === 'home'
        && !document.querySelector('fieldset')?.disabled);
    }
    async function save() {
      const response = await waitForDraftResponse(page, draftPath(), () => saveButton().click());
      assert.equal(response.status(), 200);
      const receipt = await bounded(response.json(), 'Save receipt');
      await saveButton().waitFor();
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      return receipt;
    }
    // Hold a REAL accepted CAS write's response; do not synthesize a success body.
    async function heldPut() {
      let release, complete, written;
      const gate = new Promise(resolve => { release = resolve; });
      const ready = new Promise(resolve => { written = resolve; });
      const finished = new Promise(resolve => { complete = resolve; });
      releases.add(release);
      const handler = async route => {
        if (route.request().method() !== 'PUT') return route.fallback();
        try {
          const response = await route.fetch({ timeout: 15000 });
          assert.equal(response.status(), 200, 'Held CAS write was really accepted');
          written({});
          await bounded(gate, 'Held PUT release');
          // Navigation may cancel response delivery after the real write completed.
          await route.fulfill({ response }).catch(() => {});
        } catch { written({ failed: true }); await route.abort().catch(() => {}); }
        finally { complete(); }
      };
      await page.route(`**${draftPath()}`, handler);
      return {
        ready: async () => assert.equal((await bounded(ready, 'Real CAS PUT')).failed, undefined),
        release: () => { release(); releases.delete(release); },
        finish: async () => { await bounded(finished, 'Held route completion'); await page.unroute(`**${draftPath()}`, handler); },
      };
    }

    await stage('01 Flow manual save and independent spaces', async () => {
      await page.goto(`${origin}/login`);
      await field(page, '用户名').fill(username);
      await field(page, '密码').fill(password);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('link', { name: '进入我的站点后台' }).waitFor();
      await openFlow();
      assert.equal(await page.getByRole('switch', { name: '自动保存草稿', exact: true }).getAttribute('aria-checked'), 'false');
      await field(page, '导航品牌名').fill('Synthetic draft lifecycle');
      await field(page).fill('Flow manual saved');
      const before = count('PUT');
      const receipt = await save();
      assert.equal(receipt.revision, 1);
      assert.equal(receipt.content.profile.title, 'Flow manual saved');
      assert.equal(count('PUT'), before + 1);
      await page.reload();
      await page.locator('nav[aria-label="流影视廊后台模块"] [data-flow-section="home"]').click();
      await field(page).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('label')].find(node => node.firstChild?.textContent === '导航品牌名')?.querySelector('textarea')?.value === 'Synthetic draft lifecycle', undefined, { polling: 100 });
      assert.equal(await field(page).inputValue(), 'Flow manual saved');
      for (const space of ['basic', 'premium-polaroid']) assert.equal((await read(draftPath(space))).revision, 0);
      assert.equal((await read(publicationPath)).current, null);
      await screenshot('01-flow-manual-save');
    });

    await stage('02 delayed real CAS and next Flow edit remain separate', async () => {
      await field(page).fill('Flow submitted before reply');
      const before = count('PUT');
      const held = await heldPut();
      const response = page.waitForResponse(isResponse('PUT', draftPath()));
      void response.catch(() => {});
      try {
        await saveButton().click();
        await held.ready();
        assert.equal(await field(page).isDisabled(), true, 'Flow retains its existing fieldset guard while saving');
        await page.keyboard.press('Control+s');
        await page.keyboard.press('Meta+s');
        assert.equal(count('PUT'), before + 1, 'Busy shortcuts cannot duplicate the pending CAS write');
        assert.equal((await read()).content.profile.title, 'Flow submitted before reply');
        await screenshot('02-flow-pending-save');
      } finally { held.release(); }
      assert.equal((await response).status(), 200);
      await held.finish();
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      assert.equal(await field(page).inputValue(), 'Flow submitted before reply');
      assert.equal(await root().getAttribute('data-flow-dirty'), 'false');
      await field(page).fill('Flow newer unsaved edit');
      assert.equal(await root().getAttribute('data-flow-dirty'), 'true');
      assert.equal((await read()).content.profile.title, 'Flow submitted before reply');
      const receipt = await save();
      assert.equal(receipt.revision, 3);
      assert.equal(receipt.content.profile.title, 'Flow newer unsaved edit');
      await screenshot('02-flow-new-edit-preserved');
    });

    await stage('03 uncertain save checks with GET only and never publishes', async () => {
      await field(page).fill('Flow uncertain committed snapshot');
      const before = count('PUT'), publications = count('POST', publicationPath);
      let blockReads = true, realWrites = 0;
      const handler = async route => {
        if (route.request().method() === 'PUT') {
          realWrites++;
          const response = await route.fetch({ timeout: 15000 });
          assert.equal(response.status(), 200);
          // Lose the acknowledgment after the server committed the real write.
          return route.abort('failed');
        }
        if (route.request().method() === 'GET' && blockReads) return route.abort('failed');
        return route.fallback();
      };
      await page.route(`**${draftPath()}`, handler);
      try {
        await publishButton().click();
        const check = page.getByRole('button', { name: '检查保存结果', exact: true });
        await check.waitFor();
        await page.getByRole('region', { name: '公开发布', exact: true }).getByText(/未取得准确的保存确认/).waitFor();
        assert.equal(realWrites, 1);
        assert.equal(count('PUT'), before + 1);
        assert.equal(count('POST', publicationPath), publications, 'No publication without accurate save confirmation');
        assert.equal(await publishButton().isDisabled(), true);
        assert.equal(await field(page).inputValue(), 'Flow uncertain committed snapshot');
        await field(page).fill('Flow edit while result uncertain');
        // An unsuccessful explicit check also remains GET-only and preserves edits.
        let gets = count('GET');
        await check.click();
        await feedback().filter({ hasText: '结果仍待确认' }).waitFor();
        assert.equal(count('GET'), gets + 1);
        assert.equal(count('PUT'), before + 1);
        assert.equal(await field(page).inputValue(), 'Flow edit while result uncertain');
        await screenshot('03-flow-uncertain-no-publish');
        blockReads = false;
        gets = count('GET');
        await Promise.all([page.waitForResponse(isResponse('GET', draftPath())), check.click()]);
        await feedback().filter({ hasText: '已确认草稿保存结果' }).waitFor();
        assert.equal(count('GET'), gets + 1);
        assert.equal(count('PUT'), before + 1, 'Read-only confirmation cannot replay PUT');
        assert.equal(realWrites, 1);
        assert.equal(await check.count(), 0);
        assert.equal(await field(page).inputValue(), 'Flow edit while result uncertain');
        assert.equal(await root().getAttribute('data-flow-dirty'), 'true');
        const receipt = await read();
        assert.equal(receipt.revision, 4);
        assert.equal(receipt.content.profile.title, 'Flow uncertain committed snapshot');
        assert.equal((await read(publicationPath)).current, null);
        assert.equal(count('POST', publicationPath), publications, 'Confirmation cannot resume an abandoned publish');
      } finally { await page.unroute(`**${draftPath()}`, handler); }
    });

    await stage('04 publish waits for accurate real save receipt', async () => {
      const before = count('PUT'), publications = count('POST', publicationPath);
      const held = await heldPut();
      const published = page.waitForResponse(isResponse('POST', publicationPath));
      void published.catch(() => {});
      try {
        await publishButton().click();
        await held.ready();
        assert.equal(count('POST', publicationPath), publications);
        assert.equal((await read(publicationPath)).current, null);
        assert.equal(await page.getByRole('region', { name: '公开发布', exact: true }).getByRole('button', { name: '正在处理…', exact: true }).isDisabled(), true);
      } finally { held.release(); }
      assert.equal((await published).status(), 200);
      await held.finish();
      await page.getByRole('region', { name: '公开发布', exact: true }).getByRole('status').filter({ hasText: '发布成功' }).waitFor();
      assert.equal(count('PUT'), before + 1);
      assert.equal(count('POST', publicationPath), publications + 1);
      const receipt = await read(), publication = (await read(publicationPath)).current;
      assert.equal(receipt.content.profile.title, 'Flow edit while result uncertain');
      assert.equal(publication.space, SPACE);
      assert.equal(publication.draftRevision, receipt.revision);
      await screenshot('04-confirmed-save-then-publish');
    });

    await stage('05 switch space during pending PUT ignores old response', async () => {
      const basicBefore = await read(draftPath('basic'));
      const publicationBefore = (await read(publicationPath)).current;
      await field(page).fill('Flow old response cannot enter basic');
      const held = await heldPut();
      let acceptedLeave = false;
      const confirm = dialog => { if (dialog.type() === 'confirm') { acceptedLeave = true; void dialog.accept(); } };
      // Replace the default dismiss handler only for the explicit UI space switch.
      page.removeAllListeners('dialog');
      page.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.accept(); else confirm(dialog); });
      try {
        await saveButton().click();
        await held.ready();
        await chooseOption(page.getByRole('combobox', { name: '切换编辑的模板', exact: true }), 'basic');
        await field(page, '摄影师名称').waitFor();
        await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
        assert.equal(acceptedLeave, true, 'The explicit leave confirmation was exercised');
        assert.equal(await field(page, '摄影师名称').inputValue(), '');
        await field(page, '摄影师名称').fill('Basic new session unsaved edit');
      } finally { held.release(); }
      await held.finish();
      assert.equal(await field(page, '摄影师名称').inputValue(), 'Basic new session unsaved edit');
      assert.deepEqual(await read(draftPath('basic')), basicBefore);
      assert.equal(count('PUT', draftPath('basic')), 0);
      assert.equal((await read()).content.profile.title, 'Flow old response cannot enter basic');
      const publicationAfter = (await read(publicationPath)).current;
      for (const key of ['id', 'space', 'templateId', 'draftRevision', 'publishedAt']) assert.equal(publicationAfter[key], publicationBefore[key]);
      assert.equal(publicationAfter.matchedDraftRevision, null, 'A newer independent draft no longer matches the unchanged public snapshot');
      await screenshot('05-basic-after-old-flow-response');
      // Return through the actual switcher; the abandoned response is not carried back.
      await chooseOption(page.getByRole('combobox', { name: '切换编辑的模板', exact: true }), SPACE);
      await page.locator('nav[aria-label="流影视廊后台模块"] [data-flow-section="home"]').click();
      await field(page).waitFor();
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      assert.equal(await field(page).inputValue(), 'Flow old response cannot enter basic');
      assert.equal(await root().getAttribute('data-flow-dirty'), 'false');
    });
  } finally {
    clearTimeout(overall);
    signal?.removeEventListener('abort', abort);
    for (const release of releases) release();
    await browser.close().catch(() => {});
    await persist();
  }
}
