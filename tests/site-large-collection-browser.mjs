import assert from 'node:assert/strict';

// This helper creates only unsaved collections inside the existing anonymous
// picker fixture. The caller must supply its already isolated 3004 session.
export async function exerciseLargeCollections({ page, read, published, shot }) {
  const url = new URL(page.url());
  assert.equal(url.origin, 'http://127.0.0.1:3004');
  assert.equal(url.pathname, '/pickerfixture/admin/premium-polaroid');
  const before = await read(), pointer = await published();
  const editor = page.getByRole('region', { name: '图集照片排序', exact: true });
  const effect = page.getByRole('region', { name: '当前图集即时效果', exact: true, includeHidden: true });
  const tab = name => page.getByRole('navigation', { name: '图集编辑内容', exact: true }).getByRole('button', { name, exact: true });
  const ids = () => editor.locator('[data-member-id]').evaluateAll(nodes => nodes.map(node => node.dataset.memberId));
  async function expectOrder(expected) {
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[aria-label="图集照片排序"] [data-member-id]')].map(node => node.dataset.memberId)) === JSON.stringify(expected), expected);
    assert.deepEqual(await ids(), expected);
    assert.deepEqual(await read(), before, 'Editing order never saves automatically');
    assert.deepEqual(await published(), pointer, 'Editing order never publishes');
  }
  async function select(id) { await editor.locator(`[data-member-id="${id}"]`).getByRole('checkbox').check(); }
  async function clearSelection() {
    await editor.getByRole('button', { name: '清空选择', exact: true }).click();
    assert.equal(await editor.getByRole('checkbox', { checked: true }).count(), 0);
  }
  async function move(kind, position) {
    await editor.getByRole('combobox', { name: '移动方式', exact: true }).selectOption(kind);
    await editor.getByRole('spinbutton', { name: kind === 'position' ? '移动后起始序号' : '当前目标照片序号', exact: true }).fill(String(position));
    await editor.getByRole('button', { name: '移动选中照片', exact: true }).click();
  }
  for (const count of [50, 100]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${url.origin}${url.pathname}#edit-collections`);
    await page.getByRole('button', { name: '图集库', exact: true }).click();
    await page.getByRole('button', { name: '新建图集', exact: true }).click();
    await page.getByRole('button', { name: '从本站图库选片', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '从本站图库选片', exact: true });
    const original = [];
    while (original.length < count) {
      const inputs = picker.getByRole('checkbox', { name: /^选择照片 / });
      const pageIds = await inputs.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').replace('选择照片 ', '')));
      for (const id of pageIds.slice(0, count - original.length)) {
        await picker.getByRole('checkbox', { name: `选择照片 ${id}`, exact: true }).check(); original.push(id);
      }
      if (original.length < count) await picker.getByRole('button', { name: '下一页', exact: true }).click();
    }
    await picker.getByRole('button', { name: `加入当前图集（${count} 张）`, exact: true }).click();
    await tab('照片排序').click();
    assert.equal(await effect.isVisible(), false, 'Sorting starts full width without the effect panel');
    await expectOrder(original);
    await select(original[46]); await move('position', 3);
    const single = [...original]; single.splice(2, 0, single.splice(46, 1)[0]);
    await expectOrder(single);
    await editor.getByRole('button', { name: '撤销最近移动', exact: true }).click(); await expectOrder(original);
    await clearSelection();
    // Select in deliberately reversed order; the block must retain array order.
    for (const index of [46, 24, 9]) await select(original[index]);
    const block = [original[9], original[24], original[46]];
    const rest = original.filter(id => !block.includes(id));
    for (const [kind, target, insert] of [['position', 3, 2], ['before', 5, 4], ['after', 5, 5]]) {
      await move(kind, target);
      const expected = [...rest]; expected.splice(insert, 0, ...block);
      await expectOrder(expected);
      await editor.getByRole('button', { name: '撤销最近移动', exact: true }).click(); await expectOrder(original);
      await clearSelection(); for (const id of [...block].reverse()) await select(id);
    }
    await tab('展示效果').click();
    await effect.getByRole('button', { name: '跨页', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="当前图集即时效果"] [data-composer]')?.getAttribute('data-composer') === 'editorial');
    await tab('图集设置').click(); await tab('照片排序').click(); await tab('展示效果').click();
    assert.equal(await effect.locator('[data-composer]').getAttribute('data-composer'), 'editorial', 'Tab changes retain composition mode');
    await tab('照片排序').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await expectOrder(original); await shot(`large-collection-${count}-mobile`);
    // Discard only the unsaved fixture added in this iteration, never saved data.
    const discard = dialog => dialog.accept();
    page.on('dialog', discard);
    try { await page.reload(); } finally { page.off('dialog', discard); }
    assert.deepEqual(await read(), before); assert.deepEqual(await published(), pointer);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${url.origin}${url.pathname}#edit-collections`);
}
