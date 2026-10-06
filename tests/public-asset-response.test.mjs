import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { matchesAssetEtag, publicAssetResponse } from '../db/accounts/public-asset-response.mjs';

const file = { bytes: Buffer.from('anonymous-public-image'), type: 'image/webp' };
const etag = `"${createHash('sha256').update(file.bytes).digest('hex')}"`;
const request = (method = 'GET', validator) => new Request('https://example.invalid/public-image', { method, headers: validator === undefined ? {} : { 'If-None-Match': validator } });

test('public file has a strong content validator and requires private revalidation', async () => {
  const response = publicAssetResponse(request(), file);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('etag'), etag);
  assert.equal(response.headers.get('cache-control'), 'private, no-cache, must-revalidate');
  assert.equal(response.headers.get('content-type'), file.type);
  assert.equal(response.headers.get('content-length'), String(file.bytes.length));
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('accept-ranges'), 'none');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), file.bytes);
  assert.notEqual(publicAssetResponse(request(), { ...file, bytes: Buffer.from('different-bytes') }).headers.get('etag'), etag);
});

test('GET and HEAD matching strong, weak, list or wildcard validators return empty 304', async () => {
  for (const method of ['GET', 'HEAD']) for (const validator of [etag, `W/${etag}`, `"stale", W/${etag}`, '*']) {
    const response = publicAssetResponse(request(method, validator), file);
    assert.equal(response.status, 304, `${method}: ${validator}`);
    assert.equal(response.headers.get('etag'), etag);
    assert.equal(response.headers.get('cache-control'), 'private, no-cache, must-revalidate');
    assert.equal(response.headers.get('content-length'), null);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
});

test('stale and malformed validators send current representation; HEAD has metadata without bytes', async () => {
  for (const validator of [undefined, '"stale"', 'stale', `invalid, ${etag}`, `*, ${etag}`, `${etag},`, `w/${etag}`]) {
    assert.equal(publicAssetResponse(request('GET', validator), file).status, 200);
  }
  const head = publicAssetResponse(request('HEAD', '"stale"'), file);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(file.bytes.length));
  assert.equal(head.headers.get('etag'), etag);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('entity-tag lists may contain comma inside opaque tags', () => {
  assert.equal(matchesAssetEtag(`"not,this,one",\tW/${etag} `, etag), true);
  assert.equal(matchesAssetEtag('"not,this,one"', etag), false);
});
