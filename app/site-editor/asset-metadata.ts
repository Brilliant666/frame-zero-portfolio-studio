/** Site registration time only. Unknown times follow known times in either direction. */
export function compareSiteAssetTimes(a: { id: string; createdAt?: string | null }, b: { id: string; createdAt?: string | null }, order: "recent" | "oldest" | "asset-id") {
  const identity = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (order === "asset-id") return identity;
  if (Boolean(a.createdAt) !== Boolean(b.createdAt)) return a.createdAt ? -1 : 1;
  const time = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  return (order === "recent" ? -time : time) || identity;
}

export function siteAssetTimeLabel(createdAt?: string | null) {
  return createdAt ? `加入本站：${new Date(createdAt).toLocaleString("zh-CN", { hour12: false })}` : "加入本站时间未知";
}
