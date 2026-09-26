import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import {stampLocalPreviewRequest,LOCAL_PROOF_HEADER,LOCAL_ORIGIN_HEADER} from "../scripts/lib/local-preview-proof.mjs";
import {prepareNextStandalone} from "../scripts/prepare-next-standalone.mjs";
import {restorableLocalTsconfig} from "../scripts/lib/local-preview-build.mjs";

const origin="http://127.0.0.1:3002",secret="a".repeat(64);
function request(extra={},remoteAddress="127.0.0.1"){
  const headers={host:"127.0.0.1:3002",[LOCAL_PROOF_HEADER]:"forged",[LOCAL_ORIGIN_HEADER]:"https://attacker.invalid","x-forwarded-for":"127.0.0.1",...extra};
  return {headers,rawHeaders:Object.entries(headers).flat(),socket:{remoteAddress}};
}

test("local runner replaces proof and rejects forwarded-address trust",()=>{
  const req=request();assert.equal(stampLocalPreviewRequest(req,{origin,secret}),true);
  assert.equal(req.headers[LOCAL_PROOF_HEADER],secret);assert.equal(req.headers[LOCAL_ORIGIN_HEADER],origin);
  assert.equal(req.headers["x-forwarded-for"],undefined);assert.ok(!req.rawHeaders.includes("forged"));
  const remote=request({},"203.0.113.2");assert.equal(stampLocalPreviewRequest(remote,{origin,secret}),false);
  assert.equal(remote.headers[LOCAL_PROOF_HEADER],undefined);assert.ok(!remote.rawHeaders.includes("forged"));
});

test("local runner rejects DNS rebinding, cross-origin and invalid origins",()=>{
  for(const extra of [{host:"attacker.invalid:3002"},{host:"127.0.0.1:3001"},{origin:"https://attacker.invalid"},{"sec-fetch-site":"cross-site"},{"sec-fetch-site":"same-site"}]){
    assert.equal(stampLocalPreviewRequest(request(extra),{origin,secret}),false);
  }
  for(const invalid of ["http://0.0.0.0:3002","http://127.0.0.1:99999","https://127.0.0.1:3002"]){
    assert.equal(stampLocalPreviewRequest(request(),{origin:invalid,secret}),false);
  }
});

test("Node compatibility env remains closed unless build and runner both opt in",async()=>{
  const source=await fs.readFile(new URL("../db/node-cloudflare-workers.ts",import.meta.url),"utf8");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [build,runtime] of [["0","0"],["0","1"],["1","0"],["1","1"]]){
    const exports={};vm.runInNewContext(js,{exports,process:{env:{NEXT_PUBLIC_FRAME_ZERO_LOCAL_PREVIEW:build,FRAME_ZERO_LOCAL_PREVIEW_SERVER:runtime,FRAME_ZERO_PREVIEW_WORKSPACE_SECRET:secret,FRAME_ZERO_LOCAL_PREVIEW_ORIGIN:origin}}});
    assert.equal(Object.keys(exports.env).length,build==="1"&&runtime==="1"?2:0);
    assert.equal(exports.env.DB,undefined);assert.ok(Object.isFrozen(exports.env));
  }
});

test("server gate accepts only authenticated configured loopback origin",async()=>{
  const source=(await fs.readFile(new URL("../app/preview-workspace/server.ts",import.meta.url),"utf8")).replace(/^import .*;\r?$/gm,"");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const env={FRAME_ZERO_PREVIEW_WORKSPACE_SECRET:secret,FRAME_ZERO_LOCAL_PREVIEW_ORIGIN:origin};
  const exports={};vm.runInNewContext(js,{exports,env});
  const headers=new Headers({[LOCAL_PROOF_HEADER]:secret,[LOCAL_ORIGIN_HEADER]:origin,"sec-fetch-site":"same-origin",origin});
  assert.equal(await exports.requirePreviewWorkspace({headers}),true);
  headers.set(LOCAL_PROOF_HEADER,"forged");assert.equal(await exports.requirePreviewWorkspace({headers}),false);
  headers.set(LOCAL_PROOF_HEADER,secret);headers.set(LOCAL_ORIGIN_HEADER,"http://127.0.0.1:3001");assert.equal(await exports.requirePreviewWorkspace({headers}),false);
  env.FRAME_ZERO_LOCAL_PREVIEW_ORIGIN="http://127.0.0.1:99999";assert.equal(await exports.requirePreviewWorkspace({headers}),false);
});

test("local artifact preparation is isolated from the normal production artifact",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"frame-zero-local-build-test-"));
  try{
    for(const directory of ["config","public",".next/static",".next-local-preview/static"])await fs.mkdir(path.join(root,directory),{recursive:true});
    await fs.writeFile(path.join(root,"config/production-public-files.json"),JSON.stringify({version:1,files:["favicon.svg"]}));
    await fs.writeFile(path.join(root,"public/favicon.svg"),"<svg/>");
    await fs.writeFile(path.join(root,".next/static/sentinel.js"),"normal");
    await fs.writeFile(path.join(root,".next-local-preview/static/local.js"),"local");
    const result=await prepareNextStandalone(root,".next-local-preview");
    assert.equal(await fs.readFile(path.join(root,".next/static/sentinel.js"),"utf8"),"normal");
    assert.equal(await fs.readFile(path.join(result.standaloneRoot,".next-local-preview/static/local.js"),"utf8"),"local");
    assert.deepEqual(await fs.readdir(path.join(result.standaloneRoot,"public")),["favicon.svg"]);
    await assert.rejects(prepareNextStandalone(root,"../outside"),/Unsupported/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test("local builds restore only generated tsconfig edits, preserving concurrent user changes",()=>{
  const original=JSON.stringify({compilerOptions:{strict:true},include:["**/*.ts",".next/types/**/*.ts"]});
  const generated=JSON.parse(original);generated.include.push(".next-local-preview/types/**/*.ts",".next-local-preview/dev/types/**/*.ts");
  assert.equal(restorableLocalTsconfig(original,JSON.stringify(generated,null,2)),original);
  generated.compilerOptions.strict=false;assert.equal(restorableLocalTsconfig(original,JSON.stringify(generated)),null);
  assert.equal(restorableLocalTsconfig(original,"invalid json"),null);
  const existing=JSON.stringify({...JSON.parse(original),include:["**/*.ts",".next-local-preview/types/**/*.ts"]});
  assert.equal(restorableLocalTsconfig(existing,existing),existing);
});
