import test from 'node:test';
import assert from 'node:assert/strict';
import { localAcceptanceEnabled, unpublishedAcceptanceRedirect, privateRedirect } from '../db/accounts/local-acceptance.mjs';

test('acceptance requires explicit server flags and process proof, never client query alone', async () => {
  const names = ['FRAME_ZERO_LOCAL_ACCEPTANCE','FRAME_ZERO_ACCOUNT_NODE_RUNTIME','FRAME_ZERO_LOCAL_ACCOUNTS','FRAME_ZERO_ACCOUNT_REQUEST_PROOF'];
  const previous = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const config = { origin: 'http://127.0.0.1:3003' };
  const request = new Request(config.origin + '/photographer', { headers: { host: '127.0.0.1:3003', 'x-account-local-proof': 'fixture-proof' } });
  try {
    for (const name of names) delete process.env[name];
    assert.equal(localAcceptanceEnabled(request, config), false);
    process.env.FRAME_ZERO_LOCAL_ACCEPTANCE = '1'; process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME = '1'; process.env.FRAME_ZERO_LOCAL_ACCOUNTS = '1'; process.env.FRAME_ZERO_ACCOUNT_REQUEST_PROOF = 'fixture-proof';
    assert.equal(localAcceptanceEnabled(request, config), true);
    assert.equal(localAcceptanceEnabled(new Request(config.origin + '/photographer?preview=1', { headers: { host: '127.0.0.1:3003' } }), config), false);
    process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME = '0'; assert.equal(localAcceptanceEnabled(request, config), false);
    process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME = '1';
    assert.equal(await unpublishedAcceptanceRedirect(request, { config }, 'photographer', true), null, 'Published response never replaced by draft');
    const response = privateRedirect('/photographer/admin/basic/profile'); assert.equal(response.status, 307); assert.match(response.headers.get('cache-control'), /no-store, private/); assert.equal(response.headers.get('vary'), 'Cookie');
  } finally { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
});
