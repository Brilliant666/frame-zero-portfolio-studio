import type { PickerFilter } from "./photo-picker-state";

/** Transient conditions from the current Site's Flow library, never a selection. */
export type FlowLibraryLookup = {
  siteScopeKey: string;
  query: string;
  orientation: string;
  order?: "recent" | "oldest";
};

export function currentFlowLibraryLookup(source: FlowLibraryLookup | undefined, siteScopeKey: string | undefined): FlowLibraryLookup | null {
  if (!siteScopeKey || !source || source.siteScopeKey !== siteScopeKey || typeof source.query !== "string"
    || !["all", "landscape", "portrait", "square"].includes(source.orientation)
    || (source.order !== undefined && source.order !== "recent" && source.order !== "oldest")) return null;
  const query = source.query.trim();
  return query || source.orientation !== "all" || source.order === "oldest" ? { siteScopeKey, query, orientation: source.orientation, order: source.order } : null;
}

/** Only an explicit click applies this snapshot; member relations belong to the picker. */
export function applyPickerLookup(filter: PickerFilter, lookup: FlowLibraryLookup): PickerFilter {
  return { ...filter, query: lookup.query, orientation: lookup.orientation,
    sort: lookup.order === undefined ? filter.sort : lookup.order === "recent" ? "newest" : "oldest", onlySelected: false };
}

export function clearPickerLookup(filter: PickerFilter): PickerFilter {
  return { ...filter, query: "", orientation: "all" };
}

export function describePickerLookup(filter: PickerFilter): string {
  const direction = { all: "全部方向", landscape: "横图", portrait: "竖图", square: "方图" }[filter.orientation] ?? "未知方向";
  return `${direction} · ${filter.query.trim() ? `素材 ID 包含“${filter.query.trim()}”` : "全部素材 ID"} · ${filter.membership === "outside" ? "未加入当前分类" : "全部照片"}`;
}
