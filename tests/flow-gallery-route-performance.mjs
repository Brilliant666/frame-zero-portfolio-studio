import assert from 'node:assert/strict';

const KINDS = ['javascript', 'css', 'image'];
const kindOf = type => ({ script: 'javascript', stylesheet: 'css', image: 'image' })[type] ?? null;
const byteValue = value => Number.isFinite(value) && value >= 0 ? value : null;

/** Chromium exposes the original wire status (304) separately from the merged
 * 200 response returned to page JavaScript. Retain flags and status only: never
 * persist CDP headers, cookies, security details or owner storage. */
export function resourceCacheEvidence(network) {
  if (!network?.responseObserved) return { cacheOrRevalidated: null, cacheSource: null, revalidated: null, wireStatus: null };
  const wireStatus = network.wireStatus ?? network.responseStatus;
  const revalidated = wireStatus === 304;
  const cacheSource = network.fromDiskCache ? 'disk' : network.servedFromCache ? 'memory-or-browser-cache' : network.fromPrefetchCache ? 'prefetch' : null;
  return { cacheOrRevalidated: revalidated || cacheSource !== null, cacheSource, revalidated, wireStatus };
}

/** Resource Timing transferSize includes HTTP headers and compressed payload;
 * encodedBodySize is the compressed representation, decodedBodySize is decoded.
 * A same-origin cache hit with a known body is measured zero transfer, unlike a
 * missing timing sample. No missing metric is silently reported as zero. */
export function summarizeRouteResources(resources) {
  return Object.fromEntries(KINDS.map(kind => {
    const rows = resources.filter(row => row.kind === kind);
    const metrics = Object.fromEntries(['transferBytes', 'encodedBodyBytes', 'decodedBodyBytes'].map(key => {
      const known = rows.map(row => row[key]).filter(value => value !== null && value !== undefined);
      return [key, rows.length && known.length === rows.length ? known.reduce((sum, value) => sum + value, 0) : null];
    }));
    return [kind, {
      status: !rows.length ? 'NOT_MEASURED' : rows.every(row => row.status === 'MEASURED') ? 'MEASURED' : 'PARTIAL',
      requests: rows.length, measuredRequests: rows.filter(row => row.status === 'MEASURED').length,
      cacheEvidenceRequests: rows.filter(row => typeof row.cacheOrRevalidated === 'boolean').length,
      cacheOrRevalidatedRequests: rows.length && rows.every(row => typeof row.cacheOrRevalidated === 'boolean') ? rows.filter(row => row.cacheOrRevalidated === true).length : null,
      ...metrics,
    }];
  }));
}

/** Caller owns the synthetic Site, server and browser. Fresh contexts have no
 * Playwright routes (routing disables HTTP cache), then reload in the same
 * context measures a real warm visit. Owner storage is used in memory only and
 * never returned. This measures loaded route assets, not all gallery/lightbox
 * resources, all-template budgets, real clients, or internet delivery. */
export async function measureFlowGalleryRoutes({ browser, origin, fixtureSlug, ownerStorageState, viewport, signal }) {
  assert.equal(origin, 'http://127.0.0.1:3004', 'Performance measurement is limited to the isolated fixture server');
  assert.match(fixtureSlug, /^flowux[a-z0-9_-]*$/, 'Performance must use a synthetic Flow UX Site');
  const results = [];
  for (const route of [
    { name: 'flow-public', path: `/${fixtureSlug}#works`, expected: '[data-flow-scene="works"]' },
    { name: 'flow-admin', path: `/${fixtureSlug}/admin/premium-flow-gallery`, expected: '[data-flow-editor-section]' },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', ...(route.name === 'flow-admin' ? { storageState: ownerStorageState } : {}) });
    const page = await context.newPage();
    const network = await context.newCDPSession(page);
    await network.send('Network.enable');
    const networkRequests = new Map();
    const requestEntry = requestId => {
      if (!networkRequests.has(requestId)) networkRequests.set(requestId, {});
      return networkRequests.get(requestId);
    };
    network.on('Network.requestWillBeSent', ({ requestId, request, wallTime }) => {
      if (new URL(request.url).origin === origin) Object.assign(requestEntry(requestId), { url: request.url, startTime: wallTime * 1000 });
    });
    network.on('Network.requestServedFromCache', ({ requestId }) => { requestEntry(requestId).servedFromCache = true; });
    network.on('Network.responseReceived', ({ requestId, response }) => {
      Object.assign(requestEntry(requestId), { responseObserved: true, responseStatus: response.status, fromDiskCache: response.fromDiskCache === true, fromPrefetchCache: response.fromPrefetchCache === true });
    });
    network.on('Network.responseReceivedExtraInfo', ({ requestId, statusCode }) => { requestEntry(requestId).wireStatus = statusCode; });
    const violations = [];
    const requests = [];
    let current = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) violations.push(`${request.method()} ${url.pathname}`);
    });
    const record = async response => {
      const request = response.request(), url = new URL(response.url()), kind = kindOf(request.resourceType());
      if (!kind || url.origin !== origin) return;
      const row = { request, path: url.pathname, kind, httpStatus: response.status(), contentEncoding: null };
      current.push(row);
      const headers = await response.allHeaders();
      row.contentEncoding = headers['content-encoding'] || 'identity';
      await response.finished();
    };
    const onResponse = response => { requests.push(record(response)); };
    page.on('response', onResponse);
    try {
      for (const visit of ['cold', 'warm']) {
        signal?.throwIfAborted(); current = []; requests.length = 0; networkRequests.clear();
        if (visit === 'cold') await page.goto(`${origin}${route.path}`, { waitUntil: 'load' });
        else await page.reload({ waitUntil: 'load' });
        await page.locator(route.expected).waitFor({ state: 'visible' });
        await page.waitForFunction(() => [...document.images].filter(image => image.loading !== 'lazy').every(image => image.complete));
        const settled = await page.waitForLoadState('networkidle', { timeout: 15000 }).then(() => true, () => false);
        await Promise.all(requests);
        const timing = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({
          name: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
        })));
        const available = timing.map(row => ({ ...row, used: false }));
        const cacheRequests = [...networkRequests.values()].map(row => ({ ...row, used: false }));
        const resources = current.map(row => {
          const sample = available.find(entry => !entry.used && entry.name === row.request.url());
          if (sample) sample.used = true;
          // All resources are same-origin. An all-zero sample may have been
          // blocked or failed; count it as unknown rather than a free download.
          const measured = Boolean(sample && (sample.encodedBodySize > 0 || sample.decodedBodySize > 0 || sample.transferSize > 0) && row.httpStatus < 400);
          const startTime = row.request.timing().startTime;
          const cache = cacheRequests.filter(entry => !entry.used && entry.url === row.request.url()).sort((left, right) => Math.abs(left.startTime - startTime) - Math.abs(right.startTime - startTime))[0];
          if (cache) cache.used = true;
          return { path: row.path, kind: row.kind, httpStatus: row.httpStatus, contentEncoding: row.contentEncoding,
            status: measured ? 'MEASURED' : 'NOT_MEASURED', reason: measured ? null : sample ? 'empty_or_failed_resource_timing' : 'resource_timing_missing',
            transferBytes: measured ? byteValue(sample.transferSize) : null,
            encodedBodyBytes: measured ? byteValue(sample.encodedBodySize) : null,
            decodedBodyBytes: measured ? byteValue(sample.decodedBodySize) : null,
            ...resourceCacheEvidence(cache),
          };
        });
        assert.deepEqual(violations, [], 'Performance navigation must stay on-origin and read-only');
        results.push({ route: route.name, path: route.path, visit, viewport, cache: 'browser HTTP cache enabled; fresh context for cold, same-context reload for warm',
          networkSettled: settled, status: !resources.length ? 'NOT_MEASURED' : settled && resources.every(row => row.status === 'MEASURED') ? 'MEASURED' : 'PARTIAL',
          scope: 'Loaded JS/CSS/images at initial route; transferred bytes include headers; no size threshold or budget policy change',
          cacheEvidence: 'CDP cache flags and wire response status, independent of resource body size',
          totals: summarizeRouteResources(resources), resources });
      }
    } finally { page.off('response', onResponse); await network.detach(); await context.close(); }
  }
  return results;
}
