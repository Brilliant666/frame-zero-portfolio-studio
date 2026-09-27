import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readAccountConfig } from './lib/account-config.mjs';
import { blocksLegacySource } from './lib/local-platform-boundary.mjs';
import { handleLocalAdminShortcut } from '../db/accounts/local-acceptance.mjs';

// Same Next application, explicit Node lane. No D1 binding or content migration.
const args = process.argv.slice(2);
if (args.includes('--daily')) process.env.FRAME_ZERO_ACCOUNT_ORIGIN = 'http://127.0.0.1:3001';
const config = readAccountConfig();
const test = process.argv.includes('--test');
if (args.some(arg => !['--test', '--daily'].includes(arg)) || (args.includes('--daily') && test) || config.isTest !== test) throw new Error('Account runner target mismatch.');
process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME = '1';
process.env.FRAME_ZERO_INTERNAL_TEST_AREA = '1';
process.env.FRAME_ZERO_NEXT_NODE_PARITY_BUILD = '1';
process.env.NODE_ENV = 'production';
const { default: next } = await import('next');
const port = Number(new URL(config.origin).port);
const proof = randomBytes(32).toString('hex');
process.env.FRAME_ZERO_ACCOUNT_REQUEST_PROOF = proof;
const app = next({ dev: false, hostname: '127.0.0.1', port });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer(async (request,response) => {
  if (!['127.0.0.1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') || request.headers.host !== `127.0.0.1:${port}`) {
    response.writeHead(403); response.end(); return;
  }
  // Reject, never trust, browser-supplied proxy identity. The local runner has no proxy.
  if (['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip'].some(key => key in request.headers)) {
    response.writeHead(403); response.end(); return;
  }
  if (blocksLegacySource(request.url ?? '')) {
    response.writeHead(404, { 'Cache-Control': 'no-store, private' }); response.end('Not available.'); return;
  }
  // Next itself adds forwarding headers; mark requests after socket validation.
  delete request.headers['x-account-local-proof'];
  request.headers['x-account-local-proof'] = proof;
  if (request.url === '/test/admin' && process.env.FRAME_ZERO_LOCAL_ACCEPTANCE === '1') {
    try {
      const shortcut = await handleLocalAdminShortcut(new Request(`${config.origin}/test/admin`, { method: request.method, headers: request.headers }));
      if (shortcut) { response.writeHead(shortcut.status, Object.fromEntries(shortcut.headers)); response.end(); return; }
    } catch { response.writeHead(503, { 'Cache-Control': 'no-store, private' }); response.end('Acceptance service unavailable.'); return; }
  }
  void handle(request,response);
});
server.listen(port,'127.0.0.1',() => console.log(`Local account Node validation: ${config.origin}/login`));
async function stop() { server.close(); await app.close(); process.exit(0); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
