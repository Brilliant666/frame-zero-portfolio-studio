/** Evaluate success detail against current editor state, not the request closure. */
export function publicationSuccessDetail(message: string, published: boolean, dirty: boolean, synced: boolean) {
  if (!published) return message;
  if (dirty) return `${message} 仍有未保存修改，尚未发布。`;
  if (!synced) return `${message} 当前草稿还有待发布改动。`;
  return message;
}
