import type { Collection } from "../templates/polaroid-field/collection-model";

export type MemberDestination = { kind: "position"; position: number } | { kind: "relative"; targetId: string; side: "before" | "after" };
export type MemberMoveUndo = { after: Collection; beforeIds: readonly string[]; afterIds: readonly string[] };

/** Stable block move. Position is the zero-based final start of the block. */
export function moveCollectionMembers(collection: Collection, selectedIds: readonly string[], destination: MemberDestination): Collection {
  const selected = new Set(selectedIds);
  if (!selected.size || selectedIds.some(id => !collection.assetIds.includes(id))) return collection;
  const block = collection.assetIds.filter(id => selected.has(id));
  const remaining = collection.assetIds.filter(id => !selected.has(id));
  let position: number;
  if (destination.kind === "position") position = destination.position;
  else {
    if (selected.has(destination.targetId) || !remaining.includes(destination.targetId) || !["before", "after"].includes(destination.side)) return collection;
    position = remaining.indexOf(destination.targetId) + (destination.side === "after" ? 1 : 0);
  }
  if (!Number.isInteger(position) || position < 0 || position > remaining.length) return collection;
  const assetIds = [...remaining.slice(0, position), ...block, ...remaining.slice(position)];
  return assetIds.every((id, index) => id === collection.assetIds[index]) ? collection : { ...collection, assetIds };
}

export function moveCollectionMember(collection: Collection, assetId: string, position: number): Collection {
  return moveCollectionMembers(collection, [assetId], { kind: "position", position });
}

export function rememberMemberMove(before: Collection, after: Collection): MemberMoveUndo | null {
  return before === after ? null : { after, beforeIds: [...before.assetIds], afterIds: [...after.assetIds] };
}

/** A new external object, changed membership or changed order invalidates undo. */
export function undoMemberMove(current: Collection, undo: MemberMoveUndo | null): Collection {
  if (!undo || current !== undo.after || current.assetIds.length !== undo.afterIds.length || current.assetIds.some((id, index) => id !== undo.afterIds[index])) return current;
  return { ...current, assetIds: [...undo.beforeIds] };
}
