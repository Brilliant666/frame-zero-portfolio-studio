import { accountJson } from "../../db/accounts/http.mjs";
import { changePublication, publicationHistory, PublicationError } from "../../db/accounts/publications.mjs";
import { authorizeEditor } from "./server";
import { isContentSpace } from "./content-schema";
import { preparePublication } from "./publication-projection";
export { preparePublication } from "./publication-projection";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function handlePublicationRequest(request: Request,slug: string,space: string) {
  const auth=await authorizeEditor(request,slug,space);
  if("denied" in auth)return accountJson({error:"站点或内容空间不可访问"},auth.denied);
  if(!isContentSpace(space))return accountJson({error:"内容空间不可访问"},404);
  try {
    if(request.method==="GET")return accountJson(await publicationHistory(auth.runtime.pool,auth.account.site.id,{authorizedSpaces:["basic",...auth.account.templates.premium],prepare:(value:unknown,targetSpace:string)=>{if(!isContentSpace(targetSpace))throw Error("内容空间不合法");return preparePublication(value,targetSpace);}}));
    if(request.method!=="POST")return accountJson({error:"METHOD_NOT_ALLOWED"},405);
    if(!(request.headers.get("content-type")??"").startsWith("application/json"))return accountJson({error:"INVALID_CONTENT_TYPE"},415);
    const raw=await request.text();
    if(Buffer.byteLength(raw)>2048)return accountJson({error:"请求过大"},413);
    let payload;
    try {
      payload=JSON.parse(raw);
      if(!payload || typeof payload!=="object" || Array.isArray(payload))throw Error();
      if(payload.expectedPublicationId!==null && (typeof payload.expectedPublicationId!=="string" || !UUID.test(payload.expectedPublicationId)))throw Error();
      if(payload.action==="publish") {
        if(Object.keys(payload).some(k=>!["action","expectedDraftRevision","expectedPublicationId"].includes(k)) || !Number.isSafeInteger(payload.expectedDraftRevision) || payload.expectedDraftRevision<1)throw Error();
      } else if(payload.action==="rollback") {
        if(Object.keys(payload).some(k=>!["action","revisionId","expectedPublicationId"].includes(k)) || typeof payload.revisionId!=="string" || !UUID.test(payload.revisionId))throw Error();
      } else throw Error();
    } catch { return accountJson({error:"发布请求或版本不合法"},400); }
    const publication=await changePublication(auth.runtime.pool,{siteId:auth.account.site.id,userId:auth.userId,space,payload,prepare:(value:unknown)=>preparePublication(value,space)});
    return accountJson({publication});
  } catch(error) {
    return accountJson({error:error instanceof PublicationError ? error.message : "发布服务暂不可用，草稿未改变"},error instanceof PublicationError ? error.status : 503);
  }
}
