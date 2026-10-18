import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';

// Auto-save and the live preview, in a real browser against the isolated test database.
// The other browser suites switch auto-save off (manual-save-browser.mjs); this one keeps the default.
export async function adminAutosaveBrowser({ origin, password, username, signal }) {
  assert.equal(origin, 'http://127.0.0.1:3004');
  const browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
  const abort = () => void browser.close().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  const draftPath = space => `/api/sites/${username}/drafts/${space}`;
  const field = (p, label) => p.getByLabel(label, { exact: true }).first();
  async function login(p) {
    await p.goto(`${origin}/login`);
    await field(p, '用户名').fill(username);
    await field(p, '密码').fill(password);
    await p.getByRole('button', { name: '登录', exact: true }).click();
    await p.getByRole('link', { name: '进入我的站点后台' }).waitFor();
  }
  function recordPuts(p, space) {
    const puts = [];
    p.on('response', response => {
      if (response.request().method() === 'PUT' && new URL(response.url()).pathname === draftPath(space)) puts.push(response.status());
    });
    return puts;
  }
  async function openPolaroidProfile(p) {
    await p.goto(`${origin}/${username}/admin/premium-polaroid`);
    await p.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
    await p.getByRole('button', { name: '主页资料', exact: true }).click();
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await login(page);

    // 1. Default on: an edit saves itself after the pause, through the editor's guarded save.
    let puts = recordPuts(page, 'premium-polaroid');
    await openPolaroidProfile(page);
    const toggle = page.getByRole('switch', { name: '自动保存草稿', exact: true });
    assert.equal(await toggle.getAttribute('aria-checked'), 'true', 'Auto-save is on by default');
    await field(page, '摄影师名称').fill('Autosaved photographer');
    await page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === draftPath('premium-polaroid'), { timeout: 8000 });
    await page.locator('[data-workbench-bar]').getByText('草稿已保存').waitFor();
    assert.deepEqual(puts, [200], 'Exactly one save for one pause in typing');
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
    await page.getByRole('button', { name: '主页资料', exact: true }).click();
    assert.equal(await field(page, '摄影师名称').inputValue(), 'Autosaved photographer', 'The auto-saved draft is the persisted draft');

    // 2. The switch turns it off for this browser; manual save still works.
    puts = recordPuts(page, 'premium-polaroid');
    await page.getByRole('switch', { name: '自动保存草稿', exact: true }).click();
    assert.equal(await page.getByRole('switch', { name: '自动保存草稿', exact: true }).getAttribute('aria-checked'), 'false');
    await field(page, '摄影师名称').fill('Manual only photographer');
    await page.waitForTimeout(3500);
    assert.deepEqual(puts, [], 'No save while auto-save is off');
    await page.locator('[data-workbench-bar]').getByText('有未保存修改').waitFor();

    // 3. Live preview renders the unsaved in-memory draft with the real template.
    // Wide screens open the pane by default; open it explicitly otherwise.
    const liveToggle = page.getByRole('button', { name: '实时预览', exact: true });
    if (await liveToggle.getAttribute('aria-pressed') !== 'true') await liveToggle.click();
    const pane = page.getByRole('complementary', { name: '星轨实时预览' });
    await pane.waitFor();
    const frame = page.frameLocator('iframe[title="星轨实时预览"]');
    await frame.getByText('Manual only photographer').first().waitFor({ timeout: 15000 });
    await field(page, '摄影师名称').fill('Live preview photographer');
    await frame.getByText('Live preview photographer').first().waitFor({ timeout: 5000 });
    assert.deepEqual(puts, [], 'The live preview never saves');
    await pane.getByRole('radio', { name: '手机', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('iframe[title="星轨实时预览"]')?.contentWindow?.innerWidth === 390);
    await page.getByRole('button', { name: '仅保存草稿', exact: true }).click();
    await page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === draftPath('premium-polaroid'));
    await page.getByRole('switch', { name: '自动保存草稿', exact: true }).click();

    // 3b. A photo uploaded after the preview opened appears in it: the frame reads the asset list again.
    await pane.getByRole('radio', { name: '桌面', exact: true }).click();
    const assetsUrl = `${origin}/api/sites/${username}/assets`;
    const known = new Set((await (await context.request.get(assetsUrl)).json()).assets.map(asset => asset.id));
    await page.getByRole('button', { name: '图集', exact: true }).click();
    await page.getByRole('button', { name: '新建图集', exact: true }).click();
    const creation = page.getByRole('dialog', { name: '新建图集', exact: true });
    await creation.getByLabel('图集名称', { exact: true }).fill('Live preview album');
    await creation.getByRole('button', { name: '创建并选片', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
    await picker.getByRole('button', { name: '上传照片', exact: true }).click();
    const uploader = page.getByRole('dialog', { name: '上传照片到本站图库', exact: true });
    await uploader.getByLabel('选择要上传的照片', { exact: true }).setInputFiles({ name: 'live-preview-upload.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 160, height: 120, channels: 3, background: '#4a7d9c' } }).png().toBuffer() });
    await uploader.getByRole('button', { name: '开始上传（1 张）', exact: true }).click();
    await picker.waitFor({ state: 'hidden', timeout: 20000 });
    const uploaded = (await (await context.request.get(assetsUrl)).json()).assets.filter(asset => !known.has(asset.id)).map(asset => asset.id);
    assert.equal(uploaded.length, 1, 'One new Site photo');
    const previewFrame = page.frame({ url: url => url.pathname.endsWith('/admin/live/premium-polaroid') });
    assert.ok(previewFrame, 'The live preview frame is open');
    await previewFrame.waitForFunction(id => [...document.images].some(image => (image.currentSrc || image.src).includes(id))
      || [...document.querySelectorAll('[style*="url("]')].some(node => node.getAttribute('style').includes(id)), uploaded[0], { timeout: 15000 });

    // 4. The basic editor auto-saves too.
    const basicPuts = recordPuts(page, 'basic');
    await page.goto(`${origin}/${username}/admin/basic/profile`);
    await page.waitForFunction(() => document.querySelector('[data-workbench-bar]'));
    await field(page, '摄影师名称').waitFor();
    await field(page, '摄影师名称').fill('Basic autosaved photographer');
    await page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === draftPath('basic'), { timeout: 8000 });
    assert.deepEqual(basicPuts, [200]);

    // 5. A stale tab's auto-save meets the version check: one refused attempt, a visible conflict, no loop.
    const stale = await context.newPage();
    await openPolaroidProfile(stale);
    await openPolaroidProfile(page);
    await field(page, '摄影师名称').fill('Newer tab photographer');
    await page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === draftPath('premium-polaroid'), { timeout: 8000 });
    const stalePuts = recordPuts(stale, 'premium-polaroid');
    await field(stale, '摄影师名称').fill('Stale tab photographer');
    await stale.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === draftPath('premium-polaroid'), { timeout: 8000 });
    await stale.getByText(/版本冲突/).first().waitFor();
    await stale.waitForTimeout(4000);
    assert.deepEqual(stalePuts, [409], 'A refused save is not retried automatically');
    assert.equal(await field(stale, '摄影师名称').inputValue(), 'Stale tab photographer', 'The stale tab keeps its edit');
    const saved = await (await context.request.get(`${origin}${draftPath('premium-polaroid')}`)).json();
    assert.equal(saved.content.profile.photographer, 'Newer tab photographer', 'The newer draft is never overwritten');
    await context.close();
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser.close().catch(() => {});
  }
}
