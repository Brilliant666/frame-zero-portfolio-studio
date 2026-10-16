// Older imported documents can retain the original demo notice. Suppress only
// that exact seed on the premium surface; never rewrite the saved document.
const legacyDemoNotice = "当前为示例联系方式与价格，后续可在后台统一替换。";

export function polaroidContactNote(note: string, premium: boolean): string {
  return premium && note.trim() === legacyDemoNotice ? "" : note;
}

export function packageInquiry(template: string, packageName: string | null): string {
  if (!packageName) return template;
  return `本次咨询套餐：${packageName}\n\n${template}`;
}
