#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stampLocalPreviewRequest } from "./lib/local-preview-proof.mjs";
import { createLocalPreviewPhotoHandler } from "./lib/local-preview-photo.mjs";

const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=="--port"))throw new Error("Usage: node scripts/start-local-preview.mjs [--port 3002]");
const port=Number(args[1] ?? 3002);
if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error("Choose a port from 1024 through 65535.");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const artifact=path.join(root,".next-local-preview","standalone");
await access(path.join(artifact,"server.js"));
const origin=`http://127.0.0.1:${port}`,secret=randomBytes(32).toString("hex");
const reserve=http.createServer();
await new Promise((resolve,reject)=>{reserve.once("error",reject);reserve.listen(0,"127.0.0.1",resolve);});
const backendPort=reserve.address().port;
await new Promise((resolve,reject)=>reserve.close(error=>error?reject(error):resolve()));
const child=spawn(process.execPath,[path.join(artifact,"server.js")],{cwd:artifact,windowsHide:true,stdio:"inherit",env:{
  ...process.env,NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(backendPort),
  FRAME_ZERO_LOCAL_PREVIEW_SERVER:"1",FRAME_ZERO_PREVIEW_WORKSPACE_SECRET:secret,FRAME_ZERO_LOCAL_PREVIEW_ORIGIN:origin,
}});
const photoHandler=createLocalPreviewPhotoHandler({root});
const server=http.createServer(async(request,response)=>{
  response.setHeader("Cache-Control","no-store, private");
  if(!stampLocalPreviewRequest(request,{origin,secret})){response.writeHead(403);response.end("Loopback preview only.");return;}
  try {
    if(await photoHandler(request,response))return;
    const upstream=http.request({hostname:"127.0.0.1",port:backendPort,path:request.url,method:request.method,headers:request.headers},incoming=>{
      response.writeHead(incoming.statusCode ?? 502,{...incoming.headers,"cache-control":"no-store, private"});incoming.pipe(response);
    });
    upstream.on("error",()=>{if(!response.headersSent)response.writeHead(503);response.end("Local preview is starting or unavailable.");});
    request.on("aborted",()=>upstream.destroy());request.pipe(upstream);
  }catch{if(!response.headersSent)response.writeHead(500);response.end("Local preview request failed.");}
});
const stop=()=>{server.close();child.kill();};
process.once("SIGINT",stop);process.once("SIGTERM",stop);
child.once("error",error=>{console.error(error.message);server.close();process.exitCode=1;});
child.once("exit",code=>{server.close();process.exitCode=code ?? 1;});
server.once("error",error=>{console.error(error.message);child.kill();process.exitCode=1;});
server.listen(port,"127.0.0.1",()=>console.log(`Local production preview: ${origin}/preview (fixture tests; no D1 binding)`));
