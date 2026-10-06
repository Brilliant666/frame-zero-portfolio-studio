import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';

// Anonymous proof only: never authenticates, provisions accounts or calls a
// business API. The caller owns the independent build/server and its cleanup.
const origin = process.env.ADMIN_DESIGN_ORIGIN;
assert.equal(origin, 'http://127.0.0.1:3006', 'Explicit independent proof origin is required; never fall back to daily 3001');
const repository = await realpath(fileURLToPath(new URL('../', import.meta.url)));
let evidenceDirectory;
if (process.env.ADMIN_DESIGN_EVIDENCE_DIR) {
  evidenceDirectory = resolve(process.env.ADMIN_DESIGN_EVIDENCE_DIR);
  const outside = target => {
    const result = relative(repository, target);
    return result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result);
  };
  assert.ok(outside(evidenceDirectory), 'Evidence must remain outside repository');
  await mkdir(evidenceDirectory, { recursive: true });
  assert.ok(outside(await realpath(evidenceDirectory)), 'Evidence symlinks must not resolve into repository');
}

async function fixture(viewport, run) {
  const browser = await chromium.launch({ headless: true, channel: process.env.FRAME_ZERO_BROWSER_CHANNEL || undefined });
  const context = await browser.newContext({ viewport, isMobile: viewport.width === 390, hasTouch: viewport.width === 390 });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const requests = [], errors = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  const shot = async label => {
    if (!evidenceDirectory) return;
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      // Finite scene enter/hover animations must finish before visual evidence.
      // The two intentionally continuous photo rails keep their real motion.
      const settled = document.getAnimations().every(animation => {
        const end = animation.effect?.getComputedTiming().endTime;
        return !Number.isFinite(end) || !animation.pending && animation.playState !== 'running';
      });
      const scenesVisible = [...document.querySelectorAll('[data-flow-scene] main')].every(main => Number(getComputedStyle(main).opacity) >= .99);
      const visibleImagesReady = [...document.querySelectorAll('img')].every(image => {
        const box = image.getBoundingClientRect();
        const visible = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && getComputedStyle(image).visibility !== 'hidden';
        return !visible || image.complete && image.naturalWidth > 0 && Number(getComputedStyle(image).opacity) >= .99;
      });
      return settled && scenesVisible && visibleImagesReady;
    }, undefined, { timeout: 5000 });
    await page.screenshot({ path: resolve(evidenceDirectory, `${viewport.width}-${label}.png`), fullPage: true });
  };
  try {
    const response = await page.goto(`${origin}/preview/admin-design`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: '图库', exact: true, level: 1 }).waitFor();
    assert.match(await page.locator('body').innerText(), /保存与发布为本页模拟/);
    await run({ page, shot });
    assert.deepEqual(errors, [], 'Candidate must not produce uncaught browser errors');
    for (const request of requests) {
      assert.equal(request.method, 'GET', `No business writes: ${request.method} ${request.url}`);
      if (/^https?:/.test(request.url)) {
        const url = new URL(request.url);
        assert.equal(url.origin, origin, 'Candidate must not request daily runtime or third-party resources');
        assert.ok(!url.pathname.startsWith('/api/'), `No Site/business API request: ${url.pathname}`);
      }
    }
    if (evidenceDirectory) await writeFile(resolve(evidenceDirectory, `${viewport.width}-${run.name || 'scenario'}-network.json`), JSON.stringify({ viewport, requests, errors }, null, 2));
  } catch (error) {
    const failure = `${run.name || 'scenario'}-failure-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await shot(failure);
    if (evidenceDirectory) await writeFile(resolve(evidenceDirectory, `${viewport.width}-${failure}.json`), JSON.stringify({ error: String(error), errors, requests, visibleText: await page.locator('body').innerText(), images: await page.locator('img').evaluateAll(nodes => nodes.map(node => ({ source: node.src, complete: node.complete, width: node.naturalWidth, height: node.naturalHeight }))) }, null, 2));
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

const sortRegion = page => page.getByRole('region', { name: '图集照片排序', exact: true });
const order = page => sortRegion(page).locator('[data-member-id]').evaluateAll(nodes => nodes.map(node => node.dataset.memberId));
async function expectOrder(page, expected) {
  await page.waitForFunction(ids => JSON.stringify([...document.querySelectorAll('[aria-label="图集照片排序"] [data-member-id]')].map(node => node.dataset.memberId)) === JSON.stringify(ids), expected);
  assert.deepEqual(await order(page), expected);
}
async function visibleButton(page, name) {
  const buttons = page.getByRole('button', { name, exact: true });
  for (let i = 0; i < await buttons.count(); i++) if (await buttons.nth(i).isVisible()) return buttons.nth(i);
  throw Error(`No visible button: ${name}`);
}
async function noHorizontalOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Page must fit viewport width');
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px complete anonymous Flow workflow with cancellation and failed publication`, { timeout: 120_000 }, async () => {
    await fixture(viewport, async function flowWorkflow({ page, shot }) {
      await noHorizontalOverflow(page);
      await shot('flow-library');
      await page.getByRole('complementary', { name: '后台模块' }).getByRole('button', { name: /^作品分类/ }).click();
      await page.getByRole('button', { name: '新建作品分类', exact: true }).click();
      const create = page.getByRole('dialog', { name: '新建作品分类', exact: true });
      await create.getByRole('textbox', { name: '作品分类名称', exact: true }).fill(`匿名流程 ${viewport.width}`);
      await create.getByRole('button', { name: '创建并选片', exact: true }).click();
      const picker = page.getByRole('dialog', { name: `为“匿名流程 ${viewport.width}”选片`, exact: true });
      // Deliberately select in an order different from the library order.
      for (const name of ['窗边片刻 03', '温室午后 01', '柔光肖像 02']) await picker.getByRole('button', { name: `选择照片：${name}`, exact: true }).click();
      await picker.getByRole('button', { name: '加入作品分类', exact: true }).click();
      const selected = ['proof-photo-3', 'proof-photo-1', 'proof-photo-2'];
      await expectOrder(page, selected);
      assert.equal(await sortRegion(page).getByRole('checkbox').count(), 0);
      assert.equal(await sortRegion(page).getByRole('combobox').count(), 0);
      await shot('flow-photos');
      await page.getByRole('button', { name: '从图库选片', exact: true }).click();
      await picker.getByRole('button', { name: '选择照片：温室午后 04', exact: true }).click();
      await picker.getByRole('button', { name: '取消', exact: true }).click();
      await expectOrder(page, selected);
      const first = sortRegion(page).locator('[data-member-id="proof-photo-3"]');
      await first.press('End');
      await expectOrder(page, ['proof-photo-1', 'proof-photo-2', 'proof-photo-3']);
      assert.equal(await first.evaluate(node => node === document.activeElement), true, 'Reordering retains member focus');
      await page.getByRole('button', { name: '撤销最近移动', exact: true }).click();
      await expectOrder(page, selected);
      if (viewport.width === 390) {
        const touch = await page.context().newCDPSession(page);
        const source = sortRegion(page).locator('[data-member-id="proof-photo-2"]');
        await source.scrollIntoViewIfNeeded();
        const from = await source.boundingBox(), to = await first.boundingBox();
        assert.ok(from && to);
        const start = { x: from.x + from.width / 2, y: from.y + from.height / 3 };
        const end = { x: to.x + to.width / 4, y: to.y + to.height / 3 };
        for (const point of [start, end]) assert.ok(point.y > 0 && point.y < viewport.height - 80, 'Touch photo points stay clear of fixed mobile save actions');
        try {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
          await page.waitForFunction(() => document.querySelector('[data-member-id="proof-photo-2"]')?.getAttribute('data-dragging') === 'true', undefined, { timeout: 1500 });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await expectOrder(page, ['proof-photo-2', 'proof-photo-3', 'proof-photo-1']);
          assert.equal(await page.getByRole('dialog').count(), 0, 'Long press sorts without opening big-photo dialog');
          await page.getByRole('button', { name: '撤销最近移动', exact: true }).click();
          await expectOrder(page, selected);
        } finally { await touch.detach(); }
      }
      await page.getByRole('button', { name: '下一步：分类与说明', exact: true }).click();
      const captionChoice = page.getByRole('button', { name: '编辑第 2 张照片说明', exact: true });
      await captionChoice.click();
      assert.equal(await captionChoice.getAttribute('aria-pressed'), 'true');
      await page.getByRole('textbox', { name: /照片说明/ }).fill('匿名描述：这张照片的展示说明。');
      assert.equal(await page.getByRole('button', { name: /使用第 .*作为封面/ }).count(), 0, 'Flow candidate has no Polaroid cover controls');
      await page.getByRole('button', { name: '将此照片移出分类', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: /编辑第 .*张照片说明/ }).count(), 2);
      await page.getByRole('button', { name: '撤销移出', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: /编辑第 .*张照片说明/ }).count(), 3);
      await captionChoice.click();
      assert.equal(await page.getByRole('textbox', { name: /照片说明/ }).inputValue(), '匿名描述：这张照片的展示说明。', 'Undo restores removed photo caption');
      await shot('flow-details');
      const nextEffect = page.getByRole('button', { name: '下一步：查看效果', exact: true });
      // Continue the mobile scenario with a native touch after the CDP long
      // press; desktop continues with actual mouse input.
      if (viewport.width === 390) {
        const before = { box: await nextEffect.boundingBox(), layout: await page.evaluate(() => ({ active: document.activeElement?.tagName, scrollY, height: document.documentElement.scrollHeight })) };
        await nextEffect.tap();
        if (evidenceDirectory) await writeFile(resolve(evidenceDirectory, '390-flow-effect-button-input.json'), JSON.stringify({ before, after: await page.evaluate(() => ({ box: [...document.querySelectorAll('button')].find(node => node.textContent?.trim().startsWith('下一步：查看效果'))?.getBoundingClientRect().toJSON() ?? null, layout: { active: document.activeElement?.tagName, scrollY, height: document.documentElement.scrollHeight, step: document.querySelector('[aria-label="作品分类编辑步骤"] [aria-current]')?.textContent } })) }, null, 2));
      }
      else await nextEffect.click();
      await page.getByRole('button', { name: '查看当前分类效果', exact: true }).click();
      const effect = page.getByRole('dialog', { name: '流影视廊 · 当前编辑效果', exact: true });
      const gallery = effect.locator('[data-flow-scene="gallery"]');
      await gallery.waitFor();
      const group = gallery.getByRole('region', { name: `匿名流程 ${viewport.width}`, exact: true });
      assert.equal(await group.getByRole('button', { name: /^查看大图：/ }).count(), 3, 'Real full gallery contains exactly selected photos');
      assert.deepEqual(await group.getByRole('img').evaluateAll(nodes => nodes.map(node => new URL(node.src).pathname.split('/').at(-1))), ['closeup', 'background', 'portrait'], 'Real full gallery preserves selection order');
      await group.getByRole('button', { name: '查看大图：匿名描述：这张照片的展示说明。', exact: true }).click();
      const bigPhoto = effect.getByRole('dialog', { name: '匿名描述：这张照片的展示说明。', exact: true });
      await bigPhoto.waitFor();
      assert.match(await bigPhoto.getByRole('img').getAttribute('src'), /asset\/background\?size=full$/);
      await bigPhoto.getByRole('button', { name: '关闭大图', exact: true }).click();
      await noHorizontalOverflow(page);
      await shot('flow-gallery');
      await effect.getByRole('button', { name: '返回编辑', exact: true }).click();
      await page.getByRole('button', { name: '下一步：配置首页轨道', exact: true }).click();
      await page.getByRole('combobox', { name: '左侧轨道', exact: true }).selectOption({ label: `匿名流程 ${viewport.width}` });
      await page.getByRole('combobox', { name: '右侧轨道', exact: true }).selectOption({ label: '人物与片刻' });
      await page.getByRole('button', { name: '7∶3', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '7∶3', exact: true }).getAttribute('aria-pressed'), 'true');
      const width = page.getByRole('slider', { name: '左轨宽度', exact: true });
      await width.press('Home');
      assert.equal(await width.inputValue(), '30');
      await width.press('End');
      assert.equal(await width.inputValue(), '70');
      await page.getByRole('button', { name: '5∶5', exact: true }).click();
      assert.equal(await width.inputValue(), '50');
      await (await visibleButton(page, '查看首页效果')).click();
      const home = effect.locator('[data-flow-scene="works"]');
      await home.waitFor();
      await home.getByRole('heading', { name: `匿名流程 ${viewport.width}`, exact: true }).waitFor();
      await home.getByRole('heading', { name: '人物与片刻', exact: true }).waitFor();
      assert.match(await home.locator('[aria-label="作品速览"]').getAttribute('style'), /50fr/);
      await shot('flow-home');
      await effect.getByRole('button', { name: '返回编辑', exact: true }).click();
      await (await visibleButton(page, '仅保存草稿')).click();
      await page.getByText('演示草稿 2 已保存，仅在本页生效。', { exact: true }).waitFor();
      await page.getByText('公开 v1 · 当前编辑尚未公开', { exact: true }).waitFor();
      await (await visibleButton(page, '保存并发布')).click();
      await page.getByText('公开 v2 · 与当前编辑一致', { exact: true }).waitFor();
      await page.getByRole('textbox', { name: '首页标题', exact: true }).fill('失败模拟期间的编辑应保留。');
      await page.getByRole('checkbox', { name: '模拟保存失败', exact: true }).check();
      await (await visibleButton(page, '保存并发布')).click();
      await page.getByText('模拟保存失败：编辑保留，可关闭失败模拟后重试。公开版本未改变。', { exact: true }).waitFor();
      await page.getByText('公开 v2 · 当前编辑尚未公开', { exact: true }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: '首页标题', exact: true }).inputValue(), '失败模拟期间的编辑应保留。');
      await page.getByRole('checkbox', { name: '模拟保存失败', exact: true }).uncheck();
      await (await visibleButton(page, '保存并发布')).click();
      await page.getByText('公开 v3 · 与当前编辑一致', { exact: true }).waitFor();
      await noHorizontalOverflow(page);
      await shot('flow-saved-published');
    });
  });
}

test('48 photos support keyboard precise reorder and undo without batch toolbar', { timeout: 90_000 }, async () => {
  await fixture({ width: 1440, height: 900 }, async function longFlowGroup({ page, shot }) {
    await page.getByRole('button', { name: '体验 48 张排序', exact: true }).click();
    const original = Array.from({ length: 48 }, (_, i) => `long-photo-${i}`);
    await expectOrder(page, original);
    const first = sortRegion(page).locator('[data-member-id="long-photo-0"]');
    await first.scrollIntoViewIfNeeded();
    const columns = await sortRegion(page).locator('[data-member-id]').evaluateAll(nodes => {
      const firstTop = nodes[0].getBoundingClientRect().top;
      return nodes.filter(node => Math.abs(node.getBoundingClientRect().top - firstTop) < 2).length;
    });
    assert.ok(columns > 1 && columns < 48, 'Desktop has multiple columns and rows');
    const nextRow = sortRegion(page).locator(`[data-member-id="long-photo-${columns}"]`);
    const from = await nextRow.boundingBox(), to = await first.boundingBox();
    assert.ok(from && to && from.y > to.y, 'Pointer source is in following row');
    for (const box of [from, to]) assert.ok(box.y + box.height / 2 > 0 && box.y + box.height / 2 < 900, 'Real cross-row drag remains inside viewport');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 3);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 4, to.y + to.height / 3, { steps: 12 });
    assert.equal(await first.getAttribute('data-drop-target'), 'true');
    await page.mouse.up();
    await expectOrder(page, [original[columns], ...original.filter((_, i) => i !== columns)]);
    await page.getByRole('button', { name: '撤销最近移动', exact: true }).click();
    await expectOrder(page, original);
    const last = sortRegion(page).locator('[data-member-id="long-photo-47"]');
    await last.press('Home');
    await expectOrder(page, ['long-photo-47', ...original.slice(0, -1)]);
    assert.equal(await last.evaluate(node => node === document.activeElement), true);
    await page.getByRole('button', { name: '撤销最近移动', exact: true }).click();
    await expectOrder(page, original);
    const third = sortRegion(page).locator('[data-member-id="long-photo-2"]');
    await third.press('ArrowRight');
    const moved = [...original]; [moved[2], moved[3]] = [moved[3], moved[2]];
    await expectOrder(page, moved);
    await page.getByRole('button', { name: '撤销最近移动', exact: true }).click();
    await expectOrder(page, original);
    assert.equal(await sortRegion(page).getByRole('checkbox').count(), 0);
    await shot('flow-48-photos');
  });
});

test('browser-local PNG appears in library and invalid file reports failure with no upload request', { timeout: 90_000 }, async () => {
  await fixture({ width: 390, height: 844 }, async function localFlowUpload({ page, shot }) {
    const buffer = await sharp({ create: { width: 72, height: 108, channels: 3, background: '#75917c' } }).png().toBuffer();
    await page.getByLabel('添加本地照片', { exact: true }).setInputFiles([
      { name: 'anonymous-local.png', mimeType: 'image/png', buffer },
      { name: 'unsupported.txt', mimeType: 'text/plain', buffer: Buffer.from('anonymous fixture') },
    ]);
    const results = page.getByRole('region', { name: '图片添加结果', exact: true });
    await results.getByText('anonymous-local.png：已加入候选图库', { exact: true }).waitFor();
    await results.getByText('unsupported.txt：请选择 JPG、PNG 或 WebP 图片', { exact: true }).waitFor();
    const photo = page.getByRole('button', { name: '选择照片：anonymous-local.png', exact: true });
    assert.match(await photo.getByRole('img').getAttribute('src'), /^blob:/);
    await photo.click();
    await page.getByRole('button', { name: '用所选照片新建', exact: true }).click();
    const create = page.getByRole('dialog', { name: '新建作品分类', exact: true });
    await create.getByRole('textbox', { name: '作品分类名称', exact: true }).fill('本地图片测试');
    await create.getByRole('button', { name: '创建并选片', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '为“本地图片测试”选片', exact: true });
    assert.equal(await picker.getByRole('button', { name: '选择照片：anonymous-local.png', exact: true }).getAttribute('aria-pressed'), 'true', 'Library selection carries into new collection');
    await picker.getByRole('button', { name: '加入作品分类', exact: true }).click();
    assert.equal((await order(page)).length, 1);
    await page.getByRole('button', { name: '下一步：分类与说明', exact: true }).click();
    assert.match(await page.getByRole('button', { name: '查看大图：anonymous-local.png', exact: true }).getByRole('img').getAttribute('src'), /^blob:/);
    await page.getByRole('button', { name: '下一步：查看效果', exact: true }).click();
    await page.getByRole('button', { name: '查看当前分类效果', exact: true }).click();
    const effect = page.getByRole('dialog', { name: '流影视廊 · 当前编辑效果', exact: true });
    await effect.locator('[data-flow-scene="gallery"]').waitFor();
    assert.match(await effect.locator('[data-flow-scene="gallery"] main img').first().getAttribute('src'), /^blob:/, 'Local file remains in browser even in real gallery');
    await noHorizontalOverflow(page);
    await shot('flow-local-png');
  });
});
