/** Same-page signal that the public pointer is known to have changed (publish, rollback or a status read). */
export const PUBLICATION_CHANGED_EVENT = "frame-zero:publication-changed";

export function announcePublication(space: string | null) {
  window.dispatchEvent(new CustomEvent<string | null>(PUBLICATION_CHANGED_EVENT, { detail: space }));
}
