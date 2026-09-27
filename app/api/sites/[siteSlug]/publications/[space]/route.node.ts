import { handlePublicationRequest } from "../../../../../site-editor/publication-server";
export const dynamic="force-dynamic";
type Context={params:Promise<{siteSlug:string;space:string}>};
export async function GET(request:Request,{params}:Context){const {siteSlug,space}=await params;return handlePublicationRequest(request,siteSlug,space);}
export async function POST(request:Request,{params}:Context){const {siteSlug,space}=await params;return handlePublicationRequest(request,siteSlug,space);}
