// Drive the shared admin listbox (app/admin-kit/select.tsx) the way a person does:
// open the combobox, pick an option, and read the committed value from the trigger.
const listFor = async combobox => combobox.page().locator(`[id="${await combobox.getAttribute('aria-controls')}"]`);

export async function chooseOption(combobox, target) {
  await combobox.click();
  const list = await listFor(combobox);
  await list.waitFor();
  const option = typeof target === 'string'
    ? list.locator(`[role="option"][data-value=${JSON.stringify(target)}]`)
    : list.getByRole('option', { name: target.label, exact: true });
  await option.click();
  await list.waitFor({ state: 'detached' });
}

export async function kitValue(combobox) {
  return (await combobox.getAttribute('data-value')) ?? '';
}

export async function kitOptionValues(combobox) {
  // Like reading <option>s of an absent <select>: no control (e.g. a category without photos) means no options.
  if (await combobox.count() === 0) return [];
  await combobox.click();
  const list = await listFor(combobox);
  await list.waitFor();
  const values = await list.locator('[role="option"]').evaluateAll(options => options.map(option => option.dataset.value));
  await combobox.press('Escape');
  await list.waitFor({ state: 'detached' });
  return values;
}

export async function kitText(combobox) {
  return (await combobox.innerText()).trim();
}
