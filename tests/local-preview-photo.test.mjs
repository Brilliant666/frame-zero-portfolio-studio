import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ts from "typescript";
import {createLocalPreviewPhotoHandler} from "../scripts/lib/local-preview-photo.mjs";

test("entry preparation shares relative and absolute URLs and waits for decoding",async()=>{
  const text=await fs.readFile(new URL("../app/templates/polaroid-field/entry-photos.ts",import.meta.url),"utf8");
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const oldImage=globalThis.Image,oldLocation=globalThis.location;
  let created=0,decode;
  globalThis.location={href:"http://127.0.0.1:3002/preview"};
  globalThis.Image=class{constructor(){created++;}set src(value){this.url=value;queueMicrotask(()=>value.includes("failed")?this.onerror():this.onload());}decode(){return new Promise(resolve=>{decode=resolve;});}};
  try {
    const {prepareEntryPhoto}=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
    const first=prepareEntryPhoto("/__local-preview-photo?src=test&w=600");
    const second=prepareEntryPhoto("http://127.0.0.1:3002/__local-preview-photo?src=test&w=600");
    assert.equal(first,second);assert.equal(created,1);
    await Promise.resolve();let settled=false;void first.then(()=>{settled=true;});
    await Promise.resolve();assert.equal(settled,false);decode();await first;assert.equal(settled,true);
    assert.equal(await prepareEntryPhoto("/failed"),false);
    assert.equal(await prepareEntryPhoto("/failed"),false);assert.equal(created,3);
  } finally {globalThis.Image=oldImage;globalThis.location=oldLocation;}
});

test("local preview image sizes are generated in memory without changing source",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"preview-photo-test-"));
  try {
    const folder=path.join(root,"public/photos/library");await fs.mkdir(folder,{recursive:true});
    const source=await sharp({create:{width:1100,height:1500,channels:3,background:"#aaccee"}}).webp().toBuffer();
    const file=path.join(folder,"test.webp");await fs.writeFile(file,source);
    const handler=createLocalPreviewPhotoHandler({root});
    const call=async(url,method="GET")=>{
      const result={};const response={writeHead(status,headers){Object.assign(result,{status,headers});return this;},end(body){result.body=body;return this;}};
      result.handled=await handler({url,method},response);return result;
    };
    const resized=await call("/__local-preview-photo?src=%2Fphotos%2Flibrary%2Ftest.webp&w=600");
    assert.equal(resized.status,200);assert.equal((await sharp(resized.body).metadata()).width,600);
    assert.deepEqual(await fs.readFile(file),source);assert.deepEqual(await fs.readdir(folder),["test.webp"]);
    assert.equal((await call("/__local-preview-photo?src=/photos/library/test.webp&w=9999")).status,400);
    assert.equal((await call("/__local-preview-photo?src=/photos/library/../../secrets.webp&w=600")).status,404);
    assert.equal((await call("/__local-preview-photo?src=https://example.com/photo.webp&w=600")).status,404);
    assert.equal((await call("/photos/library/test.webp","POST")).status,405);
    assert.equal((await call("/api/site-content")).handled,false);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
