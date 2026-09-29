import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { exerciseCollectionOrder } from './site-collection-order-browser.mjs';
import { provisionAccount } from '../db/accounts/provision.mjs';

// Fixture writes are restricted to the dedicated integration database and its
// temporary asset directory. Browser saves use the actual UI and HTTP handlers.
export async function sitePhotoPickerBrowserSmoke({ runtime, origin, password, assetRoot, signal }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  assert.equal((await runtime.pool.query('SELECT current_database() AS name')).rows[0].name, 'frame_zero_accounts_test');
  assert.match(basename(assetRoot), /^site-assets-integration-/);
  const slug = 'pickerfixture';
  await provisionAccount(runtime, { username: slug, slug, email: `${slug}@accounts.example`, password, premium: true });
  const siteId = (await runtime.pool.query('SELECT id FROM sites WHERE slug=$1', [slug])).rows[0].id;
  const groups = [];
  for (const [width, height, background] of [[90, 60, '#557799'], [60, 90, '#668866'], [70, 70, '#aa8855']]) {
    const id = randomUUID(), bytes = await sharp({ create: { width, height, channels: 3, background } }).webp().toBuffer();
    await mkdir(join(assetRoot, siteId, id), { recursive: true });
    const variants = {};
    for (const name of ['thumbnail', 'card', 'full']) {
      await writeFile(join(assetRoot, siteId, id, `${name}.webp`), bytes);
      variants[name] = { key: `${siteId}/${id}/${name}.webp`, width, height, bytes: bytes.length, type: 'image/webp' };
    }
    groups.push({ width, height, variants });
  }
  for (let index = 0; index < 500; index++) {
    const group = groups[index % groups.length];
    await runtime.pool.query(`INSERT INTO site_assets(id,site_id,digest,original_type,width,height,variants,created_at)
      VALUES($1,$2,$3,'image/webp',$4,$5,$6::jsonb,$7)`, [randomUUID(), siteId,
      createHash('sha256').update(`anonymous-picker-fixture-${index}`).digest('hex'), group.width, group.height,
      JSON.stringify(group.variants), new Date(Date.UTC(2026, 0, 1) + Math.floor(index / 3) * 1000)]);
  }
  const output = join(process.cwd(), 'outputs', 'site-editor-browser', 'photo-picker');
  await mkdir(output, { recursive: true });
  const checkpoints = [], screenshots = [];
  const browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  async function openSettings() {
    await page.getByRole('button', { name: '图集设置', exact: true }).click();
  }
  const abort = () => { void browser.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  const endpoint = `/api/sites/${slug}/drafts/premium-polaroid`;
  const picker = page.getByRole('dialog', { name: '从本站图库选片', exact: true });
  const checkboxes = () => picker.getByRole('checkbox', { name: /^选择照片 / });
  const idsOnPage = () => checkboxes().evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').replace('选择照片 ', '')));
  const open = () => page.getByRole('button', { name: '从本站图库选片', exact: true }).click();
  const read = async (space = 'premium-polaroid') => {
    const response = await context.request.get(`${origin}/api/sites/${slug}/drafts/${space}`);
    assert.equal(response.status(), 200); return response.json();
  };
  const save = async (status = 200) => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'PUT');
    await page.getByRole('button', { name: '仅保存草稿', exact: true }).click();
    const response = await pending; assert.equal(response.status(), status);
    // The real status, rendered conflict and retained draft are asserted below.
    // As in the existing editor smoke, do not wait on the browser's error-body
    // stream; the HTTP integration suite covers its JSON contract.
    if (status !== 200) return null;
    let timeout;
    try {
      return await Promise.race([response.json(), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Picker save JSON body timed out after 15 seconds')), 15000);
      })]);
    } finally { clearTimeout(timeout); }
  };
  const shot = async name => {
    assert.equal(await page.locator('input[type=password]').count(), 0);
    const file = `${name}-${page.viewportSize().width}.png`;
    await page.screenshot({ path: join(output, file) }); screenshots.push(file);
  };
  const step = async (name, run) => {
    console.log(`[picker-browser] START ${name}`);
    try { await run(); checkpoints.push({ name, result: 'PASS' }); }
    catch (error) { checkpoints.push({ name, result: 'FAIL', error: String(error.message).split(password).join('[redacted]') }); throw error; }
  };
  let basicBefore, publishedBefore, assets, selected, saved;
  try {
    await step('real login and 500 photo fixture', async () => {
      await page.goto(`${origin}/login`);
      await page.getByLabel('用户名', { exact: true }).fill(slug);
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('link', { name: '进入我的站点后台' }).waitFor();
      basicBefore = await read('basic');
      publishedBefore = (await runtime.pool.query('SELECT * FROM site_publications WHERE site_id=$1', [siteId])).rows;
      assets = (await (await context.request.get(`${origin}/api/sites/${slug}/assets`)).json()).assets;
      assert.equal(assets.length, 500);
      await page.goto(`${origin}/${slug}/admin/premium-polaroid`);
      await page.getByRole('button', { name: '图集管理', exact: true }).click();
      await page.getByRole('button', { name: '新建图集', exact: true }).click();
      await openSettings();
      await page.getByLabel('图集名称', { exact: true }).fill('Anonymous picker collection');
      await open();
      await picker.waitFor();
      assert.equal(await checkboxes().count(), 48);
      await picker.getByText('第 1 / 11 页 · 500 张匹配', { exact: true }).waitFor();
      const firstId = (await idsOnPage())[0];
      const enlarge = picker.getByRole('button', { name: `放大照片 ${firstId}`, exact: true });
      await enlarge.click();
      await picker.getByRole('button', { name: '关闭放大照片', exact: true }).waitFor();
      await page.keyboard.press('Tab');
      assert.equal(await picker.locator('[inert]').evaluateAll(nodes => nodes.some(node => node.contains(document.activeElement))), false, 'Enlarged photo excludes background controls from keyboard focus');
      await page.keyboard.press('Escape');
      await picker.getByRole('button', { name: '关闭放大照片', exact: true }).waitFor({ state: 'hidden' });
      await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label, `放大照片 ${firstId}`);
      assert.equal(await enlarge.evaluate(node => node === document.activeElement), true, 'Escape restores enlargement trigger focus');
      await page.keyboard.press('Tab');
      assert.equal(await picker.evaluate(node => node.contains(document.activeElement)), true, 'Keyboard focus stays in picker');
      await shot('picker-desktop');
    });
    await step('stable sorting, cross-page selections, direction filter and cancel', async () => {
      const ordered = [...assets].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      assert.deepEqual(await idsOnPage(), ordered.slice(0, 48).map(asset => asset.id));
      const first = ordered[0].id;
      await picker.getByRole('checkbox', { name: `选择照片 ${first}`, exact: true }).check();
      await picker.getByRole('button', { name: '下一页', exact: true }).click();
      const second = (await idsOnPage())[0];
      await picker.getByRole('checkbox', { name: `选择照片 ${second}`, exact: true }).check();
      await picker.getByLabel('照片方向', { exact: true }).selectOption('portrait');
      assert.ok((await idsOnPage()).every(id => assets.find(asset => asset.id === id).orientation === 'portrait'));
      await picker.getByLabel('加入本站时间', { exact: true }).selectOption('oldest');
      await picker.getByRole('button', { name: '查看已选', exact: true }).click();
      assert.equal(await picker.getByLabel('照片方向', { exact: true }).isDisabled(), true);
      assert.deepEqual(await idsOnPage(), [first, second]);
      page.once('dialog', dialog => dialog.accept());
      await picker.getByRole('button', { name: '取消选片', exact: true }).click();
      await picker.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '编辑照片', exact: true }).click();
      await page.getByText('图集还没有照片，请从本站图库选片。', { exact: true }).waitFor();
      assert.equal(await page.locator('[data-member-id]').count(), 0);
      await open();
      assert.equal(await checkboxes().evaluateAll(nodes => nodes.filter(node => node.checked).length), 0);
      await picker.getByRole('button', { name: '选择本页可加入照片', exact: true }).click();
      assert.equal(await checkboxes().evaluateAll(nodes => nodes.filter(node => node.checked).length), 48);
      await picker.getByRole('button', { name: '清空选择', exact: true }).click();
      assert.equal(await checkboxes().evaluateAll(nodes => nodes.filter(node => node.checked).length), 0);
      selected = (await idsOnPage()).slice(0, 2);
      for (const id of selected) await picker.getByRole('checkbox', { name: `选择照片 ${id}`, exact: true }).check();
      await picker.getByRole('button', { name: '下一页', exact: true }).click();
      selected.push((await idsOnPage())[0]);
      await picker.getByRole('checkbox', { name: `选择照片 ${selected[2]}`, exact: true }).check();
      // Deliberate transport fault injection; the recovery is a real GET.
      const assetUrl = `${origin}/api/sites/${slug}/assets`;
      await page.route(assetUrl, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated read failure' }) }), { times: 1 });
      const failure = page.waitForResponse(response => response.url() === assetUrl && response.status() === 503);
      await picker.getByRole('button', { name: '重新读取素材', exact: true }).click();
      await failure;
      await picker.getByRole('status').filter({ hasText: /失败|不可用|Simulated/ }).waitFor();
      assert.ok((await checkboxes().evaluateAll(nodes => nodes.map(node => node.disabled))).every(Boolean));
      assert.equal(await picker.getByRole('button', { name: '加入当前图集（3 张）', exact: true }).isDisabled(), true);
      await page.unroute(assetUrl);
      const recovery = page.waitForResponse(response => response.url() === assetUrl && response.status() === 200);
      await picker.getByRole('button', { name: '重新读取素材', exact: true }).click();
      await recovery;
      await picker.getByRole('button', { name: '查看已选', exact: true }).click();
      assert.deepEqual((await idsOnPage()).sort(), [...selected].sort());
      await picker.getByRole('button', { name: '加入当前图集（3 张）', exact: true }).click();
      await picker.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '编辑照片', exact: true }).click();
      assert.equal(await page.locator('[data-member-id]').count(), 3);
    });
    await step('real drag / keyboard / cancel / live composition / explicit draft save', async () => {
      ({ selected, saved } = await exerciseCollectionOrder({ page, selected, read, save, shot,
        published: async () => (await runtime.pool.query('SELECT * FROM site_publications WHERE site_id=$1', [siteId])).rows }));
      await page.reload();
      await page.getByRole('button', { name: '图集管理', exact: true }).click();
      assert.deepEqual((await read()).content.collections[0].assetIds, selected);
    });
    await step('mobile picker 390 and 320 with no page or dialog overflow', async () => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 }); await open();
        await picker.getByLabel('图集关系', { exact: true }).selectOption('all');
        for (const id of selected) {
          await picker.getByLabel('按素材 ID 查找', { exact: true }).fill(id);
          assert.equal(await picker.getByRole('checkbox', { name: `选择照片 ${id}`, exact: true }).isDisabled(), true);
        }
        await picker.getByLabel('按素材 ID 查找', { exact: true }).fill('');
        await shot('picker');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Page overflow at ${width}`);
        assert.equal(await picker.evaluate(node => node.scrollWidth > node.clientWidth + 2), false, `Dialog overflow at ${width}`);
        await picker.getByRole('button', { name: '取消选片', exact: true }).click();
      }
    });
    await step('real 409 retains editing, basic draft and Published pointer unchanged', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const otherSave = await context.request.put(`${origin}${endpoint}`, { headers: { origin }, data: { content: saved.content, expectedRevision: saved.revision } });
      assert.equal(otherSave.status(), 200);
      await openSettings();
      await page.getByLabel('图集名称', { exact: true }).fill('Unsaved conflict retained');
      await save(409);
      await page.getByText(/版本冲突：其他标签页已保存新版本/).waitFor();
      assert.equal(await page.getByLabel('图集名称', { exact: true }).inputValue(), 'Unsaved conflict retained');
      await page.getByRole('button', { name: '编辑照片', exact: true }).click();
      assert.equal(await page.locator('[data-member-id]').count(), 3);
      assert.deepEqual((await read()).content.collections[0].assetIds, selected);
      assert.equal((await read()).content.collections[0].name, 'Anonymous picker collection');
      assert.deepEqual(await read('basic'), basicBefore);
      assert.deepEqual((await runtime.pool.query('SELECT * FROM site_publications WHERE site_id=$1', [siteId])).rows, publishedBefore);
      await shot('conflict');
    });
  } finally {
    await writeFile(join(output, 'acceptance.json'), JSON.stringify({ fixture: '500 anonymous synthetic assets / isolated PostgreSQL / port 3004', publicationBoundary: 'initially empty Published pointer remains empty; nonempty pointers covered by existing publication integration', injectedFault: 'one browser asset-list GET returns simulated 503, followed by real retry', checkpoints, screenshots }, null, 2));
    signal?.removeEventListener('abort', abort); await browser.close();
  }
}
