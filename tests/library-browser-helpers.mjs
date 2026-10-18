// Shared selectors for the batch photo library (app/admin-kit/photo-library.tsx) in browser suites.
export const tile = (scope, id) => scope.locator(`[role="option"][data-asset-id="${id}"]`);
export const tileIds = scope => scope.locator('[role="option"][data-asset-id]').evaluateAll(nodes => nodes.map(node => node.dataset.assetId));
export const selectedTileIds = scope => scope.locator('[role="option"][data-asset-id][aria-selected="true"]').evaluateAll(nodes => nodes.map(node => node.dataset.assetId));
export const selectableTileIds = scope => scope.locator('[role="option"][data-asset-id]:not([aria-disabled="true"])').evaluateAll(nodes => nodes.map(node => node.dataset.assetId));
export const batchBoxes = scope => scope.getByRole('checkbox', { name: /^选中这一批/ });
export const tray = scope => scope.getByRole('region', { name: '已选照片操作', exact: true });
/** The picker's add button names the album and the number of new photos. */
export const addToTarget = (picker, name, count) => picker.getByRole('button', { name: `加入「${name}」（${count} 张）`, exact: true });

/** Click picks one photo at a time; the click order is the order photos are appended. */
export async function pick(scope, ids) { for (const id of ids) await tile(scope, id).click(); }

/** Plain click on the first id, Shift-click on the last: everything between them in display order. */
export async function pickRange(scope, first, last) {
  await tile(scope, first).click();
  await tile(scope, last).click({ modifiers: ['Shift'] });
}

/** Opens the tray's "加入图集/分类" menu and chooses one album by name. */
export async function addSelectionTo(page, scope, noun, albumName) {
  await tray(scope).getByRole('button', { name: `加入${noun}`, exact: true }).click();
  const menu = page.getByRole('menu', { name: `加入${noun}`, exact: true });
  await menu.getByRole('menuitem').filter({ hasText: albumName }).first().click();
  await menu.waitFor({ state: 'hidden' });
}
