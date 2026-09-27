import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { provisionAccount } from '../db/accounts/provision.mjs';
import { readPublished } from '../db/accounts/publications.mjs';

export async function publicationIntegration({runtime,origin,password,restart}) {
  for(const [name,premium] of [['publishfixturea',true],['publishfixtureb',false],['publishfixturec',true]]) await provisionAccount(runtime,{username:name,slug:name,email:`${name}@example.invalid`,password,premium});
  const req=(path,cookie,body)=>fetch(`${origin}${path}`,{headers:{origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const login=async name=>{const r=await req('/api/auth/sign-in/username',null,{username:name,password});assert.equal(r.status,200);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');};
  let a=await login('publishfixturea');const b=await login('publishfixtureb'),c=await login('publishfixturec');
  const path='/api/sites/publishfixturea/publications/premium-polaroid';
  const draftPath='/api/sites/publishfixturea/drafts/premium-polaroid';
  const draft=(await (await req(draftPath,a)).json()).content;
  const images=[];
  for(const color of ['#123456','#6789ab']){
    const bytes=await sharp({create:{width:90,height:60,channels:3,background:color}}).png().toBuffer();
    const r=await fetch(`${origin}/api/sites/publishfixturea/assets`,{method:'POST',headers:{origin,cookie:a,'content-type':'image/png','x-file-name':'fixture.png'},body:bytes});assert.equal(r.status,201);images.push((await r.json()).asset.id);
  }
  draft.profile.photographer='Published Photographer A';
  draft.collections=images.map((id,i)=>({id:randomUUID(),name:i?'Private hidden collection':'Public collection',description:'',visible:!i,assetIds:[id],coverAssetId:id,focusAssetId:null,coverFit:'natural',coverFocusX:50,coverFocusY:50}));
  const save=async revision=>fetch(`${origin}${draftPath}`,{method:'PUT',headers:{origin,cookie:a,'content-type':'application/json'},body:JSON.stringify({content:draft,expectedRevision:revision})});
  assert.equal((await save(0)).status,200);
  assert.equal(await readPublished(runtime.pool,'publishfixturea'),null);
  for(const [cookie,status] of [[null,401],[b,403]])assert.equal((await req(path,cookie,{action:'publish',expectedDraftRevision:1,expectedPublicationId:null})).status,status);
  assert.equal((await req('/api/sites/publishfixtureb/publications/premium-polaroid',b,{action:'publish',expectedDraftRevision:1,expectedPublicationId:null})).status,403);
  assert.equal((await req(path,a,{action:'publish',expectedDraftRevision:2,expectedPublicationId:null})).status,409);
  const concurrent=await Promise.all([0,1].map(()=>req(path,a,{action:'publish',expectedDraftRevision:1,expectedPublicationId:null})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409],'same expected pointer permits exactly one publisher');
  const first=(await concurrent.find(r=>r.status===200).json()).publication;
  assert.equal((await req('/api/sites/publishfixturec/publications/premium-polaroid',c,{action:'rollback',revisionId:first.id,expectedPublicationId:null})).status,404,'premium owner cannot use another Site history UUID');
  assert.equal((await req(path,c,{action:'rollback',revisionId:first.id,expectedPublicationId:first.id})).status,403);
  const crossOrigin=await fetch(`${origin}${path}`,{method:'POST',headers:{origin:'https://untrusted.example',cookie:a,'content-type':'application/json'},body:JSON.stringify({action:'publish',expectedDraftRevision:1,expectedPublicationId:first.id})});
  assert.equal(crossOrigin.status,403);
  const snapshot=await readPublished(runtime.pool,'publishfixturea');assert.deepEqual(snapshot.assetIds,[images[0]]);assert.equal(snapshot.content.collections.length,1);
  for(const variant of ['thumbnail','card','full'])assert.equal((await req(`/api/public-sites/publishfixturea/assets/${images[0]}/${variant}`)).status,200);
  for(const [slug,id,variant] of [['publishfixturea',images[1],'full'],['publishfixtureb',images[0],'full'],['publishfixturea',images[0],'original']])assert.equal((await req(`/api/public-sites/${slug}/assets/${id}/${variant}`)).status,404);
  assert.equal((await req(`/api/sites/publishfixturea/assets/${images[0]}/full`)).status,401);
  const html=await (await req('/publishfixturea')).text();assert.match(html,/Published Photographer A/);assert.doesNotMatch(html,/Private hidden collection/);
  await assert.rejects(runtime.pool.query('UPDATE site_publication_revisions SET content=content WHERE id=$1',[first.id]),/immutable/);
  draft.profile.photographer='Unpublished change';assert.equal((await save(1)).status,200);
  assert.equal((await readPublished(runtime.pool,'publishfixturea')).content.profile.photographer,'Published Photographer A');
  const secondResponse=await req(path,a,{action:'publish',expectedDraftRevision:2,expectedPublicationId:first.id});assert.equal(secondResponse.status,200);const second=(await secondResponse.json()).publication;
  assert.equal((await req(path,a,{action:'publish',expectedDraftRevision:2,expectedPublicationId:first.id})).status,409);
  assert.equal((await req(path,a,{action:'rollback',revisionId:first.id,expectedPublicationId:first.id})).status,409);
  assert.equal((await req(path,a,{action:'rollback',revisionId:randomUUID(),expectedPublicationId:second.id})).status,404);
  assert.equal((await req(path,a,{action:'rollback',revisionId:first.id,expectedPublicationId:second.id})).status,200);
  await restart();a=await login('publishfixturea');
  assert.equal((await readPublished(runtime.pool,'publishfixturea')).id,first.id);
  const history=await(await req(path,a)).json();assert.equal(history.history.length,2);assert.equal(history.current.id,first.id);
  assert.equal((await(await req(draftPath,a)).json()).content.profile.photographer,'Unpublished change');
  assert.equal((await req('/api/auth/sign-out',a,{})).status,200);
  assert.equal((await req(path,a,{action:'publish',expectedDraftRevision:2,expectedPublicationId:first.id})).status,401,'signed-out session cannot publish');
  a=await login('publishfixturea');
  await runtime.pool.query('UPDATE "session" SET expires_at=timezone(\'UTC\',now())-interval \'1 minute\' WHERE user_id=(SELECT id FROM "user" WHERE username=$1)',['publishfixturea']);
  assert.equal((await req(path,a,{action:'rollback',revisionId:first.id,expectedPublicationId:first.id})).status,401,'expired session cannot rollback');
  assert.equal((await readPublished(runtime.pool,'publishfixturea')).id,first.id);
}
