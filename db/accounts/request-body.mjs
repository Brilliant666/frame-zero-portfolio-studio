// Limits apply while streaming, before allocating the complete request body.
export const JSON_BODY_LIMITS = Object.freeze({ auth: 2048, draft: 512000, publication: 2048 });
export const MAX_JSON_READERS = 8;
export const MAX_PRINCIPAL_JSON_READERS = 2;
export const AUTH_BODY_TIMEOUT_MS = 2_000;
const activeJsonReaders = { auth: 0, editor: 0 };
const principalReaders = new Map();
export class RequestBodyError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export async function readBoundedBytes(request, { maximum, timeoutMs = 10_000, emptyAllowed = false } = {}) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Invalid request body policy.');
  }
  const declared = request.headers.get('content-length');
  if (declared !== null && !/^\d+$/.test(declared)) throw new RequestBodyError('INVALID_CONTENT_LENGTH');
  if (declared !== null && Number(declared) > maximum) throw new RequestBodyError('REQUEST_TOO_LARGE', 413);
  if (request.signal?.aborted) throw new RequestBodyError('REQUEST_INTERRUPTED');
  if (!request.body) {
    if (emptyAllowed) return Buffer.alloc(0);
    throw new RequestBodyError('EMPTY_REQUEST_BODY');
  }
  let reader;
  try { reader = request.body.getReader(); } catch { throw new RequestBodyError('INVALID_REQUEST_BODY'); }
  const parts = [];
  let size = 0, timer, abort, interruption;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const interrupted = new Promise((_, reject) => {
    const fail = error => { interruption = error; reject(error); cancel(); };
    timer = setTimeout(() => fail(new RequestBodyError('REQUEST_TIMEOUT', 408)), timeoutMs);
    abort = () => fail(new RequestBodyError('REQUEST_INTERRUPTED'));
    request.signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    for (;;) {
      let chunk;
      try { chunk = await Promise.race([reader.read(), interrupted]); }
      catch (error) {
        if (error instanceof RequestBodyError) throw error;
        throw new RequestBodyError('REQUEST_INTERRUPTED');
      }
      if (interruption) throw interruption;
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new RequestBodyError('INVALID_REQUEST_BODY');
      size += chunk.value.byteLength;
      if (size > maximum) { cancel(); throw new RequestBodyError('REQUEST_TOO_LARGE', 413); }
      parts.push(Buffer.from(chunk.value));
    }
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', abort);
    try { reader.releaseLock(); } catch { /* A cancelled pending read owns no application state. */ }
  }
  if (!size && !emptyAllowed) throw new RequestBodyError('EMPTY_REQUEST_BODY');
  return Buffer.concat(parts, size);
}

export async function readBoundedText(request, { bucket = 'auth', principal, ...policy } = {}) {
  if (!Object.hasOwn(activeJsonReaders, bucket) || bucket === 'editor' && (typeof principal !== 'string' || !principal)) {
    throw new TypeError('Invalid request body scope.');
  }
  const held = bucket === 'editor' ? principalReaders.get(principal) ?? 0 : 0;
  if (activeJsonReaders[bucket] >= MAX_JSON_READERS || bucket === 'editor' && held >= MAX_PRINCIPAL_JSON_READERS) {
    throw new RequestBodyError('JSON_REQUEST_BUSY', 429);
  }
  activeJsonReaders[bucket]++;
  if (bucket === 'editor') principalReaders.set(principal, held + 1);
  try {
    const bytes = await readBoundedBytes(request, policy);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new RequestBodyError('INVALID_REQUEST_BODY'); }
  } finally {
    activeJsonReaders[bucket]--;
    if (bucket === 'editor') {
      const remaining = principalReaders.get(principal) - 1;
      if (remaining) principalReaders.set(principal, remaining);
      else principalReaders.delete(principal);
    }
  }
}
