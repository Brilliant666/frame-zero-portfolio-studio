// The Site Node lane never exposes private legacy sources, even when the project
// public directory points at a photographer's existing library. The old isolated
// legacy process is the fallback; it is not an authorization backdoor here.
export function blocksLegacySource(requestTarget) {
  try {
    let target = requestTarget;
    for (let i = 0; i < 4 && /%[a-f0-9]{2}/i.test(target); i++) target = decodeURIComponent(target);
    if (target.includes('\\') || target.includes('%') || !target.startsWith('/') || target.startsWith('//')) return true;
    const pathname = new URL(target, 'http://loopback.invalid').pathname;
    return /^\/(?:photos|platform-qr|preview|admin)(?:\/|$)/.test(pathname)
      || /^\/api\/(?:site-content|preview|platform-qr|local-photos|photo-import)(?:\/|$)/.test(pathname);
  } catch { return true; }
}
