import type { Collection } from "../templates/polaroid-field/collection-model";

/** Move a member to a zero-based position without changing any other collection field. */
export function moveCollectionMember(collection: Collection, assetId: string, position: number): Collection {
  const from = collection.assetIds.indexOf(assetId);
  if (from < 0 || !Number.isInteger(position) || position < 0 || position >= collection.assetIds.length || from === position) return collection;
  const assetIds = [...collection.assetIds];
  assetIds.splice(position, 0, assetIds.splice(from, 1)[0]);
  return { ...collection, assetIds };
}
