import { createHash } from 'node:crypto';

// GET and HEAD use weak comparison for If-None-Match, even though our response
// validator is a strong digest of the exact file bytes. Ignore malformed lists.
export function matchesAssetEtag(value, etag) {
  if (!value) return false;
  if (value.trim() === '*') return true;
  const tag = '(?:W/)?"[\\x21\\x23-\\x7e\\x80-\\xff]*"';
  if (!new RegExp(`^[\\t ]*${tag}(?:[\\t ]*,[\\t ]*${tag})*[\\t ]*$`).test(value)) return false;
  return (value.match(new RegExp(tag, 'g')) ?? []).some(candidate => candidate.replace(/^W\//, '') === etag);
}

// Call only after current Published membership, Site ownership and file reads
// have succeeded. Revalidation must never bypass a revoked public reference.
export function publicAssetResponse(request, file) {
  const etag = `"${createHash('sha256').update(file.bytes).digest('hex')}"`;
  const headers = {
    'Cache-Control': 'private, no-cache, must-revalidate',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Accept-Ranges': 'none',
  };
  if (matchesAssetEtag(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(file.bytes), {
    headers: { ...headers, 'Content-Type': file.type, 'Content-Length': String(file.bytes.length) },
  });
}
