import assert from 'node:assert/strict';
import sharp from 'sharp';
import { chooseOption } from './kit-select-helpers.mjs';
import { batchBoxes, pick, tile, tileIds, tray } from './library-browser-helpers.mjs';

// 星轨 library page on the anonymous 500-photo picker fixture. Everything stays an unsaved draft
// (the suite turns auto-save off); uploads go to the isolated test asset root only.
export async function exerciseSiteLibrary({ page, read, published, shot }) {
  const url = new URL(page.url());
  assert.equal(url.origin, 'http://127.0.0.1:3004');
  assert.equal(url.pathname, '/pickerfixture/admin/premium-polaroid');
  const before = await read(), pointer = await published();
  const collection = before.content.collections[0];
  assert.ok(collection?.assetIds.length, 'Use the existing saved anonymous picker collection');
  const filed = new Set(before.content.collections.flatMap(item => item.assetIds));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '图库', exact: true }).click();
  const library = page.getByRole('region', { name: '图库', exact: true });
  const scopes = library.getByRole('group', { name: '按归属查看', exact: true });
  const scope = name => scopes.getByRole('button', { name: new RegExp(`^${name}`) });
  const menu = page.getByRole('menu', { name: '加入图集', exact: true });
  const toast = text => library.getByRole('status').getByText(text, { exact: true });
  await batchBoxes(library).first().waitFor();
  assert.equal(await batchBoxes(library).count(), 3, 'Upload days become batches');

  // Membership views: unfiled hides photos in any album; an album lists its own order.
  await scope('未归入图集').click();
  assert.ok((await tileIds(library)).every(id => !filed.has(id)), 'The unfiled view hides photos already in an album');
  await scope(collection.name).click();
  assert.deepEqual(await tileIds(library), collection.assetIds, 'An album view lists members in album order');
  await scope('全部').click();
  assert.match(await tile(library, collection.assetIds[0]).getAttribute('aria-label'), new RegExp(`已在.*「${collection.name}」`), 'Each photo says which albums hold it');

  // Menu add: the menu shows what is new, existing members are skipped, undo puts the album back.
  const fresh = (await tileIds(library)).filter(id => !filed.has(id));
  const [first, second, third] = fresh;
  await pick(library, [first, second, collection.assetIds[0]]);
  await tray(library).getByRole('button', { name: '加入图集', exact: true }).click();
  await menu.getByRole('menuitem').filter({ hasText: collection.name }).filter({ hasText: '+2' }).waitFor();
  await shot('library-add-menu');
  await menu.getByRole('menuitem').filter({ hasText: collection.name }).click();
  await toast(`已把 2 张加入「${collection.name}」，另 1 张原本就在`).waitFor();
  assert.deepEqual(await read(), before, 'Library edits stay in the draft until saved'); assert.deepEqual(await published(), pointer);
  await library.getByRole('button', { name: '撤销', exact: true }).click();
  await scope(collection.name).click();
  assert.deepEqual(await tileIds(library), collection.assetIds, 'Undo restores the album');

  // Drag: the selection dropped on an album chip is appended in pick order.
  await scope('全部').click();
  await pick(library, [second, first]);
  await tile(library, second).dragTo(scope(collection.name));
  await toast(`已把 2 张加入「${collection.name}」`).waitFor();

  // A new album made from the selection starts hidden.
  await pick(library, [third]);
  await tray(library).getByRole('button', { name: '加入图集', exact: true }).click();
  await menu.getByRole('menuitem').filter({ hasText: '新建图集并加入' }).click();
  await menu.getByLabel('新图集名称', { exact: true }).fill('Library made album');
  await menu.getByRole('button', { name: '创建并加入', exact: true }).click();
  await scope('Library made album').filter({ hasText: '隐藏' }).waitFor();

  // Upload straight into the album: queued files go one by one and are appended in order.
  const assetsUrl = `${url.origin}/api/sites/pickerfixture/assets`;
  const known = new Set((await (await page.request.get(assetsUrl)).json()).assets.map(asset => asset.id));
  const files = [];
  for (const [name, background] of [['library-upload-1', '#3a5f8a'], ['library-upload-2', '#8a5f3a']]) files.push({ name: `${name}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width: 120, height: 80, channels: 3, background } }).png().toBuffer() });
  await library.getByRole('button', { name: '上传照片', exact: true }).click();
  const uploader = page.getByRole('dialog', { name: '上传照片到本站图库', exact: true });
  await uploader.getByLabel('选择要上传的照片', { exact: true }).setInputFiles(files);
  await chooseOption(uploader.getByRole('combobox', { name: '上传后加入', exact: true }), collection.id);
  await uploader.getByRole('button', { name: '开始上传（2 张）', exact: true }).click();
  await uploader.waitFor({ state: 'hidden' });
  const uploaded = (await (await page.request.get(assetsUrl)).json()).assets.filter(asset => !known.has(asset.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(asset => asset.id);
  assert.equal(uploaded.length, 2);
  await scope(collection.name).click();
  await page.waitForFunction(count => document.querySelectorAll('[aria-label="图库"] [role="option"]').length === count, collection.assetIds.length + 4);
  assert.deepEqual(await tileIds(library), [...collection.assetIds, second, first, ...uploaded], 'Drag and upload append in order after existing members');
  await shot('library-album-after-upload');

  await page.getByRole('button', { name: '图集', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(collection.name) }).click();
  const members = page.getByRole('region', { name: '图集照片排序', exact: true }).locator('[data-member-id]');
  assert.deepEqual(await members.evaluateAll(nodes => nodes.map(node => node.dataset.memberId)), [...collection.assetIds, second, first, ...uploaded], 'The album editor sees the library additions');
  await shot('independent-library-unsaved-add');
  const discard = dialog => dialog.accept(); page.on('dialog', discard);
  try { await page.reload(); } finally { page.off('dialog', discard); }
  assert.deepEqual(await read(), before); assert.deepEqual(await published(), pointer);
  await page.goto(`${url.origin}${url.pathname}#edit-collections`);
}
