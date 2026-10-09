import type { GalleryDocument } from "./model";

/** Project valid, selected rails without changing the stored configuration. */
export function galleryRailLayout(content: GalleryDocument) {
  const groups = content.groups.filter(group => group.photos.length > 0);
  const selected = content.featuredGroupIds
    ? [content.featuredGroupIds.left, content.featuredGroupIds.right].map(id => groups.find(group => group.id === id))
    : groups.slice(0, 2);
  const columns = selected.flatMap((group, side) => group ? [{ group, side }] : []);
  const mode = columns.length === 2 ? "dual" : columns.length === 1 ? "single" : "empty";
  const left = content.leftRailWidthPercent ?? 200 / 3;
  return { mode, columns: columns.map(column => ({ ...column, widthPercent: mode === "single" ? 100 : column.side === 0 ? left : 100 - left })) };
}

export function galleryRailSizes(widthPercent: number, single: boolean, measuredWidth: number | null) {
  if (measuredWidth !== null) return `${measuredWidth}px`;
  if (single) return "(max-width: 700px) min(300px, calc(100vw - 40px)), min(500px, 55vw)";
  const ratio = widthPercent / 100;
  return `(max-width: 700px) calc((100vw - 52px) * ${ratio}), calc((55vw - 17px) * ${ratio})`;
}
