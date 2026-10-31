import assert from 'node:assert/strict';
import test from 'node:test';
import { JSON_BODY_LIMITS, MAX_JSON_READERS, readBoundedBytes, readBoundedText, RequestBodyError } from '../db/accounts/request-body.mjs';

test('declared oversized and malformed bodies fail before acquiring a stream reader', async () => {
  for (const [value, status] of [['999999999999999999999999', 413], ['not-a-length', 400]]) {
    let acquired = false;
    const request = { headers: new Headers({ 'content-length': value }), body: { getReader() { acquired = true; throw Error('must not read'); } } };
    await assert.rejects(readBoundedBytes(request, { maximum: JSON_BODY_LIMITS.auth }), error => error instanceof RequestBodyError && error.status === status);
    assert.equal(acquired, false);
  }
});

test('chunked JSON is bounded by bytes before the entire stream is buffered', async () => {
  let reads = 0, cancelled = false;
  const body = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } });
  const request = new Request('http://fixture', { method: 'POST', body, duplex: 'half' });
  await assert.rejects(readBoundedText(request, { maximum: 10 }), error => error.status === 413);
  assert.ok(reads <= 3);
  assert.equal(cancelled, true);
  await assert.rejects(readBoundedText(new Request('http://fixture', { method: 'POST', body: '星空' }), { maximum: 5 }), error => error.status === 413, 'UTF-8 bytes, not JS character count');
});

test('cancellation failure cannot replace oversize error or stall the request', async () => {
  const request = new Request('http://fixture', {
    method: 'POST', duplex: 'half',
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(20)); }, cancel() { return new Promise(() => {}); } }),
  });
  await assert.rejects(readBoundedBytes(request, { maximum: 10, timeoutMs: 20 }), error => error.status === 413);
});

test('slow body timeout remains a timeout even when cancelling resolves the pending read', async () => {
  let cancelled = false;
  const request = new Request('http://fixture', { method: 'POST', duplex: 'half', body: new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } }) });
  await assert.rejects(readBoundedText(request, { maximum: 10, timeoutMs: 10 }), error => error.status === 408 && error.message === 'REQUEST_TIMEOUT');
  assert.equal(cancelled, true);
});

test('abort and reader errors have fixed responses without internal details', async () => {
  const abort = new AbortController();
  const request = new Request('http://fixture', { method: 'POST', signal: abort.signal, duplex: 'half', body: new ReadableStream({ pull() { return new Promise(() => {}); } }) });
  const result = readBoundedBytes(request, { maximum: 10 });
  abort.abort(new Error('/private/credentials'));
  await assert.rejects(result, error => error.message === 'REQUEST_INTERRUPTED' && error.status === 400);
  const failed = new Request('http://fixture', { method: 'POST', duplex: 'half', body: new ReadableStream({ start(controller) { controller.error(new Error('/private/storage')); } }) });
  await assert.rejects(readBoundedBytes(failed, { maximum: 10 }), error => error.message === 'REQUEST_INTERRUPTED');
});

test('valid UTF-8, binary, allowed empty auth and invalid UTF-8 stay distinct', async () => {
  assert.equal(await readBoundedText(new Request('http://fixture', { method: 'POST', body: '星空' }), { maximum: 6 }), '星空');
  const binary = new Uint8Array([255, 0, 1]);
  assert.deepEqual(await readBoundedBytes(new Request('http://fixture', { method: 'POST', body: binary }), { maximum: 3 }), Buffer.from(binary));
  await assert.rejects(readBoundedText(new Request('http://fixture', { method: 'POST', body: binary }), { maximum: 3 }), /INVALID_REQUEST_BODY/);
  assert.equal(await readBoundedText(new Request('http://fixture', { method: 'POST' }), { maximum: 10, emptyAllowed: true }), '');
  await assert.rejects(readBoundedBytes(new Request('http://fixture', { method: 'POST' }), { maximum: 10 }), /EMPTY_REQUEST_BODY/);
});

test('eight held JSON reads reject the ninth and abort returns every slot without blocking binary uploads', async () => {
  assert.equal(MAX_JSON_READERS, 8);
  const controllers = Array.from({ length: MAX_JSON_READERS }, () => new AbortController());
  const reads = controllers.map(controller => readBoundedText(new Request('http://fixture', {
    method: 'POST', duplex: 'half', signal: controller.signal,
    body: new ReadableStream({ pull() { return new Promise(() => {}); } }),
  }), { maximum: JSON_BODY_LIMITS.draft }));
  const completed = Promise.allSettled(reads);
  try {
    await assert.rejects(readBoundedText(new Request('http://fixture', { method: 'POST', body: '{}' }), { maximum: JSON_BODY_LIMITS.auth }),
      error => error instanceof RequestBodyError && error.status === 429 && error.message === 'JSON_REQUEST_BUSY');
    assert.deepEqual(await readBoundedBytes(new Request('http://fixture', { method: 'POST', body: new Uint8Array([1, 2]) }), { maximum: 2 }), Buffer.from([1, 2]), 'Binary upload reader does not share the JSON limit');
  } finally { controllers.forEach(controller => controller.abort()); }
  const results = await completed;
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.message === 'REQUEST_INTERRUPTED'));
  assert.equal(await readBoundedText(new Request('http://fixture', { method: 'POST', body: '{}' }), { maximum: JSON_BODY_LIMITS.auth }), '{}', 'All JSON slots become available again');
});

test('anonymous reads cannot exhaust authenticated writes and one principal cannot block another', async () => {
  const held = [];
  function hold(bucket, principal) {
    const controller = new AbortController();
    const read = readBoundedText(new Request('http://fixture', {
      method: 'POST', duplex: 'half', signal: controller.signal,
      body: new ReadableStream({ pull() { return new Promise(() => {}); } }),
    }), { maximum: 2048, bucket, principal });
    held.push(controller); return read;
  }
  const reads = Array.from({ length: MAX_JSON_READERS }, () => hold('auth'));
  const done = Promise.allSettled(reads);
  try {
    const request = () => new Request('http://fixture', { method: 'POST', body: '{}' });
    await assert.rejects(readBoundedText(request(), { maximum: 2048, bucket: 'auth' }), error => error.status === 429);
    assert.equal(await readBoundedText(request(), { maximum: 2048, bucket: 'editor', principal: 'owner-a' }), '{}');
    const writes = [hold('editor', 'owner-a'), hold('editor', 'owner-a')];
    const writesDone = Promise.allSettled(writes);
    await assert.rejects(readBoundedText(request(), { maximum: 2048, bucket: 'editor', principal: 'owner-a' }), error => error.status === 429);
    assert.equal(await readBoundedText(request(), { maximum: 2048, bucket: 'editor', principal: 'owner-b' }), '{}');
    held.forEach(controller => controller.abort());
    await writesDone;
    assert.equal(await readBoundedText(request(), { maximum: 2048, bucket: 'editor', principal: 'owner-a' }), '{}');
    await assert.rejects(readBoundedText(request(), { maximum: 2048, bucket: 'editor' }), TypeError);
    await assert.rejects(readBoundedText(request(), { maximum: 2048, bucket: 'unknown' }), TypeError);
  } finally { held.forEach(controller => controller.abort()); await done; }
});

test('authenticated global capacity and principal slots return after timeout or malformed UTF-8', async () => {
  const controllers = Array.from({ length: MAX_JSON_READERS }, () => new AbortController());
  const reads = controllers.map((controller, i) => readBoundedText(new Request('http://fixture', {
    method: 'POST', duplex: 'half', signal: controller.signal,
    body: new ReadableStream({ pull() { return new Promise(() => {}); } }),
  }), { maximum: 10, bucket: 'editor', principal: `owner-${i}` }));
  const done = Promise.allSettled(reads);
  try {
    await assert.rejects(readBoundedText(new Request('http://fixture', { method: 'POST', body: '{}' }), { maximum: 10, bucket: 'editor', principal: 'other' }), e => e.status === 429);
    assert.equal(await readBoundedText(new Request('http://fixture', { method: 'POST', body: '{}' }), { maximum: 10, bucket: 'auth' }), '{}');
  } finally { controllers.forEach(c => c.abort()); await done; }
  await assert.rejects(readBoundedText(new Request('http://fixture', { method: 'POST', body: new Uint8Array([255]) }), { maximum: 10, bucket: 'editor', principal: 'other' }), /INVALID_REQUEST_BODY/);
  await assert.rejects(readBoundedText(new Request('http://fixture', { method: 'POST', duplex: 'half', body: new ReadableStream({ pull() { return new Promise(() => {}); } }) }), { maximum: 10, timeoutMs: 10, bucket: 'editor', principal: 'other' }), e => e.status === 408);
  assert.equal(await readBoundedText(new Request('http://fixture', { method: 'POST', body: '{}' }), { maximum: 10, bucket: 'editor', principal: 'other' }), '{}');
});
