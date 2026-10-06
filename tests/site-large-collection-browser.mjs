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
        await card(original[1]).evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
        const geometry = () => page.evaluate(([sourceId, targetId]) => {
          const rect = id => {
            const r = document.querySelector(`[data-member-id="${id}"]`).getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          return { scroll: scrollY, source: rect(sourceId), target: rect(targetId) };
        }, [original[1], original[0]]);
        async function settleCards() {
          let previous = await geometry(), stableGeometry = 0;
          const samples = [previous];
          for (let attempt = 0; attempt < 20 && stableGeometry < 3; attempt++) {
            await page.waitForTimeout(50);
            const next = await geometry(); samples.push(next);
            const deltas = [Math.abs(next.scroll - previous.scroll), ...['source', 'target'].flatMap(key => ['x', 'y', 'width', 'height'].map(axis => Math.abs(next[key][axis] - previous[key][axis])))];
            stableGeometry = deltas.every(delta => delta < 1) ? stableGeometry + 1 : 0; previous = next;
          }
          assert.ok(stableGeometry >= 3, `Long-press card geometry settled: ${JSON.stringify(samples)}`);
          return samples;
        }
        const samples = await settleCards();
        const points = await card(original[1]).evaluate((element, targetId) => {
          const point = (card, fraction) => {
            const r = card.querySelector(':scope > div').getBoundingClientRect();
            const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
            const x = left + (right - left) * fraction, y = (top + bottom) / 2;
            const hit = document.elementFromPoint(x, y);
            return { x, y, visibleWidth: right - left, visibleHeight: bottom - top, hitTag: hit?.tagName ?? null, hitMember: hit?.closest('[data-member-id]')?.getAttribute('data-member-id') ?? null, hitButton: Boolean(hit?.closest('button')) };
          };
          const zoom = element.querySelector('[data-member-zoom]').getBoundingClientRect();
          return { source: point(element, .5), target: point(document.querySelector(`[data-member-id="${targetId}"]`), .25), zoom: { x: zoom.x, y: zoom.y, width: zoom.width, height: zoom.height }, scroll: scrollY };
        }, original[0]);
        for (const [key, id] of [['source', original[1]], ['target', original[0]]]) {
          assert.ok(points[key].visibleWidth > 10 && points[key].visibleHeight > 10 && points[key].hitMember === id && !points[key].hitButton, `Native touch ${key} reaches the photo area: ${JSON.stringify(points)}`);
        }
        await page.evaluate(initial => {
          const events = [];
          window.__largeCollectionTouchDiagnostics = { ...initial, events };
          const record = event => {
            const target = event.target instanceof Element ? event.target : null;
            const touch = event.touches?.[0] ?? event.changedTouches?.[0];
            events.push({ type: event.type, at: performance.now(), member: target?.closest('[data-member-id]')?.getAttribute('data-member-id') ?? null, button: Boolean(target?.closest('button')), touches: event.touches?.length ?? null, point: touch ? { x: touch.clientX, y: touch.clientY, radiusX: touch.radiusX, radiusY: touch.radiusY } : null, scroll: scrollY });
          };
          for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.addEventListener(type, record, { capture: true, passive: true });
          window.addEventListener('blur', record);
          window.__largeCollectionTouchCleanup = () => {
            for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.removeEventListener(type, record, true);
            window.removeEventListener('blur', record);
          };
        }, { points, samples });
        async function waitForDrag(stage) {
          try {
            await page.waitForFunction(id => document.querySelector(`[data-member-id="${id}"]`)?.getAttribute('data-dragging') === 'true', original[1], { timeout: 1500 });
          } catch (cause) {
            const diagnostic = await page.evaluate(() => ({ ...window.__largeCollectionTouchDiagnostics, activeElement: document.activeElement?.tagName, dragging: [...document.querySelectorAll('[data-dragging]')].map(node => node.getAttribute('data-member-id')) }));
            throw new Error(`${stage} did not activate card dragging: ${JSON.stringify(diagnostic)}`, { cause });
          }
        }
        const photoDialog = page.getByRole('dialog', { name: '成员照片大图', exact: true });
        try {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points.source.x, y: points.source.y }] });
          await waitForDrag('Photo-center long press');
          assert.equal(await card(original[1]).getAttribute('data-dragging'), 'true', 'Long press activates card dragging');
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: points.target.x, y: points.target.y }] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await expectOrder([original[1], original[0], ...original.slice(2)]);
          assert.equal(await photoDialog.count(), 0, 'Photo-center long press sorts without opening the adjusted zoom button');
          await editor.getByRole('button', { name: '撤销最近移动', exact: true }).click();
          await expectOrder(original);
          await card(original[1]).evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
          await settleCards();
          const zoomButton = card(original[1]).locator('[data-member-zoom]');
          const zoomPoint = async () => zoomButton.evaluate(element => {
            const r = element.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
            return { x, y, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, reachesZoom: document.elementFromPoint(x, y)?.closest('[data-member-zoom]') === element };
          });
          const tappedZoom = await zoomPoint();
          assert.equal(tappedZoom.reachesZoom, true, `Short touch reaches the actual zoom button: ${JSON.stringify(tappedZoom)}`);
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tappedZoom.x, y: tappedZoom.y }] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await photoDialog.waitFor();
          await expectOrder(original);
          assert.equal(await editor.locator('[data-dragging]').count(), 0, 'Zoom short touch opens the viewer without sorting');
          await photoDialog.getByRole('button', { name: '关闭大图', exact: true }).click();
          await photoDialog.waitFor({ state: 'detached' });
          assert.equal(await zoomButton.evaluate(element => document.activeElement === element), true, 'Closing the viewer restores the zoom control');
          await card(original[1]).evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
          await settleCards();
          const heldZoom = await zoomPoint(), destination = await card(original[0]).boundingBox();
          assert.equal(heldZoom.reachesZoom, true, `Long touch reaches the actual zoom button: ${JSON.stringify(heldZoom)}`);
          await page.evaluate(zoom => { window.__largeCollectionTouchDiagnostics.heldZoom = zoom; }, heldZoom);
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: heldZoom.x, y: heldZoom.y }] });
          await waitForDrag('Zoom-button long press');
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: destination.x + destination.width / 4, y: destination.y + destination.height / 2 }] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await expectOrder([original[1], original[0], ...original.slice(2)]);
          assert.equal(await photoDialog.count(), 0, 'Zoom long press sorts without triggering a viewer click');
          await editor.getByRole('button', { name: '撤销最近移动', exact: true }).click();
          await expectOrder(original);
        } finally {
          await page.evaluate(() => { window.__largeCollectionTouchCleanup?.(); delete window.__largeCollectionTouchCleanup; });
        }
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
