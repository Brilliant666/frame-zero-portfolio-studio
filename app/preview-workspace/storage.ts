import { parsePreviewDocument, type PreviewPortfolioDocumentV1 } from "./document";

// Reserved after inspecting existing local rows: legacy content remains id 1.
export const PREVIEW_SETTINGS_ID = 2601;
export type PreviewSnapshot = { content: PreviewPortfolioDocumentV1 | null; revision: number; updatedAt: string | null };
type Row = { content: string; updated_at: string };
type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
export type PreviewDatabase = { prepare(sql: string): Statement };
export class PreviewStorageError extends Error { constructor(public code: "conflict" | "corrupt" | "unavailable") { super(code === "conflict" ? "新版内容已被其他页面修改，请保留草稿并重新读取。" : code === "corrupt" ? "新版已保存数据损坏或版本不支持，已停止读写。" : "新版本地存储暂时不可用，请稍后重试。"); } }
function decode(row: Row): PreviewSnapshot {
  try {
    const envelope = JSON.parse(row.content);
    if (!envelope || Object.keys(envelope).sort().join() !== "content,revision" || !Number.isSafeInteger(envelope.revision) || envelope.revision < 1 || typeof row.updated_at !== "string") throw new Error();
    return { content: parsePreviewDocument(envelope.content), revision: envelope.revision, updatedAt: row.updated_at };
  } catch { throw new PreviewStorageError("corrupt"); }
}
export async function readPreviewDocument(db: PreviewDatabase): Promise<PreviewSnapshot> {
  try {
    // GET does not create tables or data. A fresh DB without this table is empty.
    const table = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'site_settings'").first<{ name: string }>();
    if (!table) return { content: null, revision: 0, updatedAt: null };
    const row = await db.prepare("SELECT content, updated_at FROM site_settings WHERE id = ?").bind(PREVIEW_SETTINGS_ID).first<Row>();
    return row ? decode(row) : { content: null, revision: 0, updatedAt: null };
  } catch (error) { if (error instanceof PreviewStorageError) throw error; throw new PreviewStorageError("unavailable"); }
}
export async function savePreviewDocument(db: PreviewDatabase, value: unknown, expectedRevision: number): Promise<PreviewSnapshot> {
  const content = parsePreviewDocument(value);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error("expectedRevision 不合法。");
  try {
    // A damaged/unsupported record is never eligible for replacement, even if its revision matches.
    const current = await readPreviewDocument(db);
    if (current.revision !== expectedRevision) throw new PreviewStorageError("conflict");
    const original = expectedRevision > 0 ? await db.prepare("SELECT content, updated_at FROM site_settings WHERE id = ?").bind(PREVIEW_SETTINGS_ID).first<Row>() : null;
    if (expectedRevision > 0 && (!original || decode(original).revision !== expectedRevision)) throw new PreviewStorageError("conflict");
    await db.prepare("CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
    const serialized = JSON.stringify({ content, revision: expectedRevision + 1 });
    // The read above diagnoses corruption; this SQL compare-and-swap is the atomic concurrency boundary.
    const row = expectedRevision === 0
      ? await db.prepare("INSERT INTO site_settings (id, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING content, updated_at").bind(PREVIEW_SETTINGS_ID, serialized, new Date().toISOString()).first<Row>()
      : await db.prepare("UPDATE site_settings SET content = ?, updated_at = ? WHERE id = ? AND content = ? RETURNING content, updated_at").bind(serialized, new Date().toISOString(), PREVIEW_SETTINGS_ID, original!.content).first<Row>();
    if (!row) throw new PreviewStorageError("conflict");
    return decode(row);
  } catch (error) { if (error instanceof PreviewStorageError) throw error; throw new PreviewStorageError("unavailable"); }
}
