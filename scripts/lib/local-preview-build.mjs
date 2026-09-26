import { isDeepStrictEqual } from "node:util";

const generatedIncludes = new Set([".next-local-preview/types/**/*.ts", ".next-local-preview/dev/types/**/*.ts"]);

/** Restore only Next's known generated include additions and formatting changes.
 * Any independent edit makes restoration refuse, never overwriting that work.
 */
export function restorableLocalTsconfig(original, current) {
  try {
    const before=JSON.parse(original),after=JSON.parse(current);
    if(!Array.isArray(before.include) || !Array.isArray(after.include))return null;
    after.include=after.include.filter(entry=>!generatedIncludes.has(entry)||before.include.includes(entry));
    return isDeepStrictEqual(before,after)?original:null;
  }catch{return null;}
}
