export interface LivePreviewAssetState<T> {
  assets: T[] | null;
  loading: boolean;
  failed: boolean;
}

// Drafts also contain album UUIDs. A successful list can legitimately omit them;
// query each new identity once, with an explicit retry after a failed request.
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Coordinates the iframe's read-only asset requests, including out-of-order responses. */
export function createLivePreviewAssets<T extends { id: string }>(
  load: () => Promise<T[]>,
  onChange: (state: LivePreviewAssetState<T>) => void,
) {
  let state: LivePreviewAssetState<T> = { assets: null, loading: true, failed: false };
  let generation = 0;
  let disposed = false;
  let references: string[] = [];
  const attempted = new Set<string>();

  const publish = (next: LivePreviewAssetState<T>) => { state = next; onChange(next); };
  const request = async (ids: readonly string[]) => {
    if (disposed) return;
    const current = ++generation;
    ids.forEach(id => attempted.add(id));
    publish({ ...state, loading: true });
    try {
      const assets = await load();
      if (!disposed && current === generation) publish({ assets, loading: false, failed: false });
    } catch {
      // Keep the last usable list. Failed IDs are not retried on every text edit;
      // retry() gives the user a bounded recovery path, even for the same IDs.
      if (!disposed && current === generation) publish({ ...state, loading: false, failed: true });
    }
  };

  return {
    start: () => request([]),
    observe(content: unknown) {
      if (disposed || content == null) return;
      references = [...new Set((JSON.stringify(content).match(UUIDS) ?? []).map(id => id.toLowerCase()))];
      if (state.assets === null) return;
      const known = new Set(state.assets.map(asset => asset.id));
      const fresh = references.filter(id => !known.has(id) && !attempted.has(id));
      if (fresh.length) void request(fresh);
    },
    retry() {
      if (disposed || state.loading) return;
      void request(references);
    },
    dispose() { disposed = true; generation++; },
  };
}
