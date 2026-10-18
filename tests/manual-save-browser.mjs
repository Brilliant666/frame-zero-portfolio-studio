// The existing browser suites exercise manual-save semantics (unsaved edits across navigation,
// two-tab conflicts, pending confirmations). They switch the per-browser auto-save preference off,
// exactly as a person can with the 自动保存 switch; admin-autosave-browser.mjs covers auto-save itself.
export function keepManualSave(browser) {
  const create = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await create(...args);
    await context.addInitScript(() => { try { localStorage.setItem('frame-zero:admin-autosave', 'off'); } catch { /* storage denied */ } });
    return context;
  };
  return browser;
}
