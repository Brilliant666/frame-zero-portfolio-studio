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
  const card = id => editor.locator(`[data-member-id="${id}"]`);
  async function drag(source, target) {
    await card(source).scrollIntoViewIfNeeded();
    const from = await card(source).boundingBox(), to = await card(target).boundingBox();
    assert.ok(from && to);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 4, to.y + to.height / 2, { steps: 12 });
    assert.equal(await card(target).getAttribute('data-drop-target'), 'true');
    await page.mouse.up();
  }
  for (const count of [50, 100]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${url.origin}${url.pathname}#edit-collections`);
    await page.getByRole('button', { name: '图集', exact: true }).click();
    await page.getByRole('button', { name: '新建图集', exact: true }).click();
    const creation = page.getByRole('dialog', { name: '新建图集', exact: true });
    await creation.getByLabel('图集名称', { exact: true }).fill(`Anonymous ${count} photo collection`);
    await creation.getByRole('button', { name: '创建并选片', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '从图库选片', exact: true });
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
    assert.equal(await editor.getByRole('checkbox').count(), 0);
    assert.equal(await editor.getByRole('combobox').count(), 0);
    assert.equal(await editor.getByRole('spinbutton').count(), 0);
    assert.equal(await editor.getByRole('button', { name: /^拖动成员 / }).count(), 0);
    // The entire card is focusable; distant keyboard moves remain available.
    await card(original[46]).press('Home');
    const distant = [...original]; distant.unshift(distant.splice(46, 1)[0]);
    await expectOrder(distant);
    assert.equal(await card(original[46]).evaluate(node => node === document.activeElement), true);
    await editor.getByRole('button', { name: '撤销最近移动', exact: true }).click();
    await expectOrder(original);
    await drag(original[2], original[0]);
    const moved = [...original]; moved.unshift(moved.splice(2, 1)[0]);
    await expectOrder(moved);
    await editor.getByRole('button', { name: '撤销最近移动', exact: true }).click();
    await expectOrder(original);
    // Holding the card at the viewport edge scrolls a long collection. Escape
    // must cancel even after scrolling over additional possible destinations.
    await card(original[0]).scrollIntoViewIfNeeded();
    const start = await card(original[0]).boundingBox();
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, page.viewportSize().height - 12, { steps: 12 });
    await page.waitForFunction(before => scrollY > before + 100, scrollBefore);
    await page.keyboard.press('Escape'); await page.mouse.up();
    await expectOrder(original);
    assert.equal(await editor.locator('[data-dragging], [data-drop-target]').count(), 0);
    await tab('展示效果').click();
    await effect.getByRole('button', { name: '跨页', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="当前图集即时效果"] [data-composer]')?.getAttribute('data-composer') === 'editorial');
    await tab('图集设置').click(); await tab('照片排序').click(); await tab('展示效果').click();
    assert.equal(await effect.locator('[data-composer]').getAttribute('data-composer'), 'editorial', 'Tab changes retain composition mode');
    await tab('照片排序').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    if (count === 50) {
      // Real Chromium touch input, rather than dispatching synthetic DOM events.
      // This remains inside the isolated anonymous fixture supplied by CI.
      const touch = await page.context().newCDPSession(page);
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      try {
        await card(original[6]).scrollIntoViewIfNeeded();
        const box = await card(original[6]).boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        const scrollBeforeTouch = await page.evaluate(() => scrollY);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 6; step++) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 15 }] });
          await page.waitForTimeout(20);
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(before => scrollY > before + 20, scrollBeforeTouch);
        await expectOrder(original);
        assert.equal(await editor.locator('[data-dragging]').count(), 0, 'Ordinary swipe scrolls without sorting');
        // Wait for native swipe momentum to settle before taking drag coordinates.
        let stableFrames = 0, lastScroll = await page.evaluate(() => scrollY);
        for (let attempt = 0; attempt < 30 && stableFrames < 3; attempt++) {
          await page.waitForTimeout(100);
          const nextScroll = await page.evaluate(() => scrollY);
          stableFrames = Math.abs(nextScroll - lastScroll) < 1 ? stableFrames + 1 : 0; lastScroll = nextScroll;
        }
        assert.ok(stableFrames >= 3, 'Touch scroll momentum settled');
        await card(original[1]).scrollIntoViewIfNeeded();
        const source = await card(original[1]).boundingBox(), target = await card(original[0]).boundingBox();
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: source.x + source.width / 2, y: source.y + source.height / 2 }] });
        await page.waitForTimeout(450);
        assert.equal(await card(original[1]).getAttribute('data-dragging'), 'true', 'Long press activates card dragging');
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x + target.width / 4, y: target.y + target.height / 2 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expectOrder([original[1], original[0], ...original.slice(2)]);
        await editor.getByRole('button', { name: '撤销最近移动', exact: true }).click();
        await expectOrder(original);
      } finally {
        await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await touch.detach();
      }
    }
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
