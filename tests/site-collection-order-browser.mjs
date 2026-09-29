import assert from 'node:assert/strict';

// Called only by the existing isolated Site fixture. Uses actual pointer and
// keyboard input; all DOM evaluation below is read-only evidence.
export async function exerciseCollectionOrder({ page, selected, read, published, save, shot }) {
  const editor = page.getByRole('region', { name: '图集照片排序', exact: true });
  const effect = page.getByRole('region', { name: '当前图集即时效果', exact: true });
  const before = await read();
  const publishedBefore = await published();
  const card = id => editor.locator(`[data-member-id="${id}"]`);
  const handle = id => card(id).getByRole('button', { name: /^拖动成员 / });
  async function order(expected) {
    await page.waitForFunction(ids => {
      const actual = [...document.querySelectorAll('[aria-label="图集照片排序"] [data-member-id]')].map(node => node.dataset.memberId);
      const scene = [...document.querySelectorAll('[aria-label="当前图集即时效果"] [data-card-id]')]
        .sort((a, b) => Number(a.getAttribute('aria-label').match(/第 (\d+) 张/)[1]) - Number(b.getAttribute('aria-label').match(/第 (\d+) 张/)[1]))
        .map(node => node.dataset.cardId);
      return JSON.stringify(actual) === JSON.stringify(ids) && JSON.stringify(scene) === JSON.stringify(ids);
    }, expected);
    assert.deepEqual(await editor.locator('[data-member-id]').evaluateAll(nodes => nodes.map(node => node.dataset.memberId)), expected);
    assert.deepEqual(await read(), before, 'Reordering current editing must not write a saved draft');
    assert.deepEqual(await published(), publishedBefore, 'Reordering must not publish');
  }
  async function beginDrag(source, target) {
    await handle(source).scrollIntoViewIfNeeded();
    const start = await handle(source).boundingBox();
    const end = await card(target).getByRole('button', { name: /^查看成员 / }).boundingBox();
    assert.ok(start && end, 'Real source handle and target photo have layout boxes');
    const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const to = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
    assert.ok(from.y > 0 && from.y < page.viewportSize().height && to.y > 0 && to.y < page.viewportSize().height, 'Both real pointer positions are inside the viewport');
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    assert.equal(await card(target).getAttribute('data-drop-target'), 'true');
  }
  await page.getByRole('button', { name: '编辑照片', exact: true }).click();
  await effect.getByRole('button', { name: '散落', exact: true }).click();
  const mode = await effect.locator('[data-composer]').getAttribute('data-composer');
  await order(selected);
  await beginDrag(selected[2], selected[0]);
  await page.mouse.up();
  const moved = [selected[2], selected[0], selected[1]];
  await order(moved);
  assert.equal(await effect.locator('[data-composer]').getAttribute('data-composer'), mode, 'Pointer reorder preserves the selected composition');
  await handle(moved[0]).press('End');
  await order([moved[1], moved[2], moved[0]]);
  assert.equal(await handle(moved[0]).evaluate(node => node === document.activeElement), true, 'End keeps focus on the same member');
  await handle(moved[0]).press('Home');
  await order(moved);
  assert.equal(await handle(moved[0]).evaluate(node => node === document.activeElement), true, 'Home keeps focus on the same member');
  await beginDrag(moved[2], moved[0]);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await order(moved);
  assert.equal(await editor.locator('[data-dragging], [data-drop-target]').count(), 0, 'Escape clears drag presentation');
  assert.equal(await effect.locator('[data-composer]').getAttribute('data-composer'), mode, 'Keyboard and cancelled drag preserve composition');
  await beginDrag(moved[2], moved[0]);
  // Leave the entire member list after crossing a valid target; dropping in
  // the viewport's header corner must not commit the last hovered position.
  assert.equal(await page.evaluate(() => Boolean(document.elementFromPoint(4, 4)?.closest('[data-member-id]'))), false);
  await page.mouse.move(4, 4, { steps: 8 }); await page.mouse.up();
  await order(moved);
  assert.equal(await editor.locator('[data-dragging], [data-drop-target]').count(), 0, 'Drop outside clears drag presentation without reordering');
  await shot('collection-order-before-save');
  const saved = await save();
  assert.deepEqual(saved.content.collections[0].assetIds, moved);
  assert.deepEqual((await read()).content.collections[0].assetIds, moved);
  assert.deepEqual(await published(), publishedBefore, 'Draft save leaves Published untouched');
  return { selected: moved, saved };
}
