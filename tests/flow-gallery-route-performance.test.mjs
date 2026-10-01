import assert from 'node:assert/strict';
import test from 'node:test';
import { resourceCacheEvidence, summarizeRouteResources } from './flow-gallery-route-performance.mjs';

test('route performance separates compressed, decoded and real cached transfers', () => {
  const result = summarizeRouteResources([
    { kind: 'javascript', status: 'MEASURED', transferBytes: 320, encodedBodyBytes: 200, decodedBodyBytes: 900, cacheOrRevalidated: false },
    { kind: 'javascript', status: 'MEASURED', transferBytes: 0, encodedBodyBytes: 150, decodedBodyBytes: 600, cacheOrRevalidated: true },
    { kind: 'css', status: 'MEASURED', transferBytes: 80, encodedBodyBytes: 400, decodedBodyBytes: 800, cacheOrRevalidated: true },
  ]);
  assert.deepEqual(result.javascript, { status: 'MEASURED', requests: 2, measuredRequests: 2, cacheEvidenceRequests: 2, cacheOrRevalidatedRequests: 1, transferBytes: 320, encodedBodyBytes: 350, decodedBodyBytes: 1500 });
  assert.equal(result.css.transferBytes, 80);
  assert.equal(result.image.status, 'NOT_MEASURED');
  assert.equal(result.image.transferBytes, null);
});

test('missing and partial resource measurements never become a zero-byte success', () => {
  const result = summarizeRouteResources([
    { kind: 'image', status: 'MEASURED', transferBytes: 1200, encodedBodyBytes: 1000, decodedBodyBytes: 1000 },
    { kind: 'image', status: 'NOT_MEASURED', transferBytes: null, encodedBodyBytes: null, decodedBodyBytes: null },
  ]);
  assert.equal(result.image.status, 'PARTIAL');
  assert.equal(result.image.requests, 2);
  assert.equal(result.image.measuredRequests, 1);
  assert.equal(result.image.transferBytes, null);
  assert.equal(result.image.encodedBodyBytes, null);
  assert.equal(result.image.cacheOrRevalidatedRequests, null);
});

test('tiny resource revalidation uses wire 304 rather than comparing payload and header sizes', () => {
  const evidence = resourceCacheEvidence({ responseObserved: true, responseStatus: 200, wireStatus: 304 });
  assert.deepEqual(evidence, { cacheOrRevalidated: true, cacheSource: null, revalidated: true, wireStatus: 304 });
  const totals = summarizeRouteResources([{ kind: 'image', status: 'MEASURED', transferBytes: 300, encodedBodyBytes: 60, decodedBodyBytes: 60, ...evidence }]);
  assert.equal(totals.image.cacheOrRevalidatedRequests, 1, 'A 304 may transfer more header bytes than a small WebP body');
  assert.deepEqual(resourceCacheEvidence({ responseObserved: true, responseStatus: 200, servedFromCache: true }), { cacheOrRevalidated: true, cacheSource: 'memory-or-browser-cache', revalidated: false, wireStatus: 200 });
  assert.deepEqual(resourceCacheEvidence({ responseObserved: true, responseStatus: 200, fromDiskCache: true }), { cacheOrRevalidated: true, cacheSource: 'disk', revalidated: false, wireStatus: 200 });
  assert.equal(resourceCacheEvidence({ responseObserved: true, responseStatus: 200 }).cacheOrRevalidated, false);
  assert.equal(resourceCacheEvidence({ wireStatus: 304 }).cacheOrRevalidated, null, 'An unmatched/incomplete network observation remains unknown');
});
