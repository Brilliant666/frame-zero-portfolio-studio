/** CJK glyphs need a full line box even when a display face uses tight Latin leading. */
export function hasCjkText(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}
