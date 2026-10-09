import type { ContentSpace } from "./content-schema";

export type PublicationSummary = { id: string; space: ContentSpace; templateId: string; draftRevision: number; publishedAt: string; matchedDraftRevision?: number | null; outcome?: "unchanged" | "reused" | "created" };
export type PendingPublication = { space: ContentSpace; templateId: string; revision: number; expectedPublicationId: string | null; rollbackId?: string };

export function publicationMatches(current: PublicationSummary | null, target: PendingPublication) {
  if (!current || current.space !== target.space || current.templateId !== target.templateId) return false;
  if (target.rollbackId) return current.id === target.rollbackId;
  // The server can prove content equality even when no new snapshot was created.
  // Legacy responses still need a changed pointer and an exact draft revision.
  if (current.matchedDraftRevision === target.revision) return true;
  // A newly created immutable snapshot still confirms its captured revision even
  // if a later draft save makes the live content-match result null.
  return current.id !== target.expectedPublicationId && current.draftRevision === target.revision;
}

export function publicationSynced(current: PublicationSummary | null, space: ContentSpace, templateId: string, revision: number, dirty: boolean) {
  const matchedRevision = current?.matchedDraftRevision !== undefined ? current.matchedDraftRevision : current?.draftRevision;
  return !!current && current.space === space && current.templateId === templateId && matchedRevision === revision && !dirty;
}
