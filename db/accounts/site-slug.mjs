const reserved = new Set(['admin','test','preview','api','login','logout','auth','_next','public','photos','fonts','favicon','assets','health','robots','sitemap','static','template-structure-previews']);

// Routing and operator provisioning must agree; never interpret a reserved URL
// or an arbitrary display name as a Site identity.
export function isSiteSlug(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{2,29}$/.test(value) && !reserved.has(value);
}
