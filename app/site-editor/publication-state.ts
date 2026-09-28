import type { ContentSpace } from "./content-schema";

export type PublicationSummary = { id: string; space: ContentSpace; templateId: string; draftRevision: number; publishedAt: string };
export type PendingPublication = { space: ContentSpace; templateId: string; revision: number; expectedPublicationId: string | null; rollbackId?: string };

export function publicationMatches(current: PublicationSummary | null, target: PendingPublication) {
  if (!current) return false;
  if (target.rollbackId) return current.id === target.rollbackId;
  // Publishing an already-public draft creates a new immutable publication.
  // Its old pointer is not proof that a lost request committed.
  return current.id !== target.expectedPublicationId && current.space === target.space && current.templateId === target.templateId && current.draftRevision === target.revision;
}

export function publicationSynced(current: PublicationSummary | null, space: ContentSpace, templateId: string, revision: number, dirty: boolean) {
  return !!current && current.space === space && current.templateId === templateId && current.draftRevision === revision && !dirty;
}
