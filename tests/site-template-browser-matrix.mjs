import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Open the actual disclosure before editing; never force visibility or bypass UI.
async function expandControl(page, control) {
  const disclosure = page.locator('details').filter({ has: control }).last();
  if (await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').click();
  await control.waitFor({ state: 'visible' });
}

// Imported only by the isolated publication browser fixture. Every template is
// selected and published through its actual editor; reads verify the result.
export async function siteTemplateBrowserMatrix({ page, publicPage, context, origin, slug, basic, premium, stage, nav, ready, template, publish, draft, publication, screenshot, recordTiming }) {
  const source = await readFile(new URL('../app/templates/catalog.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { templateCatalog } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  assert.equal(templateCatalog.length, 11);
  const startIndex = process.env.FRAME_ZERO_PUBLICATION_MATRIX_FROM ? templateCatalog.findIndex(item => item.id === process.env.FRAME_ZERO_PUBLICATION_MATRIX_FROM) : 0;
  assert.ok(startIndex >= 0, 'Diagnostic starting template must exist in the real catalog');
  const savedPage = await context.newPage();
  const currentDialog = () => page.locator('[data-admin-draft-preview-dialog="true"]');
  async function noOverflow(p, label) {
    const size = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(size.scroll <= size.width + 2, `${label}: page overflow ${size.scroll}/${size.width}`);
  }
  async function loadedPhotos(root) {
    const image = root.locator('img[src*="/assets/"]').first();
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => element.complete && element.naturalWidth > 0 ? Promise.resolve() : new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Visible Site photo failed to load')), 10000);
      element.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      element.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Visible Site photo returned an error')); }, { once: true });
    }));
  }
  async function contact(root, id, width, accountLabel = 'Fixture contact') {
    if (id === 'archive-os') {
      await root.locator('#archive-booking').scrollIntoViewIfNeeded();
    } else if (id === 'manga-panels') {
      await root.locator('nav a[href="#manga-booking"]').click();
    } else {
      await root.getByRole('link', { name: '联系约拍', exact: true }).first().click();
    }
    const account = root.getByRole('link', { name: new RegExp(`打开${accountLabel}主页`) });
    await account.waitFor();
    assert.equal(await account.getAttribute('href'), 'https://example.com/fixture');
    const card = root.getByRole('group', { name: `${accountLabel}分享卡片`, exact: true }).locator('img');
    await card.scrollIntoViewIfNeeded();
    await loadedPhotos(root.getByRole('group', { name: `${accountLabel}分享卡片`, exact: true }));
    const image = await card.evaluate(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { naturalRatio: element.naturalWidth / element.naturalHeight, renderedRatio: rect.width / rect.height, filter: style.filter, fit: style.objectFit, width: rect.width };
    });
    assert.ok(Math.abs(image.naturalRatio - image.renderedRatio) < .02, `${id}/${width} card keeps its complete natural ratio`);
    assert.equal(image.filter, 'none'); assert.notEqual(image.fit, 'cover');
    assert.ok(image.width > 0);
    const cardLayout = await root.getByRole('link', { name: `打开${accountLabel}分享卡片原图`, exact: true }).evaluate(element => {
      const caption = element.querySelector('span');
      const picture = element.querySelector('img');
      const captionBox = caption.getBoundingClientRect(), pictureBox = picture.getBoundingClientRect();
      return { display: getComputedStyle(element).display, captionWidth: captionBox.width, fontSize: parseFloat(getComputedStyle(caption).fontSize), captionTop: captionBox.top, pictureBottom: pictureBox.bottom };
    });
    assert.equal(cardLayout.display, 'grid', `${id}/${width} contact card layout must retain its shared component styles`);
    assert.ok(cardLayout.captionWidth >= cardLayout.fontSize * 4, `${id}/${width} original-image caption must have room for a readable line`);
    assert.ok(cardLayout.captionTop >= cardLayout.pictureBottom - 2, `${id}/${width} original-image caption stays below the complete card`);
    assert.equal(await root.locator('a[href="mailto:"]').count(), 0, 'An empty email must not produce a dead contact link');
    assert.equal(await root.getByRole('button', { name: '复制微信号', exact: true }).count(), 0, 'An empty WeChat account must not produce a copy action');
  }
  async function lightbox(p, root, id, width) {
    if (id === 'archive-os' && width < 700) await root.locator('[aria-label="移动端档案导航"]').getByRole('button', { name: /检查器/ }).click();
    const triggers = {
      'cinematic-light': 'button[data-cinematic-photo-role="archive"]',
      'neon-hud': 'button[aria-label^="打开作品 "]',
      'film-rail': 'button[aria-label^="查看主视觉作品 "]',
      'manga-panels': 'button[aria-label^="查看封面作品 "]',
      'prism-liquid': 'button[aria-label^="打开作品 "]',
      'orbital-portal': 'button[aria-label^="打开作品 "]',
      'archive-os': 'button[aria-label^="Quick Look "]',
      'editorial-duet': 'button[aria-label^="打开封面作品 "]',
      'polaroid-field': 'button[aria-label^="打开作品 "]',
      'character-select': 'button[aria-label$=" 完整作品"]',
      'museum-depth': 'button[aria-label^="查看展览主视觉 "]',
    };
    const trigger = root.locator(triggers[id]).first();
    await trigger.scrollIntoViewIfNeeded(); await trigger.click();
    const box = p.locator('.lightbox[role="dialog"]').last();
    await box.waitFor(); await loadedPhotos(box);
    const bounds = await box.evaluate(element => {
      const rectangle = element.getBoundingClientRect();
      const port = element.closest('[data-preview-scrollport]') ?? document.querySelector('[data-site-preview-canvas]');
      const viewport = port?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
      return { top: rectangle.top, bottom: rectangle.bottom, min: viewport.top, max: viewport.bottom };
    });
    assert.ok(bounds.top >= bounds.min - 2 && bounds.bottom <= bounds.max + 2, `${id}/${width} lightbox stays in the work viewport`);
    await box.getByRole('button', { name: /^(CLOSE|关闭) ×$/ }).click();
    await box.waitFor({ state: 'detached' });
    await p.waitForFunction(element => document.activeElement === element, await trigger.elementHandle());
    if (id === 'archive-os' && width < 700) await root.locator('[aria-label="移动端档案导航"]').getByRole('button', { name: /档案/ }).click();
  }
  async function inspect(p, id, width, label) {
    const root = p.locator(`[data-template="${id}"]`);
    await root.waitFor();
    await loadedPhotos(root);
    await lightbox(p, root, id, width);
    await contact(root, id, width);
    await noOverflow(p, `${label}-${id}-${width}`);
    await screenshot(p, `${label}-${id}-contact`);
    const theme = await p.evaluate(() => ({ premium: document.documentElement.dataset.publicPortfolio, locked: document.body.classList.contains('is-locked') }));
    assert.equal(theme.premium, undefined, 'Basic view must not retain the premium document theme');
    assert.equal(theme.locked, false, 'A normal page must not keep a closed dialog scroll lock');
    if (await p.locator('[data-site-preview-notice]').count()) {
      const banner = await p.locator('[data-site-preview-notice]').boundingBox();
      const canvas = await p.locator('[data-site-preview-canvas]').boundingBox();
      assert.ok(banner && canvas && banner.y + banner.height <= canvas.y + 2, 'Saved preview banner must not overlap work viewport');
    }
  }
  try {
    for (const definition of templateCatalog.slice(startIndex)) {
      const id = definition.id;
      await stage(`matrix ${id}: UI publish, current/saved/public, 1440 and 390`, async () => {
        const preparationStarted = Date.now();
        await page.bringToFront();
        await page.setViewportSize({ width: 1440, height: 900 });
        await template(id);
        // Cinematic's slot 0 is a non-interactive hero. Populate two real slots
        // so the gallery as well as the hero has a photo to inspect.
        for (const index of [0, 1]) {
          await page.getByRole('group', { name: '模板照片槽位', exact: true }).getByRole('button').nth(index).click();
          const choice = page.locator('[class*="assetCard"]:not([data-selected="true"]) button:not([disabled])').filter({ has: page.locator('img[src*="/api/sites/"]') }).first();
          await choice.waitFor(); await choice.click();
        }
        await publish();
        const saved = await draft(), pointer = (await publication()).current.id;
        assert.equal(saved.content.activeTemplate, id);
        assert.ok(saved.content.templateWorks[id].length >= 2);
        recordTiming(`${id}/UI-prepare-and-publish`, preparationStarted);
        const widths = ['cinematic-light', 'archive-os', 'polaroid-field'].includes(id) ? [1440, 390, 320] : [1440, 390];
        for (const width of widths) {
          const currentStarted = Date.now();
          console.log(`[publication-browser] VIEW ${id} ${width} current/saved/public`);
          let actionStarted = Date.now();
          // Inspect the active tab, as a user would. Background-tab rAF throttling
          // otherwise turns each Playwright stability check into seconds.
          await page.bringToFront();
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
          await page.getByRole('button', { name: '预览当前编辑', exact: true }).click();
          await currentDialog().waitFor();
          assert.equal(await currentDialog().evaluate(element => Boolean(element.parentElement?.closest('[data-site-editor], nav, [class*="workspaceContext"]'))), false, 'Current preview must be isolated from editor navigation descendant styles');
          const currentRoot = currentDialog().locator(`[data-template="${id}"]`);
          await currentRoot.waitFor();
          recordTiming(`${id}/${width}/current-open/${await page.evaluate(() => document.visibilityState)}`, actionStarted);
          actionStarted = Date.now();
          await loadedPhotos(currentRoot);
          recordTiming(`${id}/${width}/current-initial-image`, actionStarted);
          actionStarted = Date.now();
          await lightbox(page, currentRoot, id, width);
          recordTiming(`${id}/${width}/current-lightbox-and-focus`, actionStarted);
          actionStarted = Date.now();
          await contact(currentRoot, id, width);
          recordTiming(`${id}/${width}/current-contact`, actionStarted);
          await screenshot(page, `current-${id}-contact`);
          await currentDialog().getByRole('button', { name: '退出预览 ×', exact: true }).click();
          await currentDialog().waitFor({ state: 'detached' });
          assert.deepEqual(await draft(), saved, 'Opening and closing current preview must not save');
          assert.equal((await publication()).current.id, pointer, 'Preview must not publish');
          recordTiming(`${id}/${width}/current`, currentStarted);
          for (const [p, route, label] of [[savedPage, `/${slug}/admin/preview/basic`, 'saved'], [publicPage, `/${slug}`, 'public']]) {
            const started = Date.now();
            await p.bringToFront();
            await p.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
            await p.goto(`${origin}${route}`);
            await inspect(p, id, width, label);
            recordTiming(`${id}/${width}/${label}`, started);
          }
        }
      });
    }
    await stage('preview source separation: unsaved memory, saved draft and public snapshot', async () => {
      await page.bringToFront();
      await page.setViewportSize({ width: 1440, height: 900 });
      await nav('contact');
      const saved = await draft(), pointer = (await publication()).current.id;
      await expandControl(page, page.getByLabel(/^账号、主页链接或分享文案 1/));
      await page.getByLabel(/^账号、主页链接或分享文案 1/).fill('UNSAVED-CONTACT-FIXTURE');
      await page.getByRole('button', { name: '预览当前编辑', exact: true }).click();
      const root = currentDialog().locator(`[data-template="${saved.content.activeTemplate}"]`);
      await root.getByRole('link', { name: '联系约拍', exact: true }).first().click();
      await root.getByText('UNSAVED-CONTACT-FIXTURE', { exact: true }).waitFor();
      await currentDialog().getByRole('button', { name: '退出预览 ×', exact: true }).click();
      assert.equal(await page.getByLabel(/^账号、主页链接或分享文案 1/).inputValue(), 'UNSAVED-CONTACT-FIXTURE');
      assert.deepEqual(await draft(), saved); assert.equal((await publication()).current.id, pointer);
      await savedPage.reload(); await publicPage.reload();
      assert.equal(await savedPage.getByText('UNSAVED-CONTACT-FIXTURE', { exact: true }).count(), 0);
      assert.equal(await publicPage.getByText('UNSAVED-CONTACT-FIXTURE', { exact: true }).count(), 0);
      await page.reload(); await ready();
    });
    await stage('premium current/saved/public views and returning to a basic public template', async () => {
      await page.bringToFront();
      await page.goto(`${origin}${premium}`); await ready();
      const basicBefore = await draft();
      const sharedCardId = basicBefore.content.social[0].qrAssetId;
      assert.ok(sharedCardId);
      await page.getByRole('button', { name: '联系约拍', exact: true }).click();
      await page.getByRole('button', { name: '添加平台账号', exact: true }).click();
      await expandControl(page, page.getByLabel('平台 1 · 名称', { exact: true }));
      await page.getByLabel('平台 1 · 名称', { exact: true }).fill('Premium fixture contact');
      await page.getByLabel('平台 1 · 账号或主页链接', { exact: true }).fill('https://example.com/fixture');
      await expandControl(page, page.getByRole('button', { name: '选择或上传联系卡', exact: true }));
      await page.getByRole('button', { name: '选择或上传联系卡', exact: true }).click();
      await page.locator('article').filter({ has: page.locator('code', { hasText: sharedCardId }) }).getByRole('button', { name: '选用此卡片', exact: true }).click();
      assert.ok((await page.getByAltText('当前联系卡', { exact: true }).getAttribute('src')).includes(sharedCardId));
      assert.deepEqual(await draft(), basicBefore, 'Selecting the same card in premium must not modify basic content');
      await page.getByRole('button', { name: '图集管理', exact: true }).click();
      for (let index = 1; index <= 4; index++) {
        await page.getByRole('button', { name: '新建图集', exact: true }).click();
        await expandControl(page, page.getByLabel('图集名称', { exact: true }));
        await page.getByLabel('图集名称', { exact: true }).fill(`Premium browser matrix ${index}`);
        await page.getByRole('button', { name: '从本站图库选片', exact: true }).click();
        const picker = page.getByRole('dialog', { name: '从本站图库选片', exact: true });
        await picker.getByRole('checkbox', { name: /^选择照片 / }).first().check();
        await picker.getByRole('button', { name: /加入当前图集/ }).click();
      }
      await publish('premium-polaroid');
      const saved = await draft('premium-polaroid'), pointer = (await publication()).current.id;
      assert.equal(saved.content.social[0].qrAssetId, sharedCardId);
      assert.deepEqual(await draft(), basicBefore, 'Premium save and publish must preserve the independent basic card reference');
      for (const width of [1440, 390, 320]) {
        const currentStarted = Date.now();
        console.log(`[publication-browser] VIEW premium ${width} current/saved/public`);
        await page.bringToFront();
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        await page.getByRole('button', { name: '预览当前编辑', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '新版未保存草稿效果', exact: true });
        await dialog.waitFor();
        const cover = dialog.locator('[data-motion-cover]').last();
        await cover.scrollIntoViewIfNeeded();
        const coverId = await cover.getAttribute('data-motion-cover');
        const port = await dialog.locator('[data-preview-scrollport]').count() ? dialog.locator('[data-preview-scrollport]').first() : dialog;
        const scroll = await port.evaluate(element => element.scrollTop), background = await page.evaluate(() => scrollY);
        assert.ok(scroll > 0, 'Four-collection fixture exercises actual inner preview scrolling');
        await cover.click();
        await dialog.getByRole('button', { name: '← 返回图集首页', exact: true }).waitFor();
        const photo = dialog.locator('button[data-card-id]').first();
        await photo.click();
        const box = page.locator('.lightbox[role="dialog"]').last();
        await box.waitFor(); await loadedPhotos(box);
        await box.getByRole('button', { name: '关闭 ×', exact: true }).click();
        await box.waitFor({ state: 'detached' });
        await dialog.getByRole('button', { name: '← 返回图集首页', exact: true }).click();
        const returned = dialog.locator(`[data-motion-cover="${coverId}"]`);
        await returned.waitFor();
        await page.waitForFunction(({ element, scroll }) => Math.abs(element.scrollTop - scroll) <= 2, { element: await port.elementHandle(), scroll });
        await page.waitForFunction(element => document.activeElement === element, await returned.elementHandle());
        assert.equal(await page.evaluate(() => scrollY), background, 'Collection navigation must not scroll the editor behind the preview');
        await contact(dialog.locator('[data-template="polaroid-field"]'), 'premium-polaroid', width, 'Premium fixture contact');
        await screenshot(page, 'premium-current');
        await dialog.getByRole('button', { name: '关闭草稿效果', exact: true }).click();
        recordTiming(`premium/${width}/current`, currentStarted);
        for (const [p, route, label] of [[savedPage, `/${slug}/admin/preview/premium-polaroid`, 'premium-saved'], [publicPage, `/${slug}`, 'premium-public']]) {
          const started = Date.now();
          await p.bringToFront();
          await p.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); await p.goto(`${origin}${route}`);
          await p.locator('[data-site-premium]').waitFor();
          await contact(p.locator('[data-site-premium]'), 'premium-polaroid', width, 'Premium fixture contact');
          await noOverflow(p, label); await screenshot(p, label);
          recordTiming(`premium/${width}/${label}`, started);
        }
      }
      assert.deepEqual(await draft('premium-polaroid'), saved); assert.equal((await publication()).current.id, pointer);
      await page.bringToFront();
      await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${origin}${basic}/profile`); await ready();
      await publish();
      await publicPage.bringToFront();
      await publicPage.goto(`${origin}/${slug}`);
      await publicPage.locator(`[data-template="${(await draft()).content.activeTemplate}"]`).waitFor();
      assert.equal(await publicPage.locator('[data-site-premium]').count(), 0);
      assert.equal(await publicPage.evaluate(() => document.documentElement.dataset.previewTheme), undefined);
    });
  } finally { await savedPage.close(); }
}
