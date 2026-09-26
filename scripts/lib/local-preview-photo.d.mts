import type { IncomingMessage, ServerResponse } from "node:http";
export function createLocalPreviewPhotoHandler(options: {root:string}): (request:IncomingMessage,response:ServerResponse)=>Promise<boolean>;
