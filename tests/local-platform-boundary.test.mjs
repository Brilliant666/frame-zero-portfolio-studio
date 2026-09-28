import assert from 'node:assert/strict';
import test from 'node:test';
import { readAccountConfig } from '../scripts/lib/account-config.mjs';
import { authOptions } from '../db/accounts/auth-options.mjs';
import { accountRequestAllowed } from '../db/accounts/http.mjs';
import { blocksLegacySource } from '../scripts/lib/local-platform-boundary.mjs';
const env = { FRAME_ZERO_LOCAL_ACCOUNTS:'1', FRAME_ZERO_ACCOUNT_DATABASE_URL:'postgresql://fixture:synthetic@127.0.0.1:55432/frame_zero_accounts', FRAME_ZERO_ACCOUNT_SECRET:'isolated-unit-test-configuration-secret' };
test('daily and preacceptance origins stay exact and database-bound', () => {
  for (const port of [3001,3003]) {
    const config=readAccountConfig({...env,FRAME_ZERO_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`});
    assert.equal(config.isTest,false); assert.deepEqual(authOptions(config).trustedOrigins,[config.origin]);
    assert.equal(authOptions(config).baseURL,config.origin);
  }
  for(const origin of ['http://127.0.0.1:3004','http://localhost:3001','https://untrusted.example','http://127.0.0.1:3001/']) assert.throws(()=>readAccountConfig({...env,FRAME_ZERO_ACCOUNT_ORIGIN:origin}));
  const testEnv={...env,FRAME_ZERO_ACCOUNT_DATABASE_URL:env.FRAME_ZERO_ACCOUNT_DATABASE_URL+'_test'};
  assert.equal(readAccountConfig({...testEnv,FRAME_ZERO_ACCOUNT_ORIGIN:'http://127.0.0.1:3004'}).isTest,true);
  for(const port of [3001,3003])assert.throws(()=>readAccountConfig({...testEnv,FRAME_ZERO_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`}));
});
test('Site Node lane rejects legacy private source aliases independently of login',()=>{
  for(const p of ['/photos/library/a.webp','/photos/library-manifest.json','/api/site-content','/api/preview/site-content','/api/platform-qr/a','/preview/admin','/admin','/%70hotos/a','/%2570hotos/a','/x/../photos/a','//photos/a'])assert.equal(blocksLegacySource(p),true,p);
  for(const p of ['/','/login','/test','/test/admin/template','/api/sites/fixture/assets','/fixture/admin/basic'])assert.equal(blocksLegacySource(p),false,p);
});
test('HEAD reads require socket proof and exact origin just like GET',()=>{
  const old=process.env.FRAME_ZERO_ACCOUNT_REQUEST_PROOF; process.env.FRAME_ZERO_ACCOUNT_REQUEST_PROOF='unit-proof';
  try {
    const config=readAccountConfig({...env,FRAME_ZERO_ACCOUNT_ORIGIN:'http://127.0.0.1:3001'});
    const make=(method,extra={})=>new Request(config.origin+'/api/sites/fixture/assets',{method,headers:{host:'127.0.0.1:3001','x-account-local-proof':'unit-proof',...extra}});
    assert.equal(accountRequestAllowed(make('HEAD'),config),true);
    assert.equal(accountRequestAllowed(make('HEAD',{origin:'http://127.0.0.1:3003'}),config),false);
    assert.equal(accountRequestAllowed(make('HEAD',{'x-account-local-proof':'forged'}),config),false);
    assert.equal(accountRequestAllowed(make('POST'),config),false);
  }finally{if(old===undefined)delete process.env.FRAME_ZERO_ACCOUNT_REQUEST_PROOF;else process.env.FRAME_ZERO_ACCOUNT_REQUEST_PROOF=old;}
});
