import { accountRequestAllowed, getAccountRuntime } from './http.mjs';
import { handleSiteEntry } from './site-entry.mjs';
import { readPublished } from './publications.mjs';

// Retain the existing non-streaming HTTP errors and local acceptance redirect.
// Only an actual Published snapshot proceeds to the React SSR renderer.
export async function publicSiteGate(request, slug) {
  try {
    const runtime = getAccountRuntime();
    if (new URL(request.url).search || !accountRequestAllowed(request, runtime.config)) return handleSiteEntry(request, slug);
    if (!await readPublished(runtime.pool, slug)) return handleSiteEntry(request, slug);
    return null;
  } catch { return handleSiteEntry(request, slug); }
}
