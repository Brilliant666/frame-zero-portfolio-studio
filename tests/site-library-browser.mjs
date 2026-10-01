import assert from 'node:assert/strict';

export async function exerciseSiteLibrary({ page, read, published, shot }) {
  const url = new URL(page.url());
  assert.equal(url.origin, 'http://127.0.0.1:3004');
  assert.equal(url.pathname, '/pickerfixture/admin/premium-polaroid');
  const before = await read(), pointer = await published();
  const collection = before.content.collections[0];
  assert.ok(collection?.assetIds.length, 'Use the existing saved anonymous picker collection');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '图库', exact: true }).click();
  const library = page.getByRole('region', { name: '图库', exact: true });
  const photos = library.locator('[aria-label="图库浏览结果"]');
  const visibleIds = () => photos.getByRole('checkbox').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').replace('选择照片 ', '')));
  await library.getByRole('combobox', { name: '加入高级图集', exact: true }).selectOption(collection.id);
  assert.equal((await visibleIds()).length, 48);
  await library.getByRole('button', { name: '选择本页照片', exact: true }).click();
  assert.equal(await photos.getByRole('checkbox', { checked: true }).count(), 48);
  await library.getByRole('button', { name: '清空选择', exact: true }).click();
  const first = (await visibleIds()).find(id => !collection.assetIds.includes(id));
  assert.ok(first);
  await library.getByRole('checkbox', { name: `选择照片 ${first}`, exact: true }).check();
  await library.getByRole('button', { name: '下一页', exact: true }).click();
  const second = (await visibleIds()).find(id => !collection.assetIds.includes(id));
  assert.ok(second && second !== first);
  await library.getByRole('checkbox', { name: `选择照片 ${second}`, exact: true }).check();
  await library.locator('[data-library-id-search] > summary').click();
  await library.getByRole('searchbox', { name: '按素材 ID 查找', exact: true }).fill(collection.assetIds[0]);
  await library.getByRole('checkbox', { name: `选择照片 ${collection.assetIds[0]}`, exact: true }).check();
  await library.getByRole('button', { name: '查看已选', exact: true }).click();
  assert.deepEqual(await visibleIds(), [first, second, collection.assetIds[0]], 'Cross-page selections retain selection order');
  await library.getByRole('button', { name: '加入所选图集', exact: true }).click();
  assert.deepEqual(await read(), before); assert.deepEqual(await published(), pointer);
  await page.getByRole('button', { name: '图集', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(collection.name) }).click();
  const members = page.getByRole('region', { name: '图集照片排序', exact: true }).locator('[data-member-id]');
  assert.deepEqual(await members.evaluateAll(nodes => nodes.map(node => node.dataset.memberId)), [...collection.assetIds, first, second], 'Add skips existing members without changing their order');
  await shot('independent-library-unsaved-add');
  const discard = dialog => dialog.accept(); page.on('dialog', discard);
  try { await page.reload(); } finally { page.off('dialog', discard); }
  assert.deepEqual(await read(), before); assert.deepEqual(await published(), pointer);
  await page.goto(`${url.origin}${url.pathname}#edit-collections`);
}
